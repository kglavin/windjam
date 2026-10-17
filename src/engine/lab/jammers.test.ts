import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { type LinkParams, simulate } from './dsss';
import { jammer, jammerStats } from './jammers';
import { mSequence } from './pn';
import { meanPower } from './signal';
import {
  berBpskJammed,
  berMultitoneLongCode,
  berPartialBandDsss,
  berPulsedBpsk,
  berToneLongCode,
  berToneShortCode,
  db,
  undb,
} from './theory';

const link = (code: Int8Array, gp: number, ebN0: number): LinkParams => ({
  code,
  chipsPerBit: gp,
  repetition: 1,
  preamblePeriods: 0,
  carrierCyclesPerChip: 0,
  ebN0,
});

// Asserts the error count lies within 4 binomial sigma of n*p.
function within4Sigma(errors: number, n: number, p: number, label: string): void {
  const sigma = Math.sqrt(n * p * (1 - p));
  const z = (errors - n * p) / sigma;
  console.log(`${label}: measured ${(errors / n).toExponential(3)} theory ${p.toExponential(3)} z=${z.toFixed(2)}`);
  expect(Math.abs(errors - n * p)).toBeLessThanOrEqual(4 * sigma);
}

// Q(x) inverse points for BER near 0.2, 0.05, 0.01: Eb/J0 = x^2/2, js = gp / (x^2 / 2).
const BBN_X = [0.8416, 1.645, 2.326];
const jsFor = (gp: number, x: number) => (2 * gp) / (x * x);

describe('mean power', () => {
  const n = 1 << 17;
  const js = 3;
  for (const s of [1, 4]) {
    it(`bbn s=${s}`, () => {
      const x = jammer({ kind: 'bbn' }, js)(n, s, createRng(1));
      expect(Math.abs(meanPower(x) / (js * s) - 1)).toBeLessThan(0.03);
    });
    it(`partial s=${s}`, () => {
      const x = jammer({ kind: 'partial', rho: 0.25, centre: 0.1 }, js)(n, s, createRng(2));
      // at s = 1 the band is shaped by sinc^2, so the power is js times the band mean of sinc^2
      const expected = s === 1 ? js * sincMean(0.1 - 0.125, 0.1 + 0.125) : js;
      expect(Math.abs(meanPower(x) / expected - 1)).toBeLessThan(0.03);
    });
    it(`pulsed s=${s}`, () => {
      const period = 40;
      const x = jammer({ kind: 'pulsed', duty: 0.25, periodChips: period, offsetChips: 3 }, js)(period * s * 3000, s, createRng(3));
      // on-samples have variance js*s/duty, so like BBN the mean power is js*s
      expect(Math.abs(meanPower(x) / (js * s) - 1)).toBeLessThan(0.03);
    });
    it(`multitone s=${s}`, () => {
      const x = jammer({ kind: 'multitone', q: 8, spacing: 0.05, phases: 'random' }, js)(n, s, createRng(5));
      // at s = 1 each tone carries sinc^2 of the chip integrator
      if (s === 1) {
        let e = 0;
        for (let i = 0; i < 8; i++) e += (js / 8) * sincMean((i - 3.5) * 0.05, (i - 3.5) * 0.05);
        expect(Math.abs(meanPower(x) / e - 1)).toBeLessThan(0.03);
      } else expect(Math.abs(meanPower(x) / js - 1)).toBeLessThan(0.03);
    });
  }
  it('tone s=4', () => {
    const x = jammer({ kind: 'tone', fTc: 0.1 }, js)(n, 4, createRng(4));
    expect(Math.abs(meanPower(x) / js - 1)).toBeLessThan(0.03);
  });
  it('tone s=1 is sinc^2 weighted', () => {
    const x = jammer({ kind: 'tone', fTc: 0.3, phase: 1 }, js)(n, 1, createRng(4));
    expect(Math.abs(meanPower(x) / (js * sincMean(0.3, 0.3)) - 1)).toBeLessThan(0.001);
  });
});

