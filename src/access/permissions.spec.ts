import {
  DATA_SCOPES,
  LEGACY_STAFF_PERMISSIONS,
  PERMISSION_KEYS,
  PRESETS,
  canCreateLeadIn,
  canSeeLead,
  resolveAccess,
  brandLimit,
  withinBrandLimit,
} from './permissions';
import { applyLeadScope } from './lead-scope';
import { RoleName } from '../common/enums/role.enum';

const base = { userId: 7, unitIds: [2] };

describe('resolveAccess', () => {
  it('gives admins every permission across the org, whatever profile they have', () => {
    const ctx = resolveAccess({
      ...base,
      roleName: RoleName.ORG_ADMIN,
      profile: { permissions: ['leads.view'], dataScope: 'own' },
    });
    expect(ctx.permissions.size).toBe(PERMISSION_KEYS.length);
    expect(ctx.dataScope).toBe('org');
  });

  it('gives client portal users nothing', () => {
    const ctx = resolveAccess({ ...base, roleName: RoleName.CLIENT, profile: null });
    expect(ctx.permissions.size).toBe(0);
  });

  it('uses the profile permissions and scope, dropping unknown keys', () => {
    const ctx = resolveAccess({
      ...base,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: { permissions: ['leads.view', 'nope.nothing'], dataScope: 'units' },
    });
    expect([...ctx.permissions]).toEqual(['leads.view']);
    expect(ctx.dataScope).toBe('units');
  });

  it('keeps the legacy access for staff without a profile', () => {
    const ctx = resolveAccess({ ...base, roleName: RoleName.CAA, profile: null });
    expect([...ctx.permissions].sort()).toEqual([...LEGACY_STAFF_PERMISSIONS].sort());
    expect(ctx.dataScope).toBe('org');
    expect(ctx.permissions.has('staff.manage')).toBe(false);
    expect(ctx.permissions.has('mail.manage')).toBe(false);
  });

  it('gives nothing when the role is missing or unknown', () => {
    expect(resolveAccess({ ...base, roleName: null, profile: null }).permissions.size).toBe(0);
    expect(resolveAccess({ ...base, roleName: 'WHO_KNOWS', profile: null }).permissions.size).toBe(0);
  });
});

describe('single-branch organization (no admin panel)', () => {
  const unitsProfile = { permissions: ['leads.view'], dataScope: 'units' as const };

  it('treats a "units" scope as the whole organization', () => {
    const ctx = resolveAccess({
      ...base,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: unitsProfile,
      adminPanelEnabled: false,
    });
    expect(ctx.dataScope).toBe('org');
    expect(ctx.adminPanel).toBe(false);
    // Sees a lead from a brand they were never assigned to.
    expect(canSeeLead(ctx, { businessUnitId: 99, ownerUserId: 1 })).toBe(true);
  });

  it('keeps "own" and "team" scopes as chosen', () => {
    const own = resolveAccess({
      ...base,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: { permissions: [], dataScope: 'own' },
      adminPanelEnabled: false,
    });
    expect(own.dataScope).toBe('own');
    const team = resolveAccess({
      ...base,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: { permissions: [], dataScope: 'team' },
      teamUserIds: [8],
      adminPanelEnabled: false,
    });
    expect(team.dataScope).toBe('team');
    expect(team.teamUserIds).toEqual([8]);
  });

  it('keeps "units" scope when the admin panel is on, or the setting is missing', () => {
    for (const adminPanelEnabled of [true, undefined, null]) {
      const ctx = resolveAccess({
        ...base,
        roleName: RoleName.ORG_EMPLOYEE,
        profile: unitsProfile,
        adminPanelEnabled,
      });
      expect(ctx.dataScope).toBe('units');
      expect(ctx.adminPanel).toBe(true);
    }
  });

  it('reports the setting for admins and does not change their access', () => {
    const ctx = resolveAccess({ ...base, roleName: RoleName.ORG_ADMIN, profile: null, adminPanelEnabled: false });
    expect(ctx.adminPanel).toBe(false);
    expect(ctx.dataScope).toBe('org');
    expect(ctx.permissions.size).toBe(PERMISSION_KEYS.length);
  });
});

describe('lead visibility under a data scope', () => {
  const ownCtx = resolveAccess({
    ...base,
    roleName: RoleName.ORG_EMPLOYEE,
    profile: { permissions: ['leads.view'], dataScope: 'own' },
  });
  const unitCtx = resolveAccess({
    ...base,
    roleName: RoleName.ORG_EMPLOYEE,
    profile: { permissions: ['leads.view'], dataScope: 'units' },
  });

  it('own: only leads they own', () => {
    expect(canSeeLead(ownCtx, { businessUnitId: 2, ownerUserId: 7 })).toBe(true);
    expect(canSeeLead(ownCtx, { businessUnitId: 2, ownerUserId: 8 })).toBe(false);
    expect(canSeeLead(ownCtx, { businessUnitId: 2, ownerUserId: null })).toBe(false);
  });

  it('units: only leads in assigned units, owner irrelevant', () => {
    expect(canSeeLead(unitCtx, { businessUnitId: 2, ownerUserId: 99 })).toBe(true);
    expect(canSeeLead(unitCtx, { businessUnitId: 3, ownerUserId: 7 })).toBe(false);
  });

  it('create: own scope creates only leads they own; units scope needs the unit', () => {
    expect(canCreateLeadIn(ownCtx, 2, 7)).toBe(true);
    expect(canCreateLeadIn(ownCtx, 2, null)).toBe(false);
    expect(canCreateLeadIn(unitCtx, 2, null)).toBe(true);
    expect(canCreateLeadIn(unitCtx, 3, null)).toBe(false);
  });
});

