import {
  AssignmentRuleLike,
  computeScore,
  countsAsFirstResponse,
  diffLeadFields,
  fillTemplate,
  firstResponseDeadline,
  leadVariables,
  plainToHtml,
  validateAssignmentRule,
  isAllowedField,
  isSlaBreached,
  leadFacts,
  matchesCondition,
  nextAfter,
  pickOwner,
  stepDueAt,
  validateScoringRule,
  validateSequence,
  validateWorkflow,
} from './rules';

const lead = {
  name: 'Asha',
  email: 'asha@example.com',
  phone: '+971501234567',
  company: 'Lumen Co',
  source: 'Tavaro website',
  value: '12000.50',
  status: 'open',
  tags: ['vip', 'resort'],
  ownerUserId: null,
  customData: { budget: 50000, city: 'Dubai' },
};

describe('leadFacts and conditions', () => {
  const facts = leadFacts(lead, { email_opened: 3, call: 0 });

  it('exposes core fields, custom data and activity counts', () => {
    expect(facts.company).toBe('Lumen Co');
    expect(facts.value).toBe(12000.5);
    expect(facts['customData.budget']).toBe('50000');
    expect(facts['activity.email_opened']).toBe(3);
    expect(facts['activity.call']).toBe(0);
  });

  it('equals ignores case and surrounding spaces', () => {
    expect(matchesCondition(facts, { field: 'source', op: 'equals', value: '  tavaro WEBSITE ' })).toBe(true);
    expect(matchesCondition(facts, { field: 'source', op: 'equals', value: 'Other' })).toBe(false);
  });

  it('contains works on text and on tags', () => {
    expect(matchesCondition(facts, { field: 'company', op: 'contains', value: 'lumen' })).toBe(true);
    expect(matchesCondition(facts, { field: 'tags', op: 'contains', value: 'VIP' })).toBe(true);
    expect(matchesCondition(facts, { field: 'tags', op: 'equals', value: 'resort' })).toBe(true);
    expect(matchesCondition(facts, { field: 'company', op: 'contains', value: '' })).toBe(false);
  });

  it('exists treats empty text, empty lists and zero counts as missing', () => {
    expect(matchesCondition(facts, { field: 'phone', op: 'exists' })).toBe(true);
    expect(matchesCondition(facts, { field: 'ownerUserId', op: 'exists' })).toBe(false);
    expect(matchesCondition(facts, { field: 'activity.call', op: 'exists' })).toBe(false);
    expect(matchesCondition(facts, { field: 'activity.email_opened', op: 'exists' })).toBe(true);
  });

  it('gte compares numbers and rejects text that is not a number', () => {
    expect(matchesCondition(facts, { field: 'value', op: 'gte', value: 10000 })).toBe(true);
    expect(matchesCondition(facts, { field: 'activity.email_opened', op: 'gte', value: 3 })).toBe(true);
    expect(matchesCondition(facts, { field: 'customData.city', op: 'gte', value: 1 })).toBe(false);
    expect(matchesCondition(facts, { field: 'value', op: 'gte', value: 'abc' })).toBe(false);
  });
});

describe('isAllowedField', () => {
  it('accepts core fields, custom keys and known activity types', () => {
    expect(isAllowedField('company')).toBe(true);
    expect(isAllowedField('customData.budget_band')).toBe(true);
    expect(isAllowedField('activity.email_clicked')).toBe(true);
  });

  it('rejects anything else, including injection-looking names', () => {
    expect(isAllowedField('password')).toBe(false);
    expect(isAllowedField('customData.Bad-Key')).toBe(false);
    expect(isAllowedField('activity.drop_table')).toBe(false);
  });
});

