// Level 7: Frequency hopping (docs/design-level-7.md). Units A to C: the hop set, broadband noise against hopping, and
// partial-band noise against hopping. Every number in the texts is checked in level7.test.ts.
import { createRng } from '../../rng';
import {
  type FhLink, FH_EXAMPLE, FH_F0_MHZ, fhPracticeAt, fhTheoryBer, followerDelayUs, followerEllipse, followerShare, jammedChannels,
} from '../fh';
import { type Pt, C_KM_PER_US, distanceKm } from '../geoloc';
import { DF_AREA, DF_ZONE_Y_MAX } from './level6';
import { berText } from './level2';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

const CHANNELS = [24, 32, 40, 48, 64];
const DWELLS = [2, 4, 5, 8, 10];
const B3_EBJ0 = [5, 6, 7]; // broadband Eb/J0 (linear) the B3 jammer gives
const C3_EBJ0 = [12, 14, 16]; // and the smaller C3 jammer
export const C3_GOAL_BER = 0.01;
export const E3_GOAL_BER = 0.1;
export const FOLLOW_PROC_US = 60; // the follower hears the hop, finds the channel and tunes in this long
export const E_RATE_KBPS = 200; // E's fast radio: 200 kHz channels
const E_GOAL_SHARE = 0.2; // the share of a dwell the E3 goal needs, about: drawn as the ellipse once done

export function level7Truth(seed: number): Truth {
  const rng = createRng(seed ^ 0x27d4eb2f);
  const pickOf = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
  const fh: FhLink = { ...FH_EXAMPLE, channels: pickOf(CHANNELS), dwellMs: pickOf(DWELLS) };
  return { ...shortCodeTruth(seed), fh };
}

const db = (x: number) => 10 * Math.log10(x);
const fhOf = (t: Truth): FhLink => t.fh ?? FH_EXAMPLE;
const pickSeeded = (seed: number, salt: number, list: number[]) => list[Math.floor(createRng((seed ^ salt) >>> 0)() * list.length)];

// J/S in whole dB for a target broadband Eb/J0.
const jsFor = (channels: number, ebJ0: number) => Math.round(db(channels / ebJ0));

export const b3JsDb = (t: Truth): number => jsFor(fhOf(t).channels, pickSeeded(t.seed, 0x1b3, B3_EBJ0));
export const c3JsDb = (t: Truth): number => jsFor(fhOf(t).channels, pickSeeded(t.seed, 0x1c3, C3_EBJ0));
// Practice: B2's J/S for the practice link (LevelDef.practiceJs), and C2's.
export const b2JsDb = (n: number): number => jsFor(fhPracticeAt(n).channels, 6);
export const c2JsDb = (n: number): number => jsFor(fhPracticeAt(n).channels, 16);

// Gp in dB as the texts print it, and Eb/J0 = Gp − J/S from it.
export const gpDbShown = (channels: number): number => Number(db(channels).toFixed(1));
export const ebJ0DbOf = (channels: number, jsDb: number): number => Number((gpDbShown(channels) - jsDb).toFixed(1));

// The best partial band: 2 × J/S (as a ratio) channels, at least one and at most all.
export const bestChannels = (channels: number, jsDb: number): number => Math.min(channels, Math.max(1, Math.round(2 * 10 ** (jsDb / 10))));
export const partialBer = (link: FhLink, k: number, jsDb: number): number => fhTheoryBer(link, { kind: 'partial', rho: k / link.channels }, jsDb);

// --- Unit D: the enemy switches to fast hopping, 3 hops per bit -----------------------------------------------------

export const fastOf = (link: FhLink): FhLink => ({ ...link, hopsPerBit: 3 });
export const d2Ber = (t: Truth): number => {
  const fh = fastOf(fhOf(t));
  return partialBer(fh, bestChannels(fh.channels, c3JsDb(t)), c3JsDb(t));
};

// --- Unit E: the follower ---------------------------------------------------------------------------------------

