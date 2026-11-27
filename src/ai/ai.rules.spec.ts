import { cleanNotes, suggestNextActions, templateDraft, NextActionInput } from './ai.rules';

const now = new Date('2026-11-26T06:00:00Z');
const base: NextActionInput = {
  status: 'open',
  ownerUserId: 4,
  firstResponseDueAt: null,
  firstRespondedAt: null,
  nextFollowUpAt: null,
  lastActivityAt: new Date('2026-11-25T06:00:00Z'),
  openTaskCount: 1,
  now,
};

describe('suggestNextActions', () => {
  it('returns nothing for closed leads', () => {
    expect(suggestNextActions({ ...base, status: 'won', ownerUserId: null })).toEqual([]);
  });

  it('ranks overdue work above softer suggestions', () => {
    const actions = suggestNextActions({
      ...base,
      ownerUserId: null,
      firstResponseDueAt: new Date('2026-11-26T05:00:00Z'),
      nextFollowUpAt: new Date('2026-11-26T01:00:00Z'),
      lastActivityAt: new Date('2026-11-20T06:00:00Z'),
      openTaskCount: 0,
    });
    expect(actions.map((a) => a.title)).toEqual([
      'Assign an owner',
      'Reply now',
      'Follow up now',
      'Re-engage this lead',
      'Schedule the next step',
    ]);
    expect(actions.slice(0, 3).every((a) => a.priority === 'high')).toBe(true);
  });

  it('is quiet when the lead is on track', () => {
    expect(suggestNextActions(base)).toEqual([]);
  });

  it('flags a first response that is still inside its SLA window as medium', () => {
    const [action] = suggestNextActions({ ...base, firstResponseDueAt: new Date('2026-11-26T09:00:00Z') });
    expect(action.title).toBe('Send the first response');
    expect(action.priority).toBe('medium');
  });

  it('does not flag an answered first response', () => {
    const actions = suggestNextActions({
      ...base,
      firstResponseDueAt: new Date('2026-11-26T05:00:00Z'),
      firstRespondedAt: new Date('2026-11-26T04:00:00Z'),
    });
    expect(actions.find((a) => a.title === 'Reply now')).toBeUndefined();
  });
});

describe('templateDraft', () => {
  it('greets by first name in a friendly tone and signs off with the unit', () => {
    const d = templateDraft({ leadName: 'Aarav Sharma', unitName: 'Tavaro', tone: 'friendly', intent: null });
    expect(d.subject).toBe('Re: your enquiry with Tavaro');
    expect(d.body.startsWith('Hi Aarav,')).toBe(true);
    expect(d.body.endsWith('Tavaro')).toBe(true);
  });

  it('uses the full name in a formal tone and includes the caller intent', () => {
    const d = templateDraft({ leadName: 'Aarav Sharma', unitName: 'Tavaro', tone: 'formal', intent: 'We can offer a demo on Monday.' });
    expect(d.body.startsWith('Dear Aarav Sharma,')).toBe(true);
    expect(d.body).toContain('We can offer a demo on Monday.');
  });

  it('falls back to a neutral greeting for an empty name', () => {
    const d = templateDraft({ leadName: '  ', unitName: 'Tavaro', tone: 'friendly', intent: '' });
    expect(d.body.startsWith('Hi there,')).toBe(true);
  });
});

describe('cleanNotes', () => {
  it('trims, collapses spaces and blank runs, and capitalizes sentence starts', () => {
    expect(cleanNotes('  called   him.  he wants a demo.\r\n\r\n\r\nnext week ')).toBe(
      'Called him. He wants a demo.\n\nNext week',
    );
  });

  it('drops consecutive duplicate lines', () => {
    expect(cleanNotes('Budget ok\nBudget ok\nDecision in May')).toBe('Budget ok\nDecision in May');
  });
});
