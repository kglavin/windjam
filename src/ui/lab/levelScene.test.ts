import { describe, expect, it } from 'vitest';
import { level1Truth, level2Truth } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { level1Scene, level2Scene } from './levelScene';

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

describe('level2Scene', () => {
  it('starts with Eb/N0 near 25 dB and Eb/J0 between 3 and 6 dB, the jammer inside the position limits', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const t = level2Truth(seed);
      const s = level2Scene(t);
      const b = sceneBudget(s);
      expect(b.ebN0Db).toBeGreaterThan(24);
      expect(b.ebN0Db).toBeLessThan(26);
      expect(b.ebJ0Db).toBeGreaterThan(3);
      expect(b.ebJ0Db).toBeLessThan(6);
      expect(b.jsDb).toBeCloseTo(t.gpDb - b.ebJ0Db, 9);
      expect(b.gpDb).toBeCloseTo(t.gpDb, 6);
      expect(s.tx.powerW).toBeGreaterThanOrEqual(0.1);
      expect(s.tx.powerW).toBeLessThanOrEqual(1000);
      expect(s.jammer.powerW).toBeGreaterThan(0);
      expect(Math.abs(s.jammer.xKm)).toBeLessThan(200);
      expect(Math.abs(s.jammer.yKm)).toBeLessThan(200);
      expect(b.jamDistanceKm).toBeGreaterThan(1);
    }
  });
  it('can reach the jammer goal with the jammer power and position the scene lets the player change', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = level2Truth(seed);
      const s = level2Scene(t);
      const need = t.gpDb + 0.9;
      const raised = sceneBudget({ ...s, jammer: { ...s.jammer, powerW: 1000 } });
      expect(raised.jsDb).toBeGreaterThan(need - 0.5);
    }
  });
});
