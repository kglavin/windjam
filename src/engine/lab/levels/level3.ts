// Level 3: Where to put the power. The same average jammer power as broadband noise, as partial-band noise and
// as pulses: partial-band noise is spread out again by despreading, pulses that cover whole bits break the
// bits they hit. Every number in the texts is checked against theory.ts in level3.test.ts.
import { createRng } from '../../rng';
import { berBpsk, undb } from '../theory';
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
  pr,
  shortCodeTruth,
} from './types';

// Like level 2, the link is given, not measured.
export const level3Truth = shortCodeTruth;

export const PULSE_DUTY = 0.1; // the duty used in the worked example and in C3
export const PULSE_PERIOD_BITS = 10; // the pulse period in bits for C3 and, where it fits, E3
export const BEST_PULSE_EBJ0 = 0.7; // Eb/J0 during the best pulse as a ratio (-1.5 dB)
export const DUTY_RANGE = { min: 0.01, max: 1, message: 'Enter the duty cycle as a fraction between 0.01 and 1, for example 0.07.' };

// J/S of the partial-band run in B2: Eb/J0 about 5 dB, in whole dB.
export const jsBOf = (t: Truth): number => Math.round(t.gpDb - 5);

// The best duty for a broadband Eb/J0 (as a ratio): each pulse just strong enough to break the bits it hits.
export const bestDuty = (ebJ0Ratio: number): number => Math.min(1, BEST_PULSE_EBJ0 / ebJ0Ratio);

// E3's pulses: whole bits, 10 bits per period unless the pulse would then be shorter than one bit.
export const e3PeriodBits = (duty: number): number => Math.max(PULSE_PERIOD_BITS, Math.ceil(1 / duty - 1e-9));

const PRACTICE_JS_DB = [4, 5, 6, 7, 8, 9, 10];
export const FIRST_PRACTICE_JS3_DB = 8;
const shown1 = (v: number) => Number(v.toFixed(1));

// The practice J/S for a "Try another" counter: 8 dB for the first link, then seeded from the whole-dB values
// that leave the broadband Eb/J0 between 8 and 11 dB.
export function practiceJs3At(counter: number, link: KnownLinkInfo): number {
  if (counter === 0) return FIRST_PRACTICE_JS3_DB;
  const ok = PRACTICE_JS_DB.filter((js) => shown1(link.gpDb) - js >= 8 && shown1(link.gpDb) - js <= 11);
  const rng = createRng((Math.imul(counter, 0x27d4eb2f) ^ 0x165667b1) >>> 0);
  return ok[Math.floor(rng() * ok.length)];
}

const fixed = (v: number, d: number) => v.toFixed(d);
const trim1 = (v: number) => String(Number(v.toFixed(1)));
const sig2 = (v: number) => String(Number(v.toPrecision(2)));

const ctxJs = (ctx: Ctx) => ctx.practiceJsDb ?? FIRST_PRACTICE_JS3_DB;
const practiceEbJ0 = (ctx: Ctx) => pr(ctx).gpDb - ctxJs(ctx);
const ratio = (ebJ0Db: number) => undb(ebJ0Db);

