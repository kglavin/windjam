// Data for the level 6 videos (level6_c1.py to level6_g2.py): the lessons' DF pictures, fixes, ellipses, hyperbolas
// and the example cross-correlation, from the functions the app draws them with. Each level6-<step>.ts writes this to
// its own path.
import { writeFileSync } from 'node:fs';
import {
  type Pt, bearingDeg, bearingSigmaDeg, crossBearings, crossingAngleDeg, distanceKm, expectedBearingFix, fixFromBearings,
} from '../../src/engine/lab/geoloc';
import {
  DF_EXAMPLES, EXAMPLE, LEG_STEP_KM, UAV_HEIGHT_M, exampleBearings, exampleDtUs, exampleHyperbolas, level6Scene, level6Truth,
  siteSnrDb, xcorrExample,
} from '../../src/engine/lab/levels';
import { mSequence } from '../../src/engine/lab/pn';

const r2 = (v: number) => Math.round(v * 100) / 100;
const pt = (p: Pt) => [r2(p.xKm), r2(p.yKm)];
const fixOf = (f: ReturnType<typeof fixFromBearings>) =>
  f && { x: r2(f.xKm), y: r2(f.yKm), a: r2(f.ellipse.aKm), b: r2(f.ellipse.bKm), angle: f.ellipse.angleRad, cep: r2(f.cepKm) };

// C1: σ at a few SNRs, and the interferometer's example (half-wave spacing at 50 MHz).
const c1 = { snrs: [20, 13, 10, 4].map((snr) => ({ snr, sigma: r2(bearingSigmaDeg(snr)) })), freqMHz: 50, lambdaM: 6, dM: 3 };

// D1: two sites 4 km apart, the transmitter moving north from 2 to 15 km: crossing angle and the 1σ ellipse (σ 2.5°).
const dSites = [{ xKm: -2, yKm: 0 }, { xKm: 2, yKm: 0 }];
const d1 = {
  sites: dSites.map(pt),
  sigma: 2.5,
  sweep: Array.from({ length: 27 }, (_, i) => 2 + i * 0.5).map((y) => {
    const tx = { xKm: 0, yKm: y };
    const e = expectedBearingFix(dSites.map((s) => ({ ...s, sigmaDeg: 2.5 })), tx)!;
    return {
      y,
      bearings: dSites.map((s) => r2(bearingDeg(s, tx))),
      crossing: r2(crossingAngleDeg(bearingDeg(dSites[0], tx), bearingDeg(dSites[1], tx))),
      a: r2(e.ellipse.aKm), b: r2(e.ellipse.bKm), angle: e.ellipse.angleRad, cep: r2(e.cepKm),
    };
  }),
};

// E1: the lesson's three noisy bearings, the triangle they make, and the fix.
const e1x = DF_EXAMPLES.E1;
const e1b = exampleBearings(e1x);
const corner = (i: number, j: number) => crossBearings(e1b[i], e1b[i].bearingDeg, e1b[j], e1b[j].bearingDeg)!.point;
const e1 = {
  sites: e1x.sites.map((s) => ({ p: pt(s), sigma: s.sigmaDeg, label: s.label })),
  bearings: e1b.map((b) => r2(b.bearingDeg)),
  trueBearings: e1x.sites.map((s) => r2(bearingDeg(s, e1x.target))),
  triangle: [corner(0, 1), corner(1, 2), corner(0, 2)].map(pt),
  fix: fixOf(fixFromBearings(e1b)),
  target: pt(e1x.target),
};

// F1: the UAV leg across the line of sight, the fix after each bearing; a leg toward the transmitter for contrast.
const f1x = DF_EXAMPLES.F1;
const f1b = exampleBearings(f1x);
const scene = level6Scene(level6Truth(1), f1x.target);
const f1 = {
  leg: f1b.map((b) => pt(b)),
  bearings: f1b.map((b) => r2(b.bearingDeg)),
  fixes: f1b.map((_, k) => (k < 1 ? null : fixOf(fixFromBearings(f1b.slice(0, k + 1))))),
  target: pt(f1x.target),
  stepKm: LEG_STEP_KM,
  heightM: UAV_HEIGHT_M,
  uavSnr: r2(siteSnrDb(scene, { xKm: 0, yKm: 0 }, UAV_HEIGHT_M)),
  groundSnr: r2(siteSnrDb(scene, { xKm: 0, yKm: 0 })),
  toward: Array.from({ length: 13 }, (_, i) => ({ xKm: f1x.target.xKm, yKm: -4 + i * 0.5 })).map((p) => ({ p: pt(p), b: r2(bearingDeg(p, f1x.target)) })),
};

// G1: three receivers, their ranges and time differences against A, and the two hyperbolas.
const g1x = DF_EXAMPLES.G1;
const g1 = {
  sites: g1x.sites.map((s) => ({ p: pt(s), label: s.label, range: r2(distanceKm(s, g1x.target)) })),
  dt: exampleDtUs(g1x).map(r2),
  hyperbolas: exampleHyperbolas(g1x).map((h) => h.map(pt)),
  target: pt(g1x.target),
};

// G2: the example cross-correlation (A against B), the code it was made from, and the hyperbola of its peak.
const g2x = DF_EXAMPLES.G2;
const xc = xcorrExample();
const g2 = {
  sites: g2x.sites.map((s) => ({ p: pt(s), label: s.label })),
  chipRateMcps: EXAMPLE.chipRateMcps,
  code: Array.from(mSequence(EXAMPLE.degree)),
  points: xc.points.filter((_, i) => i % 2 === 0).map((p) => [r2(p.lagUs), Math.round(p.mag * 1000) / 1000]),
  peakUs: xc.peakUs,
  hyperbola: exampleHyperbolas(g2x)[0].map(pt),
  target: pt(g2x.target),
};

writeFileSync(process.argv[2], JSON.stringify({ c1, d1, e1, f1, g1, g2 }));
