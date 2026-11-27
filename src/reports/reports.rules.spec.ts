import {
  addDays,
  istToday,
  nextRunAfter,
  rangeBounds,
  resolveRange,
  toCsv,
  validateFilters,
  validateSchedule,
  validateWidget,
} from './reports.rules';

const widget = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  title: 'Leads by source',
  type: 'bar',
  metric: 'lead_count',
  groupBy: 'source',
  ...over,
});

describe('validateWidget', () => {
  it('accepts a grouped bar chart and a total KPI', () => {
    expect(validateWidget(widget())).toEqual([]);
    expect(validateWidget(widget({ type: 'kpi', groupBy: 'none', metric: 'won_value' }))).toEqual([]);
  });

  it('keeps each chart type to the groupings that make sense for it', () => {
    expect(validateWidget(widget({ type: 'kpi', groupBy: 'source' }))[0]).toMatch(/cannot group by source/);
    expect(validateWidget(widget({ type: 'funnel', groupBy: 'owner' }))[0]).toMatch(/cannot group by owner/);
    expect(validateWidget(widget({ type: 'line', groupBy: 'stage' }))[0]).toMatch(/cannot group by stage/);
    expect(validateWidget(widget({ type: 'funnel', groupBy: 'stage' }))).toEqual([]);
    expect(validateWidget(widget({ type: 'line', groupBy: 'day' }))).toEqual([]);
    expect(validateWidget(widget({ type: 'table', groupBy: 'lost_reason' }))).toEqual([]);
  });

  it('rejects unknown types, metrics and groupings, and blank titles', () => {
    expect(validateWidget(widget({ type: 'pie' }))).toContain('Unknown widget type');
    expect(validateWidget(widget({ metric: 'revenue' }))).toContain('Unknown metric');
    expect(validateWidget(widget({ groupBy: 'city' }))).toContain('Unknown grouping');
    expect(validateWidget(widget({ title: '   ' }))).toContain('Give the widget a title of up to 120 characters');
  });

  it('rejects things that are not objects', () => {
    expect(validateWidget(null)).toEqual(['Widget must be an object']);
    expect(validateWidget('bar')).toEqual(['Widget must be an object']);
  });
});

describe('validateFilters', () => {
  it('accepts an empty filter set and a valid window', () => {
    expect(validateFilters(undefined)).toEqual([]);
    expect(validateFilters({ businessUnitId: 3, from: '2026-01-01', to: '2026-01-31' })).toEqual([]);
  });

  it('rejects bad dates, reversed windows and windows longer than two years', () => {
    expect(validateFilters({ from: '2026-13-01' })).toEqual(['from must be a date (YYYY-MM-DD)']);
    expect(validateFilters({ from: '2026-02-01', to: '2026-01-01' })).toContain('from must be on or before to');
    expect(validateFilters({ from: '2024-01-01', to: '2026-12-31' })[0]).toMatch(/at most 730 days/);
  });

  it('rejects ids that are not positive integers', () => {
    expect(validateFilters({ businessUnitId: NaN })).toEqual(['businessUnitId must be a positive integer']);
    expect(validateFilters({ ownerUserId: -1 })).toEqual(['ownerUserId must be a positive integer']);
  });
});

