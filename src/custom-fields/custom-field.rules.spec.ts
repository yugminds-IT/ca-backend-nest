import { CustomFieldDefinition, CustomFieldType } from '../entities/custom-fields.entities';
import {
  applyCustomData,
  canEdit,
  canSee,
  coerce,
  convertibleTypes,
  keyFromLabel,
  keyProblem,
  visibleCustomData,
} from './custom-field.rules';

function def(partial: Partial<CustomFieldDefinition> & { key: string }): CustomFieldDefinition {
  return {
    id: 1,
    organizationId: 1,
    businessUnitId: 1,
    entityType: 'lead',
    label: partial.key,
    fieldType: 'text' as CustomFieldType,
    options: [],
    required: false,
    position: 0,
    section: 'Details',
    helpText: null,
    showIfKey: null,
    showIfValue: null,
    visibleToRoles: [],
    editableByRoles: [],
    isActive: true,
    ...partial,
  } as CustomFieldDefinition;
}

describe('keyFromLabel', () => {
  it('snake-cases and strips accents', () => {
    expect(keyFromLabel('Trip date (Dec)')).toBe('trip_date_dec');
    expect(keyFromLabel('Café préférence')).toBe('cafe_preference');
  });

  it('prefixes keys that start with a digit and falls back when empty', () => {
    expect(keyFromLabel('2024 budget')).toBe('v_2024_budget');
    expect(keyFromLabel('!!!')).toBe('field');
  });

  it('always yields a key that passes keyProblem', () => {
    for (const label of ['Trip date', '2024 budget', 'Ünïcode', '***', 'a'.repeat(200)]) {
      expect(keyProblem(keyFromLabel(label))).toBeNull();
    }
  });
});

describe('keyProblem', () => {
  it('rejects bad shapes and reserved names', () => {
    expect(keyProblem('Trip')).not.toBeNull();
    expect(keyProblem('9lives')).not.toBeNull();
    expect(keyProblem('email')).toMatch(/reserved/);
    expect(keyProblem('trip_date')).toBeNull();
  });
});

describe('role visibility and edit', () => {
  it('an empty list means every staff role, and admins always pass', () => {
    const open = def({ key: 'a' });
    expect(canSee(open, 'ORG_EMPLOYEE')).toBe(true);
    expect(canEdit(open, 'CAA')).toBe(true);
    const locked = def({ key: 'b', visibleToRoles: ['ORG_ADMIN'], editableByRoles: ['ORG_ADMIN'] });
    expect(canSee(locked, 'ORG_EMPLOYEE')).toBe(false);
    expect(canSee(locked, 'MASTER_ADMIN')).toBe(true);
    expect(canEdit(locked, 'CAA')).toBe(false);
  });
});

describe('coerce', () => {
  const base = { label: 'F', options: [] as string[] };

  it('validates each type', () => {
    expect(coerce({ ...base, fieldType: 'number' }, '12.5')).toEqual({ ok: true, value: 12.5 });
    expect(coerce({ ...base, fieldType: 'number' }, 'abc').ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'date' }, '2026-02-30').ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'date' }, '2026-02-03')).toEqual({ ok: true, value: '2026-02-03' });
    expect(coerce({ ...base, fieldType: 'boolean' }, 'yes')).toEqual({ ok: true, value: true });
    expect(coerce({ ...base, fieldType: 'email' }, 'A@B.CO')).toEqual({ ok: true, value: 'a@b.co' });
    expect(coerce({ ...base, fieldType: 'email' }, 'nope').ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'phone' }, '+91 98765 43210').ok).toBe(true);
    expect(coerce({ ...base, fieldType: 'phone' }, 'call me').ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'url' }, 'javascript:alert(1)').ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'url' }, 'https://example.com').ok).toBe(true);
  });

  it('restricts select and multiselect to listed options', () => {
    const opts = { ...base, options: ['Hotel', 'Flight'] };
    expect(coerce({ ...opts, fieldType: 'select' }, 'Hotel').ok).toBe(true);
    expect(coerce({ ...opts, fieldType: 'select' }, 'Train').ok).toBe(false);
    expect(coerce({ ...opts, fieldType: 'multiselect' }, ['Hotel', 'Hotel', 'Flight'])).toEqual({
      ok: true,
      value: ['Hotel', 'Flight'],
    });
    expect(coerce({ ...opts, fieldType: 'multiselect' }, ['Train']).ok).toBe(false);
  });

  it('treats radio like a single choice from the listed options', () => {
    const opts = { ...base, options: ['Yes', 'No'], fieldType: 'radio' as CustomFieldType };
    expect(coerce(opts, 'Yes')).toEqual({ ok: true, value: 'Yes' });
    expect(coerce(opts, 'Maybe').ok).toBe(false);
    expect(coerce(opts, ['Yes']).ok).toBe(false);
  });

  it('rejects arrays and objects for single-value types', () => {
    expect(coerce({ ...base, fieldType: 'text' }, ['a']).ok).toBe(false);
    expect(coerce({ ...base, fieldType: 'text' }, { a: 1 }).ok).toBe(false);
  });
});

