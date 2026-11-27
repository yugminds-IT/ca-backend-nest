/**
 * Pure rules for the assistant. No database and no network, so they are easy to test.
 * Suggestions work without any AI key. The model only improves wording when one is configured.
 */

export interface NextActionInput {
  status: 'open' | 'won' | 'lost';
  ownerUserId: number | null;
  firstResponseDueAt: Date | null;
  firstRespondedAt: Date | null;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date | null;
  openTaskCount: number;
  now: Date;
}

export interface NextAction {
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
}

const DAY_MS = 86_400_000;
const IDLE_DAYS = 3;

/** Ranked next steps for one lead. Empty when the lead is closed or nothing needs attention. */
export function suggestNextActions(input: NextActionInput): NextAction[] {
  if (input.status !== 'open') return [];
  const actions: NextAction[] = [];
  const now = input.now.getTime();

  if (input.ownerUserId == null) {
    actions.push({
      priority: 'high',
      title: 'Assign an owner',
      reason: 'Unassigned leads are the ones most likely to go cold.',
    });
  }

  if (input.firstResponseDueAt && !input.firstRespondedAt) {
    if (now > input.firstResponseDueAt.getTime()) {
      actions.push({
        priority: 'high',
        title: 'Reply now',
        reason: 'The first-response SLA is overdue.',
      });
    } else {
      actions.push({
        priority: 'medium',
        title: 'Send the first response',
        reason: `First response is due ${input.firstResponseDueAt.toISOString()}.`,
      });
    }
  }

  if (input.nextFollowUpAt && input.nextFollowUpAt.getTime() < now) {
    actions.push({
      priority: 'high',
      title: 'Follow up now',
      reason: `The follow-up was due ${input.nextFollowUpAt.toISOString()}.`,
    });
  }

  if (input.lastActivityAt) {
    const idleDays = Math.floor((now - input.lastActivityAt.getTime()) / DAY_MS);
    if (idleDays >= IDLE_DAYS) {
      actions.push({
        priority: 'medium',
        title: 'Re-engage this lead',
        reason: `No activity for ${idleDays} days.`,
      });
    }
  }

  if (input.openTaskCount === 0) {
    actions.push({
      priority: 'medium',
      title: 'Schedule the next step',
      reason: 'No open task is set for this lead.',
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return actions.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export type DraftTone = 'formal' | 'friendly' | 'brief';

export interface DraftInput {
  leadName: string;
  company?: string | null;
  unitName: string;
  intent?: string | null;
  tone: DraftTone;
}

const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || 'there';

/** Plain template reply used when no AI key is configured. Editable before sending. */
export function templateDraft(input: DraftInput): { subject: string; body: string } {
  const first = firstNameOf(input.leadName);
  const intent = (input.intent ?? '').trim();
  const greeting = input.tone === 'formal' ? `Dear ${input.leadName.trim() || 'Sir/Madam'},` : `Hi ${first},`;
  const subject = `Re: your enquiry with ${input.unitName}`;
  const middle = intent
    ? intent
    : `Thank you for getting in touch with ${input.unitName}. We would be glad to help and will follow up with the next steps shortly.`;
  const closing =
    input.tone === 'brief'
      ? 'Let us know a good time to talk.'
      : 'Please reply to this email or tell us a convenient time to talk, and we will take it from there.';
  const body = [greeting, '', middle, '', closing, '', 'Regards,', input.unitName].join('\n');
  return { subject, body };
}

/**
 * Light cleanup for call and meeting notes: trims, collapses blank runs and repeated spaces,
 * removes consecutive duplicate lines, and capitalizes the start of each sentence.
 */
export function cleanNotes(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    if (line !== '' && out.length && out[out.length - 1] === line) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out
    .map((l) => l.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p, c: string) => `${p}${c.toUpperCase()}`))
    .join('\n');
}