// Placeholder values. jsDb, ebJ0 and the BERs are for the scene the level started with; a run in the shown step
// supplies the prediction and the measurement, and `fields` what the player entered there.
export function level3Values(
  t: Truth,
  base: { jsDb: number; ebJ0Db: number },
  practice: KnownLinkInfo,
  practiceJsDb: number,
  run?: { prediction?: number; summary?: RunSummary; fields?: Record<string, { value: number }> },
): Record<string, string> {
  // Arithmetic as printed (each dB value to 0.1 dB), so the chain in a text adds up on screen.
  const ebJ0 = shown1(t.gpDb) - shown1(base.jsDb);
  const jsB = jsBOf(t);
  const ebJ0B = shown1(t.gpDb) - jsB;
  const pEbJ0 = shown1(practice.gpDb) - practiceJsDb;
  const ebJ0x = Number(trim1(ratio(ebJ0)));
  const pEbJ0x = Number(trim1(ratio(pEbJ0)));
  const berBbn = berBpsk(undb(ebJ0));
  const berOn = berBpsk(undb(ebJ0 - 10));
  const pBerOn = berBpsk(undb(pEbJ0 - 10));
  const gain = (PULSE_DUTY * berOn) / berBbn;
  const duty = run?.fields?.duty?.value;
  return {
    n: String(t.n),
    chipRate: trim1(t.chipRateMcps),
    bitUs: trim1(t.n / t.chipRateMcps),
    gpDb: fixed(t.gpDb, 1),
    jsDb: fixed(base.jsDb, 1),
    ebJ0: fixed(ebJ0, 1),
    ebJ0on: fixed(ebJ0 - 10, 1),
    berBbn: berText(berBbn),
    berOn: berText(berOn),
    berPulsed: berText(PULSE_DUTY * berOn),
    gainX: sig2(gain),
    ebJ0x: trim1(ratio(ebJ0)),
    dutyBest: sig2(bestDuty(ebJ0x)),
    jsB: String(jsB),
    ebJ0B: fixed(ebJ0B, 1),
    berB: berText(berBpsk(undb(ebJ0B))),
    pGpDb: fixed(practice.gpDb, 1),
    pJsDb: String(practiceJsDb),
    pEbJ0: fixed(pEbJ0, 1),
    pEbJ0on: fixed(pEbJ0 - 10, 1),
    pEbJ0x: trim1(ratio(pEbJ0)),
    pBerOn: berText(pBerOn),
    pBerPulsed: berText(PULSE_DUTY * pBerOn),
    pDutyBest: sig2(bestDuty(pEbJ0x)),
    yourDuty: duty !== undefined ? String(duty) : '-',
    berYourDuty: run?.summary ? berText(run.summary.theoryBer) : '-',
    yourPrediction: run?.prediction !== undefined ? berText(run.prediction) : '-',
    measuredBer: run?.summary ? berText(run.summary.ber) : '-',
    lo: run?.summary ? berText(run.summary.lo) : '-',
    hi: run?.summary ? berText(run.summary.hi) : '-',
  };
}

const BBN = { kind: 'bbn' } as const;
const PARTIAL = { kind: 'partial', rho: 0.25 } as const;
const pulsedBits = (duty: number, bits: number) => (n: number) => ({ kind: 'pulsed' as const, duty, periodChips: bits * n });

// Eb/J0 of the scene the level started with, less the 10 dB a 10% pulse adds.
const sceneEbJ0 = (ctx: Ctx) => ctx.ebJ0Db ?? NaN;
const duty10Ber = (ebJ0Db: number) => PULSE_DUTY * berBpsk(undb(ebJ0Db - 10));

const C3: ApplyStep = {
  kind: 'apply',
  id: 'C3',
  title: 'Your turn: pulse the enemy link',
  instruments: [],
  run: {
    link: 'hidden',
    js: 'scene',
    jammer: { kind: 'pulsed', duty: PULSE_DUTY, periodChips: PULSE_PERIOD_BITS },
    jammerFrom: (_v, n) => pulsedBits(PULSE_DUTY, PULSE_PERIOD_BITS)(n),
  },
  task: "Your jammer pulses on 10% of the time at the scene's J/S = {jsDb} dB. Find Eb/J0 during a pulse, predict the BER, then press Run.",
  fields: [
    {
      id: 'during',
      label: 'Eb/J0 during a pulse',
      unit: 'dB',
      group: 1,
      truth: (_t, ctx) => sceneEbJ0(ctx) - 10,
      check: { abs: 0.5 },
      points: 10,
    },
    {
      id: 'ber',
      label: 'Predicted BER',
      unit: '',
      group: 2,
      kind: 'predictBer',
      truth: (_t, ctx) => duty10Ber(sceneEbJ0(ctx)),
      check: { factor: 2 },
      points: 15,
    },
  ],
  reveal: [
    'Broadband Eb/J0 = {gpDb} − {jsDb} = {ebJ0} dB, broadband BER {berBbn}.',
    'During a pulse: {ebJ0} − 10 = {ebJ0on} dB → BER {berOn}; overall 0.1 × {berOn} = {berPulsed}.',
    'Measured: {measuredBer} (range {lo} to {hi}). Pulsing did {gainX} times the damage of broadband noise.',
  ],
};