describe('resolveRange and rangeBounds', () => {
  it('defaults to the last 90 IST days ending today', () => {
    // 2026-11-26 10:00 IST
    const now = new Date('2026-11-26T04:30:00Z');
    expect(istToday(now)).toBe('2026-11-26');
    expect(resolveRange({}, now)).toEqual({ from: '2026-08-29', to: '2026-11-26' });
  });

  it('uses the given window as is', () => {
    expect(resolveRange({ from: '2026-11-01', to: '2026-11-07' })).toEqual({ from: '2026-11-01', to: '2026-11-07' });
  });

  it('starts at IST midnight and ends before the midnight after the last day', () => {
    const { start, end } = rangeBounds('2026-11-01', '2026-11-01');
    expect(start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T18:30:00.000Z');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('validateSchedule', () => {
  const base = {
    frequency: 'daily',
    hourIst: 9,
    recipients: ['owner@example.com'],
    format: 'xlsx',
    scope: 'standard',
  };

  it('accepts a daily standard pack', () => {
    expect(validateSchedule(base)).toEqual([]);
  });

  it('needs a weekday for weekly and a day from 1 to 28 for monthly', () => {
    expect(validateSchedule({ ...base, frequency: 'weekly' })).toContain('Choose the day of the week');
    expect(validateSchedule({ ...base, frequency: 'monthly', dayOfMonth: 31 })).toContain(
      'Choose a day of the month from 1 to 28',
    );
    expect(validateSchedule({ ...base, frequency: 'weekly', dayOfWeek: 1 })).toEqual([]);
  });

  it('checks recipients, hour and format', () => {
    expect(validateSchedule({ ...base, recipients: [] })[0]).toMatch(/between 1 and 10/);
    expect(validateSchedule({ ...base, recipients: ['not-an-email'] })).toContain('Every recipient must be an email address');
    expect(validateSchedule({ ...base, hourIst: 24 })[0]).toMatch(/from 0 to 23/);
    expect(validateSchedule({ ...base, format: 'pdf' })).toContain('Format must be Excel or CSV');
  });

  it('needs a dashboard id for dashboard scope', () => {
    expect(validateSchedule({ ...base, scope: 'dashboard' })).toContain('Choose a dashboard');
    expect(validateSchedule({ ...base, scope: 'dashboard', dashboardId: 7 })).toEqual([]);
  });
});

describe('nextRunAfter', () => {
  it('sends daily at the IST hour, later the same day when that hour has not come yet', () => {
    // 07:30 IST on 26 Nov
    const after = new Date('2026-11-26T02:00:00Z');
    const next = nextRunAfter({ frequency: 'daily', dayOfWeek: null, dayOfMonth: null, hourIst: 9 }, after);
    expect(next.toISOString()).toBe('2026-11-26T03:30:00.000Z');
  });

  it('moves to the next day once the send time has passed', () => {
    const after = new Date('2026-11-26T03:30:00Z');
    const next = nextRunAfter({ frequency: 'daily', dayOfWeek: null, dayOfMonth: null, hourIst: 9 }, after);
    expect(next.toISOString()).toBe('2026-11-27T03:30:00.000Z');
  });

  it('sends weekly on the chosen weekday (26 Nov 2026 is a Thursday)', () => {
    const after = new Date('2026-11-26T04:00:00Z');
    const next = nextRunAfter({ frequency: 'weekly', dayOfWeek: 1, dayOfMonth: null, hourIst: 9 }, after);
    expect(next.toISOString()).toBe('2026-11-30T03:30:00.000Z');
  });

  it('sends monthly on the chosen day of the month', () => {
    const after = new Date('2026-11-26T04:00:00Z');
    const next = nextRunAfter({ frequency: 'monthly', dayOfWeek: null, dayOfMonth: 1, hourIst: 9 }, after);
    expect(next.toISOString()).toBe('2026-12-01T03:30:00.000Z');
  });

  it('never returns a time at or before the one given', () => {
    const after = new Date('2026-06-15T12:00:00Z');
    const next = nextRunAfter({ frequency: 'daily', dayOfWeek: null, dayOfMonth: null, hourIst: 0 }, after);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv(['Name', 'Note'], [['Acme, Ltd', 'Said "yes"\nlater']]);
    expect(csv).toBe('Name,Note\r\n"Acme, Ltd","Said ""yes""\nlater"');
  });

  it('neutralises spreadsheet formulas so a lead name cannot run code', () => {
    const csv = toCsv(['Name'], [['=HYPERLINK("http://x")'], ['+1'], ['@sum']]);
    expect(csv.split('\r\n').slice(1)).toEqual(['"\'=HYPERLINK(""http://x"")"', "'+1", "'@sum"]);
  });

  it('writes empty cells for null and undefined', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });
});
