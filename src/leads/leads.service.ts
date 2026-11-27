import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Lead,
  LeadActivity,
  LeadTask,
  Pipeline,
  PipelineStage,
} from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { applyLeadScope } from '../access/lead-scope';
import { AccessContext, canCreateLeadIn, canSeeLead } from '../access/permissions';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { PipelinesService } from './pipelines.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { applyCustomData, visibleCustomData } from '../custom-fields/custom-field.rules';
import { CustomFieldDefinition } from '../entities/custom-fields.entities';
import { AutomationService } from '../automation/automation.service';
import { leadSnapshot } from '../automation/rules';
import {
  cleanImportRow,
  cleanText,
  normalizeEmail,
  normalizePhone,
  statusForStage,
} from './lead-normalize.util';
import {
  assertRecordInOrg,
  denyClients,
  escapeLike,
  requireOrgScope,
} from './lead-scope.util';
import {
  CreateActivityDto,
  CreateLeadDto,
  CreateTaskDto,
  ImportLeadsDto,
  MoveLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { ListLeadsQuery } from './dto/list-leads.query';
import { RoleName } from '../common/enums/role.enum';

/** Roles that can own a lead. Client-portal users are excluded. */
const OWNER_ROLES: readonly string[] = [RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

/** What an intake channel (form response, mail, import) knows about a person. */
export interface LeadIntakeInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  message?: string;
  submissionId?: number;
}

export interface ImportIssue {
  line: number;
  reason: string;
}

export interface ImportLeadsResult {
  created: number;
  duplicates: ImportIssue[];
  failed: ImportIssue[];
}

export interface DuplicateMatch {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(PipelineStage)
    private readonly stages: Repository<PipelineStage>,
    @InjectRepository(LeadActivity)
    private readonly activities: Repository<LeadActivity>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Pipeline)
    private readonly pipelineRepo: Repository<Pipeline>,
    private readonly businessUnits: BusinessUnitsService,
    private readonly pipelines: PipelinesService,
    private readonly customFields: CustomFieldsService,
    private readonly access: AccessService,
    private readonly automation: AutomationService,
  ) {}

  // ---------------------------------------------------------------- leads

  async list(user: User, q: ListLeadsQuery) {
    const orgId = requireOrgScope(user, q.organizationId);
    const limit = Math.min(q.limit ?? 50, 200);
    const page = Math.max(q.page ?? 1, 1);

    const qb = this.leads
      .createQueryBuilder('l')
      .where('l.organizationId = :orgId', { orgId });
    // Data scope: own / units / org. Staff see only what their profile allows.
    applyLeadScope(qb, await this.access.contextFor(user), 'l');
    if (q.businessUnitId !== undefined) {
      qb.andWhere('l.businessUnitId = :unitId', { unitId: q.businessUnitId });
    }
    if (q.pipelineId !== undefined)
      qb.andWhere('l.pipelineId = :pipelineId', { pipelineId: q.pipelineId });
    if (q.stageId !== undefined)
      qb.andWhere('l.stageId = :stageId', { stageId: q.stageId });
    if (q.status) qb.andWhere('l.status = :status', { status: q.status });
    if (q.followUpFrom)
      qb.andWhere('l.nextFollowUpAt >= :fFrom', { fFrom: new Date(q.followUpFrom) });
    if (q.followUpTo)
      qb.andWhere('l.nextFollowUpAt < :fTo', { fTo: new Date(q.followUpTo) });
    if (q.ownerUserId === 'none') {
      qb.andWhere('l.ownerUserId IS NULL');
    } else if (q.ownerUserId !== undefined) {
      const ownerId = Number(q.ownerUserId);
      if (!Number.isInteger(ownerId) || ownerId <= 0) {
        throw new BadRequestException(
          'ownerUserId must be a user id or "none"',
        );
      }
      qb.andWhere('l.ownerUserId = :ownerId', { ownerId });
    }
    if (q.search?.trim()) {
      const term = `%${escapeLike(q.search.trim())}%`;
      qb.andWhere(
        '(l.name ILIKE :term OR l.email ILIKE :term OR l.company ILIKE :term OR l.phone ILIKE :term)',
        {
          term,
        },
      );
    }

    const [items, total] = await qb
      .orderBy('l.lastActivityAt', 'DESC', 'NULLS LAST')
      .addOrderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const defsByUnit = new Map<number, CustomFieldDefinition[]>();
    const visible: Lead[] = [];
    for (const lead of items) {
      if (!defsByUnit.has(lead.businessUnitId)) {
        defsByUnit.set(lead.businessUnitId, await this.customFields.activeForUnit(orgId, lead.businessUnitId));
      }
      visible.push(this.withVisibleCustomData(lead, defsByUnit.get(lead.businessUnitId)!, user));
    }
    return { items: visible, total, page, limit };
  }

  async get(user: User, id: number): Promise<Lead> {
    const lead = await this.owned(user, id);
    const defs = await this.customFields.activeForUnit(lead.organizationId, lead.businessUnitId);
    return this.withVisibleCustomData(lead, defs, user);
  }

  async create(user: User, dto: CreateLeadDto): Promise<Lead> {
    const orgId = requireOrgScope(user, dto.organizationId);
    const unitId = await this.businessUnits.resolveUnitId(
      orgId,
      dto.businessUnitId,
    );
    const scope = await this.access.contextFor(user);
    // Own-scope users create leads they own. Everyone else may name an owner.
    const ownerId =
      dto.ownerUserId !== undefined
        ? dto.ownerUserId
        : scope.dataScope === 'own'
          ? user.id
          : null;
    if (!canCreateLeadIn(scope, unitId, ownerId ?? null)) {
      throw new ForbiddenException('Your access does not include that business unit or owner');
    }

    const pipeline =
      dto.pipelineId != null
        ? await this.pipelineInUnit(orgId, unitId, dto.pipelineId)
        : await this.pipelines.ensureDefault(orgId, unitId);
    const stage =
      dto.stageId != null
        ? await this.stageInPipeline(dto.stageId, pipeline.id)
        : await this.firstStage(pipeline.id);

    const email = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    await this.assertOwnerInOrg(orgId, ownerId);
    const defs = await this.customFields.activeForUnit(orgId, unitId);
    const custom = applyCustomData(defs, dto.customData ?? {}, {}, user.role?.name);
    this.assertCustomDataOk(custom);

    if (!dto.allowDuplicate) {
      const duplicates = await this.findDuplicates(orgId, unitId, email, phone, scope);
      // A match outside the caller's scope still blocks the create, but its details stay hidden.
      const hiddenMatch =
        scope.dataScope !== 'org' &&
        (await this.findDuplicates(orgId, unitId, email, phone)).length > duplicates.length;
      if (duplicates.length > 0 || hiddenMatch) {
        throw new ConflictException({
          message: duplicates.length
            ? 'A lead with the same email or phone already exists in this business unit. Merge or confirm to create anyway.'
            : 'A lead with the same email or phone already exists in this business unit, outside your access. Ask a manager to merge or confirm.',
          duplicates,
        });
      }
    }

    const status = statusForStage(stage);
    const now = new Date();
    // Owner pick, first-response deadline and score (automation). A chosen owner is kept.
    const prepared = await this.automation.prepareNewLead(
      orgId,
      unitId,
      {
        name: dto.name.trim(),
        email,
        phone,
        company: cleanText(dto.company),
        source: cleanText(dto.source),
        value: dto.value ?? null,
        status,
        tags: normalizeTags(dto.tags),
        ownerUserId: ownerId ?? null,
        customData: custom.data,
      },
      now,
    );
    const saved = await this.leads.save(
      this.leads.create({
        organizationId: orgId,
        businessUnitId: unitId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        name: dto.name.trim(),
        email,
        phone,
        company: cleanText(dto.company),
        source: cleanText(dto.source),
        status,
        value: dto.value ?? null,
        ownerUserId: prepared.ownerUserId,
        score: prepared.score,
        firstResponseDueAt: prepared.firstResponseDueAt,
        tags: normalizeTags(dto.tags),
        customData: custom.data,
        formSubmissionId: null,
        lostReason: null,
        nextFollowUpAt: dto.nextFollowUpAt
          ? new Date(dto.nextFollowUpAt)
          : null,
        lastActivityAt: null,
        closedAt: status === 'open' ? null : now,
      }),
    );
    await this.recordActivity(
      orgId,
      saved.id,
      user.id,
      'system',
      `Lead created in stage "${stage.name}"`,
    );
    await this.automation.afterLeadCreated(saved, user.id);
    return this.present(await this.reload(saved.id), user);
  }

  async update(user: User, id: number, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.owned(user, id);
    const before = leadSnapshot(lead);
    if (dto.name !== undefined) lead.name = dto.name.trim();
    if (dto.email !== undefined) lead.email = normalizeEmail(dto.email);
    if (dto.phone !== undefined) lead.phone = normalizePhone(dto.phone);
    if (dto.company !== undefined) lead.company = cleanText(dto.company);
    if (dto.source !== undefined) lead.source = cleanText(dto.source);
    if (dto.value !== undefined) lead.value = dto.value;
    if (dto.ownerUserId !== undefined) {
      await this.assertOwnerInOrg(lead.organizationId, dto.ownerUserId);
      lead.ownerUserId = dto.ownerUserId;
    }
    if (dto.tags !== undefined) lead.tags = normalizeTags(dto.tags);
    if (dto.nextFollowUpAt !== undefined) {
      lead.nextFollowUpAt = dto.nextFollowUpAt
        ? new Date(dto.nextFollowUpAt)
        : null;
    }
    if (dto.customData !== undefined) {
      const defs = await this.customFields.activeForUnit(lead.organizationId, lead.businessUnitId);
      const custom = applyCustomData(defs, dto.customData, lead.customData ?? {}, user.role?.name);
      this.assertCustomDataOk(custom);
      lead.customData = custom.data;
    }
    if (dto.email !== undefined || dto.phone !== undefined) {
      const others = (
        await this.findDuplicates(lead.organizationId, lead.businessUnitId, lead.email, lead.phone)
      ).filter((d) => d.id !== lead.id);
      if (others.length > 0) {
        throw new ConflictException({
          message: 'Another lead in this business unit already has this email or phone.',
          duplicates: others,
        });
      }
    }
    const saved = await this.leads.save(lead);
    await this.automation.afterFieldsChanged(saved, before, user.id);
    return this.present(await this.reload(saved.id), user);
  }

  async remove(user: User, id: number): Promise<void> {
    const lead = await this.owned(user, id);
    await this.leads.remove(lead);
  }

  /** Moves a lead to another stage of its pipeline. Logs the change and sets open/won/lost. */
  async move(user: User, id: number, dto: MoveLeadDto): Promise<Lead> {
    const lead = await this.owned(user, id);
    const from = await this.stages.findOne({ where: { id: lead.stageId } });
    const to = await this.stageInPipeline(dto.stageId, lead.pipelineId);
    if (from?.id === to.id) return this.present(lead, user);

    const status = statusForStage(to);
    lead.stageId = to.id;
    lead.status = status;
    lead.closedAt = status === 'open' ? null : new Date();
    lead.lostReason = status === 'lost' ? cleanText(dto.lostReason) : null;
    const saved = await this.leads.save(lead);

    await this.recordActivity(
      lead.organizationId,
      lead.id,
      user.id,
      'stage_change',
      `Moved from "${from?.name ?? 'unknown'}" to "${to.name}"`,
    );
    await this.automation.afterStageChanged(saved, from?.id ?? null, to.id, user.id);
    return this.present(await this.reload(saved.id), user);
  }

  /** Fresh copy after hooks may have changed the row (score, owner, SLA fields). */
  private async reload(id: number): Promise<Lead> {
    return this.leads.findOneOrFail({ where: { id } });
  }

  // ---------------------------------------------------------- duplicates

  /** Leads in the unit with the same email or phone. Capped at 10 results. */
  async duplicatesFor(
    user: User,
    businessUnitId: number,
    email?: string,
    phone?: string,
  ) {
    const orgId = requireOrgScope(user);
    const unitId = await this.businessUnits.resolveUnitId(
      orgId,
      businessUnitId,
    );
    const scope = await this.access.contextFor(user);
    return this.findDuplicates(
      orgId,
      unitId,
      normalizeEmail(email),
      normalizePhone(phone),
      scope,
    );
  }

  /** Same email or phone in the unit. With a scope, only leads that scope can see. */
  private async findDuplicates(
    orgId: number,
    unitId: number,
    email: string | null,
    phone: string | null,
    scope?: AccessContext,
  ): Promise<DuplicateMatch[]> {
    if (!email && !phone) return [];
    const qb = this.leads
      .createQueryBuilder('l')
      .select(['l.id', 'l.name', 'l.email', 'l.phone', 'l.status'])
      .where('l.organizationId = :orgId AND l.businessUnitId = :unitId', {
        orgId,
        unitId,
      });
    if (scope) applyLeadScope(qb, scope, 'l');
    const conditions: string[] = [];
    const params: Record<string, string> = {};
    if (email) {
      conditions.push('l.email = :email');
      params.email = email;
    }
    if (phone) {
      conditions.push('l.phone = :phone');
      params.phone = phone;
    }
    qb.andWhere(`(${conditions.join(' OR ')})`, params);
    return qb.orderBy('l.createdAt', 'DESC').take(10).getMany();
  }

  /**
   * Merges `dropId` into `keepId`, both in the same unit. Activities and tasks move to the kept lead.
   * Empty fields on the kept lead are filled from the dropped one. The dropped lead is deleted.
   */
  async merge(user: User, keepId: number, dropId: number): Promise<Lead> {
    if (keepId === dropId)
      throw new BadRequestException('Choose two different leads to merge');
    const keep = await this.owned(user, keepId);
    const drop = await this.owned(user, dropId);
    if (keep.businessUnitId !== drop.businessUnitId) {
      throw new BadRequestException(
        'Only leads in the same business unit can be merged',
      );
    }

    await this.leads.manager.transaction(async (m) => {
      await m
        .getRepository(LeadActivity)
        .update({ leadId: drop.id }, { leadId: keep.id });
      await m
        .getRepository(LeadTask)
        .update({ leadId: drop.id }, { leadId: keep.id });

      const patch: Partial<Lead> = {};
      if (!keep.email && drop.email) patch.email = drop.email;
      if (!keep.phone && drop.phone) patch.phone = drop.phone;
      if (!keep.company && drop.company) patch.company = drop.company;
      if (!keep.source && drop.source) patch.source = drop.source;
      if (keep.value == null && drop.value != null) patch.value = drop.value;
      if (keep.ownerUserId == null && drop.ownerUserId != null)
        patch.ownerUserId = drop.ownerUserId;
      const tags = normalizeTags([...(keep.tags ?? []), ...(drop.tags ?? [])]);
      if (tags.length !== (keep.tags ?? []).length) patch.tags = tags;
      if (Object.keys(patch).length > 0) {
        await m.getRepository(Lead).save({ ...patch, id: keep.id });
      }

      await m.getRepository(Lead).delete({ id: drop.id });
      await m.getRepository(LeadActivity).save(
        m.getRepository(LeadActivity).create({
          organizationId: keep.organizationId,
          leadId: keep.id,
          type: 'system',
          body: `Merged lead #${drop.id} (${drop.name}) into this lead`,
          createdByUserId: user.id,
        }),
      );
    });

    return this.owned(user, keepId);
  }

  // ---------------------------------------------------------- activities

  async listActivities(user: User, leadId: number): Promise<LeadActivity[]> {
    await this.owned(user, leadId);
    return this.activities.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async addActivity(
    user: User,
    leadId: number,
    dto: CreateActivityDto,
  ): Promise<LeadActivity> {
    const lead = await this.owned(user, leadId);
    const activity = await this.recordActivity(
      lead.organizationId,
      lead.id,
      user.id,
      dto.type,
      dto.body.trim(),
    );
    await this.automation.afterActivity(lead.organizationId, lead.id, dto.type, user.id);
    return activity;
  }

  private async recordActivity(
    orgId: number,
    leadId: number,
    userId: number | null,
    type: LeadActivity['type'],
    body: string,
  ): Promise<LeadActivity> {
    const now = new Date();
    const saved = await this.activities.save(
      this.activities.create({
        organizationId: orgId,
        leadId,
        type,
        body,
        createdByUserId: userId,
      }),
    );
    await this.leads.update({ id: leadId }, { lastActivityAt: now });
    return saved;
  }

  // ---------------------------------------------------------------- tasks

  async listTasks(
    user: User,
    filter: {
      assignedToUserId?: number;
      status?: 'open' | 'done' | 'all';
      organizationId?: number;
      /** Tasks belong to a lead, so the unit filter goes through the lead. */
      businessUnitId?: number;
      dueFrom?: Date;
      dueTo?: Date;
    },
  ): Promise<LeadTask[]> {
    const orgId = requireOrgScope(user, filter.organizationId);
    const qb = this.tasks
      .createQueryBuilder('t')
      .where('t.organizationId = :orgId', { orgId });
    const scope = await this.access.contextFor(user);
    if (filter.businessUnitId !== undefined) {
      qb.innerJoin(
        Lead,
        'l',
        'l.id = t.leadId AND l.businessUnitId = :unitId',
        { unitId: filter.businessUnitId },
      );
    } else if (scope.dataScope !== 'org') {
      // Tasks inherit their lead's scope.
      qb.innerJoin(Lead, 'l', 'l.id = t.leadId');
    }
    if (scope.dataScope !== 'org') applyLeadScope(qb, scope, 'l');
    if (filter.dueFrom) qb.andWhere('t.dueAt >= :dFrom', { dFrom: filter.dueFrom });
    if (filter.dueTo) qb.andWhere('t.dueAt < :dTo', { dTo: filter.dueTo });
    if (filter.assignedToUserId !== undefined) {
      qb.andWhere('t.assignedToUserId = :uid', {
        uid: filter.assignedToUserId,
      });
    }
    const status = filter.status ?? 'open';
    if (status === 'open') qb.andWhere('t.completedAt IS NULL');
    if (status === 'done') qb.andWhere('t.completedAt IS NOT NULL');
    return qb.orderBy('t.dueAt', 'ASC', 'NULLS LAST').take(500).getMany();
  }

  async addTask(
    user: User,
    leadId: number,
    dto: CreateTaskDto,
  ): Promise<LeadTask> {
    const lead = await this.owned(user, leadId);
    await this.assertOwnerInOrg(lead.organizationId, dto.assignedToUserId);
    return this.tasks.save(
      this.tasks.create({
        organizationId: lead.organizationId,
        leadId: lead.id,
        title: dto.title.trim(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        assignedToUserId: dto.assignedToUserId ?? null,
        completedAt: null,
        createdByUserId: user.id,
      }),
    );
  }

  async setTaskDone(
    user: User,
    taskId: number,
    done: boolean,
  ): Promise<LeadTask> {
    denyClients(user);
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    assertRecordInOrg(user, task.organizationId);
    task.completedAt = done ? new Date() : null;
    return this.tasks.save(task);
  }

  // -------------------------------------------------------------- helpers

  /** Loads a lead the caller may access. Other organizations' leads look like "not found". */
  private async owned(user: User, id: number): Promise<Lead> {
    denyClients(user);
    const lead = await this.leads.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    assertRecordInOrg(user, lead.organizationId);
    // Outside the caller's data scope looks the same as not found.
    const ctx = await this.access.contextFor(user);
    if (!canSeeLead(ctx, lead)) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async pipelineInUnit(
    orgId: number,
    unitId: number,
    pipelineId: number,
  ) {
    const pipeline = await this.pipelineRepo.findOne({
      where: { id: pipelineId },
    });
    if (
      !pipeline ||
      pipeline.organizationId !== orgId ||
      pipeline.businessUnitId !== unitId
    ) {
      throw new BadRequestException('Pipeline not found in this business unit');
    }
    return pipeline;
  }

  private async stageInPipeline(
    stageId: number,
    pipelineId: number,
  ): Promise<PipelineStage> {
    const stage = await this.stages.findOne({ where: { id: stageId } });
    if (!stage || stage.pipelineId !== pipelineId) {
      throw new BadRequestException('Stage does not belong to this pipeline');
    }
    if (stage.isActive === false) {
      throw new BadRequestException('That stage is turned off. Pick one that is on.');
    }
    return stage;
  }

  private async firstStage(pipelineId: number): Promise<PipelineStage> {
    const stages = await this.stages.find({
      where: { pipelineId },
      order: { position: 'ASC' },
    });
    const on = stages.filter((s) => s.isActive !== false);
    const stage = on.find((s) => !s.isWon && !s.isLost) ?? on[0];
    if (!stage) throw new BadRequestException('Pipeline has no stages');
    return stage;
  }

  /** Returns the lead with customData reduced to what this role may see. The stored data is unchanged. */
  private async present(lead: Lead, user: User): Promise<Lead> {
    const defs = await this.customFields.activeForUnit(lead.organizationId, lead.businessUnitId);
    return this.withVisibleCustomData(lead, defs, user);
  }

  private withVisibleCustomData(lead: Lead, defs: CustomFieldDefinition[], user: User): Lead {
    return { ...lead, customData: visibleCustomData(defs, lead.customData ?? {}, user.role?.name) };
  }

  /** Forbidden for fields the role cannot edit; 400 with per-field messages for bad values. */
  private assertCustomDataOk(result: { errors: Record<string, string>; forbidden: string[] }): void {
    if (result.forbidden.length > 0) {
      throw new ForbiddenException(`You cannot change: ${result.forbidden.join(', ')}`);
    }
    if (Object.keys(result.errors).length > 0) {
      throw new BadRequestException({ message: 'Some custom fields are invalid', errors: result.errors });
    }
  }

  private async assertOwnerInOrg(
    orgId: number,
    userId: number | null | undefined,
  ): Promise<void> {
    if (userId == null) return;
    const member = await this.users.findOne({
      where: { id: userId, organizationId: orgId },
      relations: { role: true },
    });
    if (!member || !OWNER_ROLES.includes(member.role?.name ?? ''))
      throw new BadRequestException(
        'The owner must be a staff member of this organization',
      );
  }

  /**
   * Adds a lead from an intake channel. The unit's default pipeline and its first stage are used.
   * A lead in the same unit with the same email or phone is not duplicated: the message is added to it
   * and duplicateOf is set so the caller can say so.
   */
  async addFromIntake(
    orgId: number,
    unitId: number,
    input: LeadIntakeInput,
    actorUserId: number | null,
  ): Promise<{ lead: Lead; duplicateOf: Lead | null }> {
    const email = normalizeEmail(input.email ?? null);
    const phone = normalizePhone(input.phone ?? null);
    const origin =
      input.submissionId != null
        ? `form response #${input.submissionId}`
        : (input.source ?? 'an intake channel');

    const duplicates = await this.findDuplicates(orgId, unitId, email, phone);
    if (duplicates.length > 0) {
      const existing = await this.leads.findOne({
        where: { id: duplicates[0].id, organizationId: orgId },
      });
      if (existing) {
        await this.recordActivity(
          orgId,
          existing.id,
          actorUserId,
          'system',
          `New ${origin} for this lead` + (input.message ? `: ${input.message}` : ''),
        );
        return { lead: existing, duplicateOf: existing };
      }
    }

    const pipeline = await this.pipelines.ensureDefault(orgId, unitId);
    const stage = await this.firstStage(pipeline.id);
    const status = statusForStage(stage);
    const name = (cleanText(input.name) ?? 'Form enquiry').slice(0, 255);
    const prepared = await this.automation.prepareNewLead(orgId, unitId, {
      name,
      email,
      phone,
      company: cleanText(input.company ?? null),
      source: cleanText(input.source ?? null),
      value: null,
      status,
      tags: [],
      ownerUserId: null,
      customData: {},
    });
    const saved = await this.leads.save(
      this.leads.create({
        organizationId: orgId,
        businessUnitId: unitId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        name,
        email,
        phone,
        company: cleanText(input.company ?? null),
        source: cleanText(input.source ?? null),
        status,
        value: null,
        ownerUserId: prepared.ownerUserId,
        score: prepared.score,
        firstResponseDueAt: prepared.firstResponseDueAt,
        tags: [],
        customData: {},
        formSubmissionId: input.submissionId ?? null,
        lostReason: null,
        nextFollowUpAt: null,
        lastActivityAt: null,
        closedAt: status === 'open' ? null : new Date(),
      }),
    );
    await this.recordActivity(
      orgId,
      saved.id,
      actorUserId,
      'system',
      `Lead created from ${origin} in stage "${stage.name}"`,
    );
    if (input.message) {
      await this.recordActivity(orgId, saved.id, actorUserId, 'note', input.message);
    }
    await this.automation.afterLeadCreated(saved, actorUserId);
    return { lead: await this.reload(saved.id), duplicateOf: null };
  }

  /** Staff who can own a lead, for the owner picker. Client-portal users are never listed. */
  async owners(user: User, requestedOrgId?: number) {
    const orgId = requireOrgScope(user, requestedOrgId);
    const members = await this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('u.organizationId = :orgId', { orgId })
      .andWhere('r.name IN (:...roles)', { roles: OWNER_ROLES })
      .orderBy('u.name', 'ASC')
      .addOrderBy('u.email', 'ASC')
      .getMany();
    return members.map((m) => ({
      id: m.id,
      name: m.name ?? m.email,
      email: m.email,
      role: m.role?.name ?? null,
    }));
  }

  /**
   * Creates leads from parsed rows. Duplicates and bad rows are reported by line, never fail the whole file.
   * Line numbers count the header as line 1.
   */
  async importRows(user: User, dto: ImportLeadsDto): Promise<ImportLeadsResult> {
    const orgId = requireOrgScope(user, dto.organizationId);
    const result: ImportLeadsResult = { created: 0, duplicates: [], failed: [] };
    for (const [index, raw] of dto.rows.entries()) {
      const line = index + 2;
      const row = cleanImportRow(raw);
      if (typeof row === 'string') {
        result.failed.push({ line, reason: row });
        continue;
      }
      try {
        await this.create(user, {
          ...row,
          organizationId: orgId,
          businessUnitId: dto.businessUnitId,
          allowDuplicate: false,
        });
        result.created++;
      } catch (err) {
        if (err instanceof ConflictException) {
          result.duplicates.push({ line, reason: `Matches an existing lead (${row.email ?? row.phone})` });
        } else if (err instanceof BadRequestException) {
          result.failed.push({ line, reason: err.message });
        } else {
          result.failed.push({ line, reason: 'Could not save this row' });
        }
      }
    }
    return result;
  }
}

/** Trimmed, unique, non-empty tags, capped at 50. */
export function normalizeTags(tags: string[] | null | undefined): string[] {
  const cleaned = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  return [...new Set(cleaned)].slice(0, 50);
}
