export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 40;

/** Trimmed, single-spaced, first spelling kept for case-insensitive repeats. Throws away blanks. */
export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const t = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

/** Adds then removes (case-insensitive); keeps the existing spelling of a tag the client already has. */
export function applyTagChange(current: readonly string[], add: readonly string[] = [], remove: readonly string[] = []): string[] {
  const drop = new Set(normalizeTags(remove).map((t) => t.toLowerCase()));
  return normalizeTags([...current, ...add]).filter((t) => !drop.has(t.toLowerCase()));
}
