import { describe, expect, it } from 'vitest';
import {
  PREFERRED_PAIRS, PRIMITIVE_TAPS, berlekampMassey, chipsToBits, extendRecurrence, goldCode, mSequence, periodicCrossCorrelation,
  registerSequence, registerSteps,
} from './pn';
import {
  type PacketLink, acquireProb, detectProb, jammerEnergy, meanSearchTests, packetErrorRate, payloadBer, runPackets, thresholdFor,
} from './sync';
import { qfunc } from './theory';

describe('shift registers', () => {
  it('registerSequence and registerSteps reproduce the lab m-sequences', () => {
    for (const d of [5, 6, 7]) {
      expect(Array.from(registerSequence(d, PRIMITIVE_TAPS[d]))).toEqual(Array.from(mSequence(d)));
      const steps = registerSteps(d, PRIMITIVE_TAPS[d], 1, 2 ** d - 1);
      expect(steps.map((s) => (s.out ? -1 : 1))).toEqual(Array.from(mSequence(d)));
    }
  });

  it('Berlekamp–Massey rebuilds a degree-n code from 2n chips, and predicts the rest', () => {
    for (const d of [5, 6, 7]) {
      const bits = chipsToBits(mSequence(d));
      const bm = berlekampMassey(bits.slice(0, 2 * d));
      expect(bm.length).toBe(d);
      expect(extendRecurrence(bits.slice(0, 2 * d), bm.coeffs, bits.length - 2 * d)).toEqual(bits.slice(2 * d));
      // The taps it finds are the register's: the recurrence's ones sit at the taps' positions.
      const ones = bm.coeffs.flatMap((c, i) => (c ? [i + 1] : []));
      expect(ones).toEqual([...PRIMITIVE_TAPS[d]].sort((a, b) => a - b));
    }
  });

  it('a whole period has linear complexity n, not 2n', () => {
    expect(berlekampMassey(chipsToBits(mSequence(7))).length).toBe(7);
  });
});

describe('Gold codes', () => {
  it('pairs and their family cross-correlate at three values only', () => {
    for (const d of [5, 7]) {
      const t = 1 + 2 ** ((d + 1) / 2);
      const allowed = [-1, -t, t - 2];
      const codes = [0, 1, 2, 5, 9, 20].map((k) => goldCode(d, k));
      for (let i = 0; i < codes.length; i++) {
        for (let j = i + 1; j < codes.length; j++) {
          for (const v of periodicCrossCorrelation(codes[i], codes[j])) expect(allowed).toContain(v);
        }
      }
      expect(PREFERRED_PAIRS[d]).toBeDefined();
    }
  });
});

describe('acquisition', () => {
  const LINK: PacketLink = { n: 31, preamblePeriods: 31, payloadBits: 500, chipSnrDb: -4, pfaCell: 1e-3 };

  it('sets the threshold for the false-alarm rate', () => {
    expect(qfunc(thresholdFor(1e-3))).toBeCloseTo(1e-3, 8);
    expect(detectProb(LINK)).toBeGreaterThan(0.95);
    expect(meanSearchTests({ ...LINK, chipSnrDb: 20 })).toBeCloseTo(16, 3);
  });

  it('theory matches the simulated packets, quiet and jammed', () => {
    for (const j of [{ on: 'none', jsDb: 0 }, { on: 'preamble', jsDb: 12 }, { on: 'payload', jsDb: 9 }, { on: 'both', jsDb: 10 }] as const) {
      const r = runPackets(LINK, j, 5, 6000, 400);
      const t = packetErrorRate(LINK, j);
      expect(t, `${j.on}: theory ${t}, run ${r.per}`).toBeGreaterThanOrEqual(r.perLo * 0.9 - 0.002);
      expect(t, `${j.on}: theory ${t}, run ${r.per}`).toBeLessThanOrEqual(r.perHi * 1.1 + 0.002);
    }
    expect(acquireProb(LINK)).toBeGreaterThan(0.9);
  });

  it('jamming the preamble loses packets for far less energy than jamming the payload', () => {
    // The J/S each needs to lose half the packets.
    const jsFor = (on: 'preamble' | 'payload') => {
      let lo = -20;
      let hi = 40;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (packetErrorRate(LINK, { on, jsDb: mid }) < 0.5) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const pre = { on: 'preamble' as const, jsDb: jsFor('preamble') };
    const pay = { on: 'payload' as const, jsDb: jsFor('payload') };
    expect(jammerEnergy(LINK, pay) / jammerEnergy(LINK, pre)).toBeGreaterThan(3);
    expect(payloadBer(LINK, pay)).toBeGreaterThan(0);
  });
});
