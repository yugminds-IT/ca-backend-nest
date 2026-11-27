import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Lead, LeadTask } from '../entities/crm.entities';
import { Sequence, SequenceEnrollment } from '../entities/automation.entities';
import { LeadActionsService } from './lead-actions.service';
import { fillTemplate, leadVariables, stepDueAt } from './rules';

export type StopReason =
  | 'stage_changed'
  | 'replied'
  | 'lead_closed'
  | 'suppressed'
  | 'no_email'
  | 'lead_deleted'
  | 'sequence_deleted'
  | 'stopped_by_user'
  | 'error';

@Injectable()
export class SequenceRunnerService {
  private readonly logger = new Logger(SequenceRunnerService.name);

  constructor(
    @InjectRepository(Sequence) private readonly sequences: Repository<Sequence>,
    @InjectRepository(SequenceEnrollment) private readonly enrollments: Repository<SequenceEnrollment>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    private readonly actions: LeadActionsService,
  ) {}

  /**
   * Stops a lead's active enrollments. With a flag, only sequences that have that setting on are stopped
   * (for example "stop when the stage changes"). Without a flag, all of them stop.
   */
  async stopForLead(
    leadId: number,
    reason: StopReason,
    flag?: 'stopOnStageChange' | 'stopOnReply',
  ): Promise<number> {
    const active = await this.enrollments.find({ where: { leadId, status: 'active' } });
    if (active.length === 0) return 0;
    let ids = active.map((e) => e.id);
    if (flag) {
      const seqs = await this.sequences.find({ where: { id: In(active.map((e) => e.sequenceId)) } });
      const stopOn = new Set(seqs.filter((s) => s[flag]).map((s) => s.id));
      ids = active.filter((e) => stopOn.has(e.sequenceId)).map((e) => e.id);
    }
    if (ids.length === 0) return 0;
    await this.enrollments.update({ id: In(ids) }, { status: 'stopped', stopReason: reason, nextStepAt: null });
    return ids.length;
  }

  async stopOne(enrollmentId: number, reason: StopReason): Promise<void> {
    await this.enrollments.update({ id: enrollmentId, status: 'active' }, { status: 'stopped', stopReason: reason, nextStepAt: null });
  }

  /** Runs every enrollment whose next step is due. Each enrollment is independent: one failure does not stop the rest. */
  async processDue(now: Date, limit = 200): Promise<{ processed: number; sent: number; stopped: number }> {
    const due = await this.enrollments.find({
      where: { status: 'active', nextStepAt: LessThanOrEqual(now) },
      order: { nextStepAt: 'ASC' },
      take: limit,
    });
    let sent = 0;
    let stopped = 0;
    for (const enrollment of due) {
      try {
        const outcome = await this.runStep(enrollment, now);
        if (outcome === 'sent') sent++;
        if (outcome === 'stopped') stopped++;
      } catch (err) {
        this.logger.error(`Sequence enrollment ${enrollment.id} failed: ${err instanceof Error ? err.message : err}`);
        await this.stopOne(enrollment.id, 'error');
        stopped++;
      }
    }
    return { processed: due.length, sent, stopped };
  }

  private async runStep(enrollment: SequenceEnrollment, now: Date): Promise<'sent' | 'stopped' | 'waiting'> {
    const sequence = await this.sequences.findOne({ where: { id: enrollment.sequenceId } });
    if (!sequence) {
      await this.stopOne(enrollment.id, 'sequence_deleted');
      return 'stopped';
    }
    if (!sequence.enabled) return 'waiting';

    const lead = await this.leads.findOne({ where: { id: enrollment.leadId } });
    if (!lead) {
      await this.stopOne(enrollment.id, 'lead_deleted');
      return 'stopped';
    }
    if (lead.status !== 'open') {
      await this.stopOne(enrollment.id, 'lead_closed');
      return 'stopped';
    }

    const step = sequence.steps[enrollment.currentStep];
    if (!step) {
      await this.enrollments.update({ id: enrollment.id }, { status: 'completed', nextStepAt: null });
      return 'stopped';
    }

    if (step.kind === 'email') {
      if (!lead.email) {
        await this.stopOne(enrollment.id, 'no_email');
        return 'stopped';
      }
      const result = await this.actions.emailLead(
        lead,
        { subject: step.subject ?? undefined, body: step.body ?? undefined, templateId: step.templateId ?? null },
        { sequenceId: sequence.id },
      );
      if (result.status === 'suppressed') {
        await this.stopOne(enrollment.id, 'suppressed');
        await this.actions.logActivity(lead.organizationId, lead.id, null, 'system', `Sequence "${sequence.name}" stopped: recipient is suppressed`, false);
        return 'stopped';
      }
      await this.actions.logActivity(
        lead.organizationId,
        lead.id,
        null,
        'system',
        `Sequence "${sequence.name}" email sent: ${result.subject}`,
        false,
      );
    } else {
      const title = fillTemplate(step.taskTitle ?? 'Follow up', leadVariables(lead)).trim() || 'Follow up';
      await this.actions.createTask(lead, {
        title: `${title} (${sequence.name})`,
        dueAt: now,
        assignedToUserId: lead.ownerUserId,
        createdByUserId: null,
      });
    }

    const nextStep = enrollment.currentStep + 1;
    const nextAt = stepDueAt(sequence.steps, nextStep, now);
    if (nextAt === null) {
      await this.enrollments.update({ id: enrollment.id }, { currentStep: nextStep, status: 'completed', nextStepAt: null });
    } else {
      await this.enrollments.update({ id: enrollment.id }, { currentStep: nextStep, nextStepAt: nextAt });
    }
    return 'sent';
  }
}
