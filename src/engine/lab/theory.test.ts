import { describe, expect, it } from 'vitest';
import { berNoncoherentBfsk } from '../ew';
import {
  berBpsk,
  berBpskJammed,
  berMultitoneLongCode,
  berNoncoherentBfskLin,
  berPartialBandDsss,
  berPartialBandBfsk,
  berPulsedBpsk,
  berRepetitionMajority,
  berToneLongCode,
  berToneShortCode,
  db,
  jsForBer,
  qfunc,
  sincSquaredMean,
  undb,
  worstRhoBfsk,
  worstRhoBpsk,
} from './theory';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('qfunc', () => {
  const table: [number, number][] = [
    [0, 0.5],
    [1, 0.158655254],
    [2, 0.0227501319],
    [3, 1.349898e-3],
    [4, 3.167124e-5],
    [5, 2.866516e-7],
    [6, 9.865876e-10],
  ];
  for (const [x, q] of table) {
    it(`Q(${x})`, () => expect(rel(qfunc(x), q)).toBeLessThan(1e-6));
  }
  it('negative x', () => expect(qfunc(-1)).toBeCloseTo(1 - qfunc(1), 12));
});

describe('db helpers', () => {
  it('round trip', () => {
    expect(db(100)).toBeCloseTo(20, 12);
    expect(undb(db(3.7))).toBeCloseTo(3.7, 12);
  });
});

describe('BPSK and BFSK', () => {
  it('berBpsk tabulated points', () => {
    const a = berBpsk(undb(9.6));
    expect(a).toBeGreaterThan(0.9e-5);
    expect(a).toBeLessThan(1.1e-5);
    expect(rel(berBpsk(undb(6.8)), 1e-3)).toBeLessThan(0.1);
  });
  it('berNoncoherentBfskLin matches ew', () => {
    for (const d of [0, 5, 10, 13]) {
      expect(rel(berNoncoherentBfskLin(undb(d)), berNoncoherentBfsk(d))).toBeLessThan(1e-12);
    }
  });
  it('about 4 dB apart at 1e-3', () => {
    const bpsk = -jsForBer((x) => berBpsk(undb(-x)), 1e-3);
    const bfsk = -jsForBer((x) => berNoncoherentBfskLin(undb(-x)), 1e-3);
    expect(bfsk - bpsk).toBeGreaterThan(3.8);
    expect(bfsk - bpsk).toBeLessThan(4.4);
  });
});

describe('pulsed jamming', () => {
  it('rho = 1 equals continuous', () => {
    expect(berPulsedBpsk(20, 15, 1)).toBeCloseTo(berBpskJammed(20, 15), 14);
  });
  for (const j of [100, 1000]) {
    it(`worst rho at ebJ0 ${j}`, () => {
      const w = worstRhoBpsk(Infinity, j);
      expect(rel(w.rho, 0.709 / j)).toBeLessThan(0.03);
      expect(rel(w.ber, 0.083 / j)).toBeLessThan(0.03);
    });
  }
  it('rho = 1 when jamming is strong', () => {
    expect(worstRhoBpsk(Infinity, 0.5).rho).toBe(1);
  });
  it('BFSK worst case closed form', () => {
    const w = worstRhoBfsk(100);
    expect(w.rho).toBeCloseTo(0.02, 12);
    expect(w.ber).toBeCloseTo(Math.exp(-1) / 100, 14);
    expect(berPartialBandBfsk(Infinity, 100, w.rho)).toBeCloseTo(w.ber, 14);
  });
});

describe('tone jamming', () => {
  it('long code', () => {
    expect(berToneLongCode(10, 100, 50, 0, Math.PI / 2)).toBeCloseTo(berBpsk(10), 12);
    expect(berToneLongCode(10, 100, 5)).toBeCloseTo(berBpskJammed(10, 100 / 5), 14);
    expect(berToneLongCode(10, 100, 50, 1)).toBeCloseTo(berBpsk(10), 12);
  });
  const code = [1, 1, 1, -1, -1, 1, -1];
  it('short code', () => {
    expect(berToneShortCode(4, 0, code, 0.3, 0.2)).toBeCloseTo(berBpsk(4), 12);
    expect(berToneShortCode(4, 9, code, 0, Math.PI / 2)).toBeCloseTo(berBpsk(4), 12);
    const a = Math.sqrt(8);
    const i = 3 / 7;
    const want = 0.5 * (qfunc(a * (1 + i)) + qfunc(a * (1 - i)));
    expect(berToneShortCode(4, 9, code, 0, 0)).toBeCloseTo(want, 12);
  });
  it('requires finite ebN0', () => {
    expect(() => berToneShortCode(Infinity, 1, code, 0, 0)).toThrow();
  });
});

describe('repetition and search', () => {
  it('majority', () => {
    expect(berRepetitionMajority(0.1, 3)).toBeCloseTo(0.028, 12);
    expect(berRepetitionMajority(0.1, 5)).toBeCloseTo(0.00856, 12);
    expect(berRepetitionMajority(0.3, 1)).toBeCloseTo(0.3, 14);
  });
  it('jsForBer', () => {
    const js = jsForBer((d) => berBpskJammed(Infinity, 100 / undb(d)), 1e-1);
    expect(Math.abs(js - 20.86)).toBeLessThan(0.05);
    expect(jsForBer(() => 0, 0.1)).toBe(Infinity);
    expect(jsForBer(() => 0.5, 0.1)).toBe(-Infinity);
  });
});

describe('partial band and multitone against DSSS', () => {
  it('sincSquaredMean', () => {
    expect(sincSquaredMean(-0.5, 0.5)).toBeCloseTo(0.7737, 3);
    expect(sincSquaredMean(0.3, 0.3)).toBeCloseTo((Math.sin(0.3 * Math.PI) / (0.3 * Math.PI)) ** 2, 12);
    expect(sincSquaredMean(-1, 1)).toBeCloseTo(0.4514, 3);
  });
  it('berPartialBandDsss', () => {
    const w = sincSquaredMean(-0.5, 0.5);
    expect(berPartialBandDsss(Infinity, 64, 10, 1)).toBeCloseTo(berBpskJammed(Infinity, 64 / (10 * w)), 14);
    expect(db(w)).toBeGreaterThan(-1.12);
    expect(db(w)).toBeLessThan(-1.08);
  });
  it('berMultitoneLongCode', () => {
    expect(berMultitoneLongCode(4, 100, 5, [0])).toBeCloseTo(berToneLongCode(4, 100, 5, 0), 14);
    const sinc2 = (Math.sin(0.1 * Math.PI) / (0.1 * Math.PI)) ** 2;
    expect(berMultitoneLongCode(4, 100, 5, [-0.1, 0.1])).toBeCloseTo(berBpskJammed(4, 100 / (5 * sinc2)), 14);
  });
});
