/**
 * Parses a pasted list of people to invite. Pure, so the rules are easy to test.
 *
 * The first non-blank line is the header. Columns: name, email (required); role, profile (optional).
 * Quoted fields are supported ("Doe, Jane"). Nothing is invited unless every row is valid.
 */

export const MAX_INVITE_ROWS = 100;

export interface InviteRow {
  line: number;
  name: string;
  email: string;
  roleName?: 'CAA' | 'ORG_EMPLOYEE' | 'ORG_ADMIN';
  profileName?: string;
}

export interface InviteCsvError {
  line: number;
  message: string;
}

export interface ParsedInviteCsv {
  rows: InviteRow[];
  errors: InviteCsvError[];
}

const KNOWN_COLUMNS = ['name', 'email', 'role', 'profile'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_ALIASES: Record<string, InviteRow['roleName']> = {
  staff: 'ORG_EMPLOYEE',
  org_employee: 'ORG_EMPLOYEE',
  accountant: 'CAA',
  caa: 'CAA',
  admin: 'ORG_ADMIN',
  org_admin: 'ORG_ADMIN',
};

/** Splits one CSV line. Handles quoted fields and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseInviteCsv(text: string): ParsedInviteCsv {
  const errors: InviteCsvError[] = [];
  const numbered = text
    .split(/\r?\n/)
    .map((raw, index) => ({ line: index + 1, cells: splitCsvLine(raw) }))
    .filter((l) => l.cells.some((c) => c.length > 0));

  if (numbered.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'Paste at least a header row and one person' }] };
  }

  const header = numbered[0];
  const columns = header.cells.map((c) => c.toLowerCase());
  for (const col of columns) {
    if (!KNOWN_COLUMNS.includes(col)) {
      errors.push({ line: header.line, message: `Unknown column "${col}". Use name, email, role and profile.` });
    }
  }
  for (const required of ['name', 'email']) {
    if (!columns.includes(required)) {
      errors.push({ line: header.line, message: `The header needs a "${required}" column` });
    }
  }
  if (errors.length) return { rows: [], errors };

  const body = numbered.slice(1);
  if (body.length > MAX_INVITE_ROWS) {
    return {
      rows: [],
      errors: [{ line: header.line, message: `Invite at most ${MAX_INVITE_ROWS} people at a time` }],
    };
  }

  const rows: InviteRow[] = [];
  const seen = new Set<string>();
  for (const { line, cells } of body) {
    const pick = (name: string) => {
      const idx = columns.indexOf(name);
      return idx === -1 ? '' : (cells[idx] ?? '');
    };
    const name = pick('name');
    const email = pick('email').toLowerCase();
    const roleRaw = pick('role').toLowerCase();
    const profileName = pick('profile');

    if (!name) {
      errors.push({ line, message: 'Name is missing' });
      continue;
    }
    if (name.length > 255) {
      errors.push({ line, message: 'Name is too long' });
      continue;
    }
    if (!EMAIL.test(email)) {
      errors.push({ line, message: `"${email || '(empty)'}" is not an email address` });
      continue;
    }
    if (seen.has(email)) {
      errors.push({ line, message: `${email} is listed more than once` });
      continue;
    }
    let roleName: InviteRow['roleName'];
    if (roleRaw) {
      roleName = ROLE_ALIASES[roleRaw];
      if (!roleName) {
        errors.push({ line, message: `Role "${roleRaw}" is not one of staff, accountant or admin` });
        continue;
      }
    }
    seen.add(email);
    rows.push({ line, name, email, roleName, profileName: profileName || undefined });
  }
  return { rows, errors };
}