export const LEVEL_3: LevelDef = {
  id: 3,
  title: 'Where to put the power',
  intro:
    "Your jammer has a fixed average power. In level 2 you spread it as broadband noise. Here you try squeezing the same power into part of the band, or into short bursts, and find out which one the enemy link's despreading cannot shrug off.",
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  practiceJs: practiceJs3At,
  units: [
    {
      id: 'A',
      title: 'Same power, three shapes',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Three ways to spend the same power',
          visual: { kind: 'threeJammers' },
          paragraphs: [
            'All three jammers have the same average power.',
            'Broadband noise spreads it over the whole band, all the time. Partial-band noise squeezes it into a quarter of the band, so it is 4 times stronger there. Pulsed noise squeezes it into short bursts, on 10% of the time, so it is 10 times stronger while it is on.',
          ],
          check: {
            question: 'A pulsed jammer is on 20% of the time with the same average power as a steady one. How many times stronger is it while it is on?',
            unit: 'times',
            answer: 5,
            tol: { exact: true },
            wrong: 'Same energy in a fifth of the time: 1 ÷ 0.2 = 5 times.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Partial-band noise',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: a quarter of the band',
          visual: {
            kind: 'berRunDemo',
            variants: [
              { label: 'broadband', jammer: BBN },
              { label: 'a quarter of the band', jammer: PARTIAL },
            ],
          },
          paragraphs: ['Run both. Theory says broadband noise gives 0.0065 and the quarter-band jammer about 0.0061.'],
          steps: [
            'The quarter-band jammer is 4 times stronger inside its quarter of the band.',
            "But the receiver multiplies everything by the code. That spreads the jammer's narrow noise back over the whole band, just as it would spread broadband noise.",
            'So at the same J/S the two do about the same damage.',
          ],
          rule: 'Squeezing noise into part of the band does not help against spread spectrum.',
        },
        {
          kind: 'apply',
          id: 'B2',
          title: 'Your turn',
          instruments: [],
          visual: { kind: 'berCurve' },
          run: { link: 'hidden', js: 'fixed', jsDbFrom: jsBOf, jammer: PARTIAL },
          task: "The jammer squeezes its noise into a quarter of the band at J/S = {jsB} dB. Predict the enemy link's BER, then press Run.",
          hint: 'Treat it like broadband noise: Eb/J0 = Gp − J/S = {gpDb} − {jsB}, then read the table. It will do no better than broadband noise, often a little worse.',
          fields: [
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              kind: 'predictBer',
              truth: (t) => berBpsk(undb(t.gpDb - jsBOf(t))),
              check: { factor: 2 },
              points: 10,
              fullWithinFactor: 2,
            },
          ],
          reveal: [
            'Eb/J0 = {gpDb} − {jsB} = {ebJ0B} dB → broadband theory {berB}.',
            'Measured with a quarter of the band: {measuredBer} (range {lo} to {hi}).',
            'Squeezed into part of the band, the noise did no better than broadband noise: despreading spread it back out.',
          ],
        },
      ],
    },
    {
      id: 'C',
      title: 'Pulsed noise',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: the same power in bursts',
          visual: {
            kind: 'berCurve',
            marks: [
              { db: 9.9, label: 'broadband 9.9 dB' },
              { db: -0.1, label: 'in-pulse −0.1 dB' },
            ],
          },
          paragraphs: [
            'The example link (Gp 14.9 dB) faces J/S = 5 dB. Broadband noise gives Eb/J0 = 14.9 − 5 = 9.9 dB: BER 0.0000049, about 5 wrong bits in a million. The link shrugs it off.',
            'Now the same average power in pulses, on 10% of the time, each pulse covering whole bits.',
          ],
          steps: [
            'On 10% of the time, so 10 times (10 dB) stronger while on.',
            'Bits hit by a pulse see Eb/J0 = 9.9 − 10 = −0.1 dB: BER 0.081.',
            'Bits between pulses see no jamming at all.',
            'Overall BER = 0.1 × 0.081 = 0.0081, more than 1000 times worse than broadband noise.',
          ],
          rule: 'Pulses hurt when the link has margin: each pulse breaks the bits it hits, while broadband noise is too weak to break any.',
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task:
            'The practice link has Gp = {pGpDb} dB and J/S = {pJsDb} dB; the jammer pulses on 10% of the time. Find Eb/J0 during a pulse, then the overall BER.',
          hint: 'During a pulse: Gp − J/S − 10. Overall: 0.1 × the BER at that Eb/J0.',
          fields: [
            {
              id: 'during',
              label: 'Eb/J0 during a pulse',
              unit: 'dB',
              group: 1,
              truth: (_t, ctx) => practiceEbJ0(ctx) - 10,
              check: { abs: 0.2 },
              points: 0,
            },
            {
              id: 'ber',
              label: 'Overall BER',
              unit: '',
              group: 2,
              truth: (_t, ctx) => duty10Ber(practiceEbJ0(ctx)),
              check: { factor: 1.5 },
              points: 0,
            },
          ],
          worked: [
            'Broadband Eb/J0 = {pGpDb} − {pJsDb} = {pEbJ0} dB.',
            'During a pulse: {pEbJ0} − 10 = {pEbJ0on} dB → BER {pBerOn}.',
            'Overall: 0.1 × {pBerOn} = {pBerPulsed}.',
          ],
        },
        C3,
      ],
    },
    {
      id: 'D',
      title: 'Pulses must cover whole bits',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: long pulses or short ones',
          visual: {
            kind: 'berRunDemo',
            variants: [
              { label: 'pulses one bit long', jammer: { kind: 'pulsed', duty: PULSE_DUTY, periodChips: 310 } },
              { label: 'pulses one chip long', jammer: { kind: 'pulsed', duty: PULSE_DUTY, periodChips: 10 } },
            ],
          },
          paragraphs: ['Both jammers are on 10% of the time at the same power. Run both.'],
          steps: [
            'Pulses one bit long (31 µs every 310 µs) break the bits they hit: BER about 0.022.',
            'Pulses one chip long (1 µs every 10 µs) land three times inside every bit. The receiver adds up all 31 chips of a bit, so each bit sees the average of the pulses and the quiet chips: just like broadband noise, BER about 0.0065.',
          ],
          rule: 'A pulse must last at least one whole bit, or the receiver averages it away.',
          check: {
            question: "The example link's bits are 31 chips at 1 Mcps. How long must a pulse last, at least, in µs?",
            unit: 'µs',
            answer: 31,
            tol: { exact: true },
            wrong: 'Bit length = chips per bit ÷ chip rate = 31 ÷ 1 Mcps = 31 µs.',
          },
        },
        {
          kind: 'apply',
          id: 'D2',
          title: 'Your turn',
          instruments: [],
          task: 'The enemy link has {n} chips per bit at {chipRate} Mcps. How long is one of its bits, in µs?',
          fields: [
            {
              id: 'bitUs',
              label: 'Bit length',
              unit: 'µs',
              truth: (t) => t.n / t.chipRateMcps,
              check: { rel: 0.02 },
              points: 10,
            },
          ],
          reveal: ['Bit length = {n} ÷ {chipRate} Mcps = {bitUs} µs. Your pulses must last at least that long.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'The best duty cycle',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: how short should the pulses be?',
          visual: { kind: 'berCurve', marks: [{ db: -1.5, label: 'in-pulse −1.5 dB' }] },
          paragraphs: [
            'Shorter pulses are stronger but hit fewer bits. The best pulse is just strong enough to break the bits it hits, which happens when Eb/J0 during the pulse is about −1.5 dB. Any stronger is wasted on bits that were already broken.',
          ],
          steps: [
            "The example's broadband Eb/J0 is 9.9 dB, a ratio of 9.8.",
            'Best duty = 0.7 ÷ 9.8 = 0.071, so on about 7% of the time.',
            'Overall BER ≈ 0.083 ÷ 9.8 = 0.0085, a little better than the 0.0081 at 10%.',
          ],
          rule: 'Best duty ≈ 0.7 ÷ (broadband Eb/J0 as a ratio). If that comes out above 1, jam all the time.',
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: "The practice link's broadband Eb/J0 is {pEbJ0} dB. What duty cycle is best?",
          hint: 'Turn dB into a ratio first: 10^(dB ÷ 10). Then 0.7 ÷ ratio.',
          fields: [
            {
              id: 'duty',
              label: 'Duty cycle',
              unit: '',
              prompt: 'Enter it as a fraction, e.g. 0.07.',
              truth: (_t, ctx) => bestDuty(ratio(practiceEbJ0(ctx))),
              check: { factor: 1.3 },
              points: 0,
              range: DUTY_RANGE,
            },
          ],
          worked: ['{pEbJ0} dB is a ratio of {pEbJ0x}.', 'Best duty = 0.7 ÷ {pEbJ0x} = {pDutyBest}.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'Your turn: tune the pulses',
          instruments: [],
          run: {
            link: 'hidden',
            js: 'scene',
            jammer: { kind: 'pulsed', duty: PULSE_DUTY, periodChips: PULSE_PERIOD_BITS },
            jammerFrom: (v, n) => ({ kind: 'pulsed', duty: v.duty, periodChips: e3PeriodBits(v.duty) * n }),
            jammerNote: (v) =>
              e3PeriodBits(v.duty) > PULSE_PERIOD_BITS
                ? `At duty ${v.duty}, a pulse in a ${PULSE_PERIOD_BITS}-bit period would be shorter than one bit. The run uses a period of ${e3PeriodBits(v.duty)} bits, so each pulse lasts one bit.`
                : undefined,
          },
          task: 'Choose the duty cycle for the enemy link at J/S = {jsDb} dB, predict the BER, then press Run.',
          fields: [
            {
              id: 'duty',
              label: 'Duty cycle',
              unit: '',
              group: 1,
              prompt: 'Enter it as a fraction, e.g. 0.07.',
              truth: (_t, ctx) => bestDuty(ratio(sceneEbJ0(ctx))),
              check: { factor: 1.5 },
              points: 10,
              range: DUTY_RANGE,
            },
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              group: 2,
              kind: 'predictBer',
              truth: (_t, ctx) => duty10Ber(sceneEbJ0(ctx)),
              check: { factor: 2 },
              points: 15,
            },
          ],
          reveal: [
            'Broadband Eb/J0 {ebJ0} dB is a ratio of {ebJ0x}; best duty = 0.7 ÷ {ebJ0x} = {dutyBest}.',
            'At your duty {yourDuty}: theory {berYourDuty}, measured {measuredBer} (range {lo} to {hi}).',
          ],
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
              text: 'With the same average power, which hurts a spread-spectrum link with margin the most?',
              options: [
                'Pulses that each cover whole bits',
                'Noise squeezed into a quarter of the band',
                'Steady broadband noise',
              ],
              correct: 0,
              explain:
                'Despreading spreads partial-band noise back over the band. Pulses put the power on a few bits and break them, while steady noise is too weak to break any.',
              points: 10,
            },
            {
              id: 'q2',
              text: 'Your pulses last a quarter of a bit, several per bit. What happens?',
              options: [
                'The receiver averages them over each bit, so they act like broadband noise',
                'They break every bit they touch',
                'They do nothing at all',
              ],
              correct: 0,
              explain: 'The receiver adds up all the chips of a bit before deciding. Short pulses are averaged with the quiet chips around them.',
              points: 10,
            },
            {
              id: 'q3',
              text: 'The broadband Eb/J0 is 13 dB, a ratio of 20. What duty cycle is best?',
              options: ['About 0.035, on 3.5% of the time', '1, on all the time', '0.5, on half the time'],
              correct: 0,
              explain: 'Best duty ≈ 0.7 ÷ 20 = 0.035: each pulse is then just strong enough to break the bits it hits.',
              points: 10,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'At the same average power, squeezing the noise into part of the band did no better than broadband noise, because despreading spreads it out again. Squeezing it into pulses that cover whole bits did {gainX} times the damage against your enemy link, and the best pulses are just strong enough to break the bits they hit: duty ≈ 0.7 ÷ Eb/J0. In level 4 you try single tones.',
};
