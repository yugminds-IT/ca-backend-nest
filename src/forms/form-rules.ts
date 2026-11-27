/**
 * Form definitions and submissions: pure rules, no database access.
 *
 * A field can map to one of the sender fields the inbox already understands (name, email, phone,
 * message). Email and phone fields map automatically by type. Other fields are stored under their key.
 */

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'checkbox',
  'date',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormFieldRole = 'name' | 'email' | 'phone' | 'message';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  role?: FormFieldRole | null;
}

export const MAX_FORM_FIELDS = 50;

/** Keys the submission pipeline already uses for its own purposes. A custom field cannot use them. */
const RESERVED_KEYS = new Set([
  'publicKey',
  'apiKey',
  'secretKey',
  'turnstileToken',
  'recaptchaToken',
  '_honey',
  '_gotcha',
  '_notify',
  'notificationEmail',
  'notifyEmail',
  'formName',
  'senderName',
  'senderEmail',
  'senderPhone',
  'fullName',
  'comments',
  'query',
  'name',
  'email',
  'phone',
  'message',
]);

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** The sender field this field fills, if any. */
export function canonicalRole(field: FormField): FormFieldRole | null {
  if (field.role) return field.role;
  if (field.type === 'email') return 'email';
  if (field.type === 'phone') return 'phone';
  return null;
}

/** Problems with a whole form definition, phrased for the builder. Empty list means valid. */
export function validateFormDefinition(fields: FormField[]): string[] {
  const problems: string[] = [];
  if (fields.length > MAX_FORM_FIELDS) {
    problems.push(`A form can have at most ${MAX_FORM_FIELDS} fields`);
  }
  const keys = new Set<string>();
  const roles = new Set<string>();
  for (const f of fields) {
    if (!KEY_PATTERN.test(f.key)) {
      problems.push(
        `Field "${f.label}": key must start with a letter and use lowercase letters, digits and underscores`,
      );
    }
    const role = canonicalRole(f);
    if (role) {
      if (roles.has(role)) {
        problems.push(`Only one field can be used as ${role}`);
      }
      roles.add(role);
    } else if (RESERVED_KEYS.has(f.key)) {
      problems.push(`Field "${f.label}": "${f.key}" is reserved, pick another label`);
    }
    if (keys.has(f.key)) {
      problems.push(`Two fields share the key "${f.key}"`);
    }
    keys.add(f.key);
    if (f.type === 'select' && (!f.options || f.options.length === 0)) {
      problems.push(`Field "${f.label}": a select needs at least one option`);
    }
  }
  return problems;
}

export interface FieldCheck {
  value?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks one submitted value against its field and returns the normalized text to store. */
export function checkFieldValue(field: FormField, raw: unknown): FieldCheck {
  if (raw !== undefined && raw !== null && typeof raw === 'object') {
    return { error: 'Invalid value' };
  }
  const text = raw === undefined || raw === null ? '' : String(raw).trim();

  if (field.type === 'checkbox') {
    const on = ['true', 'on', '1', 'yes'].includes(text.toLowerCase());
    if (field.required && !on) return { error: 'Please tick this box' };
    return { value: on ? 'Yes' : 'No' };
  }

  if (!text) return field.required ? { error: 'Required' } : {};

  switch (field.type) {
    case 'text':
      return text.length > 2000 ? { error: 'Too long (max 2000 characters)' } : { value: text };
    case 'textarea':
      return text.length > 5000 ? { error: 'Too long (max 5000 characters)' } : { value: text };
    case 'email':
      return EMAIL_RE.test(text) && text.length <= 255
        ? { value: text }
        : { error: 'Enter a valid email address' };
    case 'phone': {
      const digits = text.replace(/\D/g, '');
      return /^[+()\d\s-]{6,32}$/.test(text) && digits.length >= 6
        ? { value: text }
        : { error: 'Enter a valid phone number' };
    }
    case 'number':
      return Number.isFinite(Number(text)) ? { value: text } : { error: 'Enter a number' };
    case 'select':
      return (field.options ?? []).includes(text)
        ? { value: text }
        : { error: 'Choose one of the options' };
    case 'date': {
      const ok = DATE_RE.test(text) && !Number.isNaN(Date.parse(text));
      return ok ? { value: text } : { error: 'Enter a valid date' };
    }
    default:
      return { error: 'Unsupported field' };
  }
}

export interface ValidatedValues {
  /** Normalized values keyed by field key. Optional empty fields are left out. */
  values: Record<string, string>;
  /** Error text keyed by field key. Empty when the submission is acceptable. */
  errors: Record<string, string>;
}

/** Validates a whole submission. Keys the form does not define are ignored. */
export function validateFormValues(
  fields: FormField[],
  body: Record<string, unknown>,
): ValidatedValues {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const check = checkFieldValue(field, body[field.key]);
    if (check.error) errors[field.key] = check.error;
    else if (check.value !== undefined && check.value !== '') values[field.key] = check.value;
  }
  return { values, errors };
}

/**
 * Builds the DTO the developer intake understands: sender fields under their canonical keys,
 * everything else under the field key.
 */
export function toIntakeDto(
  formName: string,
  fields: FormField[],
  values: Record<string, string>,
): Record<string, string> {
  const dto: Record<string, string> = { formName };
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined) continue;
    const target = canonicalRole(field) ?? field.key;
    dto[target] = value;
  }
  return dto;
}
