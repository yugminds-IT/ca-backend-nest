/**
 * Automation rules as pure functions: field facts, conditions, owner picking, scoring, sequence timing,
 * SLA maths and validation. No database, so every rule here is easy to test.
 */
import type { AssignmentStrategy, WorkflowTrigger } from '../entities/automation.entities';

export const CORE_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
  'source',
  'value',
  'status',
  'tags',
  'ownerUserId',
] as const;

export const ACTIVITY_FACTS = [
  'call',
  'email',
  'meeting',
  'note',
  'email_opened',
  'email_clicked',
  'email_received',
] as const;

/** Fields a "field changed" trigger may watch. Status changes come from stage moves, so they have their own trigger. */
const CHANGEABLE_FIELDS = ['name', 'email', 'phone', 'company', 'source', 'value', 'tags', 'ownerUserId'];

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  'lead_created',
  'stage_changed',
  'field_changed',
  'lead_inactive',
  'followup_overdue',
];

export const WORKFLOW_ACTIONS = ['assign', 'create_task', 'add_tag', 'notify', 'send_email', 'set_follow_up'] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTIONS)[number];

export const CONDITION_OPS = ['exists', 'equals', 'contains', 'gte'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const MAX_CONDITIONS = 10;
export const MAX_ACTIONS = 10;

export type FactValue = string | number | string[] | null | undefined;
export type LeadFacts = Record<string, FactValue>;

export interface LeadFactSource {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  value: number | string | null;
  status: string;
  tags: string[];
  ownerUserId: number | null;
  customData?: Record<string, unknown> | null;
}

/** A stored condition. `op` is checked at run time, so an unknown operator simply never matches. */
export interface Condition {
  field: string;
  op: string;
  value?: string | number | null;
}

/** Whether a field name is allowed in conditions, scoring and triggers. */
export function isAllowedField(field: string): boolean {
  if ((CORE_FIELDS as readonly string[]).includes(field)) return true;
  if (/^customData\.[a-z0-9_]{1,60}$/.test(field)) return true;
  if (/^activity\.[a-z_]{1,30}$/.test(field)) {
    return (ACTIVITY_FACTS as readonly string[]).includes(field.slice('activity.'.length));
  }
  return false;
}

/** The values a rule can look at for one lead. Activity counts come in as `activity.<type>`. */
export function leadFacts(lead: LeadFactSource, activityCounts: Record<string, number> = {}): LeadFacts {
  const facts: LeadFacts = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    source: lead.source,
    value: lead.value === null || lead.value === undefined ? null : Number(lead.value),
    status: lead.status,
    tags: lead.tags ?? [],
    ownerUserId: lead.ownerUserId,
  };
  for (const [key, value] of Object.entries(lead.customData ?? {})) {
    facts[`customData.${key}`] = value === null || value === undefined ? null : String(value);
  }
  for (const type of ACTIVITY_FACTS) {
    facts[`activity.${type}`] = activityCounts[type] ?? 0;
  }
  return facts;
}

