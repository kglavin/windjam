import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { type LinkParams, frame, receive, simulate, transmit } from './dsss';
import { type JammerSpec, jammer } from './jammers';
import { mSequence } from './pn';
import { type IQ, addScaled, gaussian, iq } from './signal';
import { berBpsk, berBpskJammed, berRepetitionMajority, undb } from './theory';

const params = (over: Partial<LinkParams> = {}): LinkParams => ({
  code: mSequence(5),
  chipsPerBit: 31,
  repetition: 1,
  preamblePeriods: 32,
  carrierCyclesPerChip: 0,
  ebN0: Infinity,
  ...over,
});

// Asserts a count is within 4 sigma of n*p.
const near = (count: number, n: number, p: number) => {
  const sd = Math.sqrt(n * p * (1 - p));
  expect(Math.abs(count - n * p)).toBeLessThanOrEqual(4 * sd);
};

describe('frame', () => {
  it('preamble is the code repeated, rounded up to whole bits', () => {
    const p = params({ code: mSequence(5), chipsPerBit: 31, preamblePeriods: 32 });
    const f = frame(p, new Int8Array([1, -1]));
    expect(f.preambleChips).toBe(32 * 31);
    for (let k = 0; k < f.preambleChips; k++) expect(f.chips[k]).toBe(p.code[k % 31]);
    const q = params({ code: mSequence(9), chipsPerBit: 16, preamblePeriods: 3 });
    const g = frame(q, new Int8Array([1]));
    expect(g.preambleChips % 16).toBe(0);
    expect(g.preambleChips).toBe(Math.ceil((3 * 511) / 16) * 16);
    expect(frame(q, new Int8Array([1]), false).preambleChips).toBe(0);
  });

  it('a long code runs on across bits', () => {
    const p = params({ code: mSequence(9), chipsPerBit: 16, repetition: 3 });
    const f = frame(p, new Int8Array([1, -1, 1, 1]), false);
    expect(f.channelBits).toBe(12);
    expect(f.chips.length).toBe(12 * 16);
    for (let k = 0; k < f.chips.length; k++) {
      const sym = f.bits[Math.floor(k / 16 / 3)];
      expect(f.chips[k]).toBe(sym * p.code[k % 511]);
    }
  });
});

describe('noiseless loopback', () => {
  const cases: [string, Partial<LinkParams>][] = [
    ['short', { code: mSequence(5), chipsPerBit: 31 }],
    ['long', { code: mSequence(9), chipsPerBit: 16 }],
  ];
  for (const [name, base] of cases)
    for (const s of [1, 4])
      for (const carrierCyclesPerChip of [0, 0.001])
        for (const repetition of [1, 3] as const)
          it(`${name} s=${s} carrier=${carrierCyclesPerChip} r=${repetition}`, () => {
            const p = params({ ...base, carrierCyclesPerChip, repetition });
            for (const preamble of [false, true]) {
              const r = simulate(p, { nBits: 200, seed: 5, s, preamble });
              expect(r.errors).toBe(0);
              expect(r.copyErrors).toBe(0);
              for (const c of r.corr) expect(Math.abs(Math.abs(c) - 1)).toBeLessThan(1e-3);
            }
          });
});

describe('BER against theory', () => {
  it('short code, s=1, r=1, 4 dB', { timeout: 30_000 }, () => {
    const e = undb(4);
    const r = simulate(params({ ebN0: e }), { nBits: 20_000, seed: 1, s: 1 });
    near(r.errors, 20_000, berBpsk(e));
  });

  it('short code, s=4, r=1, 4 dB', { timeout: 30_000 }, () => {
    const e = undb(4);
    const r = simulate(params({ ebN0: e }), { nBits: 10_000, seed: 2, s: 4 });
    near(r.errors, 10_000, berBpsk(e));
  });

  it('r=3 at 2 dB: copies match BPSK, bits match majority', { timeout: 30_000 }, () => {
    const e = undb(2);
    const n = 20_000;
    const r = simulate(params({ ebN0: e, repetition: 3 }), { nBits: n, seed: 3, s: 1 });
    near(r.copyErrors, 3 * n, berBpsk(e));
    near(r.errors, n, berRepetitionMajority(berBpsk(e), 3));
  });

  it('long code mSequence(11), gp 64, 6 dB', { timeout: 30_000 }, () => {
    const e = undb(6);
    const n = 40_000;
    const r = simulate(params({ code: mSequence(11), chipsPerBit: 64, ebN0: e }), { nBits: n, seed: 4, s: 1 });
    near(r.errors, n, berBpsk(e));
  });
});

describe('determinism', () => {
  it('same seed gives the same result, zero interference changes nothing', () => {
    const p = params({ ebN0: undb(3) });
    const a = simulate(p, { nBits: 2000, seed: 9, s: 1 });
    const b = simulate(p, { nBits: 2000, seed: 9, s: 1 });
    expect(b).toEqual(a);
    const z = simulate(p, { nBits: 2000, seed: 9, s: 1, interference: (n) => iq(n) });
    expect(z.errors).toBe(a.errors);
    expect(z.copyErrors).toBe(a.copyErrors);
    expect(a.errors).toBeGreaterThan(0);
  });
});

