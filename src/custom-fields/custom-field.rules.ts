import { CustomFieldDefinition, CustomFieldType } from '../entities/custom-fields.entities';
import { RoleName } from '../common/enums/role.enum';

/** Same shape the frontend's variable dialog produces: lower snake case, starts with a letter. */
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** Names the lead table already uses. A custom field cannot shadow them. */
export const RESERVED_KEYS = new Set([
  'id', 'name', 'email', 'phone', 'company', 'source', 'value', 'status', 'tags',
  'owner', 'stage', 'pipeline', 'created_at', 'updated_at', 'organization_id', 'business_unit_id',
]);

/** "Trip date (Dec)" -> "trip_date_dec". Always valid against KEY_PATTERN. */
export function keyFromLabel(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (!base) return 'field';
  return /^[a-z]/.test(base) ? base : `v_${base}`.slice(0, 64);
}

/** Null when the key is usable, otherwise the reason it is not. */
export function keyProblem(key: string): string | null {
  if (!KEY_PATTERN.test(key)) return 'Keys use lower-case letters, digits and underscores, and start with a letter';
  if (RESERVED_KEYS.has(key)) return `"${key}" is reserved. Choose another key`;
  return null;
}

/** Types that offer a fixed list of choices. */
export const OPTION_TYPES: ReadonlySet<CustomFieldType> = new Set<CustomFieldType>(['select', 'radio', 'multiselect']);

/**
 * Types a field may be switched between once it has data. Values stay valid inside a group
 * (a dropdown choice is still a radio choice, short text is still text). Anything else
 * could leave lead values the new type rejects, so those need a new field instead.
 */
const TYPE_GROUPS: ReadonlyArray<ReadonlySet<CustomFieldType>> = [
  new Set<CustomFieldType>(['text', 'textarea']),
  new Set<CustomFieldType>(['select', 'radio']),
];

/** The types `from` can be changed to, including itself. */
export function convertibleTypes(from: CustomFieldType): CustomFieldType[] {
  const group = TYPE_GROUPS.find((g) => g.has(from));
  return group ? [...group] : [from];
}

export const isAdmin = (role?: string | null) => role === RoleName.MASTER_ADMIN;

/** True when the role may see the field. Empty list = all staff roles. */
export function canSee(def: Pick<CustomFieldDefinition, 'visibleToRoles'>, role?: string | null): boolean {
  if (isAdmin(role)) return true;
  const roles = def.visibleToRoles ?? [];
  return roles.length === 0 || (!!role && roles.includes(role));
}

/** True when the role may change the field. Empty list = all staff roles. */
export function canEdit(def: Pick<CustomFieldDefinition, 'editableByRoles'>, role?: string | null): boolean {
  if (isAdmin(role)) return true;
  const roles = def.editableByRoles ?? [];
  return roles.length === 0 || (!!role && roles.includes(role));
}

export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Show-if: the controlling field equals the configured value (or contains it, for multiselect). */
export function isShown(
  def: Pick<CustomFieldDefinition, 'showIfKey' | 'showIfValue'>,
  values: Record<string, unknown>,
): boolean {
  if (!def.showIfKey) return true;
  const actual = values[def.showIfKey];
  const expected = def.showIfValue ?? '';
  if (Array.isArray(actual)) return actual.map(String).includes(expected);
  return String(actual ?? '') === expected;
}