function isEmpty(v: FactValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function matchesCondition(facts: LeadFacts, cond: Condition): boolean {
  const v = facts[cond.field];
  switch (cond.op) {
    case 'exists':
      return !isEmpty(v) && v !== 0;
    case 'equals': {
      const want = String(cond.value ?? '').trim().toLowerCase();
      if (Array.isArray(v)) return v.some((t) => String(t).toLowerCase() === want);
      if (typeof v === 'number') return Number(cond.value) === v;
      return v !== null && v !== undefined && String(v).trim().toLowerCase() === want;
    }
    case 'contains': {
      const want = String(cond.value ?? '').trim().toLowerCase();
      if (!want) return false;
      if (Array.isArray(v)) return v.some((t) => String(t).toLowerCase().includes(want));
      return v !== null && v !== undefined && String(v).toLowerCase().includes(want);
    }
    case 'gte': {
      const n = typeof v === 'number' ? v : Number(v);
      const want = Number(cond.value);
      return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && Number.isFinite(want) && n >= want;
    }
    default:
      return false;
  }
}

export function matchesAll(facts: LeadFacts, conditions: Condition[]): boolean {
  return conditions.every((c) => matchesCondition(facts, c));
}

// ---------------------------------------------------------------- assignment

export interface AssignmentRuleLike {
  id: number;
  strategy: AssignmentStrategy;
  priority: number;
  enabled: boolean;
  memberUserIds: number[];
  conditionField: string | null;
  conditionValue: string | null;
  targetUserId: number | null;
  cursorUserId: number | null;
}

export interface OwnerPick {
  userId: number;
  ruleId: number;
  /** Round robin only: store this as the rule's cursor. */
  nextCursor?: number;
}

/** The first id after `cursor` in ascending order, wrapping around. */
export function nextAfter(sortedIds: number[], cursor: number | null): number {
  const next = sortedIds.find((id) => cursor === null || id > cursor);
  return next ?? sortedIds[0];
}

/**
 * Picks an owner from the enabled rules, in priority order.
 * `pool` is the active staff in the unit. `loads` is open leads per person, for load balancing.
 * A rule with no eligible person is skipped, so the next rule can still assign the lead.
 */
export function pickOwner(
  rules: AssignmentRuleLike[],
  facts: LeadFacts,
  pool: number[],
  loads: Map<number, number>,
): OwnerPick | null {
  const ordered = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const rule of ordered) {
    const eligible = [...new Set(rule.memberUserIds.length ? pool.filter((id) => rule.memberUserIds.includes(id)) : pool)].sort(
      (a, b) => a - b,
    );
    if (rule.strategy === 'by_field') {
      if (!rule.conditionField || rule.targetUserId === null) continue;
      const hit = matchesCondition(facts, {
        field: rule.conditionField,
        op: 'equals',
        value: rule.conditionValue ?? '',
      });
      if (hit && eligible.includes(rule.targetUserId)) return { userId: rule.targetUserId, ruleId: rule.id };
      continue;
    }
    if (eligible.length === 0) continue;
    if (rule.strategy === 'round_robin') {
      const userId = nextAfter(eligible, rule.cursorUserId);
      return { userId, ruleId: rule.id, nextCursor: userId };
    }
    // load_balanced: fewest open leads, then the lowest id.
    const userId = [...eligible].sort((a, b) => (loads.get(a) ?? 0) - (loads.get(b) ?? 0) || a - b)[0];
    return { userId, ruleId: rule.id };
  }
  return null;
}

// ---------------------------------------------------------------- scoring

export interface ScoringRuleLike {
  field: string;
  op: string;
  value: string | null;
  points: number;
  enabled: boolean;
}

export const MAX_SCORE = 100;

/** Sum of the points for every matching rule, clamped to 0 to 100. */
export function computeScore(rules: ScoringRuleLike[], facts: LeadFacts): number {
  let total = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (matchesCondition(facts, { field: rule.field, op: rule.op, value: rule.value })) {
      total += rule.points;
    }
  }
  return Math.min(MAX_SCORE, Math.max(0, total));
}

// ---------------------------------------------------------------- sequences

