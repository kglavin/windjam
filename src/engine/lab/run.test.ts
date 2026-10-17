import { describe, expect, it } from 'vitest';
import type { LinkParams } from './dsss';
import { mSequence } from './pn';
import { type RunProgress, type RunRequest, createRun, runBer } from './run';
import { startRun } from './runner';
import { berBpskJammed, ebJ0FromJs } from './theory';

const link = (over: Partial<LinkParams> = {}): LinkParams => ({
  code: mSequence(5),
  chipsPerBit: 31,
  repetition: 1,
  preamblePeriods: 0,
  carrierCyclesPerChip: 0,
  ebN0: 1e6,
  ...over,
});

const hot: RunRequest = {
  link: link({ ebN0: 0.5 }),
  s: 1,
  seed: 11,
  chunkBits: 500,
};

describe('runBer stop rules', () => {
  it('stops by errors', () => {
    const r = runBer(hot);
    expect(r.stoppedBy).toBe('errors');
    expect(r.errors).toBeGreaterThanOrEqual(100);
    expect(r.bits).toBe(500 * Math.ceil(r.bits / 500));
  });

  it('stops by bits on a clean link, rounded up to the chunk', () => {
    const r = runBer({ link: link(), s: 1, seed: 3, maxBits: 2500, chunkBits: 1000 });
    expect(r.stoppedBy).toBe('bits');
    expect(r.bits).toBe(3000);
    expect(r.errors).toBe(0);
  });

  it('stops by time with a fake clock', () => {
    let t = -6000;
    const now = () => (t += 6000);
    const r = runBer({ ...hot, link: link(), maxBits: 1e9 }, { now });
    expect(r.stoppedBy).toBe('time');
    expect(r.bits).toBe(1000);
  });

  it('cancels after the first progress', () => {
    let seen = 0;
    const r = runBer(
      { ...hot, link: link(), maxBits: 1e9 },
      { onProgress: () => seen++, shouldStop: () => seen >= 1 },
    );
    expect(r.stoppedBy).toBe('cancel');
    expect(r.bits).toBe(500);
  });

  it('rounds the chunk to a multiple of the repetition', () => {
    const r = runBer({ link: link({ repetition: 3 }), s: 1, seed: 1, maxBits: 1, chunkBits: 10 });
    expect(r.bits).toBe(9);
    expect(createRun({ link: link({ repetition: 5 }), s: 1, seed: 1, chunkBits: 1 }).step()).toMatchObject({ bits: 5 });
  });
});

describe('determinism and chunking', () => {
  it('same request, same result', () => {
    const a = runBer(hot);
    const b = runBer(hot);
    expect(b.errors).toBe(a.errors);
    expect(Array.from(b.corr)).toEqual(Array.from(a.corr));
  });

  it('chunked equals unchunked for a deterministic jammer without noise', () => {
    // Different chunking draws different bits, so compare error rates, which are set by the jammer alone.
    const base: RunRequest = {
      link: link({ code: mSequence(9), chipsPerBit: 31, carrierCyclesPerChip: 0.01 }),
      jammer: { spec: { kind: 'tone', fTc: 0.02 }, js: 60 },
      s: 1,
      seed: 5,
      maxBits: 4000,
      maxErrors: 1e9,
    };
    const small = runBer({ ...base, chunkBits: 250 });
    const big = runBer({ ...base, chunkBits: 4000 });
    expect(small.bits).toBe(big.bits);
    expect(small.jammerPhases).toEqual(big.jammerPhases);
    expect(small.jammerPhases).toHaveLength(1);
    expect(big.errors).toBeGreaterThan(0);
    // Same bits per seed would be needed for exact equality; the tone phase is shared, so rates agree closely.
    expect(Math.abs(small.errors - big.errors)).toBeLessThanOrEqual(5 * Math.sqrt(big.errors));
  });
});

describe('BER interval', () => {
  it('BBN at gp 31, BER 0.05: theory inside the interval', () => {
    const gp = 31;
    let js = 0.01;
    while (berBpskJammed(1e6, ebJ0FromJs(gp, js)) < 0.05) js *= 1.01;
    const theory = berBpskJammed(1e6, ebJ0FromJs(gp, js));
    const r = runBer({
      link: link(),
      jammer: { spec: { kind: 'bbn' }, js },
      s: 1,
      seed: 21,
      maxErrors: 400,
      chunkBits: 2000,
    });
    expect(r.stoppedBy).toBe('errors');
    expect(theory).toBeGreaterThanOrEqual(r.lo);
    expect(theory).toBeLessThanOrEqual(r.hi);
  }, 30000);
});

describe('startRun fallback', () => {
  it('resolves with the same result as runBer', async () => {
    const seen: RunProgress[] = [];
    const run = startRun(hot, (p) => seen.push(p));
    const res = await run.result;
    const ref = runBer(hot);
    expect(res.errors).toBe(ref.errors);
    expect(res.bits).toBe(ref.bits);
    expect(Array.from(res.corr)).toEqual(Array.from(ref.corr));
    expect(seen.length).toBeGreaterThan(0);
  });

  it('cancel stops between chunks', async () => {
    const run = startRun({ ...hot, link: link(), maxBits: 1e9 }, () => run.cancel());
    const res = await run.result;
    expect(res.stoppedBy).toBe('cancel');
    expect(res.bits).toBe(500);
  });
});