function sincMean(lo: number, hi: number): number {
  const sinc = (f: number) => (f === 0 ? 1 : Math.sin(Math.PI * f) / (Math.PI * f));
  if (lo === hi) return sinc(lo) ** 2;
  const m = 1000;
  let sum = 0;
  for (let i = 0; i < m; i++) sum += sinc(lo + ((i + 0.5) * (hi - lo)) / m) ** 2;
  return sum / m;
}

describe('jammerStats', () => {
  it('tone PAPR is 0 dB', () => {
    const x = jammer({ kind: 'tone', fTc: 0.1, phase: 0.7 }, 2)(8000, 4, createRng(1));
    expect(Math.abs(jammerStats(x).paprDb)).toBeLessThan(0.01);
  });
  it('multitone PAPR', () => {
    const q = 8;
    const run = (phases: 'zero' | 'newman' | 'random') =>
      jammerStats(jammer({ kind: 'multitone', q, spacing: 0.05, phases }, 1)(16000, 4, createRng(9))).paprDb;
    const zero = run('zero');
    const newman = run('newman');
    console.log(`PAPR q=8: zero ${zero.toFixed(3)} newman ${newman.toFixed(3)} random ${run('random').toFixed(3)}`);
    expect(Math.abs(zero - 10 * Math.log10(q))).toBeLessThan(0.3);
    expect(newman).toBeLessThan(zero - 1);
  });
  it('bbn PAPR above 8 dB', () => {
    const st = jammerStats(jammer({ kind: 'bbn' }, 1)(100_000, 1, createRng(3)));
    console.log(`bbn PAPR ${st.paprDb.toFixed(2)} dB`);
    expect(st.paprDb).toBeGreaterThan(8);
  });
});

describe('BBN', () => {
  const cases: [string, Int8Array, number][] = [
    ['short31', mSequence(5), 31],
    ['long64', mSequence(11), 64],
  ];
  for (const [name, code, gp] of cases) {
    it(`matches theory, ${name}`, { timeout: 60_000 }, () => {
      const n = 20000;
      BBN_X.forEach((x, i) => {
        const js = jsFor(gp, x);
        const r = simulate(link(code, gp, Infinity), { nBits: n, seed: 100 + i, s: 1, interference: jammer({ kind: 'bbn' }, js) });
        within4Sigma(r.errors, n, berBpskJammed(Infinity, gp / js), `bbn ${name} js=${js.toFixed(1)}`);
      });
    });
  }
  it('s=4 agrees', { timeout: 60_000 }, () => {
    const n = 8000;
    const js = jsFor(64, 1.645);
    const r = simulate(link(mSequence(11), 64, Infinity), { nBits: n, seed: 7, s: 4, interference: jammer({ kind: 'bbn' }, js) });
    within4Sigma(r.errors, n, berBpskJammed(Infinity, 64 / js), 'bbn s=4');
  });
});

describe('partial band', () => {
  const code = mSequence(11);
  for (const rho of [0.25, 1]) {
    it(`rho ${rho} matches theory and is no worse than BBN at +1.1 dB`, { timeout: 60_000 }, () => {
      const n = 20000;
      for (const x of BBN_X) {
        const js = jsFor(64, x);
        const r = simulate(link(code, 64, Infinity), { nBits: n, seed: 200, s: 1, interference: jammer({ kind: 'partial', rho }, js) });
        within4Sigma(r.errors, n, berPartialBandDsss(Infinity, 64, js, rho), `partial rho=${rho} js=${js.toFixed(1)}`);
        const bound = berBpskJammed(Infinity, 64 / (js * undb(1.1)));
        const sigma = Math.sqrt(n * bound * (1 - bound));
        expect(r.errors).toBeLessThanOrEqual(n * bound + 4 * sigma);
      }
    });
  }
  it('s=4 agrees', { timeout: 60_000 }, () => {
    const n = 6000;
    const js = jsFor(64, 1.645);
    const r = simulate(link(code, 64, Infinity), { nBits: n, seed: 201, s: 4, interference: jammer({ kind: 'partial', rho: 1 }, js) });
    within4Sigma(r.errors, n, berPartialBandDsss(Infinity, 64, js, 1), 'partial s=4');
  });
});

