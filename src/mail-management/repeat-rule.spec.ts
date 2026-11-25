import { firesOn } from './repeat-rule';

describe('firesOn', () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('monthly on a day, and on the last day of any month', () => {
    expect(firesOn({ months: all, days: [20] }, 2026, 11, 20)).toBe(true);
    expect(firesOn({ months: all, days: [20] }, 2026, 11, 21)).toBe(false);
    expect(firesOn({ months: all, days: [-1] }, 2027, 2, 28)).toBe(true);
    expect(firesOn({ months: all, days: [-1] }, 2028, 2, 28)).toBe(false); // leap year
    expect(firesOn({ months: all, days: [-1] }, 2028, 2, 29)).toBe(true);
  });

  it('weekly on weekdays, ignoring days', () => {
    // 2026-11-23 is a Monday
    expect(firesOn({ months: all, days: [], weekdays: [1, 5] }, 2026, 11, 23)).toBe(true);
    expect(firesOn({ months: all, days: [], weekdays: [1, 5] }, 2026, 11, 24)).toBe(false);
  });

  it('only in the given months (quarterly / yearly)', () => {
    const quarterly = { months: [1, 4, 7, 10], days: [7] };
    expect(firesOn(quarterly, 2026, 7, 7)).toBe(true);
    expect(firesOn(quarterly, 2026, 8, 7)).toBe(false);
  });

  it('only between start and end', () => {
    const r = { months: all, days: [1], startDate: '2026-12-01', endDate: '2027-02-01' };
    expect(firesOn(r, 2026, 11, 1)).toBe(false);
    expect(firesOn(r, 2026, 12, 1)).toBe(true);
    expect(firesOn(r, 2027, 2, 1)).toBe(true);
    expect(firesOn(r, 2027, 3, 1)).toBe(false);
  });
});

import { checkCopyAddresses } from './mail-management.service';

describe('checkCopyAddresses', () => {
  it('accepts addresses and "Name <address>", refuses anything else', () => {
    expect(() => checkCopyAddresses('a@x.com, Boss <boss@firm.in>; c@y.org', '')).not.toThrow();
    expect(() => checkCopyAddresses('omprak', null)).toThrow(/Cc .*omprak/);
    expect(() => checkCopyAddresses(null, 'a@x.com, b@')).toThrow(/Bcc/);
  });
});
