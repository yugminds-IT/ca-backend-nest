import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadActivity, LeadActivityType, LeadTask } from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { EventsGateway } from '../events/events.gateway';
import { STAFF_ROLE_NAMES } from '../access/permissions';
import { CRM_MAIL_SENDER, CrmMailSender } from './automation.tokens';
import { fillTemplate, leadVariables, plainToHtml } from './rules';

export interface ActionRunResult {
  ok: boolean;
  log: string[];
}

export interface LeadEmailInput {
  subject?: string;
  body?: string;
  templateId?: number | null;
}

function errorText(err: unknown): string {
  if (err instanceof BadRequestException) {
    const res = err.getResponse() as { message?: string | string[] } | string;
    if (typeof res === 'string') return res;
    return Array.isArray(res.message) ? res.message.join('; ') : (res.message ?? err.message);
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

/**
 * Side effects on one lead: activity logs, tasks, tags, follow-ups, notifications and tracked email.
 * Used by workflows, sequences and the manual "email this lead" action. Writes go through targeted
 * updates so a stale in-memory lead cannot overwrite a newer edit.
 */
@Injectable()
export class LeadActionsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly events: EventsGateway,
    private readonly moduleRef: ModuleRef,
  ) {}

  async logActivity(
    orgId: number,
    leadId: number,
    userId: number | null,
    type: LeadActivityType,
    body: string,
    touchLastActivity = true,
  ): Promise<LeadActivity> {
    const saved = await this.activities.save(
      this.activities.create({
        organizationId: orgId,
        leadId,
        type,
        body: body.slice(0, 5000),
        createdByUserId: userId,
      }),
    );
    if (touchLastActivity) await this.leads.update({ id: leadId }, { lastActivityAt: new Date() });
    return saved;
  }

  /** Counts of each activity type on a lead, for scoring rules like "at least 2 emails opened". */
  async activityCounts(leadId: number): Promise<Record<string, number>> {
    const rows = await this.activities
      .createQueryBuilder('a')
      .select('a.type', 'type')
      .addSelect('COUNT(*)', 'n')
      .where('a.leadId = :leadId', { leadId })
      .groupBy('a.type')
      .getRawMany<{ type: string; n: string }>();
    return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
  }

  async createTask(
    lead: Lead,
    input: { title: string; dueAt: Date | null; assignedToUserId: number | null; createdByUserId: number | null },
  ): Promise<LeadTask> {
    return this.tasks.save(
      this.tasks.create({
        organizationId: lead.organizationId,
        leadId: lead.id,
        title: input.title.slice(0, 255),
        dueAt: input.dueAt,
        assignedToUserId: input.assignedToUserId,
        createdByUserId: input.createdByUserId,
        completedAt: null,
      }),
    );
  }

  /**
   * Runs workflow actions in order. A failing action is recorded and the rest still run.
   * Returns the per-action log so the run history can show what happened.
   */
  async run(lead: Lead, actions: Array<Record<string, unknown>>, actorUserId: number | null): Promise<ActionRunResult> {
    const log: string[] = [];
    let ok = true;
    for (const [i, action] of actions.entries()) {
      try {
        log.push(await this.runOne(lead, action, actorUserId));
      } catch (err) {
        ok = false;
        log.push(`Action ${i + 1} failed: ${errorText(err)}`);
      }
    }
    return { ok, log };
  }

  private async runOne(lead: Lead, action: Record<string, unknown>, actorUserId: number | null): Promise<string> {
    const now = new Date();
    switch (action.type) {
      case 'assign': {
        const userId = Number(action.userId);
        await this.assertActiveStaff(lead.organizationId, userId);
        await this.leads.update({ id: lead.id }, { ownerUserId: userId });
        lead.ownerUserId = userId;
        return `Assigned to user #${userId}`;
      }
      case 'create_task': {
        const title = fillTemplate(String(action.title ?? ''), leadVariables(lead)).trim();
        const days = action.dueInDays === undefined || action.dueInDays === null ? null : Number(action.dueInDays);
        const dueAt = days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        await this.createTask(lead, {
          title,
          dueAt,
          assignedToUserId: lead.ownerUserId,
          createdByUserId: actorUserId,
        });
        return `Created task "${title}"`;
      }
      case 'add_tag': {
        const tag = String(action.tag ?? '').trim().toLowerCase().slice(0, 40);
        const tags = [...new Set([...(lead.tags ?? []), tag])];
        await this.leads.update({ id: lead.id }, { tags });
        lead.tags = tags;
        return `Added tag "${tag}"`;
      }
      case 'set_follow_up': {
        const days = Number(action.inDays ?? 0);
        const when = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        await this.leads.update({ id: lead.id }, { nextFollowUpAt: when });
        lead.nextFollowUpAt = when;
        return `Follow-up set for ${when.toISOString().slice(0, 10)}`;
      }
      case 'notify': {
        const message = fillTemplate(String(action.message ?? ''), leadVariables(lead)).trim();
        this.events.emitToOrg(lead.organizationId, 'lead.notification', {
          leadId: lead.id,
          name: lead.name,
          ownerUserId: lead.ownerUserId,
          message,
        });
        await this.logActivity(lead.organizationId, lead.id, null, 'system', `Notification: ${message}`, false);
        return 'Notified the team';
      }
      case 'send_email': {
        const result = await this.emailLead(
          lead,
          {
            subject: action.subject === undefined ? undefined : String(action.subject),
            body: action.body === undefined ? undefined : String(action.body),
            templateId: action.templateId === undefined || action.templateId === null ? null : Number(action.templateId),
          },
          {},
        );
        if (result.status === 'suppressed') throw new BadRequestException('The recipient has unsubscribed or bounced');
        await this.logActivity(lead.organizationId, lead.id, null, 'system', `Automated email sent: ${result.subject}`, false);
        return `Sent email "${result.subject}"`;
      }
      default:
        throw new BadRequestException(`Unknown action "${String(action.type)}"`);
    }
  }

  /**
   * Sends a tracked email to a lead through the same path as the developer API, so suppression,
   * unit sending accounts, open and click tracking, and the email log all apply. The lead id is passed
   * out of band so API callers cannot attach a lead to their own sends.
   */
  async emailLead(
    lead: Lead,
    input: LeadEmailInput,
    crm: { sequenceId?: number },
  ): Promise<{ id: string; status: string; subject: string }> {
    if (!lead.email) throw new BadRequestException('This lead has no email address');
    const sender = this.moduleRef.get<CrmMailSender>(CRM_MAIL_SENDER, { strict: false });
    const variables = leadVariables(lead);
    const subject = fillTemplate(input.subject ?? '', variables).trim();
    const body = fillTemplate(input.body ?? '', variables);
    const templateId = input.templateId ?? null;

    if (templateId) {
      const result = await sender.sendTransactional(
        lead.organizationId,
        null,
        { to: lead.email, subject: subject || 'Message', templateId, variables },
        lead.businessUnitId,
        { leadId: lead.id, ...(crm.sequenceId ? { sequenceId: crm.sequenceId } : {}) },
      );
      return { id: result.id, status: result.status, subject: subject || '(template subject)' };
    }

    if (!subject) throw new BadRequestException('Write a subject for the email');
    const result = await sender.sendTransactional(
      lead.organizationId,
      null,
      { to: lead.email, subject, html: plainToHtml(body), text: body, variables },
      lead.businessUnitId,
      { leadId: lead.id, ...(crm.sequenceId ? { sequenceId: crm.sequenceId } : {}) },
    );
    return { id: result.id, status: result.status, subject };
  }

  private async assertActiveStaff(orgId: number, userId: number): Promise<void> {
    if (!Number.isInteger(userId)) throw new BadRequestException('Choose a person');
    const user = await this.users.findOne({
      where: { id: userId, organizationId: orgId, isActive: true },
      relations: { role: true },
    });
    if (!user || !STAFF_ROLE_NAMES.includes(user.role?.name ?? '')) {
      throw new BadRequestException(`User #${userId} is not active staff in this organization`);
    }
  }
}
