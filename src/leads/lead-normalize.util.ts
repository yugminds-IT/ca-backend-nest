import type { LeadStatus } from '../entities/crm.entities';

/** Lower-case, trimmed email, or null when empty. Used for storage and duplicate checks. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * Digits only, so "+91 98765-43210" and "9876543210" match when both have no country code.
 * Returns null when fewer than 6 digits remain (too short to be a real number).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

/** Trims a free-text field and maps empty to null. */
export function cleanText(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  return v ? v : null;
}

export type StageOutcome = 'open' | 'won' | 'lost';

/** Where a new stage slots in: open stages go before Won and Lost, Won goes before Lost, Lost goes last. */
export function insertPosition(
  stages: ReadonlyArray<{ position: number; isWon: boolean; isLost: boolean }>,
  outcome: StageOutcome,
): number {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const afterLast = sorted.length ? sorted[sorted.length - 1].position + 1 : 0;
  if (outcome === 'lost') return afterLast;
  if (outcome === 'won') {
    const lost = sorted.find((s) => s.isLost);
    return lost ? lost.position : afterLast;
  }
  const closing = sorted.find((s) => s.isWon || s.isLost);
  return closing ? closing.position : afterLast;
}

/**
 * Why a stage cannot be turned off, or null when it can. A pipeline keeps one open stage,
 * one Won stage and one Lost stage, because those decide a lead's status.
 */
export function cannotTurnOffStage(
  stage: { id: number; isWon: boolean; isLost: boolean },
  stages: ReadonlyArray<{ id: number; isWon: boolean; isLost: boolean; isActive: boolean }>,
): string | null {
  const stillOn = stages.filter((s) => s.isActive && s.id !== stage.id);
  if (!stage.isWon && !stage.isLost && !stillOn.some((s) => !s.isWon && !s.isLost)) {
    return 'Keep at least one open stage. Rename this one instead of turning it off.';
  }
  if (stage.isWon && !stillOn.some((s) => s.isWon)) {
    return 'Keep a Won stage, so a lead can be closed as won. Rename it instead of turning it off.';
  }
  if (stage.isLost && !stillOn.some((s) => s.isLost)) {
    return 'Keep a Lost stage, so a lead can be closed as lost. Rename it instead of turning it off.';
  }
  return null;
}

/** A lead's status follows the stage it is in: won and lost stages close it, anything else is open. */
export function statusForStage(stage: {
  isWon: boolean;
  isLost: boolean;
}): LeadStatus {
  if (stage.isWon) return 'won';
  if (stage.isLost) return 'lost';
  return 'open';
}

/** Default stages for a new pipeline. The last two stages close the lead. */
export const DEFAULT_STAGES: ReadonlyArray<{
  name: string;
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}> = [
  { name: 'New', probability: 10 },
  { name: 'Contacted', probability: 20 },
  { name: 'Qualified', probability: 40 },
  { name: 'Proposal', probability: 60 },
  { name: 'Negotiation', probability: 80 },
  { name: 'Won', probability: 100, isWon: true },
  { name: 'Lost', probability: 0, isLost: true },
];

const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportLeadRow {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  value?: number;
}

/**
 * Checks one CSV/JSON row for import. Returns the cleaned row, or the reason it was refused.
 * Each row is judged alone, so one bad line does not stop the whole file.
 */
export function cleanImportRow(raw: Record<string, unknown>): ImportLeadRow | string {
  const text = (key: string, max: number): string => {
    const v = raw[key];
    if (v === undefined || v === null) return '';
    const s = String(v).trim();
    if (s.length > max) throw new Error(`${key} is longer than ${max} characters`);
    return s;
  };
  try {
    const name = text('name', 255);
    if (!name) return 'Name is missing';
    const email = text('email', 255);
    if (email && !IMPORT_EMAIL_RE.test(email)) return 'Email is not valid';
    const phone = text('phone', 32);
    if (!email && !phone) return 'Needs an email or a phone number';
    const rawValue = raw.value;
    let value: number | undefined;
    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
      const n = Number(String(rawValue).replace(/,/g, '').trim());
      if (!Number.isFinite(n) || n < 0) return 'Value must be 0 or more';
      value = n;
    }
    return {
      name,
      email: email || undefined,
      phone: phone || undefined,
      company: text('company', 255) || undefined,
      source: text('source', 120) || undefined,
      value,
    };
  } catch (err) {
    return err instanceof Error ? err.message : 'Row is not valid';
  }
}
