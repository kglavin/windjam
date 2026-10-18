// Level 11: Urban EW (docs/design-level-11.md). Units A to C: why towns are different, urban path loss, shadowing.
// Every number in the texts is checked in level11.test.ts.
import { createRng } from '../../rng';
import { coverageMarginDb, hataSlope, jsSpreadDb } from '../urban';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level11Truth = shortCodeTruth;
const pick = <T,>(t: Truth, salt: number, list: T[]): T => list[Math.floor(createRng((t.seed ^ salt) >>> 0)() * list.length)];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
const f1 = (v: number) => v.toFixed(1);

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
          paragraphs: [
            'In open country a signal has a clear path and loses a known amount with distance: 6 dB per doubling in free space, 12 dB near the ground (level 0, F1).',
            'In a town the direct path is usually blocked. The signal gets through over rooftops, round corners and off walls, so it loses more, the loss changes from one street to the next, and several copies arrive at slightly different times.',
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
          paragraphs: [
            'Planners use measured models. The Hata model fits a signal from a mast above the rooftops down into a town; a street microcell fits a low antenna along a street, free space at first and steeper beyond a breakpoint; a building adds its own loss on top.',
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
  ],
  debrief:
    'Towns cost a jammer twice: the loss grows faster with distance (about 35 dB per tenfold distance, plus 15 dB through a building), and it scatters from spot to spot, so J/S has to be planned with a margin. The units still to come cover multipath, friendly radios, and protecting a convoy.',
};
