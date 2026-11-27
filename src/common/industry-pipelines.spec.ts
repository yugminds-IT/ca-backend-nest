import { INDUSTRY_PRESETS } from './industry-presets';
import { INDUSTRY_PIPELINE_STAGES } from './industry-pipelines';

describe('industry pipeline seeds', () => {
  it('covers every industry preset', () => {
    for (const key of Object.keys(INDUSTRY_PRESETS)) {
      expect(INDUSTRY_PIPELINE_STAGES[key]).toBeDefined();
    }
  });

  it('has exactly one won and one lost stage, with open stages rising in probability', () => {
    for (const [key, stages] of Object.entries(INDUSTRY_PIPELINE_STAGES)) {
      expect({ key, won: stages.filter((s) => s.isWon).length }).toEqual({ key, won: 1 });
      expect({ key, lost: stages.filter((s) => s.isLost).length }).toEqual({ key, lost: 1 });
      const open = stages.filter((s) => !s.isWon && !s.isLost);
      expect(open.length).toBeGreaterThanOrEqual(2);
      const probs = open.map((s) => s.probability);
      expect(probs).toEqual([...probs].sort((a, b) => a - b));
      expect(stages.every((s) => s.probability >= 0 && s.probability <= 100)).toBe(true);
    }
  });
});
