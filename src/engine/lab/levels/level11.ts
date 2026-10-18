// Level 11: Urban EW (docs/design-level-11.md). Units A to G: why towns are different, urban path loss, shadowing,
// multipath, fratricide and isolation, counter-IED, and the check.
// Every number in the texts is checked in level11.test.ts.
import { createRng } from '../../rng';
import { type Pt, bearingDeg } from '../geoloc';
import {
  type Jammer, type Receiver, bubbleRadiusKm, coverageMarginDb, hataSlope, hataUrbanDb, isolationCheck, jsSpreadDb, reflectionBearingErrorDeg,
} from '../urban';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level11Truth = shortCodeTruth;
const pick = <T,>(t: Truth, salt: number, list: T[]): T => list[Math.floor(createRng((t.seed ^ salt) >>> 0)() * list.length)];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
const f1 = (v: number) => v.toFixed(1);
const pt = (p: Pt) => `(${p.xKm.toFixed(2)}, ${p.yKm.toFixed(2)})`;

// --- Unit B --------------------------------------------------------------------------------------------------------

export const BUILDING_LOSS_DB = 15;
export const TOWN_SLOPE = 3.5; // the town's distance slope: 35 dB per tenfold distance (Hata, 30 m base)
// J/S at a receiver in town: power difference, then 35 dB per decade of the distance ratio, plus a building's loss.
export const jsTownDb = (jamOverSigDb: number, jamKm: number, sigKm: number, behindBlock = false): number =>
  jamOverSigDb - 10 * TOWN_SLOPE * Math.log10(jamKm / sigKm) - (behindBlock ? BUILDING_LOSS_DB : 0);
export const b3Setup = (t: Truth) => ({
  jamOverSigDb: pick(t, 0xb31, [6, 10, 13]),
  sigKm: pick(t, 0xb32, [1.5, 2, 3]),
  jamKm: pick(t, 0xb33, [0.8, 1, 1.2]),
});
const B2_HB = [50, 100, 15, 200];
export const b2Hb = (n: number) => at(B2_HB, n);

// --- Unit C --------------------------------------------------------------------------------------------------------

const C2_SETS = [{ j: 6, s: 6, share: 0.9 }, { j: 10, s: 6, share: 0.95 }, { j: 8, s: 4, share: 0.9 }, { j: 9, s: 9, share: 0.99 }];
export const shadowC2Set = (n: number) => at(C2_SETS, n);
export const c3Setup = (t: Truth) => ({ sigma: pick(t, 0xc31, [6, 8, 10]), share: pick(t, 0xc32, [0.9, 0.95]) });

// --- Unit D: a bearing off a wall --------------------------------------------------------------------------------

export const d2Geometry = (t: Truth) => {
  const r = createRng((t.seed ^ 0xd2) >>> 0);
  const site = { xKm: 0.3, yKm: 0.3 };
  const tx = { xKm: round2(0.6 + 0.6 * r()), yKm: round2(1.4 + 0.4 * r()) };
  const wall = { xKm: round2(1.3 + 0.5 * r()), yKm: round2(0.6 + 0.6 * r()) };
  return { site, tx, wall, errorDeg: reflectionBearingErrorDeg(site, tx, wall) };
};
const round2 = (v: number) => Math.round(v * 100) / 100;

// --- Unit E: friendly radios near the target ----------------------------------------------------------------------

export const TOWN_FREQ_MHZ = 450;
export const townLossDb = (km: number): number => hataUrbanDb(TOWN_FREQ_MHZ, Math.max(km, 0.05), 30, 1.5);
export const ENEMY_GOAL_JS_DB = 3;
export const FRIEND_TOLERANCE_JS_DB = 0;
export const JAMMER: Omit<Jammer, 'xKm' | 'yKm'> = { powerDbm: 43, gainDbi: 10, halfBeamDeg: 30, sidelobeDb: 25 };
const TX_DBM = 37; // 5 W radios

export interface TownLayout {
  receivers: Receiver[];
  enemyTx: Pt;
  friendTx: Pt;
}