describe('convertibleTypes', () => {
  it('lets text and long text swap, and dropdown and radio swap', () => {
    expect(convertibleTypes('text').sort()).toEqual(['text', 'textarea']);
    expect(convertibleTypes('textarea').sort()).toEqual(['text', 'textarea']);
    expect(convertibleTypes('select').sort()).toEqual(['radio', 'select']);
    expect(convertibleTypes('radio').sort()).toEqual(['radio', 'select']);
  });

  it('keeps every other type fixed, because stored values might not fit a new type', () => {
    expect(convertibleTypes('number')).toEqual(['number']);
    expect(convertibleTypes('date')).toEqual(['date']);
    expect(convertibleTypes('multiselect')).toEqual(['multiselect']);
    expect(convertibleTypes('email')).toEqual(['email']);
  });
});

describe('applyCustomData', () => {
  const trip = def({ key: 'trip', fieldType: 'select', options: ['Yes', 'No'] });
  const budget = def({ key: 'budget', fieldType: 'number', required: true, showIfKey: 'trip', showIfValue: 'Yes' });

  it('enforces required only when the field is shown', () => {
    const hidden = applyCustomData([trip, budget], { trip: 'No' }, {}, 'ORG_ADMIN');
    expect(hidden.errors).toEqual({});

    const shown = applyCustomData([trip, budget], { trip: 'Yes' }, {}, 'ORG_ADMIN');
    expect(shown.errors).toEqual({ budget: 'budget is required' });
  });

  it('clears the value of a field whose show-if no longer matches', () => {
    const result = applyCustomData([trip, budget], { trip: 'No' }, { trip: 'Yes', budget: 500 }, 'ORG_ADMIN');
    expect(result.data).toEqual({ trip: 'No' });
  });

  it('blocks changes to fields the role cannot edit, but ignores unchanged resends', () => {
    const locked = def({ key: 'cost', fieldType: 'number', editableByRoles: ['ORG_ADMIN'] });
    const resent = applyCustomData([locked], { cost: 100 }, { cost: 100 }, 'ORG_EMPLOYEE');
    expect(resent.forbidden).toEqual([]);

    const changed = applyCustomData([locked], { cost: 200 }, { cost: 100 }, 'ORG_EMPLOYEE');
    expect(changed.forbidden).toEqual(['cost']);
    expect(changed.data.cost).toBe(100);
  });

  it('does not block a restricted role on required fields it cannot see', () => {
    const secret = def({ key: 'secret', required: true, visibleToRoles: ['ORG_ADMIN'] });
    const result = applyCustomData([secret], {}, {}, 'ORG_EMPLOYEE');
    expect(result.errors).toEqual({});
  });

  it('reports unknown keys instead of dropping them', () => {
    const result = applyCustomData([trip], { nope: 'x' }, {}, 'ORG_ADMIN');
    expect(result.errors).toEqual({ nope: 'Unknown field' });
  });

  it('an empty value removes the key', () => {
    const result = applyCustomData([trip], { trip: '' }, { trip: 'Yes' }, 'ORG_ADMIN');
    expect(result.data).toEqual({});
  });

  it('ignores inactive definitions', () => {
    const off = def({ key: 'old', isActive: false });
    const result = applyCustomData([off], { old: 'x' }, {}, 'ORG_ADMIN');
    expect(result.errors).toEqual({ old: 'Unknown field' });
  });
});

describe('visibleCustomData', () => {
  it('strips values the role cannot see', () => {
    const open = def({ key: 'open' });
    const secret = def({ key: 'secret', visibleToRoles: ['ORG_ADMIN'] });
    const data = { open: 'a', secret: 'b', orphan: 'c' };
    expect(visibleCustomData([open, secret], data, 'ORG_EMPLOYEE')).toEqual({ open: 'a' });
    expect(visibleCustomData([open, secret], data, 'ORG_ADMIN')).toEqual({ open: 'a', secret: 'b' });
  });
});
