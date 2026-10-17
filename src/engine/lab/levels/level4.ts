// Level 4: Tones. A tone against a long code is turned into noise; against a short code it does no better than
// noise and on the carrier almost nothing; many tones in phase make peaks. Every number in the texts is checked
// against theory.ts and generated samples in level4.test.ts.
import { createRng } from '../../rng';
import { mSequence } from '../pn';
import { peakSet } from '../peaks';
import { berBpsk, berBpskJammed, berToneLongCode, berToneShortCode, undb } from '../theory';
import { berText } from './level2';
import {
  type ApplyStep,
  type Ctx,
  type KnownLinkInfo,
  type LevelDef,
  type RunSummary,
  type Truth,
  EXAMPLE,
  PRACTICE,
  khzToFtc,
  pr,
  shortCodeTruth,
} from './types';

// Like levels 2 and 3, the link is given, not measured.
export const level4Truth = shortCodeTruth;

export const TONE_FTC = 0.05; // the tone of B1 to B3, in cycles per chip: 50 kHz at 1 Mcps
export const toneKhzAt = (chipRateMcps: number): number => TONE_FTC * chipRateMcps * 1000;

// The example link's Eb/N0 and J/S for the tone sweep and C1.
export const EX_EBN0_DB = 8;
export const EX_JS_DB = 10;

// J/S of the long-code runs in B2 and B3: broadband Eb/J0 about 5 dB, in whole dB.
export const longJsOf = (gpDb: number): number => Math.round(gpDb - 5);

const shown1 = (v: number) => Number(v.toFixed(1));
const trim1 = (v: number) => String(Number(v.toFixed(1)));
const sig3 = (v: number) => String(Number(v.toPrecision(3)));
const N30 = undb(30);

// The line spacing of a short code is the bit rate: chip rate / chips per bit, in kHz.
export const lineSpacingKhz = (chipRateMcps: number, n: number): number => (chipRateMcps * 1000) / n;

// A tone is accepted in C3 when it sits within a quarter of the line spacing of a line k x spacing, k >= 1, and
// no further out than half the chip rate.
export const offsetOk = (khz: number, t: Truth): boolean => {
  const k = Math.round(khz / t.bitRateKbps);
  return k >= 1 && Math.abs(khz - k * t.bitRateKbps) <= t.bitRateKbps / 4 + 1e-9 && khz <= t.chipRateMcps * 500;
};

// D2 and D3 numbers. D2: 16 tones first, then seeded from the list. D3: by the level seed.
const D2_Q = [2, 4, 10, 20, 32];
export const FIRST_PRACTICE_Q = 16;
export function practiceQAt(counter: number): number {
  if (counter === 0) return FIRST_PRACTICE_Q;
  const rng = createRng((Math.imul(counter, 0x2f0b4a27) ^ 0x1b873593) >>> 0);
  return D2_Q[Math.floor(rng() * D2_Q.length)];
}
const PEAK_LIMITS = [20, 22, 25];
const D3_Q = [4, 8, 10, 16];
export function d3Numbers(t: Truth): { peakLimit: number; q: number } {
  const rng = createRng(t.seed ^ 0x6a09e667);
  return { peakLimit: PEAK_LIMITS[Math.floor(rng() * PEAK_LIMITS.length)], q: D3_Q[Math.floor(rng() * D3_Q.length)] };
}
const paprDbOf = (q: number) => 10 * Math.log10(q);

// BERs for a link at a receiver Eb/N0 and J/S: the carrier tone, a tone on the first line (phase-averaged) and broadband noise.
export function toneBers(degree: number, ebN0Db: number, jsDb: number): { carrier: number; line: number; bbn: number } {
  const code = mSequence(degree);
  const n = code.length;
  const eb = undb(ebN0Db);
  const js = undb(jsDb);
  return {
    carrier: berToneShortCode(eb, js, code, 0),
    line: berToneShortCode(eb, js, code, 1 / n),
    bbn: berBpskJammed(eb, n / js),
  };
}

export const exampleBers = () => toneBers(EXAMPLE.degree, EX_EBN0_DB, EX_JS_DB);

// Theory BER of the long-code tone runs (receiver noise negligible, 30 dB).
const longToneBer = (gp: number, jsDb: number) => berToneLongCode(N30, gp, undb(jsDb), TONE_FTC);

const ctxJs = (ctx: Ctx) => ctx.practiceJsDb ?? longJsOf(pr(ctx).gpDb);