describe('pickOwner', () => {
  const rr = (over: Partial<AssignmentRuleLike> = {}): AssignmentRuleLike => ({
    id: 1,
    strategy: 'round_robin',
    priority: 100,
    enabled: true,
    memberUserIds: [],
    conditionField: null,
    conditionValue: null,
    targetUserId: null,
    cursorUserId: null,
    ...over,
  });
  const pool = [12, 7, 9];
  const facts = leadFacts(lead);

  it('round robin goes in id order and wraps', () => {
    expect(pickOwner([rr()], facts, pool, new Map())).toEqual({ userId: 7, ruleId: 1, nextCursor: 7 });
    expect(pickOwner([rr({ cursorUserId: 7 })], facts, pool, new Map())?.userId).toBe(9);
    expect(pickOwner([rr({ cursorUserId: 12 })], facts, pool, new Map())?.userId).toBe(7);
  });

  it('round robin keeps going when the last person has left the pool', () => {
    expect(nextAfter([7, 9], 8)).toBe(9);
    expect(nextAfter([7, 9], 9)).toBe(7);
  });

  it('round robin only picks from the rule member list when one is set', () => {
    expect(pickOwner([rr({ memberUserIds: [9, 12] })], facts, pool, new Map())?.userId).toBe(9);
  });

  it('load balanced picks the person with the fewest open leads, then the lowest id', () => {
    const loads = new Map([[7, 4], [9, 1], [12, 1]]);
    expect(pickOwner([rr({ strategy: 'load_balanced' })], facts, pool, loads)?.userId).toBe(9);
    expect(pickOwner([rr({ strategy: 'load_balanced' })], facts, pool, new Map())?.userId).toBe(7);
  });

  it('by field assigns the target when the lead matches', () => {
    const rule = rr({ strategy: 'by_field', conditionField: 'source', conditionValue: 'Tavaro website', targetUserId: 12 });
    expect(pickOwner([rule], facts, pool, new Map())).toEqual({ userId: 12, ruleId: 1 });
    const miss = rr({ strategy: 'by_field', conditionField: 'source', conditionValue: 'Other', targetUserId: 12 });
    expect(pickOwner([miss], facts, pool, new Map())).toBeNull();
  });

  it('falls through to the next rule when the first has nobody eligible', () => {
    const empty = rr({ id: 1, priority: 1, memberUserIds: [99] });
    const next = rr({ id: 2, priority: 2 });
    expect(pickOwner([next, empty], facts, pool, new Map())).toEqual({ userId: 7, ruleId: 2, nextCursor: 7 });
  });

  it('runs rules by priority and skips disabled ones', () => {
    const off = rr({ id: 1, priority: 1, enabled: false, strategy: 'by_field', conditionField: 'source', conditionValue: 'Tavaro website', targetUserId: 9 });
    const on = rr({ id: 2, priority: 2 });
    expect(pickOwner([off, on], facts, pool, new Map())?.ruleId).toBe(2);
  });

  it('returns null when there is no rule or nobody in the pool', () => {
    expect(pickOwner([], facts, pool, new Map())).toBeNull();
    expect(pickOwner([rr()], facts, [], new Map())).toBeNull();
  });
});

describe('computeScore', () => {
  const rules = [
    { field: 'phone', op: 'exists', value: null, points: 20, enabled: true },
    { field: 'value', op: 'gte', value: '10000', points: 30, enabled: true },
    { field: 'activity.email_opened', op: 'gte', value: '2', points: 15, enabled: true },
    { field: 'source', op: 'equals', value: 'Other', points: 50, enabled: true },
    { field: 'company', op: 'exists', value: null, points: 10, enabled: false },
  ];

  it('adds the points of matching enabled rules', () => {
    expect(computeScore(rules, leadFacts(lead, { email_opened: 2 }))).toBe(65);
  });

  it('clamps to 0 and 100', () => {
    const many = [...rules, { field: 'name', op: 'exists', value: null, points: 90, enabled: true }];
    expect(computeScore(many, leadFacts(lead, { email_opened: 5 }))).toBe(100);
    const negative = [{ field: 'name', op: 'exists', value: null, points: -30, enabled: true }];
    expect(computeScore(negative, leadFacts(lead))).toBe(0);
  });
});