export interface SequenceStepLike {
  delayDays: number;
  kind: 'email' | 'task';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a step is due: `delayDays` after `from`. Null when the index is past the last step. */
export function stepDueAt(steps: SequenceStepLike[], index: number, from: Date): Date | null {
  if (index < 0 || index >= steps.length) return null;
  return new Date(from.getTime() + Math.max(0, steps[index].delayDays) * DAY_MS);
}

// ---------------------------------------------------------------- SLA

export const FIRST_RESPONSE_TYPES = ['call', 'email', 'meeting', 'note'] as const;

/** A staff reply counts as the first response. System events and inbound mail do not. */
export function countsAsFirstResponse(type: string, actorUserId: number | null): boolean {
  return actorUserId !== null && (FIRST_RESPONSE_TYPES as readonly string[]).includes(type);
}

export function firstResponseDeadline(from: Date, minutes: number): Date {
  return new Date(from.getTime() + Math.max(1, minutes) * 60 * 1000);
}

/** True when the deadline has passed with no reply and no escalation yet. */
export function isSlaBreached(
  lead: { status: string; firstRespondedAt: Date | null; firstResponseDueAt: Date | null; slaEscalatedAt: Date | null },
  now: Date,
): boolean {
  return (
    lead.status === 'open' &&
    lead.firstRespondedAt === null &&
    lead.slaEscalatedAt === null &&
    lead.firstResponseDueAt !== null &&
    lead.firstResponseDueAt.getTime() <= now.getTime()
  );
}

// ---------------------------------------------------------------- validation

export interface WorkflowInput {
  name?: string;
  trigger?: string;
  triggerConfig?: Record<string, unknown>;
  conditions?: Array<{ field?: string; op?: string; value?: unknown }>;
  actions?: Array<Record<string, unknown>>;
}

/** Problems with a workflow definition. Empty means it can be saved. */
export function validateWorkflow(input: WorkflowInput): string[] {
  const problems: string[] = [];
  if (!input.name || !input.name.trim()) problems.push('Give the workflow a name');
  if (!input.trigger || !(WORKFLOW_TRIGGERS as string[]).includes(input.trigger)) {
    problems.push('Pick a valid trigger');
    return problems;
  }
  const cfg = input.triggerConfig ?? {};
  if (input.trigger === 'field_changed') {
    const field = cfg.field;
    const ok =
      typeof field === 'string' &&
      (CHANGEABLE_FIELDS.includes(field) || /^customData\.[a-z0-9_]{1,60}$/.test(field));
    if (!ok) problems.push('Pick the field to watch');
  }
  if (input.trigger === 'lead_inactive') {
    const days = Number(cfg.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) problems.push('Inactive days must be 1 to 365');
  }
  if (input.trigger === 'stage_changed' && cfg.toStageId !== undefined && cfg.toStageId !== null) {
    if (!Number.isInteger(Number(cfg.toStageId)) || Number(cfg.toStageId) < 1) problems.push('Pick a valid stage');
  }

  const conditions = input.conditions ?? [];
  if (conditions.length > MAX_CONDITIONS) problems.push(`At most ${MAX_CONDITIONS} conditions`);
  conditions.forEach((c, i) => {
    if (!c.field || !isAllowedField(c.field)) problems.push(`Condition ${i + 1}: unknown field`);
    if (!c.op || !(CONDITION_OPS as readonly string[]).includes(c.op)) problems.push(`Condition ${i + 1}: unknown operator`);
    if ((c.op === 'equals' || c.op === 'contains') && (c.value === undefined || c.value === null || c.value === '')) {
      problems.push(`Condition ${i + 1}: enter a value`);
    }
    if (c.op === 'gte' && !Number.isFinite(Number(c.value))) problems.push(`Condition ${i + 1}: enter a number`);
  });

  const actions = input.actions ?? [];
  if (actions.length === 0) problems.push('Add at least one action');
  if (actions.length > MAX_ACTIONS) problems.push(`At most ${MAX_ACTIONS} actions`);
  actions.forEach((a, i) => {
    const n = i + 1;
    const type = String(a.type ?? '');
    if (!(WORKFLOW_ACTIONS as readonly string[]).includes(type)) {
      problems.push(`Action ${n}: unknown type`);
      return;
    }
    if (type === 'assign' && !Number.isInteger(Number(a.userId))) problems.push(`Action ${n}: choose a person`);
    if (type === 'create_task' && !String(a.title ?? '').trim()) problems.push(`Action ${n}: give the task a title`);
    if (type === 'create_task' && a.dueInDays !== undefined && !(Number(a.dueInDays) >= 0 && Number(a.dueInDays) <= 365)) {
      problems.push(`Action ${n}: due in 0 to 365 days`);
    }
    if (type === 'add_tag' && !String(a.tag ?? '').trim()) problems.push(`Action ${n}: give the tag`);
    if (type === 'notify' && !String(a.message ?? '').trim()) problems.push(`Action ${n}: write the message`);
    if (type === 'set_follow_up' && !(Number(a.inDays) >= 0 && Number(a.inDays) <= 365)) {
      problems.push(`Action ${n}: follow up in 0 to 365 days`);
    }
    if (type === 'send_email' && !a.templateId && !(String(a.subject ?? '').trim() && String(a.body ?? '').trim())) {
      problems.push(`Action ${n}: pick a template or write a subject and body`);
    }
  });
  return problems;
}

export interface SequenceInput {
  name?: string;
  steps?: Array<Record<string, unknown>>;
}

export function validateSequence(input: SequenceInput): string[] {
  const problems: string[] = [];
  if (!input.name || !input.name.trim()) problems.push('Give the sequence a name');
  const steps = input.steps ?? [];
  if (steps.length === 0) problems.push('Add at least one step');
  if (steps.length > 20) problems.push('At most 20 steps');
  steps.forEach((s, i) => {
    const n = i + 1;
    const delay = Number(s.delayDays);
    if (!Number.isInteger(delay) || delay < 0 || delay > 365) problems.push(`Step ${n}: wait 0 to 365 days`);
    if (s.kind === 'email') {
      if (!s.templateId && !(String(s.subject ?? '').trim() && String(s.body ?? '').trim())) {
        problems.push(`Step ${n}: pick a template or write a subject and body`);
      }
    } else if (s.kind === 'task') {
      if (!String(s.taskTitle ?? '').trim()) problems.push(`Step ${n}: give the task a title`);
    } else {
      problems.push(`Step ${n}: kind must be email or task`);
    }
  });
  return problems;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text to HTML: escaped, with line breaks kept. */
export function plainToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br/>');
}

/**
 * Replaces `{{key}}` with the value from `vars`. Unknown or empty keys become an empty string.
 * Pass `escape` for HTML bodies so user-entered values cannot inject markup.
 */
export function fillTemplate(
  text: string,
  vars: Record<string, string | number | null | undefined>,
  opts: { escape?: boolean } = {},
): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,40})\s*\}\}/g, (_m, key: string) => {
    const raw = vars[key];
    const value = raw === null || raw === undefined ? '' : String(raw);
    return opts.escape ? escapeHtml(value) : value;
  });
}

