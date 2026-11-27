/**
 * How an organization is laid out. Chosen at signup; only a master admin changes it afterwards.
 *
 * A "unit" is a place (a plant, an office, a city). A "brand" is a line of business inside a unit.
 * Leads, forms, pipelines and mail accounts belong to a brand (the business_units table).
 * Every unit always has at least one brand: the single-brand layouts keep one hidden default brand.
 */
export const UNIT_STRUCTURES = [
  'multi_unit',
  'one_unit_multi_brand',
  'one_unit_one_brand',
  'one_unit_no_brand',
] as const;

export type UnitStructure = (typeof UNIT_STRUCTURES)[number];

export const DEFAULT_UNIT_STRUCTURE: UnitStructure = 'multi_unit';

export function isUnitStructure(value: unknown): value is UnitStructure {
  return typeof value === 'string' && (UNIT_STRUCTURES as readonly string[]).includes(value);
}

/** Reads a stored value, treating anything unknown as the most open layout. */
export function normalizeStructure(value: unknown): UnitStructure {
  return isUnitStructure(value) ? value : DEFAULT_UNIT_STRUCTURE;
}

/** Can this layout hold more than one unit? */
export function allowsManyUnits(s: UnitStructure): boolean {
  return s === 'multi_unit';
}

/** Can this layout hold more than one brand? When not, the app hides the unit and brand pages. */
export function allowsManyBrands(s: UnitStructure): boolean {
  return s === 'multi_unit' || s === 'one_unit_multi_brand';
}

/**
 * The "admin panel": unit and brand management, and staff assigned to units or brands.
 * Off for the two single-brand layouts, where every employee sees the data directly.
 */
export function hasAdminPanel(s: UnitStructure): boolean {
  return allowsManyBrands(s);
}

export interface StructureCounts {
  activeUnits: number;
  activeBrands: number;
}

/**
 * Why an organization cannot move to `target` right now, or null when it can.
 * Narrowing a layout never deletes anything, so the extra units or brands must be deactivated first.
 */
export function structureChangeProblem(target: UnitStructure, counts: StructureCounts): string | null {
  if (!allowsManyUnits(target) && counts.activeUnits > 1) {
    return 'This organization has more than one active unit. Deactivate the extra units before choosing a single-unit layout.';
  }
  if (!allowsManyBrands(target) && counts.activeBrands > 1) {
    return 'This organization has more than one active brand. Deactivate the extra brands before choosing a single-brand layout.';
  }
  return null;
}
