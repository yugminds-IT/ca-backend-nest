import { cleanImportRow } from './lead-normalize.util';

describe('cleanImportRow', () => {
  it('keeps a row with a name and an email, trimming and normalizing values', () => {
    expect(cleanImportRow({ name: ' Asha ', email: 'Asha@Example.com ', value: '1,250' })).toEqual({
      name: 'Asha',
      email: 'Asha@Example.com',
      phone: undefined,
      company: undefined,
      source: undefined,
      value: 1250,
    });
  });

  it('accepts a phone number in place of an email', () => {
    expect(cleanImportRow({ name: 'Ravi', phone: '98765 43210' })).toMatchObject({ phone: '98765 43210' });
  });

  it('explains why a row is refused', () => {
    expect(cleanImportRow({ name: '', email: 'a@b.co' })).toBe('Name is missing');
    expect(cleanImportRow({ name: 'Ravi' })).toBe('Needs an email or a phone number');
    expect(cleanImportRow({ name: 'Ravi', email: 'nope' })).toBe('Email is not valid');
    expect(cleanImportRow({ name: 'Ravi', phone: '1', value: '-5' })).toBe('Value must be 0 or more');
    expect(cleanImportRow({ name: 'x'.repeat(300), phone: '123456' })).toMatch(/longer than 255/);
  });

  it('treats an empty value cell as no value', () => {
    expect(cleanImportRow({ name: 'Ravi', email: 'r@x.co', value: '' })).toMatchObject({ value: undefined });
  });
});
