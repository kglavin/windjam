// Level 2: Processing gain. A broadband noise jammer against a long-enough code: Eb/J0 = Gp - J/S, the BER
// that follows, and the J/S that breaks the link. Every number in the texts is checked against theory.ts in
// level2.test.ts.
import { createRng } from '../../rng';
import { berBpsk, undb } from '../theory';
import {
  type Ctx,
  type KnownLinkInfo,
  type LevelDef,
  type RunSummary,
  type Truth,
  EXAMPLE,
  PRACTICE,
  pr,
  shortCodeTruth,
} from './types';

// Level 2 uses the same kind of link as level 1, but it is given, not measured.
export const level2Truth = shortCodeTruth;

// J/S offset that gives the jammer's goal: BER 0.1 needs Eb/J0 = -0.9 dB.
export const BREAK_EBJ0_DB = -0.9;
export const BREAK_BER = 0.1;

// Rows of the BER table beside the curve (Eb/J0 in dB).
export const BER_TABLE_DB = [-0.9, 0, 2, 4, 4.3, 6, 6.8, 8, 9.6];

// A BER as plain decimals to 2 significant figures: 0.0065, 0.00099, 0.0000097.
export function berText(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v === 0) return '0';
  return v < 1e-6 ? v.toExponential(1) : v.toPrecision(2);
}

export const berTable = (): { db: number; ber: number; text: string }[] =>
  BER_TABLE_DB.map((db) => {
    const ber = berBpsk(undb(db));
    return { db, ber, text: berText(ber) };
  });

// Table rows either side of an Eb/J0: the last row below it and the first row at or above it.
export function tableRowsAround(ebJ0Db: number): { lo: number; hi: number } {
  const below = BER_TABLE_DB.filter((d) => d < ebJ0Db);
  const above = BER_TABLE_DB.filter((d) => d >= ebJ0Db);
  return { lo: below.length ? below[below.length - 1] : BER_TABLE_DB[0], hi: above.length ? above[0] : BER_TABLE_DB[BER_TABLE_DB.length - 1] };
}

const PRACTICE_JS_DB = [6, 9, 12, 15];
export const FIRST_PRACTICE_JS_DB = 12;

// The practice J/S for a "Try another" counter: 12 dB for the first link, then seeded from {6, 9, 12, 15} dB,
// limited to the J/S that leave a BER the meter can count within 300,000 bits (Eb/J0 from -0.9 to 9.6 dB).
export function practiceJsAt(counter: number, link: KnownLinkInfo): number {
  if (counter === 0) return FIRST_PRACTICE_JS_DB;
  const ok = PRACTICE_JS_DB.filter((js) => link.gpDb - js >= BREAK_EBJ0_DB && link.gpDb - js <= 9.6);
  const rng = createRng((Math.imul(counter, 0x85ebca6b) ^ 0x2545f491) >>> 0);
  return ok[Math.floor(rng() * ok.length)];
}

const fixed = (v: number, d: number) => v.toFixed(d);
const trim1 = (v: number) => String(Number(v.toFixed(1)));
// Differences and sums of the dB values as printed, so the arithmetic in a text adds up on screen.
const shown1 = (v: number) => Number(fixed(v, 1));

const ctxJs = (ctx: Ctx) => ctx.practiceJsDb ?? FIRST_PRACTICE_JS_DB;
const practiceEbJ0 = (ctx: Ctx) => pr(ctx).gpDb - ctxJs(ctx);

