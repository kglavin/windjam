// Data for the level 7 videos (level7_a1.py to level7_f2.py): the example hop sequence, the theory BERs the lessons
// print, and the follower picture, from the functions the app uses. Each level7-<step>.ts writes this to its own path.
import { writeFileSync } from 'node:fs';
import { FH_EXAMPLE, fhTheoryBer, followerEllipse, hopPreview } from '../../src/engine/lab/fh';
import { FOLLOW_EXAMPLE, FOLLOW_PROC_US, followerNumbers } from '../../src/engine/lab/levels';

const r2 = (v: number) => Math.round(v * 100) / 100;
const fast = { ...FH_EXAMPLE, hopsPerBit: 3 as const };
const hops = hopPreview(FH_EXAMPLE, 7007, 32).map((h) => ({ c: h.channel, t: h.startMs }));
const f = FOLLOW_EXAMPLE;
const follow = (p: { xKm: number; yKm: number }) => {
  const n = followerNumbers(f.tx, f.rx, p, f.dwellUs);
  return { p: [p.xKm, p.yKm], extra: r2(n.extra), pathUs: r2(n.pathUs), delayUs: r2(n.delayUs), share: r2(n.share) };
};

writeFileSync(process.argv[2], JSON.stringify({
  link: { channels: FH_EXAMPLE.channels, rateKbps: FH_EXAMPLE.rateKbps, dwellMs: FH_EXAMPLE.dwellMs, bitsPerHop: FH_EXAMPLE.dwellMs * FH_EXAMPLE.rateKbps },
  hops,
  ber: {
    bbn3: fhTheoryBer(FH_EXAMPLE, { kind: 'bbn' }, 3),
    bbnM3: fhTheoryBer(FH_EXAMPLE, { kind: 'bbn' }, -3),
    oneM3: fhTheoryBer(FH_EXAMPLE, { kind: 'partial', rho: 1 / 16 }, -3),
    fastOneM3: fhTheoryBer(fast, { kind: 'partial', rho: 1 / 16 }, -3),
    two0: fhTheoryBer(FH_EXAMPLE, { kind: 'partial', rho: 2 / 16 }, 0),
    sweep0: fhTheoryBer(FH_EXAMPLE, { kind: 'sweep', widthChannels: 2, sweepMs: 37 }, 0),
  },
  follower: {
    tx: [f.tx.xKm, f.tx.yKm],
    rx: [f.rx.xKm, f.rx.yKm],
    dwellUs: f.dwellUs,
    procUs: FOLLOW_PROC_US,
    spots: f.spots.map(follow),
    path: Array.from({ length: 31 }, (_, i) => follow({ xKm: -9 + (9 * i) / 30, yKm: -3 + (3 * i) / 30 })),
    ellipse: (followerEllipse(f.tx, f.rx, f.dwellUs, FOLLOW_PROC_US, 0.2) ?? []).map((p) => [r2(p.xKm), r2(p.yKm)]),
  },
}));