function layoutFrom(r: () => number): TownLayout {
  const erx = { xKm: round2(0.7 + 0.6 * r()), yKm: round2(0.9 + 0.5 * r()) };
  const a = 2 * Math.PI * r();
  const etx = { xKm: round2(erx.xKm + 1.2 * Math.cos(a)), yKm: round2(erx.yKm + 1.2 * Math.sin(a)) };
  const ftx = { xKm: round2(0.2 + 1.6 * r()), yKm: round2(0.15 + 0.2 * r()) };
  const near = (k: number) => {
    const b = a + Math.PI / 2 + k * Math.PI * 0.6 + 0.4 * r();
    const d = 0.35 + 0.35 * r();
    return { xKm: round2(erx.xKm + d * Math.cos(b)), yKm: round2(erx.yKm + d * Math.sin(b)) };
  };
  const f1 = near(0);
  const f2 = near(1);
  const civ = near(2);
  const sig = (from: Pt, to: Pt) => TX_DBM - townLossDb(Math.hypot(from.xKm - to.xKm, from.yKm - to.yKm));
  const receivers: Receiver[] = [
    { ...erx, name: 'enemy receiver', friendly: false, signalDbm: sig(etx, erx) },
    { ...f1, name: 'friendly patrol', friendly: true, signalDbm: sig(ftx, f1), toleranceJsDb: FRIEND_TOLERANCE_JS_DB },
    { ...f2, name: 'friendly post', friendly: true, signalDbm: sig(ftx, f2), toleranceJsDb: FRIEND_TOLERANCE_JS_DB },
    { ...civ, name: 'taxi radio', friendly: true, signalDbm: sig({ xKm: 1, yKm: 1.9 }, civ), toleranceJsDb: FRIEND_TOLERANCE_JS_DB },
  ];
  return { receivers, enemyTx: etx, friendTx: ftx };
}

const inTown = (p: Pt) => p.xKm >= 0.05 && p.xKm <= 1.95 && p.yKm >= 0.05 && p.yKm <= 1.95;

// A search over places (0.1 km grid) and beam directions (10°): the placements that work.
export function isolationSolutions(l: TownLayout, beam = true): { at: Pt; beamDeg?: number }[] {
  const out: { at: Pt; beamDeg?: number }[] = [];
  for (let x = 0.1; x <= 1.91; x += 0.1) {
    for (let y = 0.1; y <= 1.91; y += 0.1) {
      const at = { xKm: round2(x), yKm: round2(y) };
      const dirs = beam ? Array.from({ length: 36 }, (_, i) => i * 10) : [undefined];
      for (const d of dirs) {
        const j: Jammer = d === undefined ? { ...at, powerDbm: JAMMER.powerDbm } : { ...at, ...JAMMER, boresightDeg: d };
        if (isolationCheck(j, l.receivers, townLossDb, ENEMY_GOAL_JS_DB).ok) out.push({ at, beamDeg: d });
      }
    }
  }
  return out;
}

// The enemy's layout: drawn from the seed until an omni jammer cannot do it anywhere but a beam can, at enough places.
const layouts = new Map<number, TownLayout>();
export function e3Layout(t: Truth): TownLayout {
  const hit = layouts.get(t.seed);
  if (hit) return hit;
  const r = createRng((t.seed ^ 0xe3) >>> 0);
  let l = layoutFrom(r);
  for (let i = 0; i < 100; i++) {
    const ok = [...l.receivers.map((x) => x as Pt), l.enemyTx, l.friendTx].every(inTown);
    if (ok && isolationSolutions(l, false).length === 0 && isolationSolutions(l, true).length >= 4) break;
    l = layoutFrom(r);
  }
  layouts.set(t.seed, l);
  return l;
}

// One try at the enemy's layout: the jammer at `at` with its beam on `beamDeg`.
export const townTry = (l: TownLayout, at: Pt, beamDeg: number) =>
  isolationCheck({ ...at, ...JAMMER, boresightDeg: beamDeg }, l.receivers, townLossDb, ENEMY_GOAL_JS_DB);