// E's enemy transmitter and receiver (north of the line), and the dwell of its fast radio, set so the best place on
// the friendly side covers about 30% of each dwell.
export function e3Geometry(t: Truth): { tx: Pt; rx: Pt; dwellUs: number } {
  const r = createRng(Math.imul(t.seed, 7919) >>> 0);
  const tx = { xKm: round1(-8 + 5 * r()), yKm: round1(8 + 4 * r()) };
  const rx = { xKm: round1(3 + 5 * r()), yKm: round1(6 + 6 * r()) };
  let best = Infinity;
  for (let x = DF_AREA.xMin; x <= DF_AREA.xMax; x += 0.5) {
    for (let y = DF_AREA.yMin; y <= DF_ZONE_Y_MAX; y += 0.5) best = Math.min(best, followerDelayUs(tx, rx, { xKm: x, yKm: y }, FOLLOW_PROC_US));
  }
  return { tx, rx, dwellUs: Math.round(best / 0.7 / 10) * 10 };
}
export const e3Link = (t: Truth): FhLink => ({ ...fhOf(t), rateKbps: E_RATE_KBPS, dwellMs: e3Geometry(t).dwellUs / 1000, hopsPerBit: 1 });
export const e3ShareAt = (t: Truth, at: Pt): number => {
  const g = e3Geometry(t);
  return followerShare(g.dwellUs, followerDelayUs(g.tx, g.rx, at, FOLLOW_PROC_US));
};
export const e3Ellipse = (t: Truth): Pt[] | undefined => {
  const g = e3Geometry(t);
  return followerEllipse(g.tx, g.rx, g.dwellUs, FOLLOW_PROC_US, E_GOAL_SHARE);
};

// E1's picture: a fixed transmitter and receiver, a 150 µs dwell, and two places for the follower.
export const FOLLOW_EXAMPLE = {
  tx: { xKm: -5, yKm: 10 },
  rx: { xKm: 5, yKm: 9 },
  dwellUs: 150,
  spots: [{ xKm: 0, yKm: 0, label: 'J1' }, { xKm: -9, yKm: -3, label: 'J2' }],
};
export function followerNumbers(tx: Pt, rx: Pt, at: Pt, dwellUs: number) {
  const direct = distanceKm(tx, rx);
  const via = distanceKm(tx, at) + distanceKm(at, rx);
  const pathUs = (via - direct) / C_KM_PER_US;
  const delayUs = FOLLOW_PROC_US + pathUs;
  return { direct, via, extra: via - direct, pathUs, delayUs, share: followerShare(dwellUs, delayUs) };
}

// E2's practice numbers: distances (km) and the dwell (µs).
const E2_SETS = [
  { tj: 12, jr: 14, tr: 16, dwell: 200 }, { tj: 8, jr: 9, tr: 15, dwell: 120 }, { tj: 20, jr: 18, tr: 25, dwell: 300 }, { tj: 10, jr: 10, tr: 10, dwell: 150 },
];
export const e2Set = (n: number) => E2_SETS[((n % E2_SETS.length) + E2_SETS.length) % E2_SETS.length];
export const e2DelayUs = (n: number) => {
  const s = e2Set(n);
  return FOLLOW_PROC_US + (s.tj + s.jr - s.tr) / C_KM_PER_US;
};
export const e2Share = (n: number) => followerShare(e2Set(n).dwell, e2DelayUs(n));

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const mhz = (v: number) => v.toFixed(3);
const round1 = (v: number) => Math.round(v * 10) / 10;
const ex = FOLLOW_EXAMPLE;
const exNear = followerNumbers(ex.tx, ex.rx, ex.spots[0], ex.dwellUs);
const exFar = followerNumbers(ex.tx, ex.rx, ex.spots[1], ex.dwellUs);