describe('pulsed', () => {
  const ebN0 = undb(8);
  it('whole bits, long code', { timeout: 60_000 }, () => {
    const n = 30000;
    for (const js of [5, 20, 60]) {
      const r = simulate(link(mSequence(11), 64, ebN0), {
        nBits: n,
        seed: 300,
        s: 1,
        interference: jammer({ kind: 'pulsed', duty: 0.1, periodChips: 640, offsetChips: 0 }, js),
      });
      within4Sigma(r.errors, n, berPulsedBpsk(ebN0, 64 / js, 0.1), `pulsed whole js=${js}`);
    }
  });
  it('whole bits, s=4', { timeout: 60_000 }, () => {
    const n = 8000;
    const r = simulate(link(mSequence(11), 64, ebN0), {
      nBits: n,
      seed: 301,
      s: 4,
      interference: jammer({ kind: 'pulsed', duty: 0.1, periodChips: 640 }, 20),
    });
    within4Sigma(r.errors, n, berPulsedBpsk(ebN0, 64 / 20, 0.1), 'pulsed whole s=4');
  });
  it('short pulses average out like BBN', { timeout: 60_000 }, () => {
    const n = 20000;
    const gp = 31;
    for (const x of BBN_X) {
      const js = jsFor(gp, x);
      const r = simulate(link(mSequence(5), gp, Infinity), {
        nBits: n,
        seed: 302,
        s: 1,
        interference: jammer({ kind: 'pulsed', duty: 0.25, periodChips: gp / 4 }, js),
      });
      within4Sigma(r.errors, n, berBpskJammed(Infinity, gp / js), `pulsed short js=${js.toFixed(1)}`);
    }
  });
});

describe('tone', () => {
  const ebN0 = undb(6);
  it('long code, random phase', { timeout: 60_000 }, () => {
    const n = 20000;
    for (const js of [20, 60]) {
      const r = simulate(link(mSequence(13), 128, ebN0), {
        nBits: n,
        seed: 400,
        s: 1,
        interference: jammer({ kind: 'tone', fTc: 0.1 }, js),
      });
      within4Sigma(r.errors, n, berToneLongCode(ebN0, 128, js, 0.1), `tone long js=${js}`);
    }
  });
  it('long code, s=4', { timeout: 60_000 }, () => {
    const n = 6000;
    const r = simulate(link(mSequence(13), 128, ebN0), { nBits: n, seed: 401, s: 4, interference: jammer({ kind: 'tone', fTc: 0.1 }, 60) });
    within4Sigma(r.errors, n, berToneLongCode(ebN0, 128, 60, 0.1), 'tone long s=4');
  });
  // The phase is fixed per run, so each phase is run separately and the expected count sums exact per-phase BERs.
  for (const [label, fTc] of [['fTc=0', 0], ['fTc=3/31', 3 / 31]] as const) {
    for (const s of [1, 4]) {
      it(`short code ${label} s=${s}`, { timeout: 60_000 }, () => {
        const code = mSequence(5);
        const js = 200;
        const phases = 12;
        const nPer = s === 1 ? 2000 : 500;
        let errors = 0;
        let expected = 0;
        let varSum = 0;
        for (let i = 0; i < phases; i++) {
          const phase = ((i + 0.3) * 2 * Math.PI) / phases;
          const r = simulate(link(code, 31, ebN0), {
            nBits: nPer,
            seed: 500 + i,
            s,
            interference: jammer({ kind: 'tone', fTc, phase }, js),
          });
          errors += r.errors;
          const p = berToneShortCode(ebN0, js, code, fTc, phase);
          expected += nPer * p;
          varSum += nPer * p * (1 - p);
        }
        console.log(`tone short ${label} s=${s}: measured ${errors} expected ${expected.toFixed(1)} sigma ${Math.sqrt(varSum).toFixed(1)}`);
        expect(Math.abs(errors - expected)).toBeLessThanOrEqual(4 * Math.sqrt(varSum));
      });
    }
  }
});