describe('front end', () => {
  it('transparent front end matches no front end at s=4', { timeout: 30_000 }, () => {
    const p = params({ ebN0: undb(4) });
    const o = { nBits: 5000, seed: 6, s: 4 };
    const a = simulate(p, o);
    const b = simulate(p, { ...o, frontEnd: { p1dbPower: 1e9, adcFullScale: 1e9 } });
    expect(b.errors).toBe(a.errors);
    expect(b.compressedFraction).toBe(0);
  });

  it('hard saturation still works at 10 dB', { timeout: 30_000 }, () => {
    const p = params({ ebN0: undb(10) });
    const r = simulate(p, { nBits: 5000, seed: 7, s: 4, frontEnd: { p1dbPower: 1e-2, adcFullScale: 1e9 } });
    expect(r.compressedFraction).toBeGreaterThan(0.9);
    expect(r.errors / r.bits).toBeLessThan(0.01);
  });
});

describe('broadband noise jammer', () => {
  it('matches berBpskJammed with ebJ0 = gp/js, s=1 and s=4', { timeout: 30_000 }, () => {
    const js = 10;
    const bbn =
      (n: number, s: number, rng: () => number): IQ => {
        const g = gaussian(rng);
        const x = iq(n);
        const sd = Math.sqrt((js * s) / 2);
        for (let i = 0; i < n; i++) {
          x.re[i] = sd * g();
          x.im[i] = sd * g();
        }
        return x;
      };
    const n = 20_000;
    for (const s of [1, 4]) {
      const r = simulate(params(), { nBits: n, seed: 8, s, interference: bbn });
      near(r.errors, n, berBpskJammed(Number.POSITIVE_INFINITY, 31 / js));
    }
  });
});

describe('startChip continuity', () => {
  const p = params({ code: mSequence(9), chipsPerBit: 16, repetition: 3, carrierCyclesPerChip: 0.013 });
  const nBits = 40;
  const bitsAll = new Int8Array(2 * nBits).map((_, i) => (((i * 7919) >> 3) & 1 ? 1 : -1));
  const a = bitsAll.slice(0, nBits);
  const b = bitsAll.slice(nBits);
  const chunkChips = nBits * 3 * 16;
  const specs: JammerSpec[] = [
    { kind: 'tone', fTc: 0.021, phase: 1.1 },
    { kind: 'multitone', q: 3, spacing: 0.01, phases: [0.3, 1.2, 2.5] },
  ];

  it('chips, transmitted samples and correlator outputs match one long call', () => {
    for (const s of [1, 2]) {
      const whole = frame(p, bitsAll, false);
      const f1 = frame(p, a, false, 0);
      const f2 = frame(p, b, false, chunkChips);
      expect(Array.from(whole.chips)).toEqual([...f1.chips, ...f2.chips]);
      const tw = transmit(p, whole, s);
      const t1 = transmit(p, f1, s);
      const t2 = transmit(p, f2, s);
      for (let i = 0; i < t2.re.length; i++) {
        expect(t2.re[i]).toBeCloseTo(tw.re[t1.re.length + i], 3);
        expect(t2.im[i]).toBeCloseTo(tw.im[t1.re.length + i], 3);
      }
      for (const spec of specs) {
        const jam = jammer(spec, 4);
        const rng = createRng(1);
        const jw = jam(tw.re.length, s, rng, 0);
        const j1 = jam(t1.re.length, s, rng, 0);
        const j2 = jam(t2.re.length, s, rng, chunkChips);
        for (let i = 0; i < j2.re.length; i++) {
          expect(j2.re[i]).toBeCloseTo(jw.re[j1.re.length + i], 3);
          expect(j2.im[i]).toBeCloseTo(jw.im[j1.re.length + i], 3);
        }
        addScaled(tw, jw);
        addScaled(t1, j1);
        addScaled(t2, j2);
        const rw = receive(p, tw, s, whole);
        const r1 = receive(p, t1, s, f1);
        const r2 = receive(p, t2, s, f2);
        const joined = [...r1.corr, ...r2.corr];
        for (let i = 0; i < joined.length; i++) expect(joined[i]).toBeCloseTo(rw.corr[i], 3);
      }
    }
  });

  it('pulsed on/off pattern continues across chunks', () => {
    const jam = jammer({ kind: 'pulsed', duty: 0.3, periodChips: 37, offsetChips: 5 }, 2);
    const n = 2 * chunkChips;
    const w = jam(n, 1, createRng(1), 0);
    const x1 = jam(chunkChips, 1, createRng(2), 0);
    const x2 = jam(chunkChips, 1, createRng(3), chunkChips);
    const on = (z: { re: Float32Array; im: Float32Array }, i: number) => z.re[i] !== 0 || z.im[i] !== 0;
    for (let i = 0; i < chunkChips; i++) {
      expect(on(x1, i)).toBe(on(w, i));
      expect(on(x2, i)).toBe(on(w, chunkChips + i));
    }
  });
});
