import { describe, expect, it } from 'vitest';
import { level1Truth } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { level1Scene } from './levelScene';

describe('level1Scene', () => {
  it('starts the intercept below 3 dB and the friendly link below the noise with margin', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = level1Truth(seed);
      const s = level1Scene(t);
      const b = sceneBudget(s);
      expect(b.intercept.chipSnrDb).toBeLessThan(3);
      expect(b.intercept.chipSnrDb).toBeGreaterThan(-16);
      expect(b.snrDb).toBeLessThan(0);
      expect(b.ebN0Db).toBeGreaterThan(10.5);
      expect(b.ebN0Db).toBeLessThan(14.5);
      expect(b.gpDb).toBeCloseTo(t.gpDb, 6);
      expect(s.tx.powerW).toBeGreaterThanOrEqual(0.1);
      expect(s.tx.powerW).toBeLessThanOrEqual(1000);
      expect(s.jammer.powerW).toBe(0);
    }
  });
});