describe('sequence timing', () => {
  const steps = [
    { delayDays: 0, kind: 'email' as const },
    { delayDays: 3, kind: 'task' as const },
  ];
  const from = new Date('2026-01-01T09:00:00Z');

  it('gives the due time of a step relative to the given moment', () => {
    expect(stepDueAt(steps, 1, from)?.toISOString()).toBe('2026-01-04T09:00:00.000Z');
    expect(stepDueAt(steps, 0, from)?.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });

  it('returns null past the last step', () => {
    expect(stepDueAt(steps, 2, from)).toBeNull();
  });
});

describe('SLA', () => {
  const due = new Date('2026-01-01T10:00:00Z');
  const base = { status: 'open', firstRespondedAt: null, firstResponseDueAt: due, slaEscalatedAt: null };

  it('counts staff replies only, not system events or inbound mail', () => {
    expect(countsAsFirstResponse('call', 4)).toBe(true);
    expect(countsAsFirstResponse('note', null)).toBe(false);
    expect(countsAsFirstResponse('system', 4)).toBe(false);
    expect(countsAsFirstResponse('email_received', 4)).toBe(false);
  });

  it('is breached once the deadline passes with no reply and no escalation yet', () => {
    expect(isSlaBreached(base, new Date('2026-01-01T10:00:00Z'))).toBe(true);
    expect(isSlaBreached(base, new Date('2026-01-01T09:59:00Z'))).toBe(false);
    expect(isSlaBreached({ ...base, firstRespondedAt: new Date() }, new Date('2026-01-02T00:00:00Z'))).toBe(false);
    expect(isSlaBreached({ ...base, slaEscalatedAt: new Date() }, new Date('2026-01-02T00:00:00Z'))).toBe(false);
    expect(isSlaBreached({ ...base, status: 'won' }, new Date('2026-01-02T00:00:00Z'))).toBe(false);
  });

  it('computes the deadline in minutes, with at least one minute', () => {
    expect(firstResponseDeadline(due, 30).toISOString()).toBe('2026-01-01T10:30:00.000Z');
    expect(firstResponseDeadline(due, 0).getTime()).toBe(due.getTime() + 60_000);
  });
});

describe('validateWorkflow', () => {
  const ok = {
    name: 'Tag Dubai leads',
    trigger: 'lead_created',
    conditions: [{ field: 'customData.city', op: 'equals', value: 'Dubai' }],
    actions: [{ type: 'add_tag', tag: 'dubai' }],
  };

  it('accepts a sound rule', () => {
    expect(validateWorkflow(ok)).toEqual([]);
  });

  it('needs a name, a known trigger and at least one action', () => {
    expect(validateWorkflow({ ...ok, name: '  ' })).toContain('Give the workflow a name');
    expect(validateWorkflow({ ...ok, trigger: 'nope' })).toEqual(['Pick a valid trigger']);
    expect(validateWorkflow({ ...ok, actions: [] })).toContain('Add at least one action');
  });

  it('checks trigger settings', () => {
    expect(validateWorkflow({ ...ok, trigger: 'field_changed', triggerConfig: {} })).toContain('Pick the field to watch');
    expect(validateWorkflow({ ...ok, trigger: 'field_changed', triggerConfig: { field: 'status' } })).toContain('Pick the field to watch');
    expect(validateWorkflow({ ...ok, trigger: 'lead_inactive', triggerConfig: { days: 0 } })).toContain('Inactive days must be 1 to 365');
    expect(validateWorkflow({ ...ok, trigger: 'field_changed', triggerConfig: { field: 'company' } })).toEqual([]);
  });

  it('rejects unknown fields, operators and action types', () => {
    const problems = validateWorkflow({
      ...ok,
      conditions: [{ field: 'passwordHash', op: 'equals', value: 'x' }, { field: 'company', op: 'like', value: 'x' }],
      actions: [{ type: 'delete_everything' }],
    });
    expect(problems).toEqual(
      expect.arrayContaining(['Condition 1: unknown field', 'Condition 2: unknown operator', 'Action 1: unknown type']),
    );
  });

  it('requires the fields each action needs', () => {
    const problems = validateWorkflow({
      ...ok,
      actions: [
        { type: 'assign' },
        { type: 'create_task', title: ' ' },
        { type: 'send_email', subject: 'Hi' },
        { type: 'set_follow_up', inDays: 400 },
      ],
    });
    expect(problems).toEqual([
      'Action 1: choose a person',
      'Action 2: give the task a title',
      'Action 3: pick a template or write a subject and body',
      'Action 4: follow up in 0 to 365 days',
    ]);
  });
});

describe('validateSequence and validateScoringRule', () => {
  it('sequences need steps with a clear kind and content', () => {
    expect(validateSequence({ name: 'Nurture', steps: [{ kind: 'email', delayDays: 0, templateId: 3 }] })).toEqual([]);
    expect(validateSequence({ name: 'Nurture', steps: [{ kind: 'sms', delayDays: 0 }] })).toContain('Step 1: kind must be email or task');
    expect(validateSequence({ name: 'Nurture', steps: [{ kind: 'task', delayDays: 1 }] })).toContain('Step 1: give the task a title');
    expect(validateSequence({ name: 'Nurture', steps: [] })).toContain('Add at least one step');
  });

  it('scoring rules check the field, operator and points', () => {
    expect(validateScoringRule({ field: 'company', op: 'exists', points: 10 })).toEqual([]);
    expect(validateScoringRule({ field: 'password', op: 'exists', points: 10 })).toContain('Pick a valid field');
    expect(validateScoringRule({ field: 'value', op: 'gte', value: 'lots', points: 10 })).toContain('Enter a number');
    expect(validateScoringRule({ field: 'company', op: 'equals', value: '', points: 10 })).toContain('Enter a value to compare with');
    expect(validateScoringRule({ field: 'company', op: 'exists', points: 500 })).toContain('Points must be -100 to 100');
  });
});

describe('message templating', () => {
  const vars = leadVariables({ name: 'Asha Rao', email: 'asha@example.com', phone: null, company: 'Lumen', source: null });

  it('fills known keys and blanks unknown or empty ones', () => {
    expect(fillTemplate('Hi {{first_name}}, from {{company}} {{phone}}{{nope}}.', vars)).toBe('Hi Asha, from Lumen .');
  });

  it('escapes values for HTML bodies so they cannot inject markup', () => {
    const evil = leadVariables({ name: '<img src=x onerror=alert(1)>', email: null, phone: null, company: null, source: null });
    expect(fillTemplate('<p>{{name}}</p>', evil, { escape: true })).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    );
    expect(fillTemplate('{{name}}', evil)).toBe('<img src=x onerror=alert(1)>');
  });

  it('turns plain text into escaped HTML with line breaks', () => {
    expect(plainToHtml('Tom & "Jerry"\nline 2 <b>')).toBe('Tom &amp; &quot;Jerry&quot;<br/>line 2 &lt;b&gt;');
  });
});

