/**
 * Turns a template subject/body + variables into what the recipient gets.
 * Pure functions so the frontend preview can mirror them and tests stay simple.
 */

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A body is HTML if it has tags OR entities (the editor saves "a&nbsp;b" with no tags). */
export function isHtmlBody(body: string): boolean {
  return /<[a-z][\s\S]*?>|&(?:[a-z]+|#\d+);/i.test(body);
}

/** Values the server knows without any input: dates, financial year, portal URL. */
export function systemVariables(now = new Date(), frontendUrl = 'http://localhost:3000', timeZone = 'Asia/Kolkata'): Record<string, string> {
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(now);
  // Indian financial year runs April–March
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'numeric', timeZone }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const fyStart = m >= 4 ? y : y - 1;
  const fy = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  return {
    today: date,
    current_date: date,
    date,
    financial_year: fy(fyStart),
    assessment_year: fy(fyStart + 1),
    login_url: `${frontendUrl.replace(/\/+$/, '')}/login`,
  };
}

/** Normalise keys ("{{ a }}" -> "a"); later sources win unless their value is empty. */
export function mergeVariables(...sources: Array<Record<string, string | null | undefined> | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    for (const [rawKey, value] of Object.entries(src ?? {})) {
      const key = rawKey.replace(/[{}\s]/g, '');
      if (!key) continue;
      const v = value == null ? '' : String(value);
      if (v !== '' || !(key in out)) out[key] = v;
    }
  }
  return out;
}

/** Replace every {{token}}; unknown tokens become '' so recipients never see raw braces. */
export function substitute(content: string, vars: Record<string, string>, escapeValues: boolean): string {
  return content.replace(TOKEN_RE, (_, key: string) => {
    const v = vars[key] ?? '';
    return escapeValues ? escapeHtml(v) : v;
  });
}

/** Tokens used in a piece of content, e.g. ["client_name", "login_password"]. */
export function usedVariables(content: string): string[] {
  return [...new Set([...content.matchAll(TOKEN_RE)].map((m) => m[1]))];
}

export function renderEmail(subject: string, body: string, vars: Record<string, string>): { subject: string; body: string; text: string; isHtml: boolean } {
  const html = isHtmlBody(body);
  const renderedBody = substitute(body, vars, html); // HTML bodies get escaped values; plain bodies are escaped whole later
  const text = renderedBody
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return { subject: substitute(subject, vars, false).replace(/\s+/g, ' ').trim(), body: renderedBody, text, isHtml: html };
}

/** The firm's reply-to address and sign-off for emails to clients */
export interface MailIdentity {
  replyTo?: string | null;
  signature?: string | null;
}

/** Add the sign-off after the body, in the body's own format (plain text or HTML). */
export function withSignature(body: string, signature?: string | null): string {
  const sig = signature?.trim();
  if (!sig) return body;
  if (isHtmlBody(body)) return `${body}<p>${escapeHtml(sig).replace(/\r?\n/g, '<br>')}</p>`;
  return `${body.replace(/\s+$/, '')}\n\n${sig}`;
}
