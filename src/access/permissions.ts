/**
 * The permission catalog, the presets, and how a staff member's access is worked out.
 * Pure functions only: no database, so the rules are easy to test.
 */
import { RoleName } from '../common/enums/role.enum';

export interface PermissionDef {
  key: string;
  label: string;
}

export const PERMISSION_GROUPS: { title: string; permissions: PermissionDef[] }[] = [
  {
    title: 'Leads',
    permissions: [
      { key: 'leads.view', label: 'See leads' },
      { key: 'leads.create', label: 'Add leads' },
      { key: 'leads.edit', label: 'Edit leads, move stages, log activity' },
      { key: 'leads.delete', label: 'Delete and merge leads' },
      { key: 'leads.import', label: 'Import leads from CSV' },
      { key: 'leads.export', label: 'Export leads to CSV' },
    ],
  },
  {
    title: 'Forms and inbox',
    permissions: [
      { key: 'forms.manage', label: 'Build forms' },
      { key: 'inbox.manage', label: 'Work the form inbox and convert responses' },
    ],
  },
  {
    title: 'Settings',
    permissions: [
      { key: 'fields.manage', label: 'Lead custom fields' },
      { key: 'templates.manage', label: 'Email templates' },
      { key: 'mail.manage', label: 'Mail accounts and domains' },
      { key: 'units.manage', label: 'Business units' },
      { key: 'developer.manage', label: 'API keys and webhooks' },
      { key: 'automation.manage', label: 'Assignment, workflows, sequences, SLA and scoring' },
      { key: 'staff.manage', label: 'Staff, invites and permission profiles' },
    ],
  },
  {
    title: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'See reports and dashboards (figures follow the viewer’s data scope)' },
      { key: 'reports.manage', label: 'Build dashboards and schedule report emails' },
    ],
  },
];

export const PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export const DATA_SCOPES = ['own', 'team', 'units', 'org'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  own: 'Only records they own',
  team: 'Records owned by the people in the teams they manage (and sub-teams)',
  units: 'Records in their business units',
  org: 'Every record in the organization',
};

const LEAD_PERMISSIONS = [
  'leads.view',
  'leads.create',
  'leads.edit',
  'leads.delete',
  'leads.import',
  'leads.export',
];

export interface PresetDef {
  name: string;
  description: string;
  permissions: string[];
  dataScope: DataScope;
}

/** Seeded into every organization the first time its profiles are listed. Admins can edit them. */
export const PRESETS: PresetDef[] = [
  {
    name: 'Admin',
    description: 'Everything, across the whole organization',
    permissions: PERMISSION_KEYS,
    dataScope: 'org',
  },
  {
    name: 'Manager',
    description: 'Runs leads, forms and the inbox for their business units',
    permissions: [...LEAD_PERMISSIONS, 'forms.manage', 'inbox.manage', 'templates.manage', 'reports.view', 'reports.manage'],
    dataScope: 'units',
  },
  {
    name: 'Team Lead',
    description: 'Runs the leads of the people in their team and sub-teams',
    permissions: [...LEAD_PERMISSIONS, 'forms.manage', 'inbox.manage', 'templates.manage', 'reports.view', 'reports.manage'],
    dataScope: 'team',
  },
  {
    name: 'Sales Executive',
    description: 'Works the leads they own',
    permissions: ['leads.view', 'leads.create', 'leads.edit'],
    dataScope: 'own',
  },
  {
    name: 'Read-only',
    description: 'Can look at leads in their business units, change nothing',
    permissions: ['leads.view', 'reports.view'],
    dataScope: 'units',
  },
];

/**
 * Staff without a profile keep exactly what their role could do before profiles existed: leads, forms,
 * the inbox and email templates, across the organization. Everything else (fields, units, mail, API keys,
 * staff) stays with admins until a profile grants it.
 */
export const LEGACY_STAFF_PERMISSIONS: string[] = [
  ...LEAD_PERMISSIONS,
  'forms.manage',
  'inbox.manage',
  'templates.manage',
];

const LEGACY_STAFF_ROLES: string[] = [RoleName.CAA, RoleName.ORG_EMPLOYEE];

export interface AccessContext {
  userId: number;
  permissions: ReadonlySet<string>;
  dataScope: DataScope;
  unitIds: number[];
  /** Members of the teams this user manages (and their sub-teams), excluding the user. Only for "team" scope. */
  teamUserIds: number[];
  /** False for a single-branch organization: no brands to manage, and staff see its data directly. */
  adminPanel: boolean;
}

