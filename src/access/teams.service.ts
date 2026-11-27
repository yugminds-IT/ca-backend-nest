import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { requireOrgScope } from '../leads/lead-scope.util';
import { STAFF_ROLE_NAMES } from './permissions';
import { AuditService } from './audit.service';
import { wouldCreateCycle } from './teams';

export interface TeamInput {
  name?: string;
  parentTeamId?: number | null;
  managerUserId?: number | null;
}

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async list(user: User) {
    const orgId = requireOrgScope(user);
    const [teams, members] = await Promise.all([
      this.teams.find({ where: { organizationId: orgId }, order: { name: 'ASC' } }),
      this.users.find({
        where: { organizationId: orgId, teamId: Not(IsNull()) },
        select: ['id', 'teamId'],
      }),
    ]);
    const managerIds = [...new Set(teams.map((t) => t.managerUserId).filter((id): id is number => id !== null))];
    const managers = managerIds.length
      ? await this.users.find({ where: { id: In(managerIds) }, select: ['id', 'name', 'email'] })
      : [];
    return teams.map((t) => {
      const manager = managers.find((m) => m.id === t.managerUserId);
      return {
        id: t.id,
        name: t.name,
        parentTeamId: t.parentTeamId,
        managerUserId: t.managerUserId,
        managerName: manager ? manager.name || manager.email : null,
        memberCount: members.filter((m) => m.teamId === t.id).length,
      };
    });
  }

  /** Confirms a team belongs to the organization. Used when assigning staff to a team. */
  async assertInOrg(orgId: number, teamId: number): Promise<Team> {
    const team = await this.teams.findOne({ where: { id: teamId, organizationId: orgId } });
    if (!team) throw new BadRequestException('Team does not belong to this organization');
    return team;
  }

  async create(user: User, input: TeamInput) {
    const orgId = requireOrgScope(user);
    const name = this.cleanName(input.name, true)!;
    await this.assertNameFree(orgId, name);
    if (input.parentTeamId != null) await this.assertInOrg(orgId, input.parentTeamId);
    if (input.managerUserId != null) await this.assertManager(orgId, input.managerUserId);

    const saved = await this.teams.save(
      this.teams.create({
        organizationId: orgId,
        name,
        parentTeamId: input.parentTeamId ?? null,
        managerUserId: input.managerUserId ?? null,
      }),
    );
    await this.audit.record({
      organizationId: orgId,
      actor: user,
      action: 'team.created',
      targetType: 'team',
      targetId: saved.id,
      summary: `Created team "${saved.name}"`,
    });
    return saved;
  }

  async update(user: User, id: number, input: TeamInput) {
    const orgId = requireOrgScope(user);
    const team = await this.teams.findOne({ where: { id, organizationId: orgId } });
    if (!team) throw new NotFoundException('Team not found');
    const changes: string[] = [];

    const name = this.cleanName(input.name, false);
    if (name && name !== team.name) {
      await this.assertNameFree(orgId, name, team.id);
      changes.push(`renamed to "${name}"`);
      team.name = name;
    }
    if (input.parentTeamId !== undefined && input.parentTeamId !== team.parentTeamId) {
      if (input.parentTeamId !== null) await this.assertInOrg(orgId, input.parentTeamId);
      const all = await this.teams.find({
        where: { organizationId: orgId },
        select: ['id', 'parentTeamId', 'managerUserId'],
      });
      if (wouldCreateCycle(all, team.id, input.parentTeamId)) {
        throw new BadRequestException('A team cannot sit under one of its own sub-teams');
      }
      team.parentTeamId = input.parentTeamId;
      changes.push('moved to a new parent team');
    }
    if (input.managerUserId !== undefined && input.managerUserId !== team.managerUserId) {
      if (input.managerUserId !== null) await this.assertManager(orgId, input.managerUserId);
      team.managerUserId = input.managerUserId;
      changes.push(input.managerUserId ? 'manager changed' : 'manager removed');
    }

    const saved = await this.teams.save(team);
    if (changes.length) {
      await this.audit.record({
        organizationId: orgId,
        actor: user,
        action: 'team.updated',
        targetType: 'team',
        targetId: saved.id,
        summary: `Team "${saved.name}": ${changes.join(', ')}`,
      });
    }
    return saved;
  }

  async remove(user: User, id: number): Promise<void> {
    const orgId = requireOrgScope(user);
    const team = await this.teams.findOne({ where: { id, organizationId: orgId } });
    if (!team) throw new NotFoundException('Team not found');
    const subTeams = await this.teams.count({ where: { organizationId: orgId, parentTeamId: id } });
    if (subTeams > 0) {
      throw new ConflictException('Move or delete this team’s sub-teams first');
    }
    const members = await this.users.count({ where: { organizationId: orgId, teamId: id } });
    await this.users.update({ organizationId: orgId, teamId: id }, { teamId: null });
    await this.teams.remove(team);
    await this.audit.record({
      organizationId: orgId,
      actor: user,
      action: 'team.deleted',
      targetType: 'team',
      targetId: id,
      summary: `Deleted team "${team.name}"${members ? `; ${members} member(s) left the team` : ''}`,
    });
  }

  private cleanName(name: string | undefined, required: boolean): string | undefined {
    const trimmed = name?.trim();
    if (required && !trimmed) throw new BadRequestException('Name is required');
    if (trimmed !== undefined && (trimmed.length === 0 || trimmed.length > 100)) {
      throw new BadRequestException('Name must be 1 to 100 characters');
    }
    return trimmed;
  }

  private async assertNameFree(orgId: number, name: string, exceptId?: number): Promise<void> {
    const taken = await this.teams.findOne({ where: { organizationId: orgId, name } });
    if (taken && taken.id !== exceptId) throw new ConflictException('A team with this name already exists');
  }

  /** A team manager must be an active staff member of the same organization. */
  private async assertManager(orgId: number, userId: number): Promise<void> {
    const manager = await this.users.findOne({
      where: { id: userId, organizationId: orgId },
      relations: ['role'],
    });
    if (!manager || !STAFF_ROLE_NAMES.includes(manager.role?.name ?? '') || manager.isActive === false) {
      throw new BadRequestException('A team manager must be an active staff member of this organization');
    }
  }
}
