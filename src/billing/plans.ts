/**
 * Plan entitlements (Phase 10). Pure data and rules, no database.
 * `null` means unlimited. Each organization is on one plan, and can have per-module overrides (TDS, GST).
 */
export const PLAN_KEYS = ['starter', 'growth', 'premium', 'enterprise'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Entitlements {
  name: string;
  units: number | null;
  users: number | null;
  customFields: number | null;
  aiCreditsPerMonth: number;
  automations: boolean;
  whiteLabel: boolean;
  apiRequestsPerDay: number | null;
}

export const PLANS: Record<PlanKey, Entitlements> = {
  starter: {
    name: 'Starter',
    units: 1,
    users: 3,
    customFields: 10,
    aiCreditsPerMonth: 0,
    automations: false,
    whiteLabel: false,
    apiRequestsPerDay: 1_000,
  },
  growth: {
    name: 'Growth',
    units: 3,
    users: 15,
    customFields: 50,
    aiCreditsPerMonth: 500,
    automations: true,
    whiteLabel: false,
    apiRequestsPerDay: 10_000,
  },
  premium: {
    name: 'Premium',
    units: 10,
    users: 50,
    customFields: 200,
    aiCreditsPerMonth: 2_000,
    automations: true,
    whiteLabel: true,
    apiRequestsPerDay: 50_000,
  },
  enterprise: {
    name: 'Enterprise',
    units: null,
    users: null,
    customFields: null,
    aiCreditsPerMonth: 10_000,
    automations: true,
    whiteLabel: true,
    apiRequestsPerDay: null,
  },
};

export const MODULE_KEYS = ['tds', 'gst'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleOverrides = Partial<Record<ModuleKey, boolean>>;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}

/** TDS and GST filing belong to chartered-accountant (financial services) workspaces by default. */
export function defaultModules(industry: string | null | undefined): Record<ModuleKey, boolean> {
  const accounting = industry === 'financial_services';
  return { tds: accounting, gst: accounting };
}

export function effectiveModules(
  industry: string | null | undefined,
  overrides: ModuleOverrides | null | undefined,
): Record<ModuleKey, boolean> {
  const base = defaultModules(industry);
  return {
    tds: overrides?.tds ?? base.tds,
    gst: overrides?.gst ?? base.gst,
  };
}

export type CountedLimit = 'units' | 'users' | 'customFields';

/** True when adding `adding` more would go over the plan limit. Unlimited (null) never blocks. */
export function wouldExceed(limit: number | null, current: number, adding = 1): boolean {
  return limit !== null && current + adding > limit;
}

const COUNTED_NOUN: Record<CountedLimit, string> = {
  units: 'business units',
  users: 'active staff',
  customFields: 'custom fields',
};

/**
 * Reasons a workspace using `usage` cannot move onto `plan`: each counted resource that is already over
 * the plan's cap. An empty list means the switch is safe.
 */
export function planBlockers(plan: PlanKey, usage: Record<CountedLimit, number>): string[] {
  const target = PLANS[plan];
  const out: string[] = [];
  for (const metric of ['units', 'users', 'customFields'] as const) {
    const limit = target[metric];
    if (limit !== null && usage[metric] > limit) {
      out.push(`You have ${usage[metric]} ${COUNTED_NOUN[metric]}, and ${target.name} allows ${limit}.`);
    }
  }
  return out;
}

/** AI credits left this month, never negative. */
export function aiCreditsRemaining(plan: PlanKey, used: number): number {
  return Math.max(0, PLANS[plan].aiCreditsPerMonth - used);
}

/** Month key in India time, used to reset AI credits monthly. */
export function monthKeyIst(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}