export interface AccessInput {
  userId: number;
  roleName: string | null;
  profile: { permissions: string[]; dataScope: DataScope } | null;
  unitIds: number[];
  teamUserIds?: number[];
  /** The organization's admin-panel choice. Anything but an explicit false means the panel is on. */
  adminPanelEnabled?: boolean | null;
}

/** Owners whose leads a user may see under "own" or "team" scope: themselves and their team. */
export function scopeOwnerIds(ctx: AccessContext): number[] {
  return [ctx.userId, ...ctx.teamUserIds];
}

export function isOrgAdmin(roleName: string | null | undefined): boolean {
  return roleName === RoleName.MASTER_ADMIN || roleName === RoleName.ORG_ADMIN;
}

/**
 * Admins: everything, org-wide, whatever their profile says. Client portal users: nothing.
 * Staff with a profile: the profile's permissions and scope (unknown permission keys are dropped).
 * In a single-branch organization (no admin panel) a "units" scope means the whole organization,
 * because there is only one branch and nobody is assigned to brands. "own" and "team" stay as chosen.
 * Staff without a profile: the legacy set. Any other or missing role: nothing.
 */
export function resolveAccess(input: AccessInput): AccessContext {
  const { userId, roleName, unitIds } = input;
  const adminPanel = input.adminPanelEnabled !== false;
  if (isOrgAdmin(roleName)) {
    return { userId, permissions: new Set(PERMISSION_KEYS), dataScope: 'org', unitIds, teamUserIds: [], adminPanel };
  }
  if (roleName === RoleName.CLIENT || !roleName) {
    return { userId, permissions: new Set(), dataScope: 'own', unitIds, teamUserIds: [], adminPanel };
  }
  if (input.profile) {
    const chosen = input.profile.dataScope;
    const scope: DataScope = chosen === 'units' && !adminPanel ? 'org' : chosen;
    return {
      userId,
      permissions: new Set(input.profile.permissions.filter((p) => PERMISSION_KEYS.includes(p))),
      dataScope: scope,
      unitIds,
      teamUserIds: scope === 'team' ? [...new Set(input.teamUserIds ?? [])].filter((id) => id !== userId) : [],
      adminPanel,
    };
  }
  if (LEGACY_STAFF_ROLES.includes(roleName)) {
    return {
      userId,
      permissions: new Set(LEGACY_STAFF_PERMISSIONS),
      dataScope: 'org',
      unitIds,
      teamUserIds: [],
      adminPanel,
    };
  }
  return { userId, permissions: new Set(), dataScope: 'own', unitIds, teamUserIds: [], adminPanel };
}

/** Whether a lead falls inside the user's data scope. Does not check permissions. */
export function canSeeLead(
  ctx: AccessContext,
  lead: { businessUnitId: number; ownerUserId: number | null },
): boolean {
  switch (ctx.dataScope) {
    case 'org':
      return true;
    case 'units':
      return ctx.unitIds.includes(lead.businessUnitId);
    case 'own':
    case 'team':
      return lead.ownerUserId !== null && scopeOwnerIds(ctx).includes(lead.ownerUserId);
  }
}

/**
 * The brands a user's brand-owned records (forms, templates, pipelines, fields, the brand list) are
 * limited to, or null when every brand is open to them. Only a "units" scope limits by brand:
 * "own" and "team" limit leads by owner instead, and admins see everything.
 */
export function brandLimit(ctx: AccessContext): number[] | null {
  return ctx.dataScope === 'units' ? ctx.unitIds : null;
}

/** Whether a brand is inside a limit from brandLimit. A null brand (organization-wide) is outside any limit. */
export function withinBrandLimit(limit: number[] | null, businessUnitId: number | null | undefined): boolean {
  if (limit === null) return true;
  return businessUnitId != null && limit.includes(businessUnitId);
}

/** Whether a user may create a lead in a unit and with an owner, under their scope. */
export function canCreateLeadIn(
  ctx: AccessContext,
  businessUnitId: number,
  ownerUserId: number | null,
): boolean {
  switch (ctx.dataScope) {
    case 'org':
      return true;
    case 'units':
      return ctx.unitIds.includes(businessUnitId);
    case 'own':
    case 'team':
      return ownerUserId !== null && scopeOwnerIds(ctx).includes(ownerUserId);
  }
}

/** Roles that count as staff (the people who sign in to the CRM, not clients). */
export const STAFF_ROLE_NAMES: string[] = [RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];
