import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessService } from '../access/access.service';
import { STAFF_ROLE_NAMES } from '../access/permissions';
import { canSeeLead } from '../access/permissions';
import { BusinessUnit } from '../entities/business-unit.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Lead, LeadActivity, LeadTask } from '../entities/crm.entities';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import {
  AssignmentRule,
  ScoringRule,
  Sequence,
  SequenceEnrollment,
  SlaPolicy,
  WorkflowRule,
  WorkflowRun,
} from '../entities/automation.entities';
import { assertRecordInOrg, denyClients, requireOrgScope } from '../leads/lead-scope.util';
import { EventsGateway } from '../events/events.gateway';
import { LeadActionsService } from './lead-actions.service';
import { SequenceRunnerService } from './sequence-runner.service';
import { WorkflowRunnerService } from './workflow-runner.service';
import {
  ACTIVITY_FACTS,
  CONDITION_OPS,
  CORE_FIELDS,
  LeadFactSource,
  computeScore,
  countsAsFirstResponse,
  diffLeadFields,
  firstResponseDeadline,
  leadFacts,
  leadSnapshot,
  pickOwner as choosePerson,
  stepDueAt,
  validateAssignmentRule,
  validateScoringRule,
  validateSequence,
  validateWorkflow,
  WORKFLOW_ACTIONS,
  WORKFLOW_TRIGGERS,
} from './rules';
import { AssignmentRuleDto, LeadEmailDto } from './automation.dto';

export interface PreparedLead {
  ownerUserId: number | null;
  firstResponseDueAt: Date | null;
  score: number;
}

/** Everything the rule builder needs in one call. */
export const AUTOMATION_CATALOG = {
  fields: [...CORE_FIELDS, ...ACTIVITY_FACTS.map((a) => `activity.${a}`)],
  operators: CONDITION_OPS,
  triggers: WORKFLOW_TRIGGERS,
  actions: WORKFLOW_ACTIONS,
  strategies: ['round_robin', 'load_balanced', 'by_field'] as const,
  stepKinds: ['email', 'task'] as const,
};

type WorkflowInputBody = {
  name: string;
  trigger: string;
  triggerConfig?: Record<string, unknown>;
  conditions?: Array<{ field: string; op: string; value?: string | number | null }>;
  actions: Array<Record<string, unknown> & { type: string }>;
  enabled?: boolean;
  businessUnitId?: number | null;
};

