// Data for the level 10 videos (level10_a1.py to level10_e1.py): codes and despread values, BER against users, the
// near-far numbers, the code emerging as pieces add up, beam patterns and the MVDR null following a jammer.
import { writeFileSync } from 'node:fs';
import { NULL_DIRS, angleGrid, delayAndSum, idealCovariance, jammerSuppressionDb, mvdr, patternDb } from '../../src/engine/lab/array';
import { berCdma, codeOf, discoverCode, sinr } from '../../src/engine/lab/cdma';
import { DISCOVER_EXAMPLE, NEAR_FAR, PIECE_STEPS, exampleUsers } from '../../src/engine/lab/levels';

const r2 = (v: number) => Math.round(v * 100) / 100;
const grid = angleGrid(1);
const pat = (w: ReturnType<typeof delayAndSum>, look: number) => patternDb(w, look, grid).map((v) => r2(Math.max(v, -50)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

writeFileSync(process.argv[2], JSON.stringify({
  codes: [2, 3, 4].map((k) => Array.from(codeOf(k))),
  berVsUsers: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => {
    const u = exampleUsers(k);
    return { k, rule: r2(31 / (k - 1)), ber: mean(u.map((_, j) => berCdma(u, j))) };
  }),
  nearFar: {
    users: NEAR_FAR,
    berPlain: berCdma(NEAR_FAR, 1),
    berSic: berCdma(NEAR_FAR, 1, [0]),
    sinrPlain: sinr(NEAR_FAR, 1),
    sinrSic: sinr(NEAR_FAR, 1, [0]),
  },
  discover: {
    code: Array.from(codeOf(DISCOVER_EXAMPLE.code)),
    snrDb: DISCOVER_EXAMPLE.snrDb,
    steps: PIECE_STEPS.map((p) => ({ pieces: p, ...discoverCode(codeOf(DISCOVER_EXAMPLE.code), DISCOVER_EXAMPLE.snrDb, p, 1) })),
  },
  grid,
  beams: {
    sweep: [-40, -30, -20, -10, 0, 10, 20, 30, 40].map((look) => ({ look, db: pat(delayAndSum(8, look), look) })),
    sizes: [4, 8, 16].map((m) => ({ m, db: pat(delayAndSum(m, 0), 0) })),
  },
  nulls: {
    das: pat(delayAndSum(8, 0), 0),
    sweep: [-70, -55, -40, -25, -10, 10, 25, 40, 55, 70].map((j) => {
      const w = mvdr(idealCovariance(8, [{ thetaDeg: j, power: 1000 }], 1), 0);
      return { jam: j, db: pat(w, 0), supp: r2(jammerSuppressionDb(w, 0, j)) };
    }),
    many: [7, 8].map((k) => {
      const js = NULL_DIRS.slice(0, k);
      const w = mvdr(idealCovariance(8, js.map((thetaDeg) => ({ thetaDeg, power: 1000 })), 1), 0);
      return { k, jams: js, db: pat(w, 0), worst: r2(Math.max(...js.map((j) => jammerSuppressionDb(w, 0, j)))) };
    }),
  },
}));
