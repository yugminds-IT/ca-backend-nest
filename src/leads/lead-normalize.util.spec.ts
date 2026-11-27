import {
  cannotTurnOffStage,
  DEFAULT_STAGES,
  insertPosition,
  cleanText,
  normalizeEmail,
  normalizePhone,
  statusForStage,
} from './lead-normalize.util';
import { escapeLike } from './lead-scope.util';

describe('normalizeEmail', () => {
  it('lower-cases and trims, and maps empty to null', () => {
    expect(normalizeEmail('  Guest@Tavaro.COM ')).toBe('guest@tavaro.com');
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('keeps digits only so formatting does not hide duplicates', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('(98765) 43210')).toBe('9876543210');
  });

  it('returns null for too few digits', () => {
    expect(normalizePhone('12-3')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('cleanText', () => {
  it('trims and maps blank to null', () => {
    expect(cleanText('  Acme Ltd ')).toBe('Acme Ltd');
    expect(cleanText('  ')).toBeNull();
  });
});

describe('statusForStage', () => {
  it('won and lost stages close the lead; others keep it open', () => {
    expect(statusForStage({ isWon: true, isLost: false })).toBe('won');
    expect(statusForStage({ isWon: false, isLost: true })).toBe('lost');
    expect(statusForStage({ isWon: false, isLost: false })).toBe('open');
  });
});

describe('DEFAULT_STAGES', () => {
  it('has exactly one won and one lost stage, at the end, with an open stage before them', () => {
    const won = DEFAULT_STAGES.filter((s) => s.isWon);
    const lost = DEFAULT_STAGES.filter((s) => s.isLost);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(DEFAULT_STAGES[DEFAULT_STAGES.length - 2].isWon).toBe(true);
    expect(DEFAULT_STAGES[DEFAULT_STAGES.length - 1].isLost).toBe(true);
  });
});

describe('insertPosition', () => {
  const stages = [
    { position: 0, isWon: false, isLost: false },
    { position: 5, isWon: true, isLost: false },
    { position: 6, isWon: false, isLost: true },
  ];
  it('puts an open stage before Won, Won before Lost, and Lost at the end', () => {
    expect(insertPosition(stages, 'open')).toBe(5);
    expect(insertPosition(stages, 'won')).toBe(6);
    expect(insertPosition(stages, 'lost')).toBe(7);
  });
});

describe('cannotTurnOffStage', () => {
  const stages = [
    { id: 1, isWon: false, isLost: false, isActive: true },
    { id: 2, isWon: false, isLost: false, isActive: true },
    { id: 3, isWon: true, isLost: false, isActive: true },
    { id: 4, isWon: false, isLost: true, isActive: true },
  ];
  it('allows turning off an open stage while another stays on', () => {
    expect(cannotTurnOffStage(stages[0], stages)).toBeNull();
  });
  it('keeps the last open stage and the only Won and Lost', () => {
    expect(cannotTurnOffStage(stages[0], stages.map((s) => (s.id === 2 ? { ...s, isActive: false } : s)))).toMatch(/open stage/);
    expect(cannotTurnOffStage(stages[2], stages)).toMatch(/Won/);
    expect(cannotTurnOffStage(stages[3], stages)).toMatch(/Lost/);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards so searches match the literal text', () => {
    expect(escapeLike('50% off_sale')).toBe('50\\% off\\_sale');
  });
});
