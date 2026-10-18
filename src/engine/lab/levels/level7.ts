// Level 7: Frequency hopping (docs/design-level-7.md). Units A to C: the hop set, broadband noise against hopping, and
// partial-band noise against hopping. Every number in the texts is checked in level7.test.ts.
import { createRng } from '../../rng';
import { type FhLink, FH_EXAMPLE, FH_F0_MHZ, fhPracticeAt, fhTheoryBer, jammedChannels } from '../fh';
import { berText } from './level2';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

const CHANNELS = [24, 32, 40, 48, 64];
const DWELLS = [2, 4, 5, 8, 10];
const B3_EBJ0 = [5, 6, 7]; // broadband Eb/J0 (linear) the B3 jammer gives
const C3_EBJ0 = [12, 14, 16]; // and the smaller C3 jammer
export const C3_GOAL_BER = 0.01;

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

const f1 = (v: number) => v.toFixed(1);
const mhz = (v: number) => v.toFixed(3);

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
          paragraphs: [
            'A hopping link sends on one narrow channel, stays there for a short time, the dwell, then jumps to another. The channels it uses are its hop set. The order looks random and only its receiver knows it.',
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
            'A hopping radio rarely keeps the carrier phase from one hop to the next, so it sends each bit as one of two tones, frequency-shift keying, and listens for which is stronger. That needs about 4 dB more than [[BPSK|bpsk]] for the same bit errors: BER = ½ × e^(−Eb/J0 ÷ 2), with Eb/J0 as a ratio.',
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
          paragraphs: [
            'Against [[direct sequence|dsss]], squeezing noise into part of the band gained nothing: despreading spread it back out (level 3). Against hopping it is the opposite.',
            'Put the same power into a few channels. Most hops miss them and come through clean. The hops that land there meet noise many times stronger and are badly broken.',
            'The bit errors are the hit hops\' share of the errors. Broadband noise that is too weak breaks almost nothing; a few channels at full strength break some hops every time.',
          ],
          steps: [
            'The example link at J/S −3 dB: Eb/J0 = 12.0 + 3 = 15.0 dB, a ratio of 32.',
            'Broadband: BER = ½ × e^(−16) ≈ 0.00000006. Almost nothing.',
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
  ],
  debrief:
    'Against a hopping link, broadband noise is weak: its power is shared by every channel. Squeezed into about 2 × J/S channels, the same power breaks every hop that lands there, and the BER falls only as 1 ÷ Eb/J0. Partial-band noise, useless against direct sequence, is the strongest simple attack on hopping.',
};
