/**
 * Security utilities for email header injection (CRLF) and HTML sanitization.
 */

/**
 * Strips carriage returns (\r) and newlines (\n) to prevent email header injection (CRLF).
 */
export function sanitizeHeader(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Sanitizes an array of email addresses or single email address.
 */
export function sanitizeRecipients(recipients: string | string[]): string[] {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  return list
    .map((r) => sanitizeHeader(r))
    .filter((r) => r.length > 0 && r.includes('@'));
}

/**
 * Basic HTML tag sanitization to prevent Stored XSS when rendering user messages in dashboard inboxes.
 */
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/on\w+\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, ''); // Strips onerror, onload, onclick, etc.
}