// Placeholder values. jsDb and ebN0 are for the scene the level started with; a run in the shown step supplies the
// prediction, the measurement and what the player entered.
export function level4Values(
  t: Truth,
  base: { jsDb: number; ebN0Db: number },
  practice: KnownLinkInfo,
  practiceN: number,
  practiceJsDb: number,
  run?: { prediction?: number; summary?: RunSummary; fields?: Record<string, { value: number }> },
): Record<string, string> {
  const jsB = longJsOf(t.gpDb);
  const ebJ0B = shown1(t.gpDb) - jsB;
  const pEbJ0 = shown1(practice.gpDb) - practiceJsDb;
  const pQ = practiceQAt(practiceN);
  const { peakLimit, q } = d3Numbers(t);
  const papr = shown1(paprDbOf(q));
  const ex = exampleBers();
  const here = toneBers(t.degree, base.ebN0Db, base.jsDb);
  const offset = run?.fields?.offset?.value;
  const peaks = { random: peakSet('random').paprDb, newman: peakSet('newman').paprDb };
  return {
    n: String(t.n),
    chipRate: trim1(t.chipRateMcps),
    bitRate: sig3(t.bitRateKbps),
    line2: sig3(2 * t.bitRateKbps),
    line3: sig3(3 * t.bitRateKbps),
    maxKhz: String(t.chipRateMcps * 500),
    gpDb: t.gpDb.toFixed(1),
    jsDb: base.jsDb.toFixed(1),
    ebN0: base.ebN0Db.toFixed(1),
    toneKhz: trim1(toneKhzAt(t.chipRateMcps)),
    jsB: String(jsB),
    ebJ0B: ebJ0B.toFixed(1),
    berB: berText(berBpsk(undb(ebJ0B))),
    carrierBer: berText(here.carrier),
    bbnBer: berText(here.bbn),
    lineBer: berText(here.line),
    yourKhz: offset !== undefined ? String(offset) : '-',
    yourToneBer: run?.summary ? berText(run.summary.theoryBer) : '-',
    pN: String(practice.n),
    pChipRate: trim1(practice.chipRateMcps),
    pChipRateK: String(practice.chipRateMcps * 1000),
    pBitRate: sig3(practice.bitRateKbps),
    pGpDb: practice.gpDb.toFixed(1),
    pJsDb: String(practiceJsDb),
    pEbJ0: pEbJ0.toFixed(1),
    pBer: berText(berBpsk(undb(pEbJ0))),
    pToneKhz: trim1(toneKhzAt(practice.chipRateMcps)),
    pQ: String(pQ),
    pPapr: paprDbOf(pQ).toFixed(1),
    peakLimit: String(peakLimit),
    q: String(q),
    papr: papr.toFixed(1),
    maxAvg: (peakLimit - papr).toFixed(1),
    exEbN0: String(EX_EBN0_DB),
    exJs: String(EX_JS_DB),
    exCarrierBer: berText(ex.carrier),
    exNoJamBer: berText(berBpsk(undb(EX_EBN0_DB))),
    exLineBer: berText(ex.line),
    exBbnBer: berText(ex.bbn),
    paprRandom: peaks.random.toFixed(1),
    paprNewman: peaks.newman.toFixed(1),
    yourPrediction: run?.prediction !== undefined ? berText(run.prediction) : '-',
    measuredBer: run?.summary ? berText(run.summary.ber) : '-',
    lo: run?.summary ? berText(run.summary.lo) : '-',
    hi: run?.summary ? berText(run.summary.hi) : '-',
  };
}

const BBN = { kind: 'bbn' } as const;
const TONE_50K = { kind: 'tone', fTc: TONE_FTC } as const;

const C3: ApplyStep = {
  kind: 'apply',
  id: 'C3',
  title: 'Your turn: place the tone',
  instruments: [],
  runUnscored: true,
  run: {
    link: 'hidden',
    js: 'scene',
    code: 'short',
    jammer: { kind: 'tone', fTc: 0.5 },
    jammerFrom: (v, _n, rate) => ({ kind: 'tone', fTc: khzToFtc(v.offset, rate) }),
    jammerNote: (v) => `Tone at +${v.offset} kHz from the carrier.`,
  },
  task: "Your tone jams the enemy link at the scene's J/S = {jsDb} dB. Find the line spacing, then choose where to put the tone and press Run. The run is not scored.",
  fields: [
    {
      id: 'spacing',
      label: 'Line spacing',
      unit: 'kHz',
      group: 1,
      prompt: 'The enemy link has {n} chips per bit at {chipRate} Mcps. How far apart are its lines?',
      truth: (t) => t.bitRateKbps,
      check: { rel: 0.03 },
      points: 15,
    },
    {
      id: 'offset',
      label: 'Tone offset',
      unit: 'kHz',
      group: 2,
      prompt: 'Enter its offset from the carrier, from 0 to {maxKhz} kHz. Put it on a line.',
      truth: (t) => t.bitRateKbps,
      check: { abs: 0 },
      accept: (v, _truth, t) => offsetOk(v, t),
      range: { min: 0, max: 1000, maxKey: 'maxKhz', message: 'Enter an offset between 0 and {maxKhz} kHz.' },
      points: 20,
    },
  ],
  reveal: [
    'Lines sit at {bitRate}, {line2}, {line3} kHz …',
    'Your tone at {yourKhz} kHz: theory {yourToneBer} (phase-averaged), measured {measuredBer}. Broadband noise at the same J/S: {bbnBer}. On the carrier: {carrierBer}.',
  ],
};