describe('validateAssignmentRule', () => {
  it('accepts load-balanced and round-robin rules with just a name', () => {
    expect(validateAssignmentRule({ name: 'Default', strategy: 'round_robin' })).toEqual([]);
    expect(validateAssignmentRule({ name: 'Load', strategy: 'load_balanced' })).toEqual([]);
  });

  it('by-field rules need a valid field, a value and a target person', () => {
    expect(validateAssignmentRule({ name: 'Tavaro', strategy: 'by_field' })).toEqual(
      expect.arrayContaining(['Pick the lead field to match', 'Enter the value to match', 'Pick who gets matching leads']),
    );
    expect(
      validateAssignmentRule({ name: 'Tavaro', strategy: 'by_field', conditionField: 'source', conditionValue: 'Website', targetUserId: 4 }),
    ).toEqual([]);
  });

  it('rejects unknown strategies and a missing name', () => {
    expect(validateAssignmentRule({ name: 'x', strategy: 'random' })).toEqual(['Pick a strategy']);
    expect(validateAssignmentRule({ strategy: 'round_robin' })).toContain('Give the rule a name');
  });
});

describe('diffLeadFields', () => {
  it('lists the core fields that changed', () => {
    const before = { name: 'Asha', company: 'Lumen', value: 100, tags: ['a'] };
    const after = { name: 'Asha', company: 'Lumen Co', value: 100, tags: ['a', 'b'] };
    expect(diffLeadFields(before, after)).toEqual(['company', 'tags']);
  });

  it('compares custom data one key at a time, including added and removed keys', () => {
    const before = { customData: { budget: 1, city: 'Dubai' } };
    const after = { customData: { budget: 1, city: 'Abu Dhabi', area: 'Marina' } };
    expect(diffLeadFields(before, after)).toEqual(['customData.area', 'customData.city']);
  });

  it('treats null and missing as equal, and 1 and "1" as different', () => {
    expect(diffLeadFields({ company: null }, { company: undefined })).toEqual([]);
    expect(diffLeadFields({ phone: 1 }, { phone: '1' })).toEqual(['phone']);
  });
});
