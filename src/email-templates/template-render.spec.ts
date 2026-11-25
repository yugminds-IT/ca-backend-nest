import { isHtmlBody, mergeVariables, renderEmail, substitute, systemVariables, usedVariables, withSignature } from './template-render';

describe('template-render', () => {
  it('blanks unknown variables so recipients never see raw {{braces}}', () => {
    expect(substitute('Pwd: {{login_password}} / {{ client_name }}', { client_name: 'Asha' }, false)).toBe('Pwd:  / Asha');
  });

  it('escapes values in HTML bodies but not in plain ones (plain gets escaped whole later)', () => {
    const vars = { client_name: '<b>x</b> & co' };
    expect(renderEmail('S', '<p>{{client_name}}</p>', vars).body).toBe('<p>&lt;b&gt;x&lt;/b&gt; &amp; co</p>');
    expect(renderEmail('S', 'Hi {{client_name}}', vars).body).toBe('Hi <b>x</b> & co');
  });

  it('treats a tag-less body with entities (editor output) as HTML, so &nbsp; is not shown literally', () => {
    expect(isHtmlBody('city={{client_city}}&nbsp;bye')).toBe(true);
    expect(isHtmlBody('plain text\nline')).toBe(false);
    expect(renderEmail('S', 'a&nbsp;b', {}).text).toBe('a b');
  });

  it('subject is plain text: values not escaped, unknowns blanked', () => {
    expect(renderEmail('Hi {{client_name}} {{nope}}', 'b', { client_name: 'A & B' }).subject).toBe('Hi A & B');
  });

  it('computes Indian FY/AY and dates', () => {
    const march = systemVariables(new Date('2027-03-31T10:00:00Z'), 'https://x.com/', 'Asia/Kolkata');
    const april = systemVariables(new Date('2027-04-01T10:00:00Z'), 'https://x.com', 'Asia/Kolkata');
    expect([march.financial_year, march.assessment_year]).toEqual(['2026-27', '2027-28']);
    expect([april.financial_year, april.assessment_year]).toEqual(['2027-28', '2028-29']);
    expect(april.today).toBe('1 April 2027');
    expect(april.login_url).toBe('https://x.com/login');
  });

  it('merge: later non-empty values win, empty ones do not wipe earlier values; keys normalised', () => {
    expect(mergeVariables({ financial_year: '2026-27', a: '1' }, { financial_year: '', '{{ a }}': '2', b: '' })).toEqual({
      financial_year: '2026-27',
      a: '2',
      b: '',
    });
  });

  it('lists used variables once', () => {
    expect(usedVariables('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b']);
  });
});

describe('withSignature', () => {
  it('adds the sign-off in the body’s format, escaped for HTML', () => {
    expect(withSignature('Hi', '')).toBe('Hi');
    expect(withSignature('Hi\n', 'Regards,\n{{org_name}}')).toBe('Hi\n\nRegards,\n{{org_name}}');
    expect(withSignature('<p>Hi</p>', 'A & B\n<CA>')).toBe('<p>Hi</p><p>A &amp; B<br>&lt;CA&gt;</p>');
  });
});