export const LEVEL_4: LevelDef = {
  id: 4,
  title: 'Tones',
  intro:
    'A tone is the simplest jammer: all its power on one frequency. In this level you find out what despreading does to a tone, why against some links it matters exactly where you put it, and why many tones at once worry a receiver.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  practiceJs: (_counter, link) => longJsOf(link.gpDb),
  units: [
    {
      id: 'A',
      title: 'A tone',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'All the power on one frequency',
          visual: { kind: 'toneSpectrum' },
          paragraphs: [
            'A tone jammer transmits a single steady frequency. On the spectrum it is one tall spike: all its power in one place, where noise spreads its power over the band.',
            "J/S works the same way: the tone's power over the signal's power at the enemy receiver. Here J/S = 10 dB, so the spike carries 10 times the signal's power.",
          ],
          check: {
            question: "A tone arrives at J/S = 13 dB. How many times the signal's power is that, roughly?",
            unit: 'times',
            answer: 20,
            tol: { abs: 1 },
            wrong: '13 dB = 10 dB + 3 dB: 10 times, then doubled.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'A tone against a long code',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: the code turns the tone into noise',
          visual: {
            kind: 'berRunDemo',
            variants: [
              { label: 'broadband noise', jammer: BBN, code: 'long' },
              { label: 'a tone at +50 kHz', jammer: TONE_50K, code: 'long' },
            ],
          },
          paragraphs: [
            'Some links use a long code: a code much longer than a bit, so every bit is spread by a different stretch of it.',
            'The receiver multiplies everything by the code. A steady tone multiplied by an ever-changing code comes out as noise, spread over the band like broadband noise.',
            'Run both. Theory: broadband noise 0.0065, the tone 0.0063.',
          ],
          rule: 'Against a long code, a tone does about what broadband noise of the same power does.',
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it: predict, then measure',
          link: 'practice',
          visual: { kind: 'berCurve', mark: 'practice' },
          run: { link: 'practice', js: 'fixed', code: 'long', jammer: TONE_50K },
          task: 'The practice link uses a long code. A tone at +{pToneKhz} kHz arrives at J/S = {pJsDb} dB. Predict the BER, then press Run.',
          hint: 'Treat the tone like broadband noise: Eb/J0 = {pGpDb} − {pJsDb}, then read the table.',
          fields: [
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (_t, ctx) => longToneBer(pr(ctx).gp, ctxJs(ctx)),
              check: { factor: 2 },
              points: 0,
              fullWithinFactor: 2,
            },
          ],
          worked: ['Eb/J0 = {pGpDb} − {pJsDb} = {pEbJ0} dB → about {pBer}.', 'The measured tone lands close to that.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'Your turn',
          instruments: [],
          visual: { kind: 'berCurve' },
          // The receiver's own noise is left out, as on the practice link, so the table gives the BER.
          run: { link: 'hidden', js: 'fixed', jsDbFrom: (t) => longJsOf(t.gpDb), code: 'long', ebN0Db: 30, jammer: TONE_50K },
          task: 'The enemy link switches to a long code, still {n} chips per bit. Your tone at +{toneKhz} kHz arrives at J/S = {jsB} dB. Predict the BER, then press Run. The receiver\'s own noise is negligible here.',
          fields: [
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (t) => longToneBer(t.gp, longJsOf(t.gpDb)),
              check: { factor: 2 },
              points: 20,
              fullWithinFactor: 2,
            },
          ],
          reveal: ['Treated as broadband noise: Eb/J0 = {gpDb} − {jsB} = {ebJ0B} dB → {berB}.', 'Measured: {measuredBer} (range {lo} to {hi}).'],
        },
      ],
    },
    {
      id: 'C',
      title: 'A tone against a short code: keep off the carrier',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: keep off the carrier',
          visual: { kind: 'toneSweep' },
          paragraphs: [
            'A short code repeats every bit, so its spectrum is made of thin lines one bit rate apart: the fine bumps you saw in level 1. For the example link that is 1000 kHz ÷ 31 = 32.3 kHz.',
            'The code has almost as many +1 chips as −1 chips, so on the carrier itself it has almost nothing. A tone there is wiped out by despreading: {exCarrierBer}, against {exNoJamBer} with no jammer at all.',
            'On one of the lines the tone does about what broadband noise of the same power does: {exLineBer} on the first line, against {exBbnBer} for noise. Between the lines it does less, because the code has less there.',
            "One difference: the tone meets the code the same way in every bit, so a single run's result depends on the tone's phase. Run the first-line tone a few times and watch it swing around the average.",
          ],
          rule: 'Against a short code a tone does no better than broadband noise. On the carrier it does almost nothing, and between the lines less: put it on a line.',
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'The practice link has {pN} chips per bit at {pChipRate} Mcps. How far apart are its lines, in kHz?',
          hint: 'Line spacing = bit rate = chip rate ÷ chips per bit.',
          fields: [
            {
              id: 'spacing',
              label: 'Line spacing',
              unit: 'kHz',
              truth: (_t, ctx) => pr(ctx).bitRateKbps,
              check: { rel: 0.03 },
              points: 0,
            },
          ],
          worked: ['Line spacing = {pChipRateK} ÷ {pN} = {pBitRate} kHz.'],
        },
        C3,
      ],
    },
    {
      id: 'D',
      title: 'Many tones',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: peaks',
          visual: { kind: 'peaks' },
          paragraphs: [
            'A jammer can send many tones at once. Their powers add up on average, but when the tones line up in phase their peaks add up too: 8 tones in phase give peaks 8 times the average power.',
            'Peak-to-average ratio, PAPR, measures that: 8 times is 9.0 dB. With random phases it is lower (about {paprRandom} dB here), and with carefully chosen phases lower still ({paprNewman} dB).',
            "Peaks matter because the receiver's first amplifier, its front end, has a limit. Peaks above it get squashed, and the wanted signal is squashed with them. Level 5 uses that.",
          ],
          check: {
            question: '8 tones in phase: how many times the average power is the peak?',
            unit: 'times',
            answer: 8,
            tol: { exact: true },
            wrong: 'In phase, the peak is the number of tones times the average.',
          },
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: '{pQ} tones in phase. What is their PAPR in dB?',
          hint: 'PAPR in dB = 10 × log10(number of tones).',
          fields: [
            {
              id: 'papr',
              label: 'PAPR',
              unit: 'dB',
              truth: (_t, ctx) => paprDbOf(practiceQAt(ctx.practiceN ?? 0)),
              check: { abs: 0.2 },
              points: 0,
            },
          ],
          worked: ['PAPR = 10 × log10({pQ}) = {pPapr} dB.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'Your turn',
          instruments: [],
          task:
            "The enemy receiver's front end overloads when the jammer's peaks reach J/S = {peakLimit} dB. Your jammer sends {q} tones in phase. What is the highest average J/S you can use without overloading it?",
          fields: [
            {
              id: 'avgJs',
              label: 'Average J/S',
              unit: 'dB',
              truth: (t) => d3Numbers(t).peakLimit - paprDbOf(d3Numbers(t).q),
              check: { abs: 0.3 },
              points: 15,
            },
          ],
          reveal: ['PAPR = 10 × log10({q}) = {papr} dB.', 'Highest average J/S = {peakLimit} − {papr} = {maxAvg} dB.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'Check your understanding',
      steps: [
        {
          kind: 'questions',
          id: 'E1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'Against a long code, a tone jammer does about the same damage as:',
              options: ['Broadband noise of the same power', 'Nothing at all', 'Ten times broadband noise'],
              correct: 0,
              explain: 'The long code turns the tone into noise during despreading, so it acts like broadband noise of the same power.',
              points: 10,
            },
            {
              id: 'q2',
              text: 'Against a short code, where should a tone NOT go?',
              options: ['Exactly on the carrier, where the code has almost nothing', "On one of the code's lines", 'Anywhere inside the main hump'],
              correct: 0,
              explain: "The code's +1 and −1 chips almost cancel on the carrier, so despreading wipes out a tone there. Anywhere else it does about what noise does.",
              points: 10,
            },
            {
              id: 'q3',
              text: 'Why do 8 tones in phase worry a receiver more than one tone of the same average power?',
              options: [
                'Their peaks are 8 times the average and can overload the front end',
                'They carry more average power',
                'They are easier for the receiver to filter out',
              ],
              correct: 0,
              explain: 'Same average power, but peaks 9 dB higher, and the front end reacts to peaks.',
              points: 10,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    "A long code turns a tone into noise, so the tone does what broadband noise of the same power does. Against a short code it did no better than noise either, and on the carrier it did almost nothing. Tones are no shortcut against spread spectrum. Their real use is peaks: many tones in phase add up to peaks far above their average, and peaks are what overload a receiver's front end. Level 5 uses that.",
};