export type CoerceResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Checks one value against its field type and returns the stored form. */
export function coerce(
  def: Pick<CustomFieldDefinition, 'fieldType' | 'options' | 'label'>,
  raw: unknown,
): CoerceResult {
  const type: CustomFieldType = def.fieldType;
  if (type !== 'multiselect' && Array.isArray(raw)) {
    return { ok: false, error: `${def.label} takes a single value` };
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return { ok: false, error: `${def.label} takes a single value` };
  }
  switch (type) {
    case 'text': {
      const s = String(raw).trim();
      return s.length > 500 ? { ok: false, error: `${def.label} is too long (max 500)` } : { ok: true, value: s };
    }
    case 'textarea': {
      const s = String(raw).trim();
      return s.length > 5000 ? { ok: false, error: `${def.label} is too long (max 5000)` } : { ok: true, value: s };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${def.label} must be a number` };
    }
    case 'date': {
      const s = String(raw).trim();
      const d = new Date(`${s}T00:00:00Z`);
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
      return valid ? { ok: true, value: s } : { ok: false, error: `${def.label} must be a date (YYYY-MM-DD)` };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (s === 'true' || s === 'yes') return { ok: true, value: true };
      if (s === 'false' || s === 'no') return { ok: true, value: false };
      return { ok: false, error: `${def.label} must be yes or no` };
    }
    case 'email': {
      const s = String(raw).trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { ok: true, value: s } : { ok: false, error: `${def.label} must be an email` };
    }
    case 'phone': {
      const s = String(raw).trim();
      const digits = s.replace(/\D/g, '');
      return /^\+?[0-9 ()-]+$/.test(s) && digits.length >= 6 && digits.length <= 15
        ? { ok: true, value: s }
        : { ok: false, error: `${def.label} must be a phone number` };
    }
    case 'url': {
      try {
        const u = new URL(String(raw).trim());
        if (u.protocol === 'http:' || u.protocol === 'https:') return { ok: true, value: u.toString() };
      } catch {
        /* fall through */
      }
      return { ok: false, error: `${def.label} must be an http or https link` };
    }
    case 'select':
    case 'radio': {
      const s = String(raw).trim();
      return (def.options ?? []).includes(s)
        ? { ok: true, value: s }
        : { ok: false, error: `${def.label} must be one of the listed options` };
    }
    case 'multiselect': {
      const list = Array.isArray(raw) ? raw.map((x) => String(x).trim()) : [String(raw).trim()];
      const unique = [...new Set(list.filter(Boolean))];
      const bad = unique.filter((x) => !(def.options ?? []).includes(x));
      return bad.length === 0
        ? { ok: true, value: unique }
        : { ok: false, error: `${def.label} has options that are not allowed` };
    }
    default:
      return { ok: false, error: `${def.label} has an unknown type` };
  }
}

/** Structural equality for JSON-like values, treating null, undefined and "" as the same empty value. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ApplyResult {
  data: Record<string, unknown>;
  /** Per-key validation messages. Empty when the save is valid. */
  errors: Record<string, string>;
  /** Keys the actor is not allowed to change. */
  forbidden: string[];
}

/**
 * Applies an incoming partial update to a record's customData and validates the result.
 *
 * - Only fields the actor may edit can change. Others are reported in `forbidden`.
 * - Required fields are checked only if the actor can see them, so a restricted role
 *   is not blocked by fields it cannot see.
 * - Hidden (show-if) fields have their stored value cleared, because they do not apply.
 * - Unknown keys are reported as errors, not silently dropped.
 */
export function applyCustomData(
  defs: CustomFieldDefinition[],
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  role?: string | null,
): ApplyResult {
  const active = defs.filter((d) => d.isActive);
  const byKey = new Map(active.map((d) => [d.key, d]));
  const data: Record<string, unknown> = { ...(existing ?? {}) };
  const errors: Record<string, string> = {};
  const forbidden: string[] = [];

  for (const key of Object.keys(incoming ?? {})) {
    const def = byKey.get(key);
    if (!def) {
      errors[key] = 'Unknown field';
      continue;
    }
    if (!canEdit(def, role)) {
      // A form that resends an unchanged value is not an attempt to edit it.
      if (!sameValue(incoming[key], data[key])) forbidden.push(key);
      continue;
    }
    const value = incoming[key];
    if (isEmpty(value)) {
      delete data[key];
      continue;
    }
    const result = coerce(def, value);
    if (result.ok) data[key] = result.value;
    else errors[key] = result.error;
  }

  for (const def of active) {
    if (!isShown(def, data)) {
      delete data[def.key];
      continue;
    }
    if (def.required && canSee(def, role) && isEmpty(data[def.key])) {
      errors[def.key] = errors[def.key] ?? `${def.label} is required`;
    }
  }

  return { data, errors, forbidden };
}

/** Keeps only the fields the role may see. Used when returning a lead. */
export function visibleCustomData(
  defs: CustomFieldDefinition[],
  data: Record<string, unknown>,
  role?: string | null,
): Record<string, unknown> {
  const allowed = new Set(defs.filter((d) => d.isActive && canSee(d, role)).map((d) => d.key));
  return Object.fromEntries(Object.entries(data ?? {}).filter(([k]) => allowed.has(k)));
}