// Placeholder values. jsDb, ebJ0 and ber are for the scene the level started with; a run in the shown step
// overrides jsDb and supplies the prediction and the measurement.
export function level2Values(
  t: Truth,
  base: { jsDb: number; ebJ0Db: number },
  practice: KnownLinkInfo,
  practiceJsDb: number,
  run?: { prediction?: number; summary?: RunSummary },
): Record<string, string> {
  const pEbJ0 = practice.gpDb - practiceJsDb;
  const around = tableRowsAround(pEbJ0);
  const js = run?.summary?.jsDb ?? base.jsDb;
  return {
    n: String(t.n),
    gpDb: fixed(t.gpDb, 1),
    jsDb: fixed(js, 1),
    ebJ0: fixed(shown1(t.gpDb) - shown1(base.jsDb), 1),
    ber: berText(berBpsk(undb(base.ebJ0Db))),
    jsNeeded: fixed(shown1(t.gpDb) + 0.9, 1),
    pN: String(practice.n),
    pGpDb: fixed(practice.gpDb, 1),
    pJsDb: trim1(practiceJsDb),
    pEbJ0: fixed(shown1(practice.gpDb) - practiceJsDb, 1),
    pBer: berText(berBpsk(undb(pEbJ0))),
    pLoDb: trim1(around.lo),
    pHiDb: trim1(around.hi),
    pJsNeeded: fixed(shown1(practice.gpDb) + 0.9, 1),
    yourPrediction: run?.prediction !== undefined ? berText(run.prediction) : '-',
    measuredBer: run?.summary ? berText(run.summary.ber) : '-',
    lo: run?.summary ? berText(run.summary.lo) : '-',
    hi: run?.summary ? berText(run.summary.hi) : '-',
  };
}

const BBN = { kind: 'bbn' } as const;