// E1's example: a fixed layout, a placement with a beam that works, and the same spot with an omni antenna.
export const EXAMPLE_TOWN: TownLayout = (() => {
  const r = createRng(77);
  let l = layoutFrom(r);
  while (isolationSolutions(l, false).length > 0 || isolationSolutions(l, true).length < 10) l = layoutFrom(r);
  return l;
})();
// The placement with the enemy in the main beam that leaves the friendlies most room below their tolerance.
export const EXAMPLE_PLACE = (() => {
  const room = (s: { at: Pt; beamDeg?: number }) => {
    const js = isolationCheck({ ...s.at, ...JAMMER, boresightDeg: s.beamDeg }, EXAMPLE_TOWN.receivers, townLossDb, ENEMY_GOAL_JS_DB).js;
    const omni = isolationCheck({ ...s.at, powerDbm: JAMMER.powerDbm }, EXAMPLE_TOWN.receivers, townLossDb, ENEMY_GOAL_JS_DB).js;
    return js[0] > omni[0] ? Math.min(...js.slice(1).map((v) => FRIEND_TOLERANCE_JS_DB - v)) : -Infinity;
  };
  const sols = isolationSolutions(EXAMPLE_TOWN, true);
  return sols.reduce((b, s) => (room(s) > room(b) ? s : b), sols[0]) as { at: Pt; beamDeg: number };
})();
export const exampleJs = (beam: boolean): number[] =>
  isolationCheck(beam ? { ...EXAMPLE_PLACE.at, ...JAMMER, boresightDeg: EXAMPLE_PLACE.beamDeg } : { ...EXAMPLE_PLACE.at, powerDbm: JAMMER.powerDbm }, EXAMPLE_TOWN.receivers, townLossDb, ENEMY_GOAL_JS_DB).js;

// E2's practice: a friendly radio in the side lobes.
const E2_SETS = [{ d: 0.4, s: -80 }, { d: 0.6, s: -85 }, { d: 0.8, s: -75 }, { d: 0.5, s: -90 }];
export const e2Friend = (n: number) => at(E2_SETS, n);
export const e2Js = (n: number): number => {
  const e = e2Friend(n);
  return JAMMER.powerDbm + (JAMMER.gainDbi ?? 0) - (JAMMER.sidelobeDb ?? 0) - townLossDb(e.d) - e.s;
};

// --- Unit F: counter-IED -----------------------------------------------------------------------------------------

export const f2Setup = (t: Truth) => ({
  jamW: pick(t, 0xf21, [20, 50, 100]),
  trigW: pick(t, 0xf22, [1, 2, 5]),
  trigKm: pick(t, 0xf23, [0.5, 1, 2]),
  needDb: pick(t, 0xf24, [6, 10]),
});
export const f2Radius = (t: Truth): number => {
  const f = f2Setup(t);
  return bubbleRadiusKm(f.trigKm, 10 * Math.log10(f.jamW / f.trigW), f.needDb, TOWN_SLOPE);
};

