/**
 * Pure rules for reports and dashboards: what a widget can measure, how filters and date windows are
 * read, when a scheduled report is due, and how rows become CSV. No database here, so it is easy to test.
 *
 * Dates are calendar days in India time (IST, UTC+05:30), because the teams work in IST.
 */

export const WIDGET_TYPES = ['kpi', 'bar', 'line', 'table', 'funnel'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const METRICS = ['lead_count', 'won_count', 'pipeline_value', 'won_value'] as const;
export type Metric = (typeof METRICS)[number];

export const GROUPS = ['none', 'source', 'stage', 'owner', 'unit', 'day', 'lost_reason'] as const;
export type GroupBy = (typeof GROUPS)[number];

export const METRIC_LABELS: Record<Metric, string> = {
  lead_count: 'Leads',
  won_count: 'Won leads',
  pipeline_value: 'Open pipeline value',
  won_value: 'Won value',
};

export const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Total',
  source: 'Source',
  stage: 'Stage',
  owner: 'Owner',
  unit: 'Business unit',
  day: 'Day created',
  lost_reason: 'Lost reason',
};

export interface WidgetSpec {
  id: string;
  title: string;
  type: WidgetType;
  metric: Metric;
  groupBy: GroupBy;
}

/** Which groupings make sense for each chart type. */
const ALLOWED_GROUPS: Record<WidgetType, readonly GroupBy[]> = {
  kpi: ['none'],
  funnel: ['stage'],
  line: ['day'],
  bar: ['source', 'stage', 'owner', 'unit', 'lost_reason'],
  table: GROUPS,
};

export interface ReportFilters {
  businessUnitId?: number | null;
  ownerUserId?: number | null;
  source?: string | null;
  /** IST calendar day, YYYY-MM-DD, inclusive. */
  from?: string | null;
  /** IST calendar day, YYYY-MM-DD, inclusive. */
  to?: string | null;
}

export const MAX_RANGE_DAYS = 730;
const DEFAULT_RANGE_DAYS = 90;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPositiveInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function validateWidget(input: unknown): string[] {
  if (!isObject(input)) return ['Widget must be an object'];
  const errors: string[] = [];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 120) errors.push('Give the widget a title of up to 120 characters');
  if (typeof input.id !== 'string' || !input.id || input.id.length > 64) errors.push('Widget id is required');
  if (!(WIDGET_TYPES as readonly string[]).includes(input.type as string)) errors.push('Unknown widget type');
  if (!(METRICS as readonly string[]).includes(input.metric as string)) errors.push('Unknown metric');
  if (!(GROUPS as readonly string[]).includes(input.groupBy as string)) {
    errors.push('Unknown grouping');
  } else if (
    (WIDGET_TYPES as readonly string[]).includes(input.type as string) &&
    !ALLOWED_GROUPS[input.type as WidgetType].includes(input.groupBy as GroupBy)
  ) {
    errors.push(`A ${input.type} widget cannot group by ${GROUP_LABELS[input.groupBy as GroupBy].toLowerCase()}`);
  }
  return errors;
}

/** Calendar-day arithmetic on YYYY-MM-DD strings. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in IST. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function validateFilters(f: unknown): string[] {
  if (f == null) return [];
  if (!isObject(f)) return ['Filters must be an object'];
  const errors: string[] = [];
  if (f.businessUnitId != null && !isPositiveInt(f.businessUnitId)) errors.push('businessUnitId must be a positive integer');
  if (f.ownerUserId != null && !isPositiveInt(f.ownerUserId)) errors.push('ownerUserId must be a positive integer');
  if (f.source != null && (typeof f.source !== 'string' || f.source.length > 120)) errors.push('source is too long');
  for (const key of ['from', 'to'] as const) {
    const v = f[key];
    if (v != null && (typeof v !== 'string' || !YMD.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) {
      errors.push(`${key} must be a date (YYYY-MM-DD)`);
    }
  }
  if (typeof f.from === 'string' && typeof f.to === 'string' && YMD.test(f.from) && YMD.test(f.to)) {
    if (f.from > f.to) errors.push('from must be on or before to');
    const span = (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1;
    if (span > MAX_RANGE_DAYS) errors.push(`The date range can be at most ${MAX_RANGE_DAYS} days`);
  }
  return errors;
}

/** The IST calendar days a report covers. Defaults to the last 90 days up to today. */
export function resolveRange(f: ReportFilters, now: Date = new Date()): { from: string; to: string } {
  const to = f.to ?? istToday(now);
  const from = f.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  return { from, to };
}

