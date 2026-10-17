import { describe, expect, it } from 'vitest';
import { level1Truth, level2Truth, level3Truth, level4Truth, toneBers } from '../../engine/lab/levels';
import { berPulsedBpsk, undb } from '../../engine/lab/theory';
import { sceneBudget } from '../../engine/lab/scene';
import { LEVEL4_BER, level1Scene, level2Scene, level3Scene, level4Scene } from './levelScene';

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

describe('level4Scene', () => {
  it('against the enemy short code at the scene J/S a carrier tone is at most 0.002 and the first-line tone and broadband noise are in 0.005 to 0.1', () => {
    let ebLo = Infinity;
    let ebHi = -Infinity;
    let jsLo = Infinity;
    let jsHi = -Infinity;
    for (let seed = 1; seed <= 150; seed++) {
      const t = level4Truth(seed);
      const s = level4Scene(t);
      expect(level4Scene(t)).toEqual(s);
      const b = sceneBudget(s);
      const m = toneBers(t.degree, b.ebN0Db, b.jsDb);
      expect(m.carrier).toBeLessThanOrEqual(LEVEL4_BER.carrierMax);
      expect(m.line).toBeGreaterThanOrEqual(0.005);
      expect(m.line).toBeLessThanOrEqual(0.1);
      expect(m.bbn).toBeGreaterThanOrEqual(0.005);
      expect(m.bbn).toBeLessThanOrEqual(0.1);
      expect(b.gpDb).toBeCloseTo(t.gpDb, 6);
      expect(b.ebN0Db).toBeGreaterThan(8);
      expect(b.ebN0Db).toBeLessThan(10.5);
      expect(s.tx.powerW).toBeGreaterThanOrEqual(0.1);
      expect(s.tx.powerW).toBeLessThanOrEqual(1000);
      expect(s.jammer.powerW).toBeGreaterThan(0);
      expect(Math.abs(s.jammer.xKm)).toBeLessThan(200);
      expect(Math.abs(s.jammer.yKm)).toBeLessThan(200);
      expect(b.jamDistanceKm).toBeGreaterThan(1);
      ebLo = Math.min(ebLo, b.ebN0Db);
      ebHi = Math.max(ebHi, b.ebN0Db);
      jsLo = Math.min(jsLo, b.jsDb);
      jsHi = Math.max(jsHi, b.jsDb);
    }
    console.log(`level4 scene: Eb/N0 ${ebLo.toFixed(1)} to ${ebHi.toFixed(1)} dB, J/S ${jsLo.toFixed(1)} to ${jsHi.toFixed(1)} dB`);
  });
});