export function level11Values(t: Truth, practiceN: number): Record<string, string> {
  const b = b3Setup(t);
  const c = c3Setup(t);
  const c2 = shadowC2Set(practiceN);
  const hb = b2Hb(practiceN);
  const spread3 = jsSpreadDb(c.sigma, c.sigma);
  return {
    pN: String(practiceN),
    jamOver: String(b.jamOverSigDb),
    sigKm: String(b.sigKm),
    jamKm: String(b.jamKm),
    ratio: (b.jamKm / b.sigKm).toFixed(3),
    distDb: f1(35 * Math.log10(b.jamKm / b.sigKm)),
    jsStreet: f1(jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm)),
    jsBlock: f1(jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm, true)),
    pHb: String(hb),
    pSlope: f1(10 * hataSlope(hb)),
    pTen: f1(10 * hataSlope(hb) * Math.log10(3)),
    pJ: String(c2.j),
    pS: String(c2.s),
    pShare: String(Math.round(c2.share * 100)),
    pSpread: f1(jsSpreadDb(c2.j, c2.s)),
    pMargin: f1(coverageMarginDb(jsSpreadDb(c2.j, c2.s), c2.share)),
    sigma: String(c.sigma),
    share: String(Math.round(c.share * 100)),
    spread: f1(spread3),
    z: (coverageMarginDb(1, c.share)).toFixed(2),
    margin: f1(coverageMarginDb(spread3, c.share)),
    dSite: pt(d2Geometry(t).site),
    dTx: pt(d2Geometry(t).tx),
    dWall: pt(d2Geometry(t).wall),
    dBrgTx: f1(bearingDeg(d2Geometry(t).site, d2Geometry(t).tx)),
    dBrgWall: f1(bearingDeg(d2Geometry(t).site, d2Geometry(t).wall)),
    dErr: f1(d2Geometry(t).errorDeg),
    eD: String(e2Friend(practiceN).d),
    eS: String(e2Friend(practiceN).s),
    eLoss: f1(townLossDb(e2Friend(practiceN).d)),
    eJs: f1(e2Js(practiceN)),
    fJam: String(f2Setup(t).jamW),
    fTrig: String(f2Setup(t).trigW),
    fKm: String(f2Setup(t).trigKm),
    fNeed: String(f2Setup(t).needDb),
    fOver: f1(10 * Math.log10(f2Setup(t).jamW / f2Setup(t).trigW)),
    fR: (f2Radius(t)).toFixed(2),
  };
}

