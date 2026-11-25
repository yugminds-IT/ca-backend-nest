/** What decides which local dates a repeating email goes out on */
export interface RepeatDates {
  months: number[];
  days: number[];
  weekdays?: number[] | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Does it go out on this local date? `days` may hold -1 for the last day of the month. */
export function firesOn(r: RepeatDates, year: number, month: number, day: number): boolean {
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (r.startDate && date < r.startDate) return false;
  if (r.endDate && date > r.endDate) return false;
  if (!r.months.includes(month)) return false;
  if (r.weekdays?.length) return r.weekdays.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return r.days.includes(day) || (day === last && r.days.includes(-1));
}
