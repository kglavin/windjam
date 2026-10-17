import { describe, expect, it } from 'vitest';
import { level1Truth, level2Truth, level3Truth } from '../../engine/lab/levels';
import { berPulsedBpsk, undb } from '../../engine/lab/theory';
import { sceneBudget } from '../../engine/lab/scene';
import { level1Scene, level2Scene, level3Scene } from './levelScene';

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

describe('level3Scene', () => {
  it('starts a link with margin: Eb/N0 near 25 dB, broadband Eb/J0 of 8 to 11 dB as the texts print it, a measurable pulsed BER', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const t = level3Truth(seed);
      const s = level3Scene(t);
      const b = sceneBudget(s);
      expect(b.ebN0Db).toBeGreaterThan(24);
      expect(b.ebN0Db).toBeLessThan(26);
      const printed = Math.round(t.gpDb * 10) / 10 - Math.round(b.jsDb * 10) / 10;
      expect(printed).toBeGreaterThanOrEqual(8);
      expect(printed).toBeLessThanOrEqual(11);
      expect(b.ebJ0Db).toBeGreaterThan(8);
      expect(b.ebJ0Db).toBeLessThan(11);
      const pulsed = berPulsedBpsk(undb(b.ebN0Db), undb(b.ebJ0Db), 0.1);
      expect(pulsed).toBeGreaterThan(0.001);
      expect(pulsed).toBeLessThan(0.05);
      expect(s.tx.powerW).toBeGreaterThanOrEqual(0.1);
      expect(s.tx.powerW).toBeLessThanOrEqual(1000);
      expect(s.jammer.powerW).toBeGreaterThan(0);
      expect(Math.abs(s.jammer.xKm)).toBeLessThan(200);
      expect(Math.abs(s.jammer.yKm)).toBeLessThan(200);
      expect(b.jamDistanceKm).toBeGreaterThan(1);
    }
  });
});