/**
 * Automation: assignment, workflows, sequences, SLA, scoring and in-CRM email.
 *
 * LeadsService calls the `prepare*` and `after*` hooks. Every hook is best effort: a failure is logged
 * and never fails the staff member's save.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AssignmentRule) private readonly assignmentRules: Repository<AssignmentRule>,
    @InjectRepository(WorkflowRule) private readonly workflowRules: Repository<WorkflowRule>,
    @InjectRepository(WorkflowRun) private readonly runRepo: Repository<WorkflowRun>,
    @InjectRepository(Sequence) private readonly sequences: Repository<Sequence>,
    @InjectRepository(SequenceEnrollment) private readonly enrollments: Repository<SequenceEnrollment>,
    @InjectRepository(SlaPolicy) private readonly slaPolicies: Repository<SlaPolicy>,
    @InjectRepository(ScoringRule) private readonly scoringRules: Repository<ScoringRule>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(UserBusinessUnit) private readonly memberships: Repository<UserBusinessUnit>,
    @InjectRepository(BusinessUnit) private readonly units: Repository<BusinessUnit>,
    @InjectRepository(UserOrgUnit) private readonly wholeUnitMembers: Repository<UserOrgUnit>,
    private readonly access: AccessService,
    private readonly actions: LeadActionsService,
    private readonly workflows: WorkflowRunnerService,
    private readonly sequenceRunner: SequenceRunnerService,
    private readonly events: EventsGateway,
  ) {}

  // ------------------------------------------------------------------ hooks

  /**
   * Owner pick, first-response deadline and score for a lead about to be saved.
   * A lead that already has an owner keeps it.
   */
  async prepareNewLead(orgId: number, unitId: number, draft: LeadFactSource, now = new Date()): Promise<PreparedLead> {
    try {
      let ownerUserId = draft.ownerUserId ?? null;
      if (ownerUserId === null) ownerUserId = await this.pickOwner(orgId, unitId, draft);
      const policy = await this.slaPolicies.findOne({ where: { organizationId: orgId, businessUnitId: unitId } });
      const firstResponseDueAt =
        policy?.enabled && draft.status === 'open' ? firstResponseDeadline(now, policy.firstResponseMinutes) : null;
      const score = computeScore(await this.activeScoringRules(orgId, unitId), leadFacts({ ...draft, ownerUserId }));
      return { ownerUserId, firstResponseDueAt, score };
    } catch (err) {
      this.logger.error(`prepareNewLead failed: ${errText(err)}`);
      return { ownerUserId: draft.ownerUserId ?? null, firstResponseDueAt: null, score: 0 };
    }
  }

  async afterLeadCreated(lead: Lead, actorUserId: number | null): Promise<void> {
    await this.safely('lead_created workflows', async () => {
      await this.workflows.runForEvent('lead_created', lead, { actorUserId });
      await this.rescore(lead.id);
    });
  }

  async afterStageChanged(
    lead: Lead,
    fromStageId: number | null,
    toStageId: number,
    actorUserId: number | null,
  ): Promise<void> {
    await this.safely('stage_changed hooks', async () => {
      await this.sequenceRunner.stopForLead(lead.id, 'stage_changed', 'stopOnStageChange');
      await this.workflows.runForEvent('stage_changed', lead, { fromStageId, toStageId, actorUserId });
      await this.rescore(lead.id);
    });
  }

  /**
   * `before` is leadSnapshot(lead) taken before the edit. Only the fields that really changed trigger rules.
   */
  async afterFieldsChanged(lead: Lead, before: Record<string, unknown>, actorUserId: number | null): Promise<void> {
    await this.safely('field_changed hooks', async () => {
      const changedFields = diffLeadFields(before, leadSnapshot(lead));
      if (changedFields.length === 0) return;
      await this.workflows.runForEvent('field_changed', lead, { changedFields, actorUserId });
      await this.rescore(lead.id);
    });
  }

  /** A staff reply counts toward first response. Inbound mail stops "stop on reply" sequences. */
  async afterActivity(orgId: number, leadId: number, type: string, actorUserId: number | null): Promise<void> {
    await this.safely('activity hooks', async () => {
      const lead = await this.leads.findOne({ where: { id: leadId, organizationId: orgId } });
      if (!lead) return;
      if (countsAsFirstResponse(type, actorUserId) && lead.firstRespondedAt === null) {
        await this.leads.update({ id: lead.id }, { firstRespondedAt: new Date() });
      }
      if (type === 'email_received') {
        await this.sequenceRunner.stopForLead(lead.id, 'replied', 'stopOnReply');
      }
      await this.rescore(lead.id);
    });
  }

  /** Open or click on an email sent from the CRM. Logged on the timeline, does not count as a reply. */
  async onEngagement(orgId: number, leadId: number, type: 'email_opened' | 'email_clicked', detail: string): Promise<void> {
    await this.safely('engagement hook', async () => {
      const lead = await this.leads.findOne({ where: { id: leadId, organizationId: orgId } });
      if (!lead) return;
      await this.actions.logActivity(orgId, lead.id, null, type, detail, false);
      await this.rescore(lead.id);
    });
  }

  // ------------------------------------------------------------------ lead-level actions

  /** Email one lead from the CRM. Visibility follows the same scope rules as the lead itself. */
  async sendLeadEmail(user: User, leadId: number, dto: LeadEmailDto) {
    const lead = await this.visibleLead(user, leadId);
    if (!lead.email) throw new BadRequestException('This lead has no email address');
    if (!dto.templateId && !(dto.subject?.trim() && dto.body?.trim())) {
      throw new BadRequestException('Pick a template or write a subject and body');
    }
    const result = await this.actions.emailLead(
      lead,
      { subject: dto.subject, body: dto.body, templateId: dto.templateId ?? null },
      {},
    );
    if (result.status === 'suppressed') {
      await this.actions.logActivity(lead.organizationId, lead.id, user.id, 'system', `Email not sent to ${lead.email}: recipient is suppressed`, false);
      return { id: result.id, status: 'suppressed', subject: result.subject };
    }
    await this.actions.logActivity(lead.organizationId, lead.id, user.id, 'email', `Email sent: ${result.subject}`);
    await this.afterActivity(lead.organizationId, lead.id, 'email', user.id);
    return { id: result.id, status: result.status, subject: result.subject };
  }

  async enroll(user: User, leadId: number, sequenceId: number): Promise<SequenceEnrollment> {
    const lead = await this.visibleLead(user, leadId);
    if (lead.status !== 'open') throw new BadRequestException('Only open leads can be enrolled in a sequence');
    const seq = await this.sequences.findOne({ where: { id: sequenceId, organizationId: lead.organizationId } });
    if (!seq) throw new NotFoundException('Sequence not found');
    if (seq.businessUnitId !== lead.businessUnitId) {
      throw new BadRequestException('That sequence belongs to another business unit');
    }
    if (!seq.enabled) throw new BadRequestException('That sequence is switched off');
    if (seq.steps.length === 0) throw new BadRequestException('That sequence has no steps');
    const existing = await this.enrollments.findOne({ where: { sequenceId, leadId, status: 'active' } });
    if (existing) throw new ConflictException('This lead is already in that sequence');

    const now = new Date();
    const saved = await this.enrollments.save(
      this.enrollments.create({
        organizationId: lead.organizationId,
        sequenceId,
        leadId,
        currentStep: 0,
        nextStepAt: stepDueAt(seq.steps, 0, now),
        status: 'active',
        stopReason: null,
        enrolledByUserId: user.id,
      }),
    );
    await this.actions.logActivity(lead.organizationId, lead.id, user.id, 'system', `Enrolled in sequence "${seq.name}"`, false);
    return saved;
  }

  async listEnrollments(user: User, leadId: number) {
    const lead = await this.visibleLead(user, leadId);
    return this.enrollments.find({ where: { leadId: lead.id }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async stopEnrollment(user: User, enrollmentId: number): Promise<void> {
    const enrollment = await this.enrollments.findOne({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    await this.visibleLead(user, enrollment.leadId);
    await this.sequenceRunner.stopOne(enrollment.id, 'stopped_by_user');
  }

  /** Cron entry: escalate first responses that are overdue. Returns how many were escalated. */
  async escalateOverdueFirstResponses(now: Date, limit = 200): Promise<number> {
    const due = await this.leads
      .createQueryBuilder('l')
      .where('l.status = :open', { open: 'open' })
      .andWhere('l.firstResponseDueAt IS NOT NULL AND l.firstResponseDueAt <= :now', { now })
      .andWhere('l.firstRespondedAt IS NULL')
      .andWhere('l.slaEscalatedAt IS NULL')
      .take(limit)
      .getMany();

    let escalated = 0;
    for (const lead of due) {
      const policy = await this.slaPolicies.findOne({ where: { organizationId: lead.organizationId, businessUnitId: lead.businessUnitId } });
      if (!policy || !policy.enabled) continue;
      // Claim the lead first, so a second run or a second instance cannot escalate it twice.
      const claim = await this.leads
        .createQueryBuilder()
        .update(Lead)
        .set({ slaEscalatedAt: now })
        .where('id = :id AND "slaEscalatedAt" IS NULL', { id: lead.id })
        .execute();
      if (!claim.affected) continue;

      const target = await this.escalationTarget(lead, policy.escalateToUserId);
      await this.actions.createTask(lead, {
        title: `First response overdue: ${lead.name}`.slice(0, 255),
        dueAt: now,
        assignedToUserId: target,
        createdByUserId: null,
      });
      await this.actions.logActivity(
        lead.organizationId,
        lead.id,
        null,
        'system',
        `First response overdue. Escalated${target ? ` to user #${target}` : ' (no manager set)'}`,
        false,
      );
      this.events.emitToOrg(lead.organizationId, 'lead.sla_breached', {
        leadId: lead.id,
        name: lead.name,
        ownerUserId: lead.ownerUserId,
        escalatedTo: target,
      });
      escalated++;
    }
    return escalated;
  }

  // ------------------------------------------------------------------ owner picking and scoring

  private async pickOwner(orgId: number, unitId: number, draft: LeadFactSource): Promise<number | null> {
    const rules = await this.assignmentRules.find({ where: { organizationId: orgId, businessUnitId: unitId, enabled: true } });
    if (rules.length === 0) return null;
    const pool = await this.assignmentPool(orgId, unitId);
    const loads = await this.openLoads(orgId, unitId);
    const pick = choosePerson(rules, leadFacts(draft), pool, loads);
    if (!pick) return null;
    if (pick.nextCursor !== undefined) {
      await this.assignmentRules.update({ id: pick.ruleId }, { cursorUserId: pick.nextCursor });
    }
    return pick.userId;
  }

  /** Active staff who can own leads in the unit. With no unit memberships set, every active staff member. */
  private async assignmentPool(orgId: number, unitId: number): Promise<number[]> {
    const brandMembers = await this.memberships.find({ where: { businessUnitId: unitId } });
    // People assigned to the whole unit the brand sits in can own its leads too.
    const brand = await this.units.findOne({ where: { id: unitId }, select: ['id', 'unitId'] });
    const unitMembers = brand?.unitId
      ? await this.wholeUnitMembers.find({ where: { orgUnitId: brand.unitId } })
      : [];
    const members = [...brandMembers.map((m) => ({ userId: m.userId })), ...unitMembers.map((m) => ({ userId: m.userId }))];
    const qb = this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'r')
      .select(['u.id'])
      .where('u.organizationId = :orgId', { orgId })
      .andWhere('u.isActive = true')
      .andWhere('r.name IN (:...roles)', { roles: STAFF_ROLE_NAMES });
    if (members.length > 0) qb.andWhere('u.id IN (:...ids)', { ids: members.map((m) => m.userId) });
    return (await qb.getMany()).map((u) => u.id);
  }

  private async openLoads(orgId: number, unitId: number): Promise<Map<number, number>> {
    const rows = await this.leads
      .createQueryBuilder('l')
      .select('l.ownerUserId', 'ownerUserId')
      .addSelect('COUNT(*)', 'n')
      .where('l.organizationId = :orgId AND l.businessUnitId = :unitId', { orgId, unitId })
      .andWhere("l.status = 'open' AND l.ownerUserId IS NOT NULL")
      .groupBy('l.ownerUserId')
      .getRawMany<{ ownerUserId: number; n: string }>();
    return new Map(rows.map((r) => [Number(r.ownerUserId), Number(r.n)]));
  }

  private activeScoringRules(orgId: number, unitId: number): Promise<ScoringRule[]> {
    return this.scoringRules.find({ where: { organizationId: orgId, businessUnitId: unitId, enabled: true } });
  }

  /** Recalculates and saves a lead's score when it changes. */
  private async rescore(leadId: number): Promise<void> {
    const lead = await this.leads.findOne({ where: { id: leadId } });
    if (!lead) return;
    const rules = await this.activeScoringRules(lead.organizationId, lead.businessUnitId);
    const counts = await this.actions.activityCounts(lead.id);
    const score = computeScore(rules, leadFacts(lead, counts));
    if (score !== lead.score) await this.leads.update({ id: lead.id }, { score });
  }

  private async escalationTarget(lead: Lead, configured: number | null): Promise<number | null> {
    if (configured) return configured;
    if (lead.ownerUserId === null) return null;
    // The owner's team manager. If the owner manages their own team, go up to the parent team's manager.
    let teamId = (await this.users.findOne({ where: { id: lead.ownerUserId } }))?.teamId ?? null;
    for (let depth = 0; teamId && depth < 5; depth++) {
      const team = await this.teams.findOne({ where: { id: teamId } });
      if (!team) return null;
      if (team.managerUserId && team.managerUserId !== lead.ownerUserId) return team.managerUserId;
      teamId = team.parentTeamId;
    }
    return null;
  }

  private async safely(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${label} failed: ${errText(err)}`);
    }
  }

  // ------------------------------------------------------------------ configuration

  catalog() {
    return AUTOMATION_CATALOG;
  }

  async listAssignmentRules(user: User, orgParam: number | undefined, unitId: number) {
    const orgId = requireOrgScope(user, orgParam);
    return this.assignmentRules.find({
      where: { organizationId: orgId, businessUnitId: unitId },
      order: { priority: 'ASC', id: 'ASC' },
    });
  }

  async saveAssignmentRule(user: User, orgParam: number | undefined, id: number | null, input: AssignmentRuleDto) {
    const orgId = requireOrgScope(user, orgParam);
    await this.assertUnit(orgId, input.businessUnitId);
    const problems = validateAssignmentRule(input);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    if (input.strategy === 'by_field' && input.targetUserId != null) await this.assertStaff(orgId, [input.targetUserId]);
    if (input.memberUserIds?.length) await this.assertStaff(orgId, input.memberUserIds);

    const body = {
      name: String(input.name).trim(),
      strategy: input.strategy!,
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      memberUserIds: [...new Set(input.memberUserIds ?? [])],
      conditionField: input.strategy === 'by_field' ? input.conditionField ?? null : null,
      conditionValue: input.strategy === 'by_field' ? String(input.conditionValue ?? '').trim() : null,
      targetUserId: input.strategy === 'by_field' ? input.targetUserId ?? null : null,
    };
    if (id === null) {
      return this.assignmentRules.save(this.assignmentRules.create({ ...body, organizationId: orgId, businessUnitId: input.businessUnitId, cursorUserId: null }));
    }
    const existing = await this.getOwned(this.assignmentRules, orgId, id, 'Assignment rule');
    if (existing.businessUnitId !== input.businessUnitId) throw new BadRequestException('A rule cannot move to another business unit');
    return this.assignmentRules.save({ ...existing, ...body });
  }

  async deleteAssignmentRule(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    const existing = await this.getOwned(this.assignmentRules, orgId, id, 'Assignment rule');
    await this.assignmentRules.remove(existing);
  }

  async listWorkflows(user: User, orgParam: number | undefined, unitId: number | undefined) {
    const orgId = requireOrgScope(user, orgParam);
    const rows = await this.workflowRules.find({ where: { organizationId: orgId }, order: { id: 'ASC' } });
    return unitId === undefined ? rows : rows.filter((r) => r.businessUnitId === null || r.businessUnitId === unitId);
  }

  async saveWorkflow(user: User, orgParam: number | undefined, id: number | null, input: WorkflowInputBody) {
    const orgId = requireOrgScope(user, orgParam);
    const problems = validateWorkflow(input);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    if (input.businessUnitId !== undefined && input.businessUnitId !== null) await this.assertUnit(orgId, input.businessUnitId);
    await this.assertActionTargets(orgId, input.actions);

    const body = {
      name: input.name.trim(),
      trigger: input.trigger as WorkflowRule['trigger'],
      triggerConfig: input.triggerConfig ?? {},
      conditions: input.conditions ?? [],
      actions: input.actions,
      enabled: input.enabled ?? true,
      businessUnitId: input.businessUnitId ?? null,
    };
    if (id === null) return this.workflowRules.save(this.workflowRules.create({ ...body, organizationId: orgId }));
    const existing = await this.getOwned(this.workflowRules, orgId, id, 'Workflow');
    return this.workflowRules.save({ ...existing, ...body });
  }

  async deleteWorkflow(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    const existing = await this.getOwned(this.workflowRules, orgId, id, 'Workflow');
    await this.workflowRules.remove(existing);
  }

  async workflowRuns(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    await this.getOwned(this.workflowRules, orgId, id, 'Workflow');
    return this.runRepo.find({ where: { ruleId: id, organizationId: orgId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async listSequences(user: User, orgParam: number | undefined, unitId: number) {
    const orgId = requireOrgScope(user, orgParam);
    return this.sequences.find({ where: { organizationId: orgId, businessUnitId: unitId }, order: { id: 'ASC' } });
  }

  async saveSequence(user: User, orgParam: number | undefined, id: number | null, input: { name: string; businessUnitId: number; enabled?: boolean; stopOnStageChange?: boolean; stopOnReply?: boolean; steps: Array<Record<string, unknown>> }) {
    const orgId = requireOrgScope(user, orgParam);
    await this.assertUnit(orgId, input.businessUnitId);
    const problems = validateSequence(input);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const steps: Sequence['steps'] = input.steps.map((s) => ({
      delayDays: Number(s.delayDays),
      kind: s.kind as 'email' | 'task',
      templateId: s.templateId ? Number(s.templateId) : null,
      subject: s.subject ? String(s.subject) : null,
      body: s.body ? String(s.body) : null,
      taskTitle: s.taskTitle ? String(s.taskTitle) : null,
    }));
    if (steps.some((s) => s.kind === 'email' && s.templateId)) {
      const tplIds = [...new Set(steps.filter((s) => s.templateId).map((s) => Number(s.templateId)))];
      const found = await this.templateIdsInUnit(orgId, input.businessUnitId, tplIds);
      if (found.length !== tplIds.length) throw new BadRequestException('A step uses a template that is not in this business unit');
    }
    const body = {
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      stopOnStageChange: input.stopOnStageChange ?? true,
      stopOnReply: input.stopOnReply ?? true,
      steps,
    };
    if (id === null) return this.sequences.save(this.sequences.create({ ...body, organizationId: orgId, businessUnitId: input.businessUnitId }));
    const existing = await this.getOwned(this.sequences, orgId, id, 'Sequence');
    if (existing.businessUnitId !== input.businessUnitId) throw new BadRequestException('A sequence cannot move to another business unit');
    return this.sequences.save({ ...existing, ...body });
  }

  async deleteSequence(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    const existing = await this.getOwned(this.sequences, orgId, id, 'Sequence');
    await this.sequences.remove(existing);
  }

  async sequenceEnrollments(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    await this.getOwned(this.sequences, orgId, id, 'Sequence');
    return this.enrollments.find({ where: { sequenceId: id, organizationId: orgId }, order: { createdAt: 'DESC' }, take: 200 });
  }

  async getSlaPolicy(user: User, orgParam: number | undefined, unitId: number) {
    const orgId = requireOrgScope(user, orgParam);
    return (await this.slaPolicies.findOne({ where: { organizationId: orgId, businessUnitId: unitId } })) ?? null;
  }

  async saveSlaPolicy(user: User, orgParam: number | undefined, input: { businessUnitId: number; enabled?: boolean; firstResponseMinutes: number; escalateToUserId?: number | null }) {
    const orgId = requireOrgScope(user, orgParam);
    await this.assertUnit(orgId, input.businessUnitId);
    if (input.escalateToUserId) await this.assertStaff(orgId, [input.escalateToUserId]);
    const existing = await this.slaPolicies.findOne({ where: { organizationId: orgId, businessUnitId: input.businessUnitId } });
    const body = {
      enabled: input.enabled ?? true,
      firstResponseMinutes: input.firstResponseMinutes,
      escalateToUserId: input.escalateToUserId ?? null,
    };
    return this.slaPolicies.save(existing ? { ...existing, ...body } : this.slaPolicies.create({ ...body, organizationId: orgId, businessUnitId: input.businessUnitId }));
  }

  async listScoringRules(user: User, orgParam: number | undefined, unitId: number) {
    const orgId = requireOrgScope(user, orgParam);
    return this.scoringRules.find({ where: { organizationId: orgId, businessUnitId: unitId }, order: { id: 'ASC' } });
  }

  async saveScoringRule(user: User, orgParam: number | undefined, id: number | null, input: { name: string; businessUnitId: number; field: string; op: string; value?: string | null; points: number; enabled?: boolean }) {
    const orgId = requireOrgScope(user, orgParam);
    await this.assertUnit(orgId, input.businessUnitId);
    const problems = validateScoringRule(input);
    if (!input.name?.trim()) problems.push('Give the rule a name');
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const body = {
      name: input.name.trim(),
      field: input.field,
      op: input.op,
      value: input.op === 'exists' ? null : String(input.value ?? '').trim(),
      points: input.points,
      enabled: input.enabled ?? true,
    };
    if (id === null) return this.scoringRules.save(this.scoringRules.create({ ...body, organizationId: orgId, businessUnitId: input.businessUnitId }));
    const existing = await this.getOwned(this.scoringRules, orgId, id, 'Scoring rule');
    if (existing.businessUnitId !== input.businessUnitId) throw new BadRequestException('A scoring rule cannot move to another business unit');
    return this.scoringRules.save({ ...existing, ...body });
  }

  async deleteScoringRule(user: User, orgParam: number | undefined, id: number) {
    const orgId = requireOrgScope(user, orgParam);
    const existing = await this.getOwned(this.scoringRules, orgId, id, 'Scoring rule');
    await this.scoringRules.remove(existing);
  }

  // ------------------------------------------------------------------ helpers

  private async visibleLead(user: User, leadId: number): Promise<Lead> {
    denyClients(user);
    const lead = await this.leads.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    assertRecordInOrg(user, lead.organizationId);
    const ctx = await this.access.contextFor(user);
    if (!canSeeLead(ctx, lead)) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async getOwned<T extends { id: number; organizationId: number }>(
    repo: Repository<T>,
    orgId: number,
    id: number,
    label: string,
  ): Promise<T> {
    const row = await repo.findOne({ where: { id, organizationId: orgId } as never });
    if (!row) throw new NotFoundException(`${label} not found`);
    return row;
  }

  private async assertUnit(orgId: number, unitId: number): Promise<void> {
    const unit = await this.units.findOne({ where: { id: unitId, organizationId: orgId } });
    if (!unit) throw new BadRequestException('Business unit not found');
  }

  /** Every id must be an active staff member of the organization. */
  private async assertStaff(orgId: number, ids: number[]): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await this.users.find({
      where: { id: In(unique), organizationId: orgId, isActive: true },
      relations: { role: true },
    });
    const ok = found.filter((u) => STAFF_ROLE_NAMES.includes(u.role?.name ?? ''));
    if (ok.length !== unique.length) throw new BadRequestException('Everyone named here must be active staff in this organization');
  }

  private async templateIdsInUnit(orgId: number, unitId: number, ids: number[]): Promise<number[]> {
    const rows = await this.units.manager.find(EmailTemplate, {
      where: { id: In(ids), organizationId: orgId, businessUnitId: unitId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Workflow actions that name a person or a template must point inside the organization. */
  private async assertActionTargets(orgId: number, actions: Array<Record<string, unknown> & { type: string }>): Promise<void> {
    const people = actions.filter((a) => a.type === 'assign').map((a) => Number(a.userId));
    if (people.length) await this.assertStaff(orgId, people);
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
