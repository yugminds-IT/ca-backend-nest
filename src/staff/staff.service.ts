import { BillingService } from '../billing/billing.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Lead } from '../entities/crm.entities';
import { StaffInvite } from '../entities/staff-invite.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import { OrgUnitsService } from '../business-units/org-units.service';
import { RoleName } from '../common/enums/role.enum';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { STAFF_ROLE_NAMES, isOrgAdmin } from '../access/permissions';
import { TeamsService } from '../access/teams.service';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { EmailService } from '../email/email.service';
import { requireOrgScope } from '../leads/lead-scope.util';
import { AcceptInviteDto, BulkInviteStaffDto, InviteStaffDto, UpdateStaffDto } from './dto/staff.dto';
import { parseInviteCsv } from './invite-csv';

export { STAFF_ROLE_NAMES };

const INVITABLE_ROLES: string[] = [RoleName.CAA, RoleName.ORG_EMPLOYEE, RoleName.ORG_ADMIN];
const INVITE_DAYS = 7;

/** Only the hash of an invite token is stored. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function temporaryPassword(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly billing: BillingService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(StaffInvite) private readonly invites: Repository<StaffInvite>,
    @InjectRepository(UserBusinessUnit)
    private readonly memberships: Repository<UserBusinessUnit>,
    private readonly access: AccessService,
    private readonly businessUnits: BusinessUnitsService,
    private readonly email: EmailService,
    private readonly teams: TeamsService,
    private readonly audit: AuditService,
    @InjectRepository(UserOrgUnit)
    private readonly unitMemberships: Repository<UserOrgUnit>,
    private readonly orgUnits: OrgUnitsService,
  ) {}

  async list(user: User) {
    const orgId = requireOrgScope(user);
    const staff = await this.users.find({
      where: { organizationId: orgId, role: { name: In(STAFF_ROLE_NAMES) } },
      relations: ['role'],
      order: { name: 'ASC' },
    });
    const ids = staff.map((u) => u.id);
    const [profiles, teams, units, wholeUnits, pending] = await Promise.all([
      this.access.listProfiles(user),
      this.teams.list(user),
      ids.length ? this.memberships.find({ where: { userId: In(ids) } }) : Promise.resolve([]),
      ids.length ? this.unitMemberships.find({ where: { userId: In(ids) } }) : Promise.resolve([]),
      ids.length
        ? this.invites.find({ where: { userId: In(ids), acceptedAt: IsNull() } })
        : Promise.resolve([]),
    ]);
    const now = Date.now();
    return staff.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleName: u.role?.name ?? null,
      isActive: u.isActive !== false,
      profileId: u.profileId ?? null,
      profileName: profiles.find((p) => p.id === u.profileId)?.name ?? null,
      teamId: u.teamId ?? null,
      teamName: teams.find((t) => t.id === u.teamId)?.name ?? null,
      businessUnitIds: units.filter((m) => m.userId === u.id).map((m) => m.businessUnitId),
      orgUnitIds: wholeUnits.filter((m) => m.userId === u.id).map((m) => m.orgUnitId),
      inviteStatus: pending.some((i) => i.userId === u.id && i.expiresAt.getTime() > now)
        ? 'pending'
        : 'accepted',
    }));
  }

  async invite(user: User, dto: InviteStaffDto) {
    const orgId = requireOrgScope(user);
    await this.billing.assertLimit(orgId, 'users');
    const email = dto.email.trim().toLowerCase();
    const roleName = dto.roleName ?? RoleName.ORG_EMPLOYEE;
    if (!INVITABLE_ROLES.includes(roleName)) {
      throw new BadRequestException('Role must be CAA, ORG_EMPLOYEE or ORG_ADMIN');
    }
    if (roleName === RoleName.ORG_ADMIN && !isOrgAdmin(user.role?.name)) {
      throw new ForbiddenException('Only admins can invite admins');
    }
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const role = await this.roles.findOne({ where: { name: roleName } });
    if (!role) throw new BadRequestException('Role is not set up');
    const profile = dto.profileId != null ? await this.access.profileInOrg(orgId, dto.profileId) : null;
    const teamId = dto.teamId != null ? (await this.teams.assertInOrg(orgId, dto.teamId)).id : null;

    const orgUnitIds = dto.orgUnitIds?.length ? await this.orgUnits.idsInOrg(orgId, dto.orgUnitIds) : [];
    // Brands picked one by one. With nothing picked at all, the default brand. A whole unit alone is enough.
    const unitIds = dto.businessUnitIds?.length
      ? await this.resolveUnits(orgId, dto.businessUnitIds)
      : orgUnitIds.length
        ? []
        : [(await this.businessUnits.ensureDefault(orgId)).id];

    const mode = dto.mode ?? 'email';
    const tempPassword = mode === 'temporary_password' ? temporaryPassword() : null;
    // With an email invite the password is random and unknown to anyone until the invite is accepted.
    const passwordHash = await bcrypt.hash(tempPassword ?? randomBytes(32).toString('hex'), 10);
    const saved = await this.users.save(
      this.users.create({
        email,
        name: dto.name.trim(),
        roleId: role.id,
        organizationId: orgId,
        profileId: dto.profileId ?? null,
        teamId,
        passwordHash,
        isActive: true,
      }),
    );
    if (unitIds.length) {
      await this.memberships.save(
        unitIds.map((id) => this.memberships.create({ userId: saved.id, businessUnitId: id })),
      );
    }
    if (orgUnitIds.length) {
      await this.unitMemberships.save(
        orgUnitIds.map((id) => this.unitMemberships.create({ userId: saved.id, orgUnitId: id })),
      );
    }
    await this.audit.record({
      organizationId: orgId,
      actor: user,
      action: 'staff.invited',
      targetType: 'user',
      targetId: saved.id,
      summary: `Invited ${email} as ${roleName}${profile ? `, profile "${profile.name}"` : ''}${
        teamId ? ', with a team' : ''
      } (${mode === 'temporary_password' ? 'temporary password' : 'email link'})`,
    });

    if (tempPassword) {
      return { id: saved.id, email, mode, temporaryPassword: tempPassword };
    }

    const token = randomBytes(32).toString('base64url');
    await this.invites.save(
      this.invites.create({
        organizationId: orgId,
        userId: saved.id,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      }),
    );
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
    const inviteLink = `${base}/accept-invite?token=${token}`;
    const orgName = user.organization?.name ?? 'your team';
    const sent = await this.email.sendMail(
      email,
      `You have been invited to ${orgName}`,
      `Hello ${dto.name.trim()},\n\n${orgName} has invited you to its CRM. Set your password here (the link works for ${INVITE_DAYS} days):\n${inviteLink}\n`,
      undefined,
      orgName,
      orgId,
      undefined,
      undefined,
      unitIds[0],
    );
    // If the email did not go out, return the link once so the admin can share it another way.
    return sent
      ? { id: saved.id, email, mode, sent: true }
      : { id: saved.id, email, mode, sent: false, inviteLink };
  }

  /**
   * Invites everyone in a pasted CSV. All rows are checked first; if any is wrong, nothing is invited.
   * Each invite then goes through the same path as a single invite, and each row gets its own result.
   */
  async inviteMany(user: User, dto: BulkInviteStaffDto) {
    const bulkOrgId = requireOrgScope(user);
    const parsed = parseInviteCsv(dto.csv);
    if (parsed.errors.length) {
      const shown = parsed.errors.slice(0, 5).map((e) => `line ${e.line}: ${e.message}`);
      const more = parsed.errors.length > 5 ? ` and ${parsed.errors.length - 5} more` : '';
      throw new BadRequestException({
        message: `Nobody was invited. Fix these and try again: ${shown.join('; ')}${more}`,
        errors: parsed.errors,
      });
    }
    await this.billing.assertLimit(bulkOrgId, 'users', parsed.rows.length);

    const profiles = await this.access.listProfiles(user);
    const results: Array<{ line: number; email: string; ok: boolean; error?: string; [k: string]: unknown }> = [];
    for (const row of parsed.rows) {
      let profileId = dto.defaultProfileId;
      if (row.profileName) {
        const match = profiles.find((p) => p.name.toLowerCase() === row.profileName!.toLowerCase());
        if (!match) {
          results.push({ line: row.line, email: row.email, ok: false, error: `No profile named "${row.profileName}"` });
          continue;
        }
        profileId = match.id;
      }
      try {
        const res = await this.invite(user, {
          name: row.name,
          email: row.email,
          roleName: row.roleName,
          profileId,
          businessUnitIds: dto.businessUnitIds,
          orgUnitIds: dto.orgUnitIds,
          mode: dto.mode,
          teamId: dto.teamId,
        });
        results.push({ line: row.line, ok: true, ...res });
      } catch (err) {
        const message =
          err instanceof HttpException ? (err.message as string) : 'Could not invite this person';
        if (!(err instanceof HttpException)) this.logger.warn(`Bulk invite failed for row ${row.line}: ${String(err)}`);
        results.push({ line: row.line, email: row.email, ok: false, error: message });
      }
    }
    return {
      total: results.length,
      invited: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.invites.findOne({
      where: { tokenHash: hashInviteToken(dto.token) },
    });
    const expired = !invite || invite.acceptedAt !== null || invite.expiresAt.getTime() < Date.now();
    const user = expired ? null : await this.users.findOne({ where: { id: invite.userId } });
    if (!invite || expired || !user || user.isActive === false) {
      throw new BadRequestException(
        'This invitation is invalid or has expired. Ask your admin to send a new one.',
      );
    }
    user.passwordHash = await bcrypt.hash(dto.password, 10);
    await this.users.save(user);
    invite.acceptedAt = new Date();
    await this.invites.save(invite);
    await this.audit.record({
      organizationId: invite.organizationId,
      action: 'staff.invite_accepted',
      targetType: 'user',
      targetId: user.id,
      summary: `${user.email} set their password and joined`,
    });
    return { success: true };
  }

  async update(user: User, id: number, dto: UpdateStaffDto) {
    const orgId = requireOrgScope(user);
    const target = await this.users.findOne({
      where: { id, organizationId: orgId },
      relations: ['role'],
    });
    if (!target) throw new NotFoundException('Staff member not found');
    if (!STAFF_ROLE_NAMES.includes(target.role?.name ?? '')) {
      throw new BadRequestException('Only staff accounts can be managed here');
    }
    if (target.role?.name === RoleName.ORG_ADMIN && !isOrgAdmin(user.role?.name)) {
      throw new ForbiddenException('Only admins can change admins');
    }
    if (dto.isActive === false && target.id === user.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const who = target.name || target.email;
    const changes: string[] = [];

    if (dto.profileId !== undefined) {
      const before = target.profileId;
      target.profileId =
        dto.profileId === null ? null : (await this.access.profileInOrg(orgId, dto.profileId)).id;
      if (before !== target.profileId) {
        changes.push(target.profileId === null ? 'profile removed' : 'profile changed');
      }
    }

    if (dto.teamId !== undefined) {
      const before = target.teamId;
      target.teamId =
        dto.teamId === null ? null : (await this.teams.assertInOrg(orgId, dto.teamId)).id;
      if (before !== target.teamId) {
        changes.push(target.teamId === null ? 'removed from team' : 'team changed');
      }
    }

    if (dto.businessUnitIds) {
      const unitIds = await this.resolveUnits(orgId, dto.businessUnitIds);
      await this.memberships.delete({ userId: target.id });
      if (unitIds.length) {
        await this.memberships.save(
          unitIds.map((unitId) => this.memberships.create({ userId: target.id, businessUnitId: unitId })),
        );
      }
      changes.push('business units changed');
    }

    if (dto.orgUnitIds) {
      const orgUnitIds = await this.orgUnits.idsInOrg(orgId, dto.orgUnitIds);
      await this.unitMemberships.delete({ userId: target.id });
      if (orgUnitIds.length) {
        await this.unitMemberships.save(
          orgUnitIds.map((id) => this.unitMemberships.create({ userId: target.id, orgUnitId: id })),
        );
      }
      changes.push('units changed');
    }

    if (dto.isActive !== undefined) {
      const deactivating = dto.isActive === false && target.isActive !== false;
      const reactivating = dto.isActive === true && target.isActive === false;
      target.isActive = dto.isActive;
      if (deactivating) {
        // Keep the records. Hand the leads to someone else, or leave them unowned.
        let reassignee: number | null = null;
        if (dto.reassignTo != null) {
          if (dto.reassignTo === target.id) {
            throw new BadRequestException('Choose a different person to reassign to');
          }
          const other = await this.users.findOne({
            where: { id: dto.reassignTo, organizationId: orgId, isActive: true },
            relations: ['role'],
          });
          if (!other || !STAFF_ROLE_NAMES.includes(other.role?.name ?? '')) {
            throw new BadRequestException('Reassign to an active staff member in this organization');
          }
          reassignee = other.id;
        }
        const moved = await this.leads.update(
          { organizationId: orgId, ownerUserId: target.id },
          { ownerUserId: reassignee },
        );
        await this.audit.record({
          organizationId: orgId,
          actor: user,
          action: 'staff.deactivated',
          targetType: 'user',
          targetId: target.id,
          summary: `Deactivated ${who}; ${moved.affected ?? 0} lead(s) ${
            reassignee ? 'reassigned' : 'left unowned'
          }`,
        });
      } else if (reactivating) {
        changes.push('reactivated');
      }
    }

    const saved = await this.users.save(target);
    if (changes.length) {
      await this.audit.record({
        organizationId: orgId,
        actor: user,
        action: 'staff.updated',
        targetType: 'user',
        targetId: saved.id,
        summary: `Updated ${who}: ${changes.join(', ')}`,
      });
    }
    return { id: saved.id, isActive: saved.isActive !== false, profileId: saved.profileId ?? null, teamId: saved.teamId ?? null };
  }

  /** Units must belong to the organization. Duplicates are ignored. */
  private async resolveUnits(orgId: number, ids: number[]): Promise<number[]> {
    const unique = [...new Set(ids)];
    const resolved: number[] = [];
    for (const id of unique) {
      resolved.push(await this.businessUnits.resolveUnitId(orgId, id));
    }
    return resolved;
  }
}