export const LEVEL_11: LevelDef = {
  id: 11,
  title: 'Urban EW',
  intro:
    'Levels 1 to 10 worked in open country, with a clear line of sight. Towns break that. Buildings block and reflect, so the loss is larger, changes from street to street, and arrives by several paths at once. J/S becomes a range of values instead of one number, bearings point at walls, and friendly and civilian radios sit close to every target.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Why towns are different',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Blocked, reflected, close together',
          visual: { kind: 'town' },
          video: 'level11-A1',
          paragraphs: [
            'In open country a signal has a clear path and loses a known amount with distance: 6 dB per doubling in free space, 12 dB near the ground (level 0, F1).',
            'In a town the direct path is usually blocked. The signal gets through over rooftops, round corners and off walls, so it loses more, the loss changes from one street to the next, and several copies arrive at slightly different times: [[multipath|multipath]].',
            'Everything is also close together: the enemy\'s radios, your own, and civilian phones and taxis share the same streets. A jammer aimed at one hits the others unless it is placed and pointed with care.',
          ],
          check: {
            question: 'In open country near the ground, how many dB does a signal lose each time the distance doubles?',
            unit: 'dB',
            answer: 12,
            tol: { exact: true },
            wrong: 'Near the ground the loss goes with the fourth power of distance: 12 dB per doubling.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Urban path loss',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: one distance, three losses',
          visual: { kind: 'urbanLoss' },
          video: 'level11-B1',
          paragraphs: [
            'Planners use measured models. The [[hata|Hata model]] fits a signal from a mast above the rooftops down into a town; a street microcell fits a low antenna along a street, free space at first and steeper beyond a breakpoint; a building adds its own loss on top.',
            'In Hata the loss grows by (44.9 − 6.55 × log10(mast height)) dB for each tenfold distance: 35 dB for a 30 m mast, against 20 in free space. Not the 40 or more sometimes quoted.',
          ],
          steps: [
            '450 MHz, 2 km. Free space: 91.5 dB.',
            'Along a street, low antennas (a microcell): 118.5 dB.',
            'From a 30 m mast over the rooftops into the town (Hata): 129.1 dB, 37.6 dB more than free space.',
            'Into a building: about 15 dB more again.',
          ],
          rule: 'In town, loss grows by about 35 dB per tenfold distance (Hata, 30 m mast), and a building adds about 15 dB.',
          check: {
            question: 'Hata, a 30 m mast. How many dB more loss does ten times the distance add?',
            unit: 'dB',
            answer: Number((10 * hataSlope(30)).toFixed(1)),
            tol: { abs: 0.3 },
            wrong: '44.9 − 6.55 × log10(30) = 44.9 − 9.7.',
          },
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'urbanLoss' },
          task: 'A Hata mast {pHb} m high. How many dB more loss per tenfold distance, and how many dB more at 3 times the distance?',
          hint: '44.9 − 6.55 × log10(height) dB per decade; times log10(3) for 3 times the distance.',
          fields: [
            { id: 'slope', label: 'Per tenfold distance', unit: 'dB', truth: (_t, ctx) => 10 * hataSlope(b2Hb(ctx.practiceN ?? 0)), check: { abs: 0.3 }, points: 0 },
            { id: 'three', label: 'At 3 times the distance', unit: 'dB', truth: (_t, ctx) => 10 * hataSlope(b2Hb(ctx.practiceN ?? 0)) * Math.log10(3), check: { abs: 0.3 }, points: 0 },
          ],
          worked: ['44.9 − 6.55 × log10({pHb}) = {pSlope} dB per decade.', '{pSlope} × log10(3) = {pSlope} × 0.477 = {pTen} dB.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'The enemy: a street and a block',
          instruments: [],
          task: 'An enemy receiver hears its transmitter {sigKm} km away. Your jammer sends {jamOver} dB more power and stands {jamKm} km from the receiver. With the town\'s 35 dB per tenfold distance, what is J/S with the jammer in an open street, and with a block of buildings (15 dB) in the way?',
          hint: 'J/S = power difference − 35 × log10(jammer distance ÷ transmitter distance), less 15 dB behind the block.',
          fields: [
            { id: 'street', label: 'J/S, open street', unit: 'dB', truth: (t) => { const b = b3Setup(t); return jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm); }, check: { abs: 0.3 }, points: 10 },
            { id: 'block', label: 'J/S, behind the block', unit: 'dB', truth: (t) => { const b = b3Setup(t); return jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm, true); }, check: { abs: 0.3 }, points: 10 },
          ],
          reveal: ['35 × log10({jamKm} ÷ {sigKm}) = 35 × log10({ratio}) = {distDb} dB.', 'Street: {jamOver} − ({distDb}) = {jsStreet} dB. Behind the block: {jsStreet} − 15 = {jsBlock} dB.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'Shadowing',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: J/S as a spread',
          visual: { kind: 'shadowing' },
          video: 'level11-C1',
          paragraphs: [
            'Two spots the same distance away can differ by many dB: one has a clear street, the other a block in the way. Measured over a town, the loss at a given distance scatters around the model with a standard deviation of 6 to 10 dB. This is [[shadowing|shadowing]].',
            'The jammer\'s path and the transmitter\'s path are shadowed separately, so J/S scatters by √(σJ² + σS²). To work at most spots, the jammer must plan its J/S above the need by a margin: 1.28 times the spread for 90% of spots, 1.64 for 95%.',
          ],
          steps: [
            'σ = 8 dB on each path: J/S spread = √(8² + 8²) = 11.3 dB.',
            'For 90% of spots: margin = 1.28 × 11.3 = 14.5 dB.',
            'If the enemy breaks at J/S 5 dB, plan for 5 + 14.5 = 19.5 dB on average.',
          ],
          rule: 'In town, J/S scatters by √(σJ² + σS²). Plan 1.28 times that above the need for 90% of spots.',
          check: {
            question: 'σ = 6 dB on each path. What is the J/S spread, in dB?',
            unit: 'dB',
            answer: Number(jsSpreadDb(6, 6).toFixed(1)),
            tol: { abs: 0.1 },
            wrong: '√(6² + 6²).',
          },
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'shadowing' },
          task: 'σ = {pJ} dB on the jammer\'s path and {pS} dB on the transmitter\'s. What is the J/S spread, and the margin for {pShare}% of spots?',
          hint: 'Spread = √(σJ² + σS²). Margin = z × spread: 1.28 for 90%, 1.64 for 95%, 2.33 for 99%.',
          fields: [
            { id: 'spread', label: 'Spread', unit: 'dB', truth: (_t, ctx) => jsSpreadDb(shadowC2Set(ctx.practiceN ?? 0).j, shadowC2Set(ctx.practiceN ?? 0).s), check: { abs: 0.15 }, points: 0 },
            { id: 'margin', label: 'Margin', unit: 'dB', truth: (_t, ctx) => { const c = shadowC2Set(ctx.practiceN ?? 0); return coverageMarginDb(jsSpreadDb(c.j, c.s), c.share); }, check: { abs: 0.3 }, points: 0 },
          ],
          worked: ['√({pJ}² + {pS}²) = {pSpread} dB.', 'Margin for {pShare}%: {pMargin} dB.'],
        },
        {
          kind: 'apply',
          id: 'C3',
          title: 'The enemy: plan the margin',
          instruments: [],
          task: 'In this town shadowing has σ = {sigma} dB on every path. What is the spread of J/S at the enemy receivers, and what margin must your jammer plan for {share}% of them?',
          hint: 'Spread = √(σ² + σ²). Margin = z × spread: 1.28 for 90%, 1.64 for 95%.',
          fields: [
            { id: 'spread', label: 'Spread', unit: 'dB', truth: (t) => jsSpreadDb(c3Setup(t).sigma, c3Setup(t).sigma), check: { abs: 0.15 }, points: 5 },
            { id: 'margin', label: 'Margin', unit: 'dB', truth: (t) => coverageMarginDb(jsSpreadDb(c3Setup(t).sigma, c3Setup(t).sigma), c3Setup(t).share), check: { abs: 0.3 }, points: 10 },
          ],
          reveal: ['√({sigma}² + {sigma}²) = {spread} dB.', 'For {share}%: {z} × {spread} = {margin} dB above what the enemy needs.'],
        },
      ],
    },
    {
      id: 'D',
      title: 'Multipath',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Many copies, fades and wrong bearings',
          visual: { kind: 'fading' },
          video: 'level11-D1',
          paragraphs: [
            'In a street the signal arrives as many copies, off walls on every side. They add up or cancel depending on the exact spot, so the level rises and falls every few tens of centimetres. This is [[fading|fading]]. With no direct path it follows a known pattern (Rayleigh): 10 dB below the average about 1 time in 10, 20 dB below about 1 time in 100.',
            'Direct sequence (level 2) can use the copies. Copies that arrive more than a chip apart despread separately, and a [[rake|rake]] receiver adds them up. A deep fade then needs every copy low at once: with 2 copies a 10 dB fade drops from 1 time in 10 to about 1 in 60, with 3 to about 1 in 300.',
            'Multipath also misleads the tools of level 6. A bearing taken where the direct path is blocked points at the wall the signal bounced off, not at the transmitter: the error is the angle between them. For TDOA, the copies smear the correlation peak, and a weak early copy can hide behind a strong late one.',
          ],
          rule: 'In a street, one path fades 10 dB 1 time in 10 and 20 dB 1 time in 100. A rake that adds 2 or 3 copies makes deep fades far rarer. A bearing off a wall points at the wall.',
          check: {
            question: 'A single path is 20 dB below its average about 1 time in how many?',
            answer: 100,
            tol: { exact: true },
            wrong: 'Rayleigh: 1 − e^(−0.01) ≈ 0.01, so 1 time in 100.',
          },
        },
        {
          kind: 'apply',
          id: 'D2',
          title: 'The enemy: a bearing off a wall',
          instruments: [],
          task: 'Your DF site stands at {dSite} km (x east, y north). It takes a bearing on an enemy transmitter, but a block hides it, and the signal reaches the site off a wall at {dWall}. A patrol later finds the transmitter at {dTx}. By how many degrees was the bearing wrong?',
          hint: 'Bearing from north = atan2(Δx, Δy). Find the bearing to the wall and to the transmitter; the error is the difference.',
          fields: [
            { id: 'err', label: 'Bearing error', unit: '°', truth: (t) => d2Geometry(t).errorDeg, check: { abs: 1 }, points: 10 },
          ],
          reveal: ['Bearing to the transmitter: {dBrgTx}°. Bearing to the wall, where the site pointed: {dBrgWall}°.', 'Error: {dErr}°. A fix built on it lands near the wall, not the transmitter.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'Fratricide and isolation',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: the beam on the target',
          visual: { kind: 'town', example: 'isolation' },
          video: 'level11-E1',
          paragraphs: [
            'In town your own radios and civilian ones stand a few hundred metres from the enemy\'s. A jammer that reaches the enemy reaches them too. Jamming your own side is [[fratricide|fratricide]]. Each radio has its own wanted signal, so each gets its own J/S, and each friendly has a tolerance it must stay below.',
            'A directional antenna gives [[isolation|electronic isolation]]: full gain in its beam, much less in its side lobes. Put the enemy receiver in the beam and the others in the side lobes.',
          ],
          steps: [
            'The jammer: 20 W (43 dBm), a beam 60° wide with 10 dBi gain, side lobes 25 dB down. The goal: J/S 3 dB or more at the enemy receiver, 0 dB or less at every other radio.',
            'Omni at this spot: the enemy receiver gets 12.3 dB, but the two friendlies get 13.4 and 13.3 dB and the taxi 5.6 dB. All jammed.',
            'Beam on the enemy: its J/S rises 10 dB to 22.3 dB. The others fall 15 dB, into the side lobes: −1.6, −1.7 and −9.4 dB. All clear.',
          ],
          rule: 'Each radio has its own J/S. A beam on the enemy with the others in its side lobes jams the one and spares the rest.',
          check: {
            question: 'A friendly in a side lobe has J/S −1.6 dB. What is its J/S if the beam swings onto it (side lobes 25 dB down)?',
            unit: 'dB',
            answer: 23.4,
            tol: { abs: 0.1 },
            wrong: 'In the beam it gets the full gain back: −1.6 + 25.',
          },
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'town', example: 'isolation' },
          task: 'The same jammer (43 dBm, 10 dBi beam, side lobes 25 dB down) is {eD} km from a friendly radio in a side lobe. The path loss is {eLoss} dB and the friendly\'s own signal arrives at {eS} dBm. What is its J/S, and what would it be in the beam?',
          hint: 'J/S = 43 + 10 − 25 − path loss − its signal (dBm). In the beam add the 25 dB back.',
          fields: [
            { id: 'side', label: 'J/S, side lobe', unit: 'dB', truth: (_t, ctx) => e2Js(ctx.practiceN ?? 0), check: { abs: 0.3 }, points: 0 },
            { id: 'beam', label: 'J/S, in the beam', unit: 'dB', truth: (_t, ctx) => e2Js(ctx.practiceN ?? 0) + 25, check: { abs: 0.3 }, points: 0 },
          ],
          worked: ['43 + 10 − 25 − {eLoss} − ({eS}) = {eJs} dB.', 'In the beam: {eJs} + 25 dB. Above 0 dB it is jammed.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'The enemy: jam it, spare the rest',
          instruments: ['df'],
          dfMethod: 'town',
          task: 'An enemy receiver stands among two friendly radios and a taxi radio. Your 20 W jammer has the 60° beam. Place it and point it so the enemy\'s J/S is 3 dB or more and every other radio\'s is 0 dB or less. An omni antenna cannot do it anywhere on this map.',
          hint: 'Stand where the enemy receiver and the others lie in different directions, then turn the beam onto the enemy.',
          fields: [],
          locate: { maxSites: 1, points: 25, task: 'Click the map to place the jammer, turn the beam, then press Jam. Full points within 3 jams, half after.' },
          reveal: ['From most places an omni jammer that reaches the enemy also reaches a friendly. The beam works where the others fall outside it, 25 dB down.'],
        },
      ],
    },
    {
      id: 'F',
      title: 'Counter-IED',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Example: the protection bubble',
          visual: { kind: 'none' },
          paragraphs: [
            'A roadside bomb can be set off by radio. A jammer on a convoy vehicle stops the trigger\'s signal reaching the bomb\'s receiver. This is [[counter-ied|counter-IED]] jamming. It works within a radius of the vehicle, the protection bubble.',
            'At the bomb\'s receiver, J/S = (jammer power ÷ trigger power, in dB) − 35 × log10(jammer distance ÷ trigger distance) in town. Set it equal to the J/S needed and solve: radius = trigger distance × 10^((power ratio in dB − J/S needed) ÷ 35).',
            'The bubble also covers the convoy\'s own radios. They must use frequencies the jammer leaves clear, or talk in its look-through gaps (level 9).',
          ],
          steps: [
            'Jammer 50 W, trigger 2 W from 1 km away, J/S needed 10 dB.',
            'Power ratio: 10 × log10(50 ÷ 2) = 14.0 dB, so 4.0 dB to spare.',
            'Radius = 1 × 10^(4.0 ÷ 35) = 1.30 km.',
          ],
          rule: 'Bubble radius = trigger distance × 10^((jammer over trigger, dB − J/S needed) ÷ 35). Twice the radius takes 11 times the power.',
          check: {
            question: 'In town (35 dB per tenfold distance), how many times the jammer power doubles the bubble\'s radius?',
            answer: 11.3,
            tol: { abs: 0.2 },
            wrong: 'Twice the distance costs 35 × log10(2) = 10.5 dB: 10^1.05 ≈ 11.3 times the power.',
          },
        },
        {
          kind: 'apply',
          id: 'F2',
          title: 'The enemy: the bubble\'s reach',
          instruments: [],
          task: 'Your convoy\'s jammer sends {fJam} W. The enemy\'s trigger sends {fTrig} W from {fKm} km away, and its receiver is blocked at J/S {fNeed} dB. How far from the vehicle does the bubble reach?',
          hint: 'Radius = trigger distance × 10^((10 × log10(jammer W ÷ trigger W) − J/S needed) ÷ 35).',
          fields: [
            { id: 'r', label: 'Radius', unit: 'km', truth: (t) => f2Radius(t), check: { rel: 0.03 }, points: 10 },
          ],
          reveal: ['10 × log10({fJam} ÷ {fTrig}) = {fOver} dB.', 'Radius = {fKm} × 10^(({fOver} − {fNeed}) ÷ 35) = {fR} km.'],
        },
      ],
    },
    {
      id: 'G',
      title: 'Check',
      steps: [
        {
          kind: 'questions',
          id: 'G1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'A DF site in town takes a bearing on a transmitter hidden behind a block. Where does the bearing point?',
              options: ['At the transmitter, with more noise', 'At the wall that reflects the signal to the site', 'Nowhere: no bearing can be taken'],
              correct: 1,
              explain: 'The site points where the signal arrives from: the reflecting wall. The error is the angle between wall and transmitter.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'Your jammer reaches the enemy receiver, but a friendly patrol is 400 m from it. What keeps the patrol clear?',
              options: ['More power', 'A directional antenna with the enemy in the beam and the patrol in a side lobe', 'Standing next to the patrol'],
              correct: 1,
              explain: 'More power jams both. A beam isolates the enemy: the patrol, in a side lobe, gets 25 dB less.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'Shadowing in a town has σ = 8 dB on every path. Why plan J/S well above what the enemy needs?',
              options: ['J/S scatters by about 11 dB from spot to spot, so the average must sit above the need to work at most spots', 'Hata is always 8 dB short', 'Shadowing adds 8 dB of loss everywhere'],
              correct: 0,
              explain: '√(8² + 8²) = 11.3 dB of spread. For 90% of spots, plan 1.28 × 11.3 = 14.5 dB above the need.',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'Towns cost a jammer three ways. The loss grows faster with distance (about 35 dB per tenfold distance, plus 15 dB through a building) and scatters from spot to spot, so J/S needs a margin. Copies off walls fade the signal and bend bearings. And friendly and civilian radios stand close to every target, so the jammer must be placed and pointed, not just turned up. A convoy\'s bubble follows the same sums.',
};