export const LEVEL_2: LevelDef = {
  id: 2,
  title: 'Processing gain',
  intro:
    "A noise jammer floods the enemy link's band with noise. In this level you find out how much of that noise survives the enemy receiver's despreading, what error rate it causes, and how much jammer power it takes to break the link.",
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'What a noise jammer does',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Jamming to signal ratio',
          visual: { kind: 'jammedSpectra' },
          paragraphs: [
            "A noise jammer transmits random noise across the whole band the link uses.",
            "J/S, the jamming to signal ratio, compares the jammer's power with the link's signal power at the enemy receiver, in dB. J/S = 0 dB means they are equal; J/S = +10 dB means the jammer is 10 times stronger.",
            "Left: J/S = 0 dB. The jammer's noise is about as strong as the signal's hump. Right: J/S = +10 dB. The hump is buried.",
          ],
          check: {
            question: 'At the receiver the jammer is 100 times stronger than the signal. What is J/S in dB?',
            unit: 'dB',
            answer: 20,
            tol: { exact: true },
            wrong: 'dB = 10 × log10(ratio): 10 × log10(100) = 20.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Despreading dilutes the jammer',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: what the decoder sees',
          visual: { kind: 'despreadBars', gpDb: 14.9, jsDb: 10 },
          paragraphs: [
            "The enemy receiver multiplies everything it hears by its code and adds up the chips of each bit. The signal follows the code and gains Gp. The jammer's noise does not follow the code, so it gains nothing.",
            'The example link has Gp = 14.9 dB (31 chips per bit) and the jammer arrives at J/S = 10 dB.',
          ],
          steps: [
            'Before despreading the jammer is 10 dB above the signal.',
            'Despreading lifts the signal by Gp = 14.9 dB and leaves the jammer where it was.',
            'After despreading the signal is 14.9 − 10 = 4.9 dB above the jammer. This is Eb/J0, the energy of one bit over the jammer\'s noise.',
          ],
          rule: 'Eb/J0 = Gp − J/S, in dB.',
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'despreadBars', link: 'practice' },
          task: 'The practice link has Gp = {pGpDb} dB and the jammer arrives at J/S = {pJsDb} dB. What is Eb/J0?',
          hint: 'Eb/J0 = Gp − J/S.',
          fields: [
            {
              id: 'ebJ0',
              label: 'Eb/J0',
              unit: 'dB',
              truth: (_t, ctx) => practiceEbJ0(ctx),
              check: { abs: 0.2 },
              points: 0,
            },
          ],
          worked: ['Eb/J0 = {pGpDb} − {pJsDb} = {pEbJ0} dB.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'Your turn: the enemy link',
          instruments: [],
          hiddenRows: ['Eb/J0', 'Eb/(N0+J0)'],
          task:
            'The enemy link has Gp = {gpDb} dB ({n} chips per bit). The jammer in the scene gives J/S = {jsDb} dB at the enemy receiver. What is Eb/J0?',
          fields: [
            {
              id: 'ebJ0',
              label: 'Eb/J0',
              unit: 'dB',
              truth: (_t, ctx) => ctx.ebJ0Db ?? NaN,
              check: { abs: 0.5 },
              points: 10,
            },
          ],
          reveal: ['Eb/J0 = {gpDb} − {jsDb} = {ebJ0} dB.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'From Eb/J0 to errors',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: reading the error rate',
          visual: { kind: 'berCurve', mark: 'example' },
          paragraphs: [
            'The bit error rate, BER, is the fraction of bits the receiver gets wrong. 0.1 means 1 bit in 10; 0.001 means 1 in 1000.',
            'The curve shows the BER of this kind of link against Eb/J0. More Eb/J0 means fewer errors, and the curve falls fast: every 2 dB cuts the errors by a large factor.',
          ],
          steps: [
            "The example's Eb/J0 is 4.9 dB.",
            'Between 4.3 dB (0.010) and 6 dB (0.0024) in the table, so the BER is a little under 0.01.',
            'The exact value is 0.0065: about 6 or 7 wrong bits in every 1000.',
          ],
          rule: "The jammer's goal is BER 0.1, 1 bit in 10. That needs Eb/J0 = −0.9 dB.",
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'berCurve', mark: 'practice' },
          task: "The practice link's Eb/J0 is {pEbJ0} dB. Use the table to estimate its BER.",
          hint: 'Find the two table rows either side and pick a value between them.',
          fields: [
            {
              id: 'ber',
              label: 'BER',
              unit: '',
              truth: (_t, ctx) => berBpsk(undb(practiceEbJ0(ctx))),
              check: { factor: 1.5 },
              points: 0,
            },
          ],
          worked: ['Eb/J0 = {pEbJ0} dB lies between the rows {pLoDb} dB and {pHiDb} dB.', 'The exact BER is {pBer}.'],
        },
        {
          kind: 'apply',
          id: 'C3',
          title: 'Your turn',
          instruments: [],
          task: 'Your enemy link has Eb/J0 = {ebJ0} dB (from B3). Estimate its BER.',
          fields: [
            {
              id: 'ber',
              label: 'BER',
              unit: '',
              truth: (_t, ctx) => berBpsk(undb(ctx.ebJ0Db ?? NaN)),
              check: { factor: 1.5 },
              points: 10,
            },
          ],
          reveal: ['The exact BER at {ebJ0} dB is {ber}.'],
        },
      ],
    },
    {
      id: 'D',
      title: 'Measure it',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: the BER meter',
          visual: { kind: 'berRunDemo' },
          paragraphs: [
            'The BER meter sends random bits through the jammed link and counts the errors. It stops after 100 errors, or after 300,000 bits.',
            'Press Run. The theory says 0.0065.',
            'The bar around the measured point is its 95% range. With 100 errors counted, the true BER lies within about ±20% of the measurement.',
          ],
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it: predict, then measure',
          link: 'practice',
          visual: { kind: 'none' },
          run: { link: 'practice', js: 'fixed', jammer: BBN },
          task: "Predict the practice link's BER at J/S = {pJsDb} dB, then press Run.",
          hint: 'Eb/J0 = {pGpDb} − {pJsDb} = {pEbJ0} dB; read the table.',
          fields: [
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (_t, ctx) => berBpsk(undb(practiceEbJ0(ctx))),
              check: { factor: 2 },
              points: 0,
            },
          ],
          worked: ['Eb/J0 = {pEbJ0} dB → BER {pBer}.', 'The measured value should land within its range of that.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'Your turn: predict, then measure',
          instruments: [],
          prediction: true,
          run: { link: 'hidden', js: 'scene', jammer: BBN },
          task: "Predict the enemy link's BER at the scene's J/S, then press Run.",
          fields: [
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (_t, ctx) => berBpsk(undb(ctx.ebJ0Db ?? NaN)),
              check: { factor: 2 },
              points: 20,
            },
          ],
          reveal: [
            'Predicted {yourPrediction}; measured {measuredBer} (range {lo} to {hi}).',
            'Theory at Eb/J0 = {ebJ0} dB: {ber}.',
          ],
        },
      ],
    },
    {
      id: 'E',
      title: 'How much jammer is enough',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: the J/S that breaks the link',
          visual: { kind: 'none' },
          paragraphs: ['To break the link the jammer must push the BER up to 0.1. That happens at Eb/J0 = −0.9 dB.'],
          steps: [
            'Eb/J0 = Gp − J/S, so J/S = Gp − Eb/J0.',
            'For the example link: J/S = 14.9 − (−0.9) = 15.8 dB.',
            'The jammer must arrive about 38 times stronger than the signal.',
          ],
          rule: 'J/S needed to break the link = Gp + 0.9 dB.',
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'What J/S breaks the practice link (Gp = {pGpDb} dB)?',
          hint: 'J/S needed = Gp + 0.9.',
          fields: [
            {
              id: 'jsNeeded',
              label: 'J/S',
              unit: 'dB',
              truth: (_t, ctx) => pr(ctx).gpDb - BREAK_EBJ0_DB,
              check: { abs: 0.3 },
              points: 0,
            },
          ],
          worked: ['J/S = {pGpDb} + 0.9 = {pJsNeeded} dB.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'Your turn: break the enemy link',
          instruments: [],
          editable: ['jammer', 'jamPower'],
          run: { link: 'hidden', js: 'scene', jammer: BBN },
          task: 'Break the enemy link in two parts: first work out the J/S it takes, then make it happen in the scene.',
          fields: [
            {
              id: 'jsNeeded',
              label: 'J/S needed',
              unit: 'dB',
              group: 0,
              prompt: 'The enemy link has Gp = {gpDb} dB. What J/S breaks it?',
              truth: (t) => t.gpDb - BREAK_EBJ0_DB,
              check: { abs: 1 },
              points: 15,
            },
          ],
          goal: {
            kind: 'deny',
            berAtLeast: BREAK_BER,
            points: 15,
            task:
              "Now make it happen: drag the jammer closer to the enemy receiver or raise its power until the scene's J/S reaches about {jsNeeded} dB, then press Run.",
          },
          reveal: ['J/S needed = {gpDb} + 0.9 = {jsNeeded} dB.', 'Your run: J/S {jsDb} dB, BER {measuredBer}.'],
        },
      ],
    },
    {
      id: 'F',
      title: 'Check your understanding',
      steps: [
        {
          kind: 'questions',
          id: 'F1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'A jammer gives J/S = 10 dB against a link with Gp = 20 dB. Is the link in trouble?',
              options: [
                'No: Eb/J0 = 10 dB, about 4 errors in a million bits',
                'Yes: the jammer is 10 times stronger than the signal',
                'Yes: any J/S above 0 dB breaks a link',
              ],
              correct: 0,
              explain: 'Despreading takes Gp off the jammer: Eb/J0 = 20 − 10 = 10 dB, where the BER is about 0.000004.',
              points: 10,
            },
            {
              id: 'q2',
              text: 'The enemy doubles its chips per bit, so Gp rises by 3 dB. What must the jammer do to cause the same BER?',
              options: [
                'Add 3 dB of J/S: double its power, or move closer',
                "Nothing: the jammer's power is unchanged",
                'Add 30 dB',
              ],
              correct: 0,
              explain: 'Eb/J0 = Gp − J/S. To keep Eb/J0 the same, J/S must rise by the same 3 dB.',
              points: 10,
            },
            {
              id: 'q3',
              text: 'Why does the BER meter show a range, not just one number?',
              options: [
                'It counts a limited number of errors, so the true rate is only pinned down to a band',
                "The jammer's power keeps changing",
                'The receiver adds its own noise',
              ],
              correct: 0,
              explain: 'With 100 errors counted the true BER is known to about ±20%. More errors would narrow the range.',
              points: 10,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'Broadband noise is diluted by exactly the processing gain: Eb/J0 = Gp − J/S. To break the enemy link the jammer needed J/S ≈ Gp + 0.9 = {jsNeeded} dB. In level 3 you try to do better by putting the same jammer power in a smarter place.',
};
