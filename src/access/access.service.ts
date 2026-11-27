import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PermissionProfile } from '../entities/permission-profile.entity';
import { Team } from '../entities/team.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { requireOrgScope } from '../leads/lead-scope.util';
import {
  AccessContext,
  brandLimit,
  withinBrandLimit,
  DATA_SCOPES,
  DataScope,
  PERMISSION_KEYS,
  PRESETS,
  isOrgAdmin,
  resolveAccess,
} from './permissions';
import { managedTeamIds } from './teams';
import { AuditService } from './audit.service';

export interface ProfileInput {
  name?: string;
  description?: string | null;
  permissions?: string[];
  dataScope?: DataScope;
}

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(PermissionProfile)
    private readonly profiles: Repository<PermissionProfile>,
    @InjectRepository(UserBusinessUnit)
    private readonly memberships: Repository<UserBusinessUnit>,
    @InjectRepository(UserOrgUnit)
    private readonly unitMemberships: Repository<UserOrgUnit>,
    @InjectRepository(BusinessUnit)
    private readonly brands: Repository<BusinessUnit>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    private readonly audit: AuditService,
  ) {}

  /** The effective permissions and data scope of a signed-in user. Read on every guarded request. */
  async contextFor(user: User): Promise<AccessContext> {
    const roleName = user.role?.name ?? null;
    let profile: PermissionProfile | null = null;
    if (user.profileId && !isOrgAdmin(roleName)) {
      profile = await this.profiles.findOne({ where: { id: user.profileId } });
    }
    const unitIds = await this.visibleBrandIds(user.id);
    const teamUserIds =
      profile?.dataScope === 'team' ? await this.teamMemberIds(user) : [];
    return resolveAccess({
      userId: user.id,
      roleName,
      profile: profile ? { permissions: profile.permissions, dataScope: profile.dataScope } : null,
      unitIds,
      teamUserIds,
      adminPanelEnabled: user.organization?.adminPanelEnabled,
    });
  }

  /** The brands this user is limited to, or null for all of them. See brandLimit. */
  async brandLimitFor(user: User): Promise<number[] | null> {
    return brandLimit(await this.contextFor(user));
  }

  /** Throws unless the brand is inside the user's limit. Outside looks like "not found". */
  async assertBrand(user: User, businessUnitId: number | null | undefined, what = 'Record'): Promise<void> {
    if (!withinBrandLimit(await this.brandLimitFor(user), businessUnitId)) {
      throw new NotFoundException(`${what} not found`);
    }
  }

  /**
   * The brands (business units) a user is assigned to: the ones picked one by one, plus every brand
   * in a unit they hold as a whole. Brands added to such a unit later are included automatically.
   */
  private async visibleBrandIds(userId: number): Promise<number[]> {
    const [direct, wholeUnits] = await Promise.all([
      this.memberships.find({ where: { userId } }),
      this.unitMemberships.find({ where: { userId } }),
    ]);
    const ids = new Set(direct.map((m) => m.businessUnitId));
    if (wholeUnits.length > 0) {
      const inUnits = await this.brands.find({
        where: { unitId: In(wholeUnits.map((w) => w.orgUnitId)) },
        select: ['id'],
      });
      for (const b of inUnits) ids.add(b.id);
    }
    return [...ids];
  }

  /** Members of the teams this user manages, and of their sub-teams. Excludes the user. */
  private async teamMemberIds(user: User): Promise<number[]> {
    if (!user.organizationId) return [];
    const teams = await this.teams.find({
      where: { organizationId: user.organizationId },
      select: ['id', 'parentTeamId', 'managerUserId'],
    });
    const ids = managedTeamIds(teams, user.id);
    if (ids.length === 0) return [];
    const members = await this.users.find({ where: { teamId: In(ids) }, select: ['id'] });
    return members.map((m) => m.id).filter((id) => id !== user.id);
  }

  /** Creates the preset profiles for an organization that does not have them yet. Idempotent. */
  async ensurePresets(orgId: number): Promise<void> {
    const existing = await this.profiles.find({ where: { organizationId: orgId } });
    const names = new Set(existing.map((p) => p.name));
    const missing = PRESETS.filter((p) => !names.has(p.name));
    if (missing.length === 0) return;
    await this.profiles.save(
      missing.map((p) =>
        this.profiles.create({
          organizationId: orgId,
          name: p.name,
          description: p.description,
          permissions: p.permissions,
          dataScope: p.dataScope,
          isPreset: true,
        }),
      ),
    );
  }

  async listProfiles(user: User) {
    const orgId = requireOrgScope(user);
    await this.ensurePresets(orgId);
    const rows = await this.profiles.find({
      where: { organizationId: orgId },
      order: { name: 'ASC' },
    });
    const counts = await this.users
      .createQueryBuilder('u')
      .select('u.profileId', 'profileId')
      .addSelect('COUNT(*)', 'count')
      .where('u.organizationId = :orgId', { orgId })
      .andWhere('u.profileId IS NOT NULL')
      .groupBy('u.profileId')
      .getRawMany<{ profileId: number; count: string }>();
    const byProfile = new Map(counts.map((c) => [Number(c.profileId), Number(c.count)]));
    return rows.map((p) => ({ ...p, staffCount: byProfile.get(p.id) ?? 0 }));
  }

  async createProfile(user: User, input: ProfileInput) {
    const orgId = requireOrgScope(user);
    const clean = this.validate(input, true);
    const taken = await this.profiles.findOne({
      where: { organizationId: orgId, name: clean.name! },
    });
    if (taken) throw new ConflictException('A profile with this name already exists');
    const saved = await this.profiles.save(
      this.profiles.create({
        organizationId: orgId,
        name: clean.name!,
        description: clean.description ?? null,
        permissions: clean.permissions ?? [],
        dataScope: clean.dataScope ?? 'own',
        isPreset: false,
      }),
    );
    await this.audit.record({
      organizationId: orgId,
      actor: user,
      action: 'profile.created',
      targetType: 'profile',
      targetId: saved.id,
      summary: `Created profile "${saved.name}" (${saved.permissions.length} permissions, sees ${saved.dataScope})`,
    });
    return saved;
  }

  async updateProfile(user: User, id: number, input: ProfileInput) {
    const orgId = requireOrgScope(user);
    const profile = await this.profiles.findOne({ where: { id, organizationId: orgId } });
    if (!profile) throw new NotFoundException('Profile not found');
    const before = { name: profile.name, permissions: [...profile.permissions], dataScope: profile.dataScope };
    const clean = this.validate(input, false);
    if (clean.name && clean.name !== profile.name) {
      const taken = await this.profiles.findOne({
        where: { organizationId: orgId, name: clean.name },
      });
      if (taken) throw new ConflictException('A profile with this name already exists');
      profile.name = clean.name;
    }
    if (clean.description !== undefined) profile.description = clean.description;
    if (clean.permissions) profile.permissions = clean.permissions;
    if (clean.dataScope) profile.dataScope = clean.dataScope;
    const saved = await this.profiles.save(profile);
    const changed: string[] = [];
    if (saved.name !== before.name) changed.push('renamed');
    if (JSON.stringify([...saved.permissions].sort()) !== JSON.stringify([...before.permissions].sort())) {
      changed.push('permissions changed');
    }
    if (saved.dataScope !== before.dataScope) changed.push(`sees ${saved.dataScope}`);
    if (changed.length) {
      await this.audit.record({
        organizationId: orgId,
        actor: user,
        action: 'profile.updated',
        targetType: 'profile',
        targetId: saved.id,
        summary: `Updated profile "${saved.name}": ${changed.join(', ')}`,
      });
    }
    return saved;
  }

  async deleteProfile(user: User, id: number): Promise<void> {
    const orgId = requireOrgScope(user);
    const profile = await this.profiles.findOne({ where: { id, organizationId: orgId } });
    if (!profile) throw new NotFoundException('Profile not found');
    const assigned = await this.users.count({ where: { profileId: id } });
    if (assigned > 0) {
      throw new ConflictException(
        `${assigned} staff member(s) use this profile. Give them another profile first.`,
      );
    }
    await this.profiles.remove(profile);
    await this.audit.record({
      organizationId: orgId,
      actor: user,
      action: 'profile.deleted',
      targetType: 'profile',
      targetId: id,
      summary: `Deleted profile "${profile.name}"`,
    });
  }

  /** Confirms a profile id belongs to the organization, for assignments. */
  async profileInOrg(orgId: number, profileId: number): Promise<PermissionProfile> {
    const profile = await this.profiles.findOne({ where: { id: profileId, organizationId: orgId } });
    if (!profile) throw new BadRequestException('Profile does not belong to this organization');
    return profile;
  }

  private validate(input: ProfileInput, creating: boolean) {
    const name = input.name?.trim();
    if (creating && !name) throw new BadRequestException('Name is required');
    if (name !== undefined && (name.length === 0 || name.length > 100)) {
      throw new BadRequestException('Name must be 1 to 100 characters');
    }
    if (input.permissions) {
      const unknown = input.permissions.filter((p) => !PERMISSION_KEYS.includes(p));
      if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    }
    if (input.dataScope && !(DATA_SCOPES as readonly string[]).includes(input.dataScope)) {
      throw new BadRequestException('dataScope must be own, units or org');
    }
    return {
      name,
      description:
        input.description === undefined
          ? undefined
          : input.description?.trim()
            ? input.description.trim().slice(0, 300)
            : null,
      permissions: input.permissions ? [...new Set(input.permissions)] : undefined,
      dataScope: input.dataScope,
    };
  }
}