// Placeholders for the texts.
export function level7Values(t: Truth, practiceN: number): Record<string, string> {
  const fh = fhOf(t);
  const p = fhPracticeAt(practiceN);
  const pJs = b2JsDb(practiceN);
  const pcJs = c2JsDb(practiceN);
  const pK = bestChannels(p.channels, pcJs);
  const b3 = b3JsDb(t);
  const c3 = c3JsDb(t);
  const k3 = bestChannels(fh.channels, c3);
  const e2 = e2Set(practiceN);
  const g = e3Geometry(t);
  return {
    pN: String(practiceN),
    n: String(fh.channels),
    top: mhz(FH_F0_MHZ + fh.channels * fh.rateKbps / 1000),
    width: String(fh.channels * fh.rateKbps),
    dwell: String(fh.dwellMs),
    hopRate: String(1000 / fh.dwellMs),
    gpDb: f1(gpDbShown(fh.channels)),
    b3Js: String(b3),
    b3EbJ0: f1(ebJ0DbOf(fh.channels, b3)),
    b3EbJ0Lin: f1(10 ** (ebJ0DbOf(fh.channels, b3) / 10)),
    b3Ber: berText(fhTheoryBer(fh, { kind: 'bbn' }, b3)),
    c3Js: String(c3),
    c3Ratio: f1(10 ** (c3 / 10)),
    c3K: String(k3),
    c3Best: berText(partialBer(fh, k3, c3)),
    c3Bbn: berText(fhTheoryBer(fh, { kind: 'bbn' }, c3)),
    c3EbJ0: f1(ebJ0DbOf(fh.channels, c3)),
    c3EbJ0Lin: f1(10 ** (ebJ0DbOf(fh.channels, c3) / 10)),
    pChannels: String(p.channels),
    pTop: mhz(FH_F0_MHZ + p.channels * p.rateKbps / 1000),
    pWidth: String(p.channels * p.rateKbps),
    pDwell: String(p.dwellMs),
    pGpDb: f1(gpDbShown(p.channels)),
    pJs: String(pJs),
    pEbJ0: f1(ebJ0DbOf(p.channels, pJs)),
    pEbJ0Lin: f1(10 ** (ebJ0DbOf(p.channels, pJs) / 10)),
    pBer: berText(fhTheoryBer(p, { kind: 'bbn' }, pJs)),
    pcJs: String(pcJs),
    pcRatio: f1(10 ** (pcJs / 10)),
    pK: String(pK),
    pcEbJ0Lin: f1(10 ** (ebJ0DbOf(p.channels, pcJs) / 10)),
    pBest: berText(partialBer(p, pK, pcJs)),
    d2Ber: berText(d2Ber(t)),
    e2Tj: String(e2.tj),
    e2Jr: String(e2.jr),
    e2Tr: String(e2.tr),
    e2Dwell: String(e2.dwell),
    e2Extra: String(e2.tj + e2.jr - e2.tr),
    e2Path: f1((e2.tj + e2.jr - e2.tr) / C_KM_PER_US),
    e2Delay: f1(e2DelayUs(practiceN)),
    e2Share: f2(e2Share(practiceN)),
    e3Dwell: String(g.dwellUs),
    e3Tx: `x ${f1(g.tx.xKm)}, y ${f1(g.tx.yKm)}`,
    e3Rx: `x ${f1(g.rx.xKm)}, y ${f1(g.rx.yKm)}`,
  };
}

