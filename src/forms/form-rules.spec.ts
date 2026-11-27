import {
  checkFieldValue,
  FormField,
  toIntakeDto,
  validateFormDefinition,
  validateFormValues,
} from './form-rules';

const f = (over: Partial<FormField> & Pick<FormField, 'key' | 'type'>): FormField => ({
  label: over.key,
  required: false,
  ...over,
});

describe('validateFormDefinition', () => {
  it('accepts a sensible form', () => {
    expect(
      validateFormDefinition([
        f({ key: 'full_name', type: 'text', required: true, role: 'name' }),
        f({ key: 'email', type: 'email', required: true }),
        f({ key: 'service', type: 'select', options: ['GST', 'ITR'] }),
      ]),
    ).toEqual([]);
  });

  it('rejects bad keys, reserved keys, duplicate roles, empty selects', () => {
    const problems = validateFormDefinition([
      f({ key: 'Bad Key', type: 'text' }),
      f({ key: 'apiKey', type: 'text' }),
      f({ key: 'mail_a', type: 'email' }),
      f({ key: 'mail_b', type: 'email' }),
      f({ key: 'pick', type: 'select', options: [] }),
    ]);
    expect(problems.join(' | ')).toMatch(/lowercase/);
    expect(problems.join(' | ')).toMatch(/"apiKey" is reserved/);
    expect(problems.join(' | ')).toMatch(/Only one field can be used as email/);
    expect(problems.join(' | ')).toMatch(/select needs at least one option/);
  });

  it('rejects duplicate keys', () => {
    const problems = validateFormDefinition([
      f({ key: 'city', type: 'text' }),
      f({ key: 'city', type: 'text' }),
    ]);
    expect(problems.join(' ')).toMatch(/share the key "city"/);
  });

  it('allows a reserved-looking key when the field maps to a sender role', () => {
    expect(
      validateFormDefinition([f({ key: 'email', type: 'email', required: true })]),
    ).toEqual([]);
  });
});

describe('checkFieldValue', () => {
  it('requires required fields and trims optional ones', () => {
    expect(checkFieldValue(f({ key: 'a', type: 'text', required: true }), '  ')).toEqual({
      error: 'Required',
    });
    expect(checkFieldValue(f({ key: 'a', type: 'text' }), '  ')).toEqual({});
    expect(checkFieldValue(f({ key: 'a', type: 'text' }), ' hi ')).toEqual({ value: 'hi' });
  });

  it('checks email and phone formats', () => {
    expect(checkFieldValue(f({ key: 'e', type: 'email' }), 'x@y.com')).toEqual({ value: 'x@y.com' });
    expect(checkFieldValue(f({ key: 'e', type: 'email' }), 'nope')).toEqual({
      error: 'Enter a valid email address',
    });
    expect(checkFieldValue(f({ key: 'p', type: 'phone' }), '+91 98765 43210')).toEqual({
      value: '+91 98765 43210',
    });
    expect(checkFieldValue(f({ key: 'p', type: 'phone' }), '12')).toEqual({
      error: 'Enter a valid phone number',
    });
  });

  it('only accepts listed options for select', () => {
    const sel = f({ key: 's', type: 'select', options: ['GST', 'ITR'] });
    expect(checkFieldValue(sel, 'GST')).toEqual({ value: 'GST' });
    expect(checkFieldValue(sel, 'VAT')).toEqual({ error: 'Choose one of the options' });
  });

  it('treats a checkbox as yes/no and enforces it when required', () => {
    expect(checkFieldValue(f({ key: 'c', type: 'checkbox' }), 'on')).toEqual({ value: 'Yes' });
    expect(checkFieldValue(f({ key: 'c', type: 'checkbox' }), undefined)).toEqual({ value: 'No' });
    expect(checkFieldValue(f({ key: 'c', type: 'checkbox', required: true }), 'false')).toEqual({
      error: 'Please tick this box',
    });
  });

  it('rejects objects and bad dates', () => {
    expect(checkFieldValue(f({ key: 'a', type: 'text' }), { x: 1 })).toEqual({ error: 'Invalid value' });
    expect(checkFieldValue(f({ key: 'd', type: 'date' }), '2026-13-45')).toEqual({
      error: 'Enter a valid date',
    });
    expect(checkFieldValue(f({ key: 'd', type: 'date' }), '2026-11-26')).toEqual({ value: '2026-11-26' });
  });
});

describe('validateFormValues and toIntakeDto', () => {
  const fields: FormField[] = [
    f({ key: 'full_name', type: 'text', required: true, role: 'name' }),
    f({ key: 'mail', type: 'email', required: true }),
    f({ key: 'company', type: 'text' }),
    f({ key: 'note', type: 'textarea', role: 'message' }),
  ];

  it('reports every missing required field and ignores unknown keys', () => {
    const r = validateFormValues(fields, { company: 'Acme', extra: 'x' });
    expect(r.errors).toEqual({ full_name: 'Required', mail: 'Required' });
    expect(r.values).toEqual({ company: 'Acme' });
  });

  it('maps sender roles to canonical keys and keeps the rest under their key', () => {
    const body = {
      full_name: ' Meera ',
      mail: 'meera@example.com',
      company: 'Acme',
      note: 'Need GST help',
    };
    const { values, errors } = validateFormValues(fields, body);
    expect(errors).toEqual({});
    expect(toIntakeDto('Contact', fields, values)).toEqual({
      formName: 'Contact',
      name: 'Meera',
      email: 'meera@example.com',
      company: 'Acme',
      message: 'Need GST help',
    });
  });
});