/** [start, end) instants for a range of IST calendar days. */
export function rangeBounds(from: string, to: string): { start: Date; end: Date } {
  return {
    start: new Date(`${from}T00:00:00+05:30`),
    end: new Date(`${addDays(to, 1)}T00:00:00+05:30`),
  };
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduleSpec {
  frequency: ScheduleFrequency;
  /** 0 (Sunday) to 6 (Saturday). Used when weekly. */
  dayOfWeek: number | null;
  /** 1 to 28. Used when monthly. */
  dayOfMonth: number | null;
  /** Hour in IST, 0 to 23. */
  hourIst: number;
  recipients: string[];
  format: 'xlsx' | 'csv';
  scope: 'standard' | 'dashboard';
  dashboardId: number | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSchedule(input: unknown): string[] {
  if (!isObject(input)) return ['Schedule must be an object'];
  const errors: string[] = [];
  if (!['daily', 'weekly', 'monthly'].includes(input.frequency as string)) errors.push('Choose daily, weekly or monthly');
  if (input.frequency === 'weekly' && !(Number.isInteger(input.dayOfWeek) && (input.dayOfWeek as number) >= 0 && (input.dayOfWeek as number) <= 6)) {
    errors.push('Choose the day of the week');
  }
  if (input.frequency === 'monthly' && !(Number.isInteger(input.dayOfMonth) && (input.dayOfMonth as number) >= 1 && (input.dayOfMonth as number) <= 28)) {
    errors.push('Choose a day of the month from 1 to 28');
  }
  if (!(Number.isInteger(input.hourIst) && (input.hourIst as number) >= 0 && (input.hourIst as number) <= 23)) {
    errors.push('Send hour must be from 0 to 23 (IST)');
  }
  if (!Array.isArray(input.recipients) || input.recipients.length === 0 || input.recipients.length > 10) {
    errors.push('Add between 1 and 10 recipients');
  } else if (input.recipients.some((r) => typeof r !== 'string' || !EMAIL.test(r.trim()))) {
    errors.push('Every recipient must be an email address');
  }
  if (!['xlsx', 'csv'].includes(input.format as string)) errors.push('Format must be Excel or CSV');
  if (input.scope === 'dashboard') {
    if (!isPositiveInt(input.dashboardId)) errors.push('Choose a dashboard');
  } else if (input.scope !== 'standard') {
    errors.push('Scope must be the standard reports or a dashboard');
  }
  return errors;
}

/** The first send time strictly after `after`, in IST wall-clock terms. */
export function nextRunAfter(spec: Pick<ScheduleSpec, 'frequency' | 'dayOfWeek' | 'dayOfMonth' | 'hourIst'>, after: Date): Date {
  const wall = new Date(after.getTime() + IST_OFFSET_MS);
  for (let i = 0; i <= 62; i++) {
    // The IST wall-clock time for this candidate, stored as UTC fields so the calendar maths is simple.
    const day = new Date(
      Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + i, spec.hourIst, 0, 0),
    );
    const instant = new Date(day.getTime() - IST_OFFSET_MS);
    if (instant.getTime() <= after.getTime()) continue;
    if (spec.frequency === 'daily') return instant;
    if (spec.frequency === 'weekly' && day.getUTCDay() === spec.dayOfWeek) return instant;
    if (spec.frequency === 'monthly' && day.getUTCDate() === spec.dayOfMonth) return instant;
  }
  // Unreachable for valid specs (every frequency matches within 62 days).
  return new Date(after.getTime() + 86400000);
}

/** Spreadsheet-safe CSV. Quotes fields with commas, quotes or line breaks, and neutralises formulas. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (raw: string | number | null | undefined): string => {
    let text = raw == null ? '' : String(raw);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
