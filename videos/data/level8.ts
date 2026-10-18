// Data for the level 8 videos (level8_a1.py to level8_f1.py): the example register's steps, the rebuild, the
// example searches with and without the preamble jammed, and packet losses and energies, from the engine.
import { writeFileSync } from 'node:fs';
import { PRIMITIVE_TAPS, berlekampMassey, chipsToBits, extendRecurrence, mSequence, registerSteps } from '../../src/engine/lab/pn';
import { SYNC_EXAMPLE, cellMean, detectProb, jammerEnergy, packetErrorRate, searchTrace, thresholdFor } from '../../src/engine/lab/sync';

const bits = chipsToBits(mSequence(5));
const rebuild = (k: number) => {
  const bm = berlekampMassey(bits.slice(0, k));
  return { k, length: bm.length, taps: bm.coeffs.flatMap((c, i) => (c ? [i + 1] : [])).sort((a, b) => b - a), predicted: extendRecurrence(bits.slice(0, k), bm.coeffs, 31 - k) };
};
// A quiet search that locks after a dozen tests or so, and a jammed one that never locks.
const quiet = [...Array(60).keys()].map((s) => ({ s, t: searchTrace(SYNC_EXAMPLE, s) })).find((x) => x.t.locked && x.t.z.length >= 10 && x.t.z.length <= 16)!;
const jammed = [...Array(60).keys()].map((s) => ({ s, t: searchTrace(SYNC_EXAMPLE, s, { on: 'preamble', jsDb: 8 }) })).find((x) => !x.t.locked && !x.t.falseLock)!;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

writeFileSync(process.argv[2], JSON.stringify({
  register: { degree: 5, taps: PRIMITIVE_TAPS[5], steps: registerSteps(5, PRIMITIVE_TAPS[5], 1, 32) },
  bits,
  rebuild10: rebuild(10),
  rebuild6: rebuild(6),
  search: {
    n: SYNC_EXAMPLE.n,
    threshold: r3(thresholdFor(SYNC_EXAMPLE.pfaCell)),
    mean: r3(cellMean(SYNC_EXAMPLE)),
    pd: r3(detectProb(SYNC_EXAMPLE)),
    quiet: { k: quiet.t.k, z: quiet.t.z.map(r3) },
    jammed: { k: jammed.t.k, z: jammed.t.z.map(r3), mean: r3(cellMean(SYNC_EXAMPLE, 8)) },
  },
  packets: {
    preambleChips: SYNC_EXAMPLE.preamblePeriods * SYNC_EXAMPLE.n,
    payloadChips: SYNC_EXAMPLE.payloadBits * SYNC_EXAMPLE.n,
    perPre: r3(packetErrorRate(SYNC_EXAMPLE, { on: 'preamble', jsDb: 8 })),
    perPay: r3(packetErrorRate(SYNC_EXAMPLE, { on: 'payload', jsDb: 8 })),
    perQuiet: r3(packetErrorRate(SYNC_EXAMPLE)),
    energyRatio: r3(jammerEnergy(SYNC_EXAMPLE, { on: 'payload', jsDb: 8 }) / jammerEnergy(SYNC_EXAMPLE, { on: 'preamble', jsDb: 8 })),
  },
}));
