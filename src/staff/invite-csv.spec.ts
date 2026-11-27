import { MAX_INVITE_ROWS, parseInviteCsv, splitCsvLine } from './invite-csv';

describe('splitCsvLine', () => {
  it('splits plain cells and trims them', () => {
    expect(splitCsvLine(' a , b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quotes and reads doubled quotes', () => {
    expect(splitCsvLine('"Doe, Jane",x,"say ""hi"""')).toEqual(['Doe, Jane', 'x', 'say "hi"']);
  });
});

describe('parseInviteCsv', () => {
  it('reads name and email, maps role aliases, lowercases the email', () => {
    const { rows, errors } = parseInviteCsv(
      'Name,Email,Role,Profile\r\nAsha,ASHA@Example.com,accountant,Read-only\r\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: 'Asha', email: 'asha@example.com', roleName: 'CAA', profileName: 'Read-only' },
    ]);
  });

  it('needs name and email columns', () => {
    const { errors } = parseInviteCsv('name\nAsha\n');
    expect(errors.map((e) => e.message)).toContain('The header needs a "email" column');
  });

  it('rejects unknown columns', () => {
    const { errors } = parseInviteCsv('name,email,phone\nAsha,a@b.co,123\n');
    expect(errors[0].message).toContain('Unknown column "phone"');
  });

  it('reports each bad row with its line number', () => {
    const { rows, errors } = parseInviteCsv('name,email,role\nAsha,bad,staff\nBen,ben@x.io,wizard\n');
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ line: 2 }),
      expect.objectContaining({ line: 3, message: expect.stringContaining('wizard') }),
    ]);
  });

  it('refuses a repeated email', () => {
    const { errors } = parseInviteCsv('name,email\nA,same@x.io\nB,same@x.io\n');
    expect(errors).toEqual([expect.objectContaining({ line: 3, message: expect.stringContaining('more than once') })]);
  });

  it('skips blank lines but keeps the original line numbers', () => {
    const { rows } = parseInviteCsv('name,email\n\nAsha,a@x.io\n');
    expect(rows[0].line).toBe(3);
  });

  it(`caps a single paste at ${MAX_INVITE_ROWS} people`, () => {
    const lines = ['name,email'];
    for (let i = 0; i <= MAX_INVITE_ROWS; i++) lines.push(`P${i},p${i}@x.io`);
    expect(parseInviteCsv(lines.join('\n')).errors[0].message).toContain(`at most ${MAX_INVITE_ROWS}`);
  });
});
