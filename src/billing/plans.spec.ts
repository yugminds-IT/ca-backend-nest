import {
  PLANS,
  aiCreditsRemaining,
  defaultModules,
  effectiveModules,
  monthKeyIst,
  planBlockers,
  wouldExceed,
} from './plans';

describe('plan entitlements', () => {
  it('grows monotonically from Starter to Premium on the main limits', () => {
    expect(PLANS.starter.units).toBeLessThan(PLANS.growth.units!);
    expect(PLANS.growth.units).toBeLessThan(PLANS.premium.units!);
    expect(PLANS.starter.automations).toBe(false);
    expect(PLANS.growth.automations).toBe(true);
    expect(PLANS.growth.whiteLabel).toBe(false);
    expect(PLANS.premium.whiteLabel).toBe(true);
  });

  it('treats null as unlimited', () => {
    expect(wouldExceed(null, 10_000, 50)).toBe(false);
    expect(PLANS.enterprise.units).toBeNull();
  });
});

describe('wouldExceed', () => {
  it('blocks the add that crosses the limit, not the one that reaches it', () => {
    expect(wouldExceed(3, 2, 1)).toBe(false);
    expect(wouldExceed(3, 3, 1)).toBe(true);
    expect(wouldExceed(3, 1, 3)).toBe(true);
  });
});

describe('planBlockers', () => {
  it('lets a workspace move to a plan that fits what it already uses', () => {
    expect(planBlockers('growth', { units: 3, users: 15, customFields: 50 })).toEqual([]);
    expect(planBlockers('enterprise', { units: 500, users: 900, customFields: 9_000 })).toEqual([]);
  });

  it('names every counted resource that is over the smaller plan', () => {
    const out = planBlockers('starter', { units: 2, users: 3, customFields: 11 });
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('2 business units');
    expect(out[0]).toContain('Starter allows 1');
    expect(out[1]).toContain('11 custom fields');
  });
});

describe('modules', () => {
  it('enables TDS and GST only for financial services by default', () => {
    expect(defaultModules('financial_services')).toEqual({ tds: true, gst: true });
    expect(defaultModules('saas')).toEqual({ tds: false, gst: false });
    expect(defaultModules(null)).toEqual({ tds: false, gst: false });
  });

  it('lets an override turn a module on or off either way', () => {
    expect(effectiveModules('saas', { tds: true })).toEqual({ tds: true, gst: false });
    expect(effectiveModules('financial_services', { gst: false })).toEqual({ tds: true, gst: false });
  });
});

describe('AI credits', () => {
  it('never goes below zero', () => {
    expect(aiCreditsRemaining('growth', 120)).toBe(380);
    expect(aiCreditsRemaining('growth', 900)).toBe(0);
    expect(aiCreditsRemaining('starter', 0)).toBe(0);
  });
});

describe('monthKeyIst', () => {
  it('uses India time, so 30 Nov 20:00 UTC is already 1 Dec in IST', () => {
    expect(monthKeyIst(new Date('2026-11-30T20:00:00Z'))).toBe('2026-12');
    expect(monthKeyIst(new Date('2026-11-30T10:00:00Z'))).toBe('2026-11');
  });
});
