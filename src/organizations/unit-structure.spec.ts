import {
  allowsManyBrands,
  allowsManyUnits,
  hasAdminPanel,
  isUnitStructure,
  normalizeStructure,
  structureChangeProblem,
} from './unit-structure';

describe('unit structures', () => {
  it('knows which layouts allow several units and several brands', () => {
    expect(allowsManyUnits('multi_unit')).toBe(true);
    expect(allowsManyUnits('one_unit_multi_brand')).toBe(false);
    expect(allowsManyBrands('multi_unit')).toBe(true);
    expect(allowsManyBrands('one_unit_multi_brand')).toBe(true);
    expect(allowsManyBrands('one_unit_one_brand')).toBe(false);
    expect(allowsManyBrands('one_unit_no_brand')).toBe(false);
  });

  it('shows the admin panel only where there is something to manage', () => {
    expect(hasAdminPanel('multi_unit')).toBe(true);
    expect(hasAdminPanel('one_unit_multi_brand')).toBe(true);
    expect(hasAdminPanel('one_unit_one_brand')).toBe(false);
    expect(hasAdminPanel('one_unit_no_brand')).toBe(false);
  });

  it('falls back to the most open layout for unknown values', () => {
    expect(isUnitStructure('one_unit_one_brand')).toBe(true);
    expect(isUnitStructure('nope')).toBe(false);
    expect(normalizeStructure('nope')).toBe('multi_unit');
    expect(normalizeStructure(undefined)).toBe('multi_unit');
    expect(normalizeStructure('one_unit_no_brand')).toBe('one_unit_no_brand');
  });

  it('refuses to narrow a layout while extra units or brands are active', () => {
    expect(structureChangeProblem('one_unit_multi_brand', { activeUnits: 2, activeBrands: 4 })).toMatch(/more than one active unit/);
    expect(structureChangeProblem('one_unit_one_brand', { activeUnits: 1, activeBrands: 2 })).toMatch(/more than one active brand/);
    expect(structureChangeProblem('one_unit_no_brand', { activeUnits: 1, activeBrands: 3 })).toMatch(/more than one active brand/);
  });

  it('allows widening, and narrowing when nothing extra is active', () => {
    expect(structureChangeProblem('multi_unit', { activeUnits: 5, activeBrands: 9 })).toBeNull();
    expect(structureChangeProblem('one_unit_multi_brand', { activeUnits: 1, activeBrands: 9 })).toBeNull();
    expect(structureChangeProblem('one_unit_one_brand', { activeUnits: 1, activeBrands: 1 })).toBeNull();
  });
});