export const LEVEL_7: LevelDef = {
  id: 7,
  title: 'Frequency hopping',
  intro:
    'Levels 1 to 5 attacked a direct-sequence link. This one hops: it sends on one narrow channel at a time and jumps to another channel many times a second, in an order only its own receiver knows. The jammers you know behave very differently against it. Noise squeezed into part of the band, useless against direct sequence in level 3, becomes the strongest attack.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  practiceJs: (counter) => b2JsDb(counter),
  units: [
    {
      id: 'A',
      title: 'Hopping',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Example: reading the hop set',
          visual: { kind: 'waterfall', link: 'example' },
          video: 'level7-A1',
          paragraphs: [
            'A hopping link sends on one narrow channel, stays there for a short time, the [[dwell|dwell]], then jumps to another. The channels it uses are its [[hop set|hop-set]]. The order looks random and only its receiver knows it.',
            'The plot is a waterfall: time across, frequency up. Each tile is one hop: one channel tall and one dwell wide.',
          ],
          steps: [
            'The band runs from 30.000 to 30.400 MHz: 400 kHz wide.',
            'The tiles sit on steps 25 kHz apart: each channel is 25 kHz wide.',
            'Channels = 400 ÷ 25 = 16.',
            'Each tile lasts 5 ms, so the link makes 1000 ÷ 5 = 200 hops a second.',
            'Against noise spread over the whole band, the gain is the number of channels: Gp = 16, or 10 × log10(16) = 12.0 dB.',
          ],
          rule: 'Channels = band width ÷ channel width. Against broadband noise Gp = number of channels.',
          check: {
            question: 'A link hops over 64 channels. What is its Gp against broadband noise, in dB?',
            unit: 'dB',
            answer: Number(db(64).toFixed(1)),
            tol: { abs: 0.1 },
            wrong: '10 × log10(64).',
          },
        },
        {
          kind: 'practice',
          id: 'A2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'waterfall', link: 'practice' },
          task: 'Read the practice link from its waterfall: how many channels, and how long is the dwell?',
          hint: 'The band edges are printed on the frequency axis. Hover a tile to read its start and end.',
          fields: [
            { id: 'channels', label: 'Channels', unit: '', truth: (_t, ctx) => fhPracticeAt(ctx.practiceN ?? 0).channels, check: { exact: true }, points: 0 },
            { id: 'dwell', label: 'Dwell', unit: 'ms', truth: (_t, ctx) => fhPracticeAt(ctx.practiceN ?? 0).dwellMs, check: { rel: 0.05 }, points: 0 },
          ],
          worked: ['Band: 30.000 to {pTop} MHz, {pWidth} kHz wide. Channels = {pWidth} ÷ 25 = {pChannels}.', 'Each tile lasts {pDwell} ms.'],
        },
        {
          kind: 'apply',
          id: 'A3',
          title: 'The enemy: its hop set',
          instruments: ['waterfall'],
          task: "The waterfall shows the enemy link's first hops. How many channels does it hop over, how long is its dwell, and what is its Gp against broadband noise?",
          hint: 'Channels = band width ÷ 25 kHz. Gp in dB = 10 × log10(channels).',
          fields: [
            { id: 'channels', label: 'Channels', unit: '', truth: (t) => fhOf(t).channels, check: { exact: true }, points: 10 },
            { id: 'dwell', label: 'Dwell', unit: 'ms', truth: (t) => fhOf(t).dwellMs, check: { rel: 0.05 }, points: 5 },
            { id: 'gp', label: 'Gp', unit: 'dB', truth: (t) => db(fhOf(t).channels), check: { abs: 0.15 }, points: 5 },
          ],
          reveal: [
            'Band: 30.000 to {top} MHz, {width} kHz wide. Channels = {width} ÷ 25 = {n}.',
            'Each tile lasts {dwell} ms: {hopRate} hops a second.',
            'Gp = 10 × log10({n}) = {gpDb} dB.',
          ],
        },
      ],
    },
    {
      id: 'B',
      title: 'Broadband noise against hopping',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: noise over the whole band',
          visual: { kind: 'waterfall', link: 'example', variants: [{ label: 'Broadband noise', jammer: { kind: 'bbn' } }], jsDb: 3 },
          paragraphs: [
            'A [[jammer|jammer]] that does not know the next channel can spread its power over all of them. Each channel then gets only 1/16 of it, and the hop on that channel meets only that much.',
            'So the arithmetic is level 2\'s: Eb/J0 = Gp − J/S, in dB.',
            'A hopping radio rarely keeps the carrier phase from one hop to the next, so it sends each bit as one of two tones, [[frequency-shift keying|fsk]], and listens for which is stronger. That needs about 4 dB more than [[BPSK|bpsk]] for the same bit errors: BER = ½ × e^(−Eb/J0 ÷ 2), with Eb/J0 as a ratio.',
          ],
          steps: [
            'The example link: 16 channels, Gp 12.0 dB. The jammer gives J/S 3 dB.',
            'Eb/J0 = 12.0 − 3 = 9.0 dB, a ratio of 7.9.',
            'BER = ½ × e^(−7.9 ÷ 2) = ½ × e^(−3.97) = 0.0094.',
            'Press Run to measure it.',
          ],
          rule: 'Against broadband noise: Eb/J0 = Gp − J/S, and BER = ½ × e^(−Eb/J0 ÷ 2).',
          check: {
            question: 'A link hops over 64 channels (Gp 18.1 dB) and meets J/S 8 dB of broadband noise. What is Eb/J0, in dB?',
            unit: 'dB',
            answer: 10.1,
            tol: { abs: 0.1 },
            wrong: 'Eb/J0 = Gp − J/S = 18.1 − 8.',
          },
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'The practice link hops over {pChannels} channels and meets broadband noise at J/S {pJs} dB. Work out Eb/J0, predict the BER, then run it.',
          hint: 'Gp = 10 × log10({pChannels}) = {pGpDb} dB. Eb/J0 = Gp − J/S. Then ½ × e^(−ratio ÷ 2).',
          fields: [
            { id: 'ebj0', label: 'Eb/J0', unit: 'dB', truth: (_t, ctx) => ebJ0DbOf(fhPracticeAt(ctx.practiceN ?? 0).channels, b2JsDb(ctx.practiceN ?? 0)), check: { abs: 0.15 }, points: 0 },
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (_t, ctx) => fhTheoryBer(fhPracticeAt(ctx.practiceN ?? 0), { kind: 'bbn' }, b2JsDb(ctx.practiceN ?? 0)),
              check: { factor: 2 },
              points: 0,
            },
          ],
          run: { link: 'practice', js: 'fixed', jammer: { kind: 'bbn' }, fh: { jammer: { kind: 'bbn' } } },
          worked: ['Eb/J0 = {pGpDb} − {pJs} = {pEbJ0} dB, a ratio of {pEbJ0Lin}.', 'BER = ½ × e^(−{pEbJ0Lin} ÷ 2) = {pBer}.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'The enemy: broadband noise',
          instruments: [],
          prediction: true,
          task: 'Your jammer puts broadband noise over the whole enemy band at J/S {b3Js} dB. Work out Eb/J0 from the Gp you measured, predict the BER, then run it.',
          hint: 'Eb/J0 = Gp − J/S, then ½ × e^(−ratio ÷ 2).',
          fields: [
            { id: 'ebj0', label: 'Eb/J0', unit: 'dB', truth: (t) => ebJ0DbOf(fhOf(t).channels, b3JsDb(t)), check: { abs: 0.15 }, points: 5 },
            { id: 'ber', label: 'Predicted BER', unit: '', kind: 'predictBer', truth: (t) => fhTheoryBer(fhOf(t), { kind: 'bbn' }, b3JsDb(t)), check: { factor: 2 }, points: 5 },
          ],
          run: { link: 'hidden', js: 'fixed', jsDbFrom: b3JsDb, jammer: { kind: 'bbn' }, fh: { jammer: { kind: 'bbn' } } },
          reveal: ['Eb/J0 = {gpDb} − {b3Js} = {b3EbJ0} dB, a ratio of {b3EbJ0Lin}.', 'BER = ½ × e^(−{b3EbJ0Lin} ÷ 2) = {b3Ber}.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'Partial band against hopping',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: squeeze the noise into a few channels',
          visual: {
            kind: 'waterfall',
            link: 'example',
            variants: [
              { label: 'Broadband noise', jammer: { kind: 'bbn' } },
              { label: 'One channel at 16 times the power', jammer: { kind: 'partial', rho: 1 / 16 } },
            ],
            jsDb: -3,
          },
          video: 'level7-C1',
          paragraphs: [
            'Against [[direct sequence|dsss]], squeezing noise into part of the band gained nothing: despreading spread it back out (level 3). Against hopping it is the opposite.',
            'Put the same power into a few channels. Most hops miss them and come through clean. The hops that land there meet noise many times stronger and are badly broken.',
            'The bit errors are the hit hops\' share of the errors. Broadband noise that is too weak breaks almost nothing; a few channels at full strength break some hops every time.',
          ],
          steps: [
            'The example link at J/S −3 dB: Eb/J0 = 12.0 + 3 = 15.0 dB, a ratio of 32.',
            'Broadband: Eb/J0 of 32 gives about 1 wrong bit in 10 million. Almost nothing.',
            'The best partial band is 2 × J/S as a ratio: 2 × 0.5 = 1 channel, at 16 times the power.',
            '1 hop in 16 lands there and meets Eb/J0 of 2: 18% of its bits are wrong. BER = 0.18 ÷ 16 = 0.012, about 0.37 ÷ 32.',
            'Press Run on both and compare.',
          ],
          rule: 'Against hopping, jam about 2 × J/S (as a ratio) channels. The BER is then about 0.37 ÷ (broadband Eb/J0): it falls only as 1/x, not exponentially.',
          check: {
            question: 'J/S is 3 dB (a ratio of 2). How many channels should a partial-band jammer cover?',
            unit: 'channels',
            answer: 4,
            tol: { exact: true },
            wrong: '2 × J/S as a ratio: 2 × 2.',
          },
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'waterfall', link: 'practice' },
          task: 'Your jammer reaches the practice link ({pChannels} channels) at J/S {pcJs} dB. How many channels should it cover, and about what BER will that give?',
          hint: 'J/S {pcJs} dB is a ratio of {pcRatio}. Channels = 2 × that. BER ≈ 0.37 ÷ (broadband Eb/J0 as a ratio).',
          fields: [
            {
              id: 'channels',
              label: 'Channels to jam',
              unit: '',
              truth: (_t, ctx) => bestChannels(fhPracticeAt(ctx.practiceN ?? 0).channels, c2JsDb(ctx.practiceN ?? 0)),
              check: { abs: 1 },
              points: 0,
            },
            {
              id: 'ber',
              label: 'BER',
              unit: '',
              truth: (_t, ctx) => {
                const p = fhPracticeAt(ctx.practiceN ?? 0);
                return partialBer(p, bestChannels(p.channels, c2JsDb(ctx.practiceN ?? 0)), c2JsDb(ctx.practiceN ?? 0));
              },
              check: { factor: 1.5 },
              points: 0,
            },
          ],
          worked: ['J/S {pcJs} dB = {pcRatio}. Channels = 2 × {pcRatio} ≈ {pK}.', 'Broadband Eb/J0 = {pcEbJ0Lin}; BER ≈ 0.37 ÷ {pcEbJ0Lin}. The exact value for {pK} channels is {pBest}.'],
        },
        {
          kind: 'apply',
          id: 'C3',
          title: 'The enemy: break it with a partial band',
          instruments: [],
          task: 'A smaller jammer reaches the enemy link at J/S {c3Js} dB: broadband noise would give a BER of only {c3Bbn}. Choose how many channels to jam, then run.',
          hint: 'J/S {c3Js} dB is a ratio of {c3Ratio}: jam about twice that many channels.',
          fields: [
            {
              id: 'channels',
              label: 'Channels to jam',
              unit: '',
              truth: (t) => bestChannels(fhOf(t).channels, c3JsDb(t)),
              check: { abs: 0 },
              accept: (v, truth) => v >= truth / 1.6 && v <= truth * 1.6,
              range: { min: 1, max: 64, message: 'From 1 to {n} channels.', maxKey: 'n' },
              points: 5,
            },
          ],
          run: {
            link: 'hidden',
            js: 'fixed',
            jsDbFrom: c3JsDb,
            jammer: { kind: 'bbn' },
            fh: { jammer: { kind: 'bbn' }, jammerFrom: (v, link) => ({ kind: 'partial', rho: jammedChannels(link.channels, (v.channels ?? 1) / link.channels) / link.channels }) },
            runInput: { field: 'channels', label: 'Channels to jam', unit: '' },
          },
          goal: {
            kind: 'deny',
            berAtLeast: C3_GOAL_BER,
            points: 15,
            task: 'Run with your channels. Change them and run again until the BER reaches the goal.',
            notYet: 'Not there yet: try about 2 × J/S (as a ratio) channels.',
          },
          reveal: [
            'J/S {c3Js} dB = {c3Ratio}. Best: 2 × {c3Ratio} ≈ {c3K} channels.',
            'Broadband Eb/J0 = {c3EbJ0} dB = {c3EbJ0Lin}; BER ≈ 0.37 ÷ {c3EbJ0Lin}. Exact for {c3K} channels: {c3Best}, against {c3Bbn} for broadband noise.',
          ],
        },
      ],
    },
    {
      id: 'D',
      title: 'Slow and fast hopping',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: one hit hop against three votes',
          visual: {
            kind: 'waterfall',
            link: 'example',
            variants: [
              { label: 'Slow hopping, one channel jammed', jammer: { kind: 'partial', rho: 1 / 16 } },
              { label: 'Fast hopping, 3 hops per bit, the same jammer', jammer: { kind: 'partial', rho: 1 / 16 }, hopsPerBit: 3 },
            ],
            jsDb: -3,
          },
          video: 'level7-D1',
          paragraphs: [
            '[[Slow hopping|fast-hopping]] sends many bits on each hop: the example sends 125 bits in each 5 ms dwell. One jammed hop breaks a burst of them.',
            'Fast hopping sends each bit on several hops, here 3, on 3 different channels, and the receiver takes a [[majority vote|vote]], as in level 5. One jammed hop is outvoted by the two clean ones.',
          ],
          steps: [
            'The same jammer as in C1: one channel at 16 times the power, J/S −3 dB.',
            'Slow: 1 hop in 16 is hit and 18% of its bits are wrong. BER = 0.012.',
            'Fast: each copy is wrong 0.012 of the time. The vote loses a bit only when 2 or 3 copies are wrong: 3 × 0.012² ≈ 0.0004.',
            'About 30 times fewer errors. Spreading wider does not help the jammer: one channel is still its best.',
          ],
          rule: 'Fast hopping with a vote turns a partial-band jammer\'s p into about 3p².',
          check: {
            question: 'Each copy is wrong 0.01 of the time. About what is the bit error rate after a vote of 3?',
            answer: 0.0003,
            tol: { abs: 0.00002 },
            wrong: '3 × 0.01² = 0.0003.',
          },
        },
        {
          kind: 'apply',
          id: 'D2',
          title: 'The enemy: fast hopping',
          instruments: [],
          prediction: true,
          task: 'The enemy switches to fast hopping: each bit on 3 hops, voted. Your C3 jammer stays on its best {c3K} channels at J/S {c3Js} dB. Predict the BER, then run.',
          hint: 'Each copy is wrong as often as a bit was in C3: {c3Best}. The vote: 3p² − 2p³.',
          fields: [
            { id: 'ber', label: 'Predicted BER', unit: '', kind: 'predictBer', truth: (t) => d2Ber(t), check: { factor: 2 }, points: 10 },
          ],
          run: {
            link: 'hidden',
            js: 'fixed',
            jsDbFrom: c3JsDb,
            jammer: { kind: 'bbn' },
            fh: {
              jammer: { kind: 'bbn' },
              hopsPerBit: 3,
              jammerFrom: (_v, link, t) => ({ kind: 'partial', rho: bestChannels(link.channels, c3JsDb(t)) / link.channels }),
            },
          },
          reveal: ['Each copy is wrong {c3Best} of the time.', 'After the vote: 3p² − 2p³ = {d2Ber}. The same jammer that broke the slow link barely touches the fast one.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'The follower jammer',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: racing the hop',
          visual: { kind: 'follower' },
          video: 'level7-E1',
          paragraphs: [
            'A [[follower jammer|follower]] does not guess. It listens for each hop, finds its channel, tunes there and jams it with all its power. Against a slow hopper that is deadly.',
            'But it is always late. It needs time to hear and tune, here 60 µs. Then its signal takes a longer path to the receiver: transmitter to jammer to receiver, against transmitter to receiver. At 0.3 km per µs, every extra km costs 3.3 µs.',
            'Whatever is left of the dwell is all it gets. The places where it gets enough form an ellipse round the transmitter and the receiver (the dashed line: 20% of each dwell).',
          ],
          steps: [
            `The enemy radio dwells ${ex.dwellUs} µs on each hop. Transmitter to receiver is ${f1(exNear.direct)} km.`,
            `J1 at the front line: ${f1(exNear.via)} km via the jammer, ${f1(exNear.extra)} km extra = ${f1(exNear.pathUs)} µs. Delay = 60 + ${f1(exNear.pathUs)} = ${f1(exNear.delayUs)} µs.`,
            `J1 covers 1 − ${f1(exNear.delayUs)} ÷ ${ex.dwellUs} = ${f2(exNear.share)} of each dwell.`,
            `J2 far to the west: ${f1(exFar.extra)} km extra, delay ${f1(exFar.delayUs)} µs, share ${f2(exFar.share)}.`,
          ],
          rule: 'Share of the dwell = 1 − (processing + extra km ÷ 0.3) ÷ dwell, times in µs. Short dwells beat followers; so does a follower far from the line between transmitter and receiver.',
          check: {
            question: 'Dwell 200 µs, the follower arrives 150 µs into it. What share of the dwell does it cover?',
            answer: 0.25,
            tol: { abs: 0.005 },
            wrong: '1 − 150 ÷ 200.',
          },
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'Transmitter to follower {e2Tj} km, follower to receiver {e2Jr} km, transmitter to receiver {e2Tr} km. The follower needs 60 µs to tune and the dwell is {e2Dwell} µs. When does its signal arrive, and what share of the dwell does it cover?',
          hint: 'Extra path = {e2Tj} + {e2Jr} − {e2Tr} km, at 0.3 km per µs. Add the 60 µs.',
          fields: [
            { id: 'delay', label: 'Delay', unit: 'µs', truth: (_t, ctx) => e2DelayUs(ctx.practiceN ?? 0), check: { abs: 2 }, points: 0 },
            { id: 'share', label: 'Share of the dwell', unit: '', truth: (_t, ctx) => e2Share(ctx.practiceN ?? 0), check: { abs: 0.02 }, points: 0 },
          ],
          worked: ['Extra path = {e2Tj} + {e2Jr} − {e2Tr} = {e2Extra} km = {e2Path} µs.', 'Delay = 60 + {e2Path} = {e2Delay} µs. Share = 1 − {e2Delay} ÷ {e2Dwell} = {e2Share}.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'The enemy: place the follower',
          instruments: ['df'],
          dfMethod: 'follower',
          task: 'The enemy has a fast radio: {e3Dwell} µs dwells on 200 kHz channels. Its transmitter is at {e3Tx} and its receiver at {e3Rx}. Place your follower on the friendly side (click the map), then run at J/S {c3Js} dB.',
          hint: 'Stand as close as you can to the line between transmitter and receiver: the extra path is what eats the dwell.',
          fields: [],
          run: {
            link: 'hidden',
            js: 'fixed',
            jsDbFrom: c3JsDb,
            jammer: { kind: 'bbn' },
            fh: {
              jammer: { kind: 'follower', share: 0 },
              linkFrom: e3Link,
              jammerFrom: (v, _link, t) => ({ kind: 'follower', share: e3ShareAt(t, { xKm: v.jx ?? 0, yKm: v.jy ?? -4 }) }),
            },
          },
          goal: {
            kind: 'deny',
            berAtLeast: E3_GOAL_BER,
            points: 20,
            task: 'Run. Move the follower and run again until the BER reaches the goal.',
            notYet: 'Not there yet: move the follower closer to the line between transmitter and receiver.',
          },
          reveal: ['The dashed ellipse holds the places where the follower covers at least 20% of each dwell.', 'Outside it, the hop is over before the follower\'s signal arrives.'],
        },
      ],
    },
    {
      id: 'F',
      title: 'Other ways to spread',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'The swept jammer',
          visual: {
            kind: 'waterfall',
            link: 'example',
            variants: [
              { label: 'Partial band, 2 channels', jammer: { kind: 'partial', rho: 2 / 16 } },
              { label: 'Sweep, 2 channels wide', jammer: { kind: 'sweep', widthChannels: 2, sweepMs: 37 } },
            ],
            jsDb: 0,
          },
          video: 'level7-F1',
          paragraphs: [
            'A [[swept jammer|sweep]] is a [[partial band|partial-band]] that moves: a narrow block of noise sliding across the band and starting over.',
            'For the same width it hits the same share of hops as a fixed partial band, so its BER is about the same. Its advantage is that it reaches every channel. A link that notices a few jammed channels and stops using them, adaptive hopping, escapes a fixed partial band but not a sweep.',
          ],
          rule: 'A sweep w channels wide covers each channel w ÷ N of the time: the same share as a fixed partial band, spread over the whole band.',
          check: {
            question: 'A sweep 4 channels wide crosses a band of 32 channels. What share of the time is any one channel jammed?',
            answer: 0.125,
            tol: { abs: 0.001 },
            wrong: '4 ÷ 32.',
          },
        },
        {
          kind: 'lesson',
          id: 'F2',
          title: 'Time hopping and hybrid links',
          visual: { kind: 'none' },
          video: 'level7-F2',
          paragraphs: [
            '[[Time hopping|time-hopping]] sends short bursts in random time slots instead of hopping in frequency. A jammer has to cover all the time or guess the slots. The bursts are easy to see with a detector that looks for peaks, so time hopping hides only from detectors that average over a long time.',
            'A [[hybrid|hybrid]] link does both: direct sequence inside each hop. The gains multiply. 31 chips per bit (Gp 31) hopping over 16 channels gives 31 × 16 = 496, or 27.0 dB, against broadband noise.',
          ],
          check: {
            question: 'A link spreads each bit over 63 chips and hops over 32 channels. What is its Gp against broadband noise, in dB?',
            unit: 'dB',
            answer: Number(db(63 * 32).toFixed(1)),
            tol: { abs: 0.1 },
            wrong: 'Gp = 63 × 32 = 2016. Then 10 × log10.',
          },
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
              text: 'Against a hopping link, which jammer does the most for the same power?',
              options: ['Broadband noise over the whole band', 'Noise on about 2 × J/S channels', 'Noise on half the channels'],
              correct: 1,
              explain: 'A few channels at full strength break every hop that lands there. The best number is about 2 × J/S as a ratio.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'What beats a follower jammer?',
              options: ['A dwell shorter than the follower\'s delay', 'More transmitter power', 'Wider channels'],
              correct: 0,
              explain: 'The follower jams only what is left of the dwell after its processing time and its extra path. A short dwell leaves it nothing.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'Why does fast hopping with a vote resist partial-band jamming?',
              options: ['The jammer cannot see fast hops', 'Each hop is sent louder', 'Each bit rides on several hops, and one hit hop is outvoted'],
              correct: 2,
              explain: 'With 3 hops per bit, a copy error rate p becomes about 3p².',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'Against a hopping link, broadband noise is weak: every channel shares its power. Squeezed into about 2 × J/S channels, the same power breaks every hop that lands there, the strongest simple attack on hopping and useless against direct sequence. Fast hopping with a vote answers it. A follower jams with all its power but only what is left of each dwell, which short dwells and distance from the link take away.',
};