describe('applyLeadScope', () => {
  const fakeQb = () => {
    const calls: { sql: string; params?: Record<string, unknown> }[] = [];
    const qb = {
      andWhere: (sql: string, params?: Record<string, unknown>) => {
        calls.push({ sql, params });
        return qb;
      },
    };
    return { qb: qb as never, calls };
  };

  it('adds nothing for org scope', () => {
    const { qb, calls } = fakeQb();
    applyLeadScope(qb, resolveAccess({ ...base, roleName: RoleName.ORG_ADMIN, profile: null }));
    expect(calls).toEqual([]);
  });

  it('filters by unit ids, or to nothing when there are none', () => {
    const { qb, calls } = fakeQb();
    applyLeadScope(qb, resolveAccess({ ...base, roleName: RoleName.ORG_EMPLOYEE, profile: { permissions: [], dataScope: 'units' } }));
    expect(calls[0].sql).toContain('businessUnitId IN');
    expect(calls[0].params).toEqual({ scopeUnitIds: [2] });

    const none = fakeQb();
    applyLeadScope(none.qb, resolveAccess({ userId: 7, unitIds: [], roleName: RoleName.ORG_EMPLOYEE, profile: { permissions: [], dataScope: 'units' } }));
    expect(none.calls[0].sql).toBe('1 = 0');
  });

  it('filters by owner for own scope', () => {
    const { qb, calls } = fakeQb();
    applyLeadScope(qb, resolveAccess({ ...base, roleName: RoleName.ORG_EMPLOYEE, profile: { permissions: [], dataScope: 'own' } }));
    expect(calls[0].params).toEqual({ scopeUserId: 7 });
  });
});

describe('team scope', () => {
  const teamCtx = resolveAccess({
    ...base,
    roleName: RoleName.ORG_EMPLOYEE,
    profile: { permissions: ['leads.view'], dataScope: 'team' },
    teamUserIds: [8, 9, 7],
  });

  it('sees leads owned by the user and their team, not others', () => {
    expect(canSeeLead(teamCtx, { businessUnitId: 3, ownerUserId: 8 })).toBe(true);
    expect(canSeeLead(teamCtx, { businessUnitId: 3, ownerUserId: 7 })).toBe(true);
    expect(canSeeLead(teamCtx, { businessUnitId: 3, ownerUserId: 50 })).toBe(false);
    expect(canSeeLead(teamCtx, { businessUnitId: 3, ownerUserId: null })).toBe(false);
  });

  it('drops the user from their own team list and ignores team ids outside team scope', () => {
    expect(teamCtx.teamUserIds).toEqual([8, 9]);
    const own = resolveAccess({
      ...base,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: { permissions: [], dataScope: 'own' },
      teamUserIds: [8],
    });
    expect(own.teamUserIds).toEqual([]);
  });

  it('creates only for the team, never with no owner', () => {
    expect(canCreateLeadIn(teamCtx, 3, 9)).toBe(true);
    expect(canCreateLeadIn(teamCtx, 3, 50)).toBe(false);
    expect(canCreateLeadIn(teamCtx, 3, null)).toBe(false);
  });

  it('filters the query by owner ids including the team', () => {
    const calls: { sql: string; params?: Record<string, unknown> }[] = [];
    const qb = {
      andWhere: (sql: string, params?: Record<string, unknown>) => {
        calls.push({ sql, params });
        return qb;
      },
    };
    applyLeadScope(qb as never, teamCtx);
    expect(calls[0].sql).toContain('ownerUserId IN');
    expect(calls[0].params).toEqual({ scopeOwnerIds: [7, 8, 9] });
  });
});

describe('legacy staff access', () => {
  it('no longer carries admin-only areas (fields, units, mail, API keys)', () => {
    for (const key of ['fields.manage', 'units.manage', 'mail.manage', 'developer.manage', 'staff.manage']) {
      expect(LEGACY_STAFF_PERMISSIONS).not.toContain(key);
    }
    expect(LEGACY_STAFF_PERMISSIONS).toEqual(expect.arrayContaining(['leads.view', 'leads.delete', 'inbox.manage']));
  });
});

describe('presets', () => {
  it('only use known permission keys and valid scopes', () => {
    for (const p of PRESETS) {
      for (const key of p.permissions) expect(PERMISSION_KEYS).toContain(key);
      expect(DATA_SCOPES).toContain(p.dataScope);
    }
  });
});

describe('brand limits', () => {
  const ctx = (dataScope: 'own' | 'team' | 'units' | 'org', unitIds: number[] = [11]) =>
    resolveAccess({
      userId: 5,
      roleName: RoleName.ORG_EMPLOYEE,
      profile: { permissions: ['leads.view'], dataScope },
      unitIds,
    });

  it('limits a "units" staff member to the brands they are assigned', () => {
    expect(brandLimit(ctx('units', [11]))).toEqual([11]);
  });

  it('does not limit by brand for org, own or team scope', () => {
    expect(brandLimit(ctx('org'))).toBeNull();
    expect(brandLimit(ctx('own'))).toBeNull();
    expect(brandLimit(ctx('team'))).toBeNull();
  });

  it('never limits an admin, whatever brands they are assigned', () => {
    const admin = resolveAccess({ userId: 1, roleName: RoleName.ORG_ADMIN, profile: null, unitIds: [11] });
    expect(brandLimit(admin)).toBeNull();
  });

  it('keeps other brands and organization-wide records outside a limit', () => {
    expect(withinBrandLimit([11], 11)).toBe(true);
    expect(withinBrandLimit([11], 12)).toBe(false);
    expect(withinBrandLimit([11], null)).toBe(false);
    expect(withinBrandLimit([], 11)).toBe(false);
    expect(withinBrandLimit(null, 12)).toBe(true);
    expect(withinBrandLimit(null, null)).toBe(true);
  });
});