// One run fixes the 8 phases, and with a code of period 2047 the BER of that run depends on them (measured sd across
// seeds 0.04 against binomial 0.004 at js 80). Theory is the phase ensemble, so the mean over seeds is tested
// against its standard error.
describe('multitone', () => {
  const offsets = Array.from({ length: 8 }, (_, i) => (i - 3.5) * 0.05);
  for (const [s, runs, nPer] of [[1, 24, 3000], [4, 8, 1500]] as const) {
    it(`q=8 random phases, long code, s=${s}`, { timeout: 60_000 }, () => {
      for (const js of [30, 80]) {
        const bers: number[] = [];
        for (let seed = 1; seed <= runs; seed++) {
          const r = simulate(link(mSequence(11), 64, Infinity), {
            nBits: nPer,
            seed: 600 + seed,
            s,
            interference: jammer({ kind: 'multitone', q: 8, spacing: 0.05, phases: 'random' }, js),
          });
          bers.push(r.errors / nPer);
        }
        const mean = bers.reduce((a, b) => a + b) / runs;
        const se = Math.sqrt(bers.reduce((a, b) => a + (b - mean) ** 2, 0) / (runs - 1) / runs);
        const theory = berMultitoneLongCode(Infinity, 64, js, offsets);
        console.log(`multitone s=${s} js=${js}: measured ${mean.toExponential(3)} theory ${theory.toExponential(3)} z=${((mean - theory) / se).toFixed(2)}`);
        expect(Math.abs(mean - theory)).toBeLessThanOrEqual(4 * se);
      }
    });
  }
});

describe('determinism', () => {
  it('same seed, same result', () => {
    const run = () =>
      simulate(link(mSequence(5), 31, undb(6)), {
        nBits: 2000,
        seed: 9,
        s: 1,
        interference: jammer({ kind: 'multitone', q: 4, spacing: 0.05, phases: 'random' }, 30),
      });
    const a = run();
    const b = run();
    expect(a.errors).toBe(b.errors);
    expect(Array.from(a.corr.slice(0, 50))).toEqual(Array.from(b.corr.slice(0, 50)));
    expect(db(1)).toBe(0);
  });
});

describe('pulsed jamming against a front end that recovers slowly', () => {
  // Short code, s = 4. Pulses of 2 bits every 100 bits, strong enough to overload the front end.
  // With a recovery time of 10 bits the receiver stays blind long after each pulse ends.
  const link: LinkParams = { code: mSequence(5), chipsPerBit: 31, repetition: 1, preamblePeriods: 0, carrierCyclesPerChip: 0, ebN0: undb(10) };
  const pulses = jammer({ kind: 'pulsed', duty: 0.02, periodChips: 3100, offsetChips: 0 }, 10);
  const fe = { p1dbPower: 50, adcFullScale: 1e3, overloadPower: 1000 };
  it('does damage out of proportion to its duty once recovery is modelled', { timeout: 60_000 }, () => {
    const base = { nBits: 10_000, seed: 42, s: 4, interference: pulses };
    const fast = simulate(link, { ...base, frontEnd: fe });
    const slow = simulate(link, { ...base, frontEnd: { ...fe, recoverySamples: 10 * 31 * 4 } });
    // Blind for the pulse (2 bits) plus recovery (10 bits) out of every 100: about 12% of samples.
    expect(slow.blankedFraction).toBeGreaterThan(0.1);
    expect(slow.blankedFraction).toBeLessThan(0.13);
    // A blanked bit is a coin toss, so roughly half the blind bits are wrong.
    expect(slow.errors / slow.bits).toBeGreaterThan(0.04);
    expect(slow.errors).toBeGreaterThan(3 * fast.errors);
    expect(fast.blankedFraction).toBe(0);
  });
});
