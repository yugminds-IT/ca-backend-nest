import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { Lead } from '../entities/crm.entities';
import { WorkflowRule, WorkflowRun } from '../entities/automation.entities';
import { LeadActionsService } from './lead-actions.service';
import { leadFacts, matchesAll } from './rules';

export type EventTrigger = 'lead_created' | 'stage_changed' | 'field_changed';

export interface EventContext {
  fromStageId?: number | null;
  toStageId?: number | null;
  changedFields?: string[];
  actorUserId: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name);

  constructor(
    @InjectRepository(WorkflowRule) private readonly rules: Repository<WorkflowRule>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    private readonly actions: LeadActionsService,
  ) {}

  /**
   * Runs the enabled rules for an event on a lead. Actions do not fire further events, so a rule
   * cannot trigger itself. Each rule that fires writes one run record.
   */
  async runForEvent(trigger: EventTrigger, lead: Lead, ctx: EventContext): Promise<number> {
    const rules = await this.enabledRules(lead.organizationId, lead.businessUnitId, trigger);
    let fired = 0;
    for (const rule of rules) {
      if (!this.eventMatches(rule, ctx)) continue;
      if (!(await this.conditionsHold(rule, lead))) continue;
      await this.fire(rule, lead, ctx.actorUserId);
      fired++;
    }
    return fired;
  }

  /**
   * Time-based triggers: a lead has been inactive for N days, or its follow-up is overdue.
   * A rule fires again only after new activity (or a new follow-up date), so it does not repeat daily.
   */
  async runTimeBased(now: Date): Promise<number> {
    let fired = 0;
    const rules = await this.rules.find({
      where: [
        { trigger: 'lead_inactive', enabled: true },
        { trigger: 'followup_overdue', enabled: true },
      ],
    });
    for (const rule of rules) {
      const candidates = rule.trigger === 'lead_inactive' ? await this.inactiveLeads(rule, now) : await this.overdueLeads(rule, now);
      for (const lead of candidates) {
        const since = rule.trigger === 'lead_inactive' ? (lead.lastActivityAt ?? lead.createdAt) : lead.nextFollowUpAt;
        if (!since) continue;
        const already = await this.runs.count({
          where: { ruleId: rule.id, leadId: lead.id, createdAt: MoreThanOrEqual(since) },
        });
        if (already > 0) continue;
        if (!(await this.conditionsHold(rule, lead))) continue;
        await this.fire(rule, lead, null);
        fired++;
      }
    }
    return fired;
  }

  private async inactiveLeads(rule: WorkflowRule, now: Date): Promise<Lead[]> {
    const days = Number((rule.triggerConfig as { days?: unknown }).days);
    if (!Number.isInteger(days) || days < 1) return [];
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const qb = this.leads
      .createQueryBuilder('l')
      .where('l.status = :open', { open: 'open' })
      .andWhere('COALESCE(l.lastActivityAt, l.createdAt) <= :cutoff', { cutoff })
      .orderBy('COALESCE(l.lastActivityAt, l.createdAt)', 'ASC')
      .take(BATCH);
    this.scopeToRule(qb, rule);
    return qb.getMany();
  }

  private async overdueLeads(rule: WorkflowRule, now: Date): Promise<Lead[]> {
    const qb = this.leads
      .createQueryBuilder('l')
      .where('l.status = :open', { open: 'open' })
      .andWhere('l.nextFollowUpAt IS NOT NULL AND l.nextFollowUpAt <= :now', { now })
      .orderBy('l.nextFollowUpAt', 'ASC')
      .take(BATCH);
    this.scopeToRule(qb, rule);
    return qb.getMany();
  }

  private scopeToRule(qb: SelectQueryBuilder<Lead>, rule: WorkflowRule): void {
    qb.andWhere('l.organizationId = :orgId', { orgId: rule.organizationId });
    if (rule.businessUnitId !== null) qb.andWhere('l.businessUnitId = :unitId', { unitId: rule.businessUnitId });
  }

  private async enabledRules(orgId: number, unitId: number, trigger: EventTrigger): Promise<WorkflowRule[]> {
    const all = await this.rules.find({ where: { organizationId: orgId, trigger, enabled: true } });
    return all
      .filter((r) => r.businessUnitId === null || r.businessUnitId === unitId)
      .sort((a, b) => a.id - b.id);
  }

  private eventMatches(rule: WorkflowRule, ctx: EventContext): boolean {
    const cfg = rule.triggerConfig ?? {};
    if (rule.trigger === 'field_changed') {
      return (ctx.changedFields ?? []).includes(String(cfg.field ?? ''));
    }
    if (rule.trigger === 'stage_changed') {
      if (cfg.toStageId !== undefined && cfg.toStageId !== null && Number(cfg.toStageId) !== ctx.toStageId) return false;
      if (cfg.fromStageId !== undefined && cfg.fromStageId !== null && Number(cfg.fromStageId) !== ctx.fromStageId) return false;
    }
    return true;
  }

  private async conditionsHold(rule: WorkflowRule, lead: Lead): Promise<boolean> {
    if (!rule.conditions || rule.conditions.length === 0) return true;
    const counts = rule.conditions.some((c) => c.field.startsWith('activity.'))
      ? await this.actions.activityCounts(lead.id)
      : {};
    return matchesAll(leadFacts(lead, counts), rule.conditions);
  }

  private async fire(rule: WorkflowRule, lead: Lead, actorUserId: number | null): Promise<void> {
    try {
      const result = await this.actions.run(lead, rule.actions, actorUserId);
      await this.runs.save(
        this.runs.create({
          organizationId: rule.organizationId,
          ruleId: rule.id,
          leadId: lead.id,
          trigger: rule.trigger,
          status: result.ok ? 'ok' : 'failed',
          detail: result.log.join('\n').slice(0, 2000),
        }),
      );
    } catch (err) {
      this.logger.error(`Workflow ${rule.id} failed on lead ${lead.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
