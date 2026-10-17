import { describe, expect, it } from 'vitest';
import { capture, despreadCapture } from './capture';
import { type LinkParams, simulate } from './dsss';
import { jammer } from './jammers';
import { mSequence } from './pn';
import { meanPower } from './signal';
import { undb } from './theory';

const link: LinkParams = {
  code: mSequence(6),
  chipsPerBit: 63,
  repetition: 1,
  preamblePeriods: 4,
  carrierCyclesPerChip: 0.002,
  ebN0: undb(8),
};

describe('capture', () => {
  it('has the expected length and preamble', () => {
    const c = capture({ link, s: 4, nBits: 50, seed: 1 });
    expect(c.rx.re.length).toBe(c.frame.chips.length * 4);
    expect(c.frame.preambleChips).toBeGreaterThan(0);
    expect(capture({ link, s: 4, nBits: 50, seed: 1, preamble: false }).frame.preambleChips).toBe(0);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = capture({ link, s: 2, nBits: 20, seed: 5 });
    const b = capture({ link, s: 2, nBits: 20, seed: 5 });
    const d = capture({ link, s: 2, nBits: 20, seed: 6 });
    expect(Array.from(a.rx.re)).toEqual(Array.from(b.rx.re));
    expect(Array.from(a.rx.re)).not.toEqual(Array.from(d.rx.re));
  });

  it('adds jammer power of about js', () => {
    const js = undb(10);
    const c = capture({ link, s: 1, nBits: 400, seed: 3, jammer: { spec: { kind: 'bbn' }, js } });
    expect(c.jam).toBeDefined();
    const p = meanPower(c.jam!);
    expect(p / js).toBeGreaterThan(0.9);
    expect(p / js).toBeLessThan(1.1);
  });

  it('despreads to the same correlator outputs as simulate', () => {
    const o = { nBits: 60, seed: 9, s: 4 };
    const jam = { spec: { kind: 'bbn' } as const, js: undb(5) };
    const c = capture({ link, ...o, preamble: false, jammer: jam });
    const r = despreadCapture(c, link);
    const sim = simulate(link, { ...o, preamble: false, interference: jammer(jam.spec, jam.js) });
    expect(Array.from(r.corr)).toEqual(Array.from(sim.corr));
  });
});