/** The lead values a message can use in `{{...}}`. */
export function leadVariables(lead: {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
}): Record<string, string> {
  return {
    name: lead.name ?? '',
    first_name: (lead.name ?? '').trim().split(/\s+/)[0] ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    company: lead.company ?? '',
    source: lead.source ?? '',
  };
}

export interface AssignmentRuleInput {
  name?: string;
  strategy?: string;
  conditionField?: string | null;
  conditionValue?: string | null;
  targetUserId?: number | null;
}

/** Assignment rule definitions. Empty means valid. */
export function validateAssignmentRule(input: AssignmentRuleInput): string[] {
  const problems: string[] = [];
  if (!input.name || !input.name.trim()) problems.push('Give the rule a name');
  if (!['round_robin', 'load_balanced', 'by_field'].includes(String(input.strategy))) {
    problems.push('Pick a strategy');
    return problems;
  }
  if (input.strategy === 'by_field') {
    if (!input.conditionField || !isAllowedField(input.conditionField)) problems.push('Pick the lead field to match');
    if (!String(input.conditionValue ?? '').trim()) problems.push('Enter the value to match');
    if (input.targetUserId === null || input.targetUserId === undefined) problems.push('Pick who gets matching leads');
  }
  return problems;
}

/** The fields that can trigger "field changed" rules. Take one before an edit, then diff after. */
export function leadSnapshot(lead: {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  value: number | string | null;
  tags: string[];
  ownerUserId: number | null;
  customData?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    source: lead.source,
    value: lead.value === null || lead.value === undefined ? null : Number(lead.value),
    tags: [...(lead.tags ?? [])],
    ownerUserId: lead.ownerUserId,
    customData: { ...(lead.customData ?? {}) },
  };
}

/**
 * Field keys that changed between two snapshots of a lead. Custom data is compared key by key,
 * as `customData.<key>`. Values are compared as JSON, so 1 and "1" differ.
 */
export function diffLeadFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === 'customData') {
      const b = (before.customData ?? {}) as Record<string, unknown>;
      const a = (after.customData ?? {}) as Record<string, unknown>;
      for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)) changed.push(`customData.${k}`);
      }
    } else if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changed.push(key);
    }
  }
  return changed.sort();
}

/** Scoring rule definitions. Empty means valid. */
export function validateScoringRule(input: { field?: string; op?: string; value?: string | null; points?: number }): string[] {
  const problems: string[] = [];
  if (!input.field || !isAllowedField(input.field)) problems.push('Pick a valid field');
  if (!input.op || !(CONDITION_OPS as readonly string[]).includes(input.op)) problems.push('Pick a valid operator');
  if (input.op === 'gte' && !Number.isFinite(Number(input.value))) problems.push('Enter a number');
  if ((input.op === 'equals' || input.op === 'contains') && !String(input.value ?? '').trim()) {
    problems.push('Enter a value to compare with');
  }
  if (!Number.isInteger(input.points) || Math.abs(Number(input.points)) > 100) problems.push('Points must be -100 to 100');
  return problems;
}
