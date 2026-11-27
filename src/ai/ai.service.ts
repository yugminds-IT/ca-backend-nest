import { BillingService } from '../billing/billing.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Lead, LeadActivity, LeadTask } from '../entities/crm.entities';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { canSeeLead } from '../access/permissions';
import { assertRecordInOrg, denyClients } from '../leads/lead-scope.util';
import { completeChat, llmSettingsFromEnv, LlmSettings } from './ai.llm';
import { requireOrgScope } from '../leads/lead-scope.util';
import {
  DraftTone,
  NextAction,
  cleanNotes,
  suggestNextActions,
  templateDraft,
} from './ai.rules';

export interface DraftReplyResult {
  subject: string;
  body: string;
  source: 'model' | 'template';
}

/**
 * Sales assistant. Next steps and the reply template work without any AI key.
 * When AI_API_KEY is set, reply drafts and note cleanup are written by the model, and fall back to the rules if the call fails.
 */
@Injectable()
export class AiService {
  private readonly llm: LlmSettings | null = llmSettingsFromEnv();

  constructor(
    private readonly billing: BillingService,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    @InjectRepository(BusinessUnit) private readonly units: Repository<BusinessUnit>,
    private readonly access: AccessService,
  ) {}

  status() {
    return { modelConfigured: this.llm !== null };
  }

  private async loadLead(user: User, leadId: number): Promise<Lead> {
    denyClients(user);
    const lead = await this.leads.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    assertRecordInOrg(user, lead.organizationId);
    const ctx = await this.access.contextFor(user);
    if (!canSeeLead(ctx, lead)) throw new NotFoundException('Lead not found');
    return lead;
  }

  async nextActions(user: User, leadId: number): Promise<{ actions: NextAction[] }> {
    const lead = await this.loadLead(user, leadId);
    const [lastActivity, openTaskCount] = await Promise.all([
      this.activities.findOne({ where: { leadId: lead.id }, order: { createdAt: 'DESC' } }),
      this.tasks.count({ where: { leadId: lead.id, completedAt: IsNull() } }),
    ]);
    const now = new Date();
    return {
      actions: suggestNextActions({
        status: lead.status,
        ownerUserId: lead.ownerUserId,
        firstResponseDueAt: lead.firstResponseDueAt,
        firstRespondedAt: lead.firstRespondedAt,
        nextFollowUpAt: lead.nextFollowUpAt,
        lastActivityAt: lastActivity?.createdAt ?? lead.lastActivityAt ?? null,
        openTaskCount,
        now,
      }),
    };
  }

  async draftReply(
    user: User,
    leadId: number,
    input: { intent?: string; tone?: DraftTone },
  ): Promise<DraftReplyResult> {
    const lead = await this.loadLead(user, leadId);
    const unit = await this.units.findOne({ where: { id: lead.businessUnitId } });
    const unitName = unit?.name ?? 'our team';
    const tone: DraftTone = input.tone ?? 'friendly';
    const fallback = templateDraft({
      leadName: lead.name,
      company: lead.company,
      unitName,
      intent: input.intent,
      tone,
    });
    if (!this.llm) return { ...fallback, source: 'template' };
    // Each model call uses one of the plan's monthly AI credits. With none left, the standard template is used.
    if (!(await this.billing.consumeAiCredit(lead.organizationId))) return { ...fallback, source: 'template' };

    const recent = await this.activities.find({
      where: { leadId: lead.id },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    const history = recent
      .reverse()
      .map((a) => `- ${a.type}: ${(a.body ?? '').slice(0, 300)}`)
      .join('\n');
    const system =
      'You write short sales emails for a small business CRM. Reply with JSON only: {"subject": string, "body": string}. ' +
      'The body is plain text with line breaks, no HTML, no invented prices, dates or promises. Keep it under 120 words.';
    const userPrompt = [
      `Brand: ${unitName}`,
      `Tone: ${tone}`,
      `Lead name: ${lead.name}`,
      lead.company ? `Company: ${lead.company}` : '',
      input.intent ? `What to say: ${input.intent.slice(0, 1000)}` : '',
      history ? `Recent activity:\n${history}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const text = await completeChat(this.llm, system, userPrompt);
    const parsed = parseDraftJson(text);
    if (!parsed) return { ...fallback, source: 'template' };
    return { ...parsed, source: 'model' };
  }

  /** Cleans call or meeting notes. Rules always run; the model is used for wording only when configured. */
  async cleanNote(user: User, text: string): Promise<{ text: string; source: 'model' | 'rules' }> {
    denyClients(user);
    const ruled = cleanNotes(text);
    if (!this.llm) return { text: ruled, source: 'rules' };
    if (!(await this.billing.consumeAiCredit(requireOrgScope(user)))) return { text: ruled, source: 'rules' };
    const system =
      'You tidy CRM call notes. Keep every fact, name, number and date. Remove filler, fix grammar, and use short plain sentences. Reply with the cleaned note only.';
    const out = await completeChat(this.llm, system, text.slice(0, 4000));
    if (!out) return { text: ruled, source: 'rules' };
    return { text: cleanNotes(out), source: 'model' };
  }
}

/** Accepts a bare JSON object or one wrapped in a Markdown fence. */
export function parseDraftJson(raw: string | null): { subject: string; body: string } | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { subject?: unknown; body?: unknown };
    if (typeof obj.subject !== 'string' || typeof obj.body !== 'string') return null;
    const subject = obj.subject.trim().slice(0, 255);
    const body = obj.body.trim();
    if (!subject || !body) return null;
    return { subject, body };
  } catch {
    return null;
  }
}
