// Level 5: Saturation and timing. The enemy link sends every bit three times and votes; pulses must cover all
// three copies of a bit to get past the vote, and pulses strong enough to overload the front end blind the
// receiver for its recovery time. Every number in the texts is checked against theory.ts and blinding.ts in
// level5.test.ts.
import { createRng } from '../../rng';
import { planRun } from '../berRun';
import { blindBitShares, blindFraction } from '../blinding';
import type { FrontEndConfig } from '../frontend';
import type { JammerSpec } from '../jammers';
import { berBpsk, berRepetitionMajority, undb } from '../theory';
import { berText, level2Truth } from './level2';
import {
  type ApplyStep,
  type Ctx,
  type KnownLinkInfo,
  type LevelDef,
  type RunSummary,
  type Truth,
  EXAMPLE,
  PRACTICE,
  knownLinkInfo,
  pr,
  shortCodeTruth,
  FIRST_PRACTICE,
} from './types';

// Like levels 2 to 4, the link is given, not measured.
export const level5Truth = shortCodeTruth;

export const COPIES = 3;
export const EX_JS5_DB = 15; // J/S of the example runs in B1 and C1, average
export const OVERLOAD_DB = 15; // the example front end overloads at this peak J/S
export const EX_RECOVERY_COPIES = 10;
export const EX_BLIND_PERIOD = 30; // copies between overload pulses in C1
export const HIDDEN_OVERLOAD_DB = 25; // the enemy front end, a little higher so its own noise never overloads it
export const HIDDEN_PEAK_DB = 40; // the peak J/S of C3's pulses, 15 dB above the overload
export const GOAL_BER = 0.1;

const shown1 = (v: number) => Number(v.toFixed(1));
const trim1 = (v: number) => String(Number(v.toFixed(1)));
const sig2 = (v: number) => String(Number(v.toPrecision(2)));

const ex = knownLinkInfo(EXAMPLE);

// A front end that overloads at overloadDb peak J/S and is blind for `recoveryCopies` copies after the last
// overloaded chip. The limiter and the ADC sit well above the overload so only the blanking acts.
export const frontEndOf = (overloadDb: number, recoveryCopies: number, chipsPerCopy: number): FrontEndConfig => ({
  p1dbPower: undb(overloadDb + 10),
  adcFullScale: 1e4,
  overloadPower: undb(overloadDb),
  recoverySamples: recoveryCopies * chipsPerCopy,
});
export const exampleFrontEnd = (): FrontEndConfig => frontEndOf(OVERLOAD_DB, EX_RECOVERY_COPIES, ex.n);

// The demo jammers on the example link, all aligned to copy boundaries.
const BBN: JammerSpec = { kind: 'bbn' };
export const ONE_COPY: JammerSpec = { kind: 'pulsed', duty: 1 / 3, periodChips: 3 * ex.n, offsetChips: 0 };
export const WHOLE_BIT: JammerSpec = { kind: 'pulsed', duty: 1 / 3, periodChips: 9 * ex.n, offsetChips: 0 };
export const BLIND_PULSES: JammerSpec = { kind: 'pulsed', duty: 1 / EX_BLIND_PERIOD, periodChips: EX_BLIND_PERIOD * ex.n, offsetChips: 0 };

// Theory of an example run (the plan the demo uses).
export function exampleTheory(jammer: JammerSpec, frontEnd?: FrontEndConfig): number {
  return planRun(
    { link: 'example', js: 'fixed', jsDb: EX_JS5_DB, jammer, repetition: 3, frontEnd },
    { truth: level2Truth(1), example: ex, practice: FIRST_PRACTICE, practiceJsDb: EX_JS5_DB, scene: { jsDb: EX_JS5_DB, ebN0Db: 30 }, seed: 1 },
  ).theoryBer;
}

// A3: the copy error rate on the enemy link.
const COPY_BERS = [0.04, 0.06, 0.08, 0.12, 0.15];
export const copyBerOf = (t: Truth): number => COPY_BERS[Math.floor(createRng(t.seed ^ 0x2545f491)() * COPY_BERS.length)];

// A2: practice copy error rates, 0.05 first.
const P_COPY_BERS = [0.05, 0.1, 0.2, 0.02];
export function practiceCopyBerAt(counter: number): number {
  if (counter === 0) return P_COPY_BERS[0];
  const rng = createRng((Math.imul(counter, 0x3243f6a9) ^ 0x1b873593) >>> 0);
  return P_COPY_BERS[Math.floor(rng() * P_COPY_BERS.length)];
}

// C2: practice recovery, pulse and period in µs, 50, 5 and 500 first.
const P_BLIND = [
  { rec: 50, pulse: 5, period: 500 },
  { rec: 40, pulse: 10, period: 500 },
  { rec: 60, pulse: 10, period: 350 },
  { rec: 30, pulse: 5, period: 350 },
];
export function practiceBlindAt(counter: number): { rec: number; pulse: number; period: number } {
  if (counter === 0) return P_BLIND[0];
  const rng = createRng((Math.imul(counter, 0x9e3779b1) ^ 0x7f4a7c15) >>> 0);
  return P_BLIND[Math.floor(rng() * P_BLIND.length)];
}

// The enemy front end's recovery in copies, and the per-link numbers of B3 and C3.
const REC_COPIES = [6, 8, 10, 12];
export const recoveryCopiesOf = (t: Truth): number => REC_COPIES[Math.floor(createRng(t.seed ^ 0x6a09e667)() * REC_COPIES.length)];
export const copyUsOf = (t: Truth): number => t.n / t.chipRateMcps;
export const recoveryUsOf = (t: Truth): number => recoveryCopiesOf(t) * copyUsOf(t);
export const maxPeriodUsOf = (t: Truth): number => 2 * (copyUsOf(t) + recoveryUsOf(t));
export const maxPeriodCopiesOf = (t: Truth): number => 2 * (1 + recoveryCopiesOf(t));
export const hiddenFrontEnd = (t: Truth, chipsPerCopy: number): FrontEndConfig => frontEndOf(HIDDEN_OVERLOAD_DB, recoveryCopiesOf(t), chipsPerCopy);

// B3: pulses over all three copies of every third bit, at a J/S in whole dB that puts the theory at 0.005 to 0.1.
export const js5BOf = (t: Truth): number => Math.round(t.gpDb - 3);
export const wholeBitSpec = (n: number): JammerSpec => ({ kind: 'pulsed', duty: 1 / 3, periodChips: 9 * n, offsetChips: 0 });

// C3: the pulse period, in whole copies, for what the player entered in µs. A pulse is one copy.
export const periodCopiesOf = (periodUs: number, copyUs: number): number => Math.max(1, Math.round(periodUs / copyUs));
export const blindPulseSpec = (copies: number, n: number): JammerSpec => ({
  kind: 'pulsed',
  duty: 1 / copies,
  periodChips: copies * n,
  offsetChips: 0,
});
// Average J/S of pulses of one copy every `copies` copies at the fixed peak J/S.
export const avgJsOfPeriod = (copies: number): number => HIDDEN_PEAK_DB - 10 * Math.log10(copies);

// Theory of the B3 run and the quantities of its reveal, as the text prints them (each dB value to 0.1 dB).
export function b3Numbers(t: Truth): { ebJ0on: number; qOn: number; groupFail: number; berWhole: number } {
  const ebJ0on = shown1(t.gpDb) - js5BOf(t) - 4.8;
  const qOn = berBpsk(undb(ebJ0on));
  const groupFail = berRepetitionMajority(qOn, 3);
  return { ebJ0on, qOn, groupFail, berWhole: groupFail / 3 };
}
export const b3Theory = (t: Truth): number =>
  planRun(
    { link: 'hidden', js: 'fixed', jsDbFrom: js5BOf, jammer: wholeBitSpec(t.n), jammerFrom: (_v, n) => wholeBitSpec(n), repetition: 3, ebN0Db: 30 },
    { truth: t, example: ex, practice: FIRST_PRACTICE, practiceJsDb: 0, scene: { jsDb: 0, ebN0Db: 12 }, seed: 1 },
  ).theoryBer;

// Share of bits with at least two blind copies, and the BER, for a period in copies.
export const bitsLostShare = (copies: number, recoveryCopies: number): number => {
  const s = blindBitShares(copies, 1, recoveryCopies);
  return s[2] + s[3];
};

// Placeholder values. A run in the shown step supplies the prediction, the measurement and what the player entered.
export function level5Values(
  t: Truth,
  _base: { jsDb: number; ebN0Db: number },
  practice: KnownLinkInfo,
  practiceN: number,
  run?: { prediction?: number; summary?: RunSummary; fields?: Record<string, { value: number }> },
): Record<string, string> {
  const copyBer = copyBerOf(t);
  const pc = practiceCopyBerAt(practiceN);
  const pb = practiceBlindAt(practiceN);
  const b3 = b3Numbers(t);
  const copyUs = copyUsOf(t);
  const recUs = recoveryUsOf(t);
  const entered = run?.fields?.period?.value;
  const yourCopies = entered !== undefined ? periodCopiesOf(entered, copyUs) : undefined;
  const bbn = exampleTheory(BBN);
  const blind = exampleTheory(BLIND_PULSES, exampleFrontEnd());
  const maj = (p: number) => berRepetitionMajority(p, 3);
  return {
    n: String(t.n),
    chipRate: trim1(t.chipRateMcps),
    gpDb: t.gpDb.toFixed(1),
    copyUs: trim1(copyUs),
    bitUs: trim1(3 * copyUs),
    jsB: String(js5BOf(t)),
    ebJ0on: b3.ebJ0on.toFixed(1),
    qOn: berText(b3.qOn),
    groupFail: berText(b3.groupFail),
    berWhole: berText(b3.berWhole),
    recUs: trim1(recUs),
    blindUs: trim1(copyUs + recUs),
    maxPeriodUs: trim1(maxPeriodUsOf(t)),
    copyBer: String(copyBer),
    voteBer: berText(maj(copyBer)),
    pCopyBer: String(pc),
    pTwo: berText(3 * pc * pc * (1 - pc)),
    pThree: berText(pc ** 3),
    pVoteBer: berText(maj(pc)),
    pN: String(practice.n),
    pChipRate: trim1(practice.chipRateMcps),
    pCopyUs: trim1(practice.n / practice.chipRateMcps),
    pBitUs: trim1((3 * practice.n) / practice.chipRateMcps),
    pRecUs: String(pb.rec),
    pPulseUs: String(pb.pulse),
    pPeriodUs: String(pb.period),
    pBlindUs: String(pb.rec + pb.pulse),
    pBlindFrac: sig2((pb.rec + pb.pulse) / pb.period),
    exBbnVote: berText(bbn),
    exOneCopy: berText(exampleTheory(ONE_COPY)),
    exWholeBit: berText(exampleTheory(WHOLE_BIT)),
    exBbnLow: berText(bbn),
    exBlind: berText(blind),
    exRecoveryCopies: String(EX_RECOVERY_COPIES),
    exBlindCopies: String(1 + EX_RECOVERY_COPIES),
    yourPeriodUs: yourCopies !== undefined ? trim1(yourCopies * copyUs) : '-',
    berYour: run?.summary ? berText(run.summary.theoryBer) : '-',
    dutyPct: yourCopies !== undefined ? sig2(100 / yourCopies) : '-',
    yourPrediction: run?.prediction !== undefined ? berText(run.prediction) : '-',
    measuredBer: run?.summary ? berText(run.summary.ber) : '-',
    lo: run?.summary ? berText(run.summary.lo) : '-',
    hi: run?.summary ? berText(run.summary.hi) : '-',
  };
}

const ctxN = (ctx: Ctx) => pr(ctx).n;

const C3: ApplyStep = {
  kind: 'apply',
  id: 'C3',
  title: 'Your turn: blind the enemy',
  instruments: [],
  run: {
    link: 'hidden',
    js: 'fixed',
    code: 'short',
    repetition: 3,
    jammer: { kind: 'pulsed', duty: 0.5, periodChips: 2, offsetChips: 0 },
    jammerFrom: (v, n, rate) => blindPulseSpec(periodCopiesOf(v.period, n / rate), n),
    jsDbFromEntered: (v, n, rate) => avgJsOfPeriod(periodCopiesOf(v.period, n / rate)),
    frontEndFrom: hiddenFrontEnd,
    runInput: { field: 'period', label: 'Period for this run', unit: 'µs' },
    jammerNote: (v, n) => `Pulses of one copy, peak J/S ${HIDDEN_PEAK_DB} dB (above the overload), every ${v.period} µs rounded to whole copies (${n} chips each).`,
  },
  goal: {
    kind: 'deny',
    berAtLeast: GOAL_BER,
    points: 15,
    task: 'Run pulses at your period against the enemy link. Reach a measured BER of at least 0.1.',
    notYet: 'Not there yet. Try a shorter period: the receiver must be blind at least half the time.',
  },
  task: 'The enemy front end is overloaded by pulses above J/S = 25 dB. Your pulses are 40 dB at their peak, one copy long. Find the longest pulse period that still blinds the receiver half the time, then run it.',
  fields: [
    {
      id: 'period',
      label: 'Longest period',
      unit: 'µs',
      group: 1,
      prompt:
        'The enemy front end recovers in {recUs} µs. Your pulses last one copy, {copyUs} µs. What is the longest pulse period that keeps the receiver blind at least half the time?',
      truth: (t) => maxPeriodUsOf(t),
      check: { rel: 0.03 },
      range: { min: 1, max: 1e6, message: 'Enter a period in µs between 1 and 1000000.' },
      points: 15,
    },
  ],
  reveal: [
    'Blind per period: {copyUs} + {recUs} = {blindUs} µs. Half the time needs a period of at most 2 × {blindUs} = {maxPeriodUs} µs.',
    'Your period {yourPeriodUs} µs: theory {berYour}, measured {measuredBer}, with the jammer on only {dutyPct}% of the time.',
  ],
};

export const LEVEL_5: LevelDef = {
  id: 5,
  title: 'Saturation and timing',
  intro:
    'The enemy link has learned from levels 3 and 4. It sends every bit three times and takes a vote, and its receiver can survive short pulses. In this level you find the pulse pattern a vote cannot fix, and a way to make the receiver blind itself.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  practiceJs: () => EX_JS5_DB,
  units: [
    {
      id: 'A',
      title: 'Sending every bit three times',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Example: the majority vote',
          video: 'level5-A1',
          visual: { kind: 'majorityVote' },
          paragraphs: [
            'The link sends every bit three times: three copies. The receiver decides each copy, then takes a vote: whichever value at least two copies agree on wins.',
            'So one wrong copy does no harm. A bit is lost only when at least two of its three copies are wrong.',
          ],
          steps: [
            'Say each copy is wrong 1 time in 10 (0.1).',
            'Two wrong and one right: 3 × 0.1 × 0.1 × 0.9 = 0.027. All three wrong: 0.1 × 0.1 × 0.1 = 0.001.',
            'Bit error rate after the vote: 0.027 + 0.001 = 0.028.',
          ],
          rule: 'With three copies and a vote, a copy error rate p becomes about 3p² (0.1 becomes 0.028, 0.01 becomes 0.0003).',
          check: {
            question: 'Each copy is wrong 1 time in 100. Roughly what is the bit error rate after the vote?',
            answer: 0.0003,
            tol: { factor: 1.3 },
            wrong: 'About 3 × 0.01 × 0.01 = 0.0003.',
          },
        },
        {
          kind: 'practice',
          id: 'A2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'Each copy is wrong {pCopyBer} of the time. What is the bit error rate after the vote?',
          hint: 'Add the two ways to lose a bit: exactly two copies wrong, and all three wrong.',
          fields: [
            {
              id: 'ber',
              label: 'Bit error rate',
              unit: '',
              truth: (_t, ctx) => berRepetitionMajority(practiceCopyBerAt(ctx.practiceN ?? 0), 3),
              check: { factor: 1.2 },
              points: 0,
            },
          ],
          worked: ['3 × {pCopyBer}² × (1 − {pCopyBer}) = {pTwo}.', '{pCopyBer}³ = {pThree}.', 'Sum: {pVoteBer}.'],
        },
        {
          kind: 'apply',
          id: 'A3',
          title: 'Your turn',
          instruments: [],
          task: 'Jammed with broadband noise, each copy on the enemy link is wrong {copyBer} of the time. What is its bit error rate after the vote?',
          fields: [
            {
              id: 'ber',
              label: 'Bit error rate',
              unit: '',
              truth: (t) => berRepetitionMajority(copyBerOf(t), 3),
              check: { factor: 1.3 },
              points: 10,
            },
          ],
          reveal: ['3 × {copyBer}² × (1 − {copyBer}) + {copyBer}³ = {voteBer}.'],
        },
      ],
    },
    {
      id: 'B',
      title: 'Pulses against the vote',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: one copy of every bit, or every copy of some bits',
          video: 'level5-B1',
          visual: {
            kind: 'berRunDemo',
            jsDb: EX_JS5_DB,
            variants: [
              { label: 'broadband noise', jammer: BBN, repetition: 3 },
              { label: 'pulses hitting one copy of every bit', jammer: ONE_COPY, repetition: 3 },
              { label: 'pulses hitting all three copies of every third bit', jammer: WHOLE_BIT, repetition: 3 },
            ],
          },
          paragraphs: [
            'All three jammers have the same average power. Run each one.',
            'Theory: broadband noise {exBbnVote}; one copy of every bit {exOneCopy}; all copies of every third bit {exWholeBit}.',
          ],
          steps: [
            'Pulses on one copy of every bit break that copy, but the other two outvote it: almost no bits are lost.',
            'Pulses on all three copies of a bit break the copies together, so the vote cannot help: {exWholeBit}, worse than broadband noise.',
          ],
          rule: 'Against a vote, a pulse must cover every copy of a bit: three copies long, starting where a bit starts.',
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'The practice link has {pN} chips per copy at {pChipRate} Mcps and sends 3 copies per bit. How long must a pulse be to cover a whole bit, in µs?',
          hint: 'One copy lasts chips ÷ chip rate. A bit is three copies.',
          fields: [
            {
              id: 'pulse',
              label: 'Pulse length',
              unit: 'µs',
              truth: (_t, ctx) => (3 * ctxN(ctx)) / pr(ctx).chipRateMcps,
              check: { rel: 0.02 },
              points: 0,
            },
          ],
          worked: ['One copy lasts {pN} ÷ {pChipRate} Mcps = {pCopyUs} µs.', 'Three copies: 3 × {pCopyUs} = {pBitUs} µs.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'Your turn: break the vote',
          instruments: [],
          visual: { kind: 'berCurve' },
          run: {
            link: 'hidden',
            js: 'fixed',
            jsDbFrom: js5BOf,
            code: 'short',
            repetition: 3,
            ebN0Db: 30,
            jammer: { kind: 'pulsed', duty: 1 / 3, periodChips: 9, offsetChips: 0 },
            jammerFrom: (_v, n) => wholeBitSpec(n),
          },
          task: "Your pulses cover all three copies of every third bit at J/S = {jsB} dB. Predict the BER, then press Run. The receiver's own noise is negligible here.",
          hint: 'In a pulse the jammer is 3 times (4.8 dB) stronger: copy Eb/J0 = Gp − J/S − 4.8. Find that copy\'s BER from the table, apply the vote, then divide by 3.',
          fields: [
            {
              id: 'pulse',
              label: 'Pulse length',
              unit: 'µs',
              group: 1,
              prompt: 'The enemy link has {n} chips per copy at {chipRate} Mcps, 3 copies per bit. How long must each pulse be?',
              truth: (t) => 3 * copyUsOf(t),
              check: { rel: 0.02 },
              points: 10,
            },
            {
              id: 'ber',
              label: 'Predicted BER',
              unit: '',
              group: 2,
              kind: 'predictBer',
              truth: (t) => b3Theory(t),
              check: { factor: 2 },
              points: 20,
              fullWithinFactor: 2,
            },
          ],
          reveal: [
            'A bit lasts 3 × {copyUs} = {bitUs} µs.',
            'In a pulse: copy Eb/J0 = {gpDb} − {jsB} − 4.8 = {ebJ0on} dB → copy BER {qOn} → after the vote {groupFail}.',
            'One bit in three is hit: {groupFail} ÷ 3 = {berWhole}. Measured {measuredBer} (range {lo} to {hi}).',
          ],
        },
      ],
    },
    {
      id: 'C',
      title: 'Blinding the receiver',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: a receiver that needs time to recover',
          video: 'level5-C1',
          visual: {
            kind: 'blinding',
            demo: {
              kind: 'berRunDemo',
              jsDb: EX_JS5_DB,
              variants: [
                { label: 'broadband noise at the same average power', jammer: BBN, repetition: 3 },
                { label: 'short pulses strong enough to overload the front end', jammer: BLIND_PULSES, repetition: 3, frontEnd: exampleFrontEnd() },
              ],
            },
          },
          paragraphs: [
            "A receiver's front end can be overloaded. After a pulse that strong it stays blind for a while, its recovery time, even after the pulse has ended.",
            'While blind it hears nothing, so each copy it decides is a coin toss.',
            'Run both. They have the same average power. Theory: broadband noise {exBbnLow}; overloading pulses {exBlind}.',
          ],
          steps: [
            'Each pulse lasts 1 copy and the receiver then stays blind for {exRecoveryCopies} more copies: blind {exBlindCopies} copies out of every 30.',
            'Bits with two or more blind copies are a coin toss: {exBlind} of all bits are lost.',
            'The jammer was on only 3% of the time.',
          ],
          rule: "Overloading pulses do damage in proportion to the time the receiver is blind, not to the jammer's average power.",
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A front end recovers in {pRecUs} µs after each overload. Your pulses last {pPulseUs} µs and repeat every {pPeriodUs} µs. What fraction of the time is the receiver blind?',
          hint: 'Blind time per period = pulse + recovery. Divide by the period.',
          fields: [
            {
              id: 'frac',
              label: 'Blind fraction',
              unit: '',
              truth: (_t, ctx) => {
                const b = practiceBlindAt(ctx.practiceN ?? 0);
                return (b.rec + b.pulse) / b.period;
              },
              check: { factor: 1.05 },
              accept: (v, truth) => Math.abs(v - truth) <= 0.01 || (v > 0 && v <= truth * 1.05 && v >= truth / 1.05),
              points: 0,
            },
          ],
          worked: ['Blind per period: {pPulseUs} + {pRecUs} = {pBlindUs} µs.', 'Fraction: {pBlindUs} ÷ {pPeriodUs} = {pBlindFrac}.'],
        },
        C3,
      ],
    },
    {
      id: 'D',
      title: 'Check your understanding',
      steps: [
        {
          kind: 'questions',
          id: 'D1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'Against a link that sends 3 copies and votes, which pulses do the most damage for the same average power?',
              options: ['Pulses covering all three copies of some bits', 'Pulses covering one copy of every bit', 'Steady broadband noise'],
              correct: 0,
              explain: 'The vote fixes a single wrong copy. Pulses that break every copy of a bit leave the vote nothing to work with.',
              points: 10,
            },
            {
              id: 'q2',
              text: 'How can a jammer with a low average power break a link by overloading its front end?',
              options: [
                'The receiver stays blind for its recovery time after each pulse, far longer than the pulse',
                "Overloading adds the receiver's own power to the jammer",
                "The front end amplifies the jammer's average power",
              ],
              correct: 0,
              explain: 'The damage follows the blind time: pulse plus recovery. The jammer only needs to be on for the pulse.',
              points: 10,
            },
            {
              id: 'q3',
              text: 'Copies are wrong 1 time in 10. What is the bit error rate after a 3-copy vote?',
              options: ['About 0.028', '0.1', '0.3'],
              correct: 0,
              explain: '3 × 0.1² × 0.9 + 0.1³ = 0.028.',
              points: 10,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    "A vote shrugs off pulses that hit one copy of each bit. Your pulses had to cover all three copies of a bit, {bitUs} µs on your enemy link, to get past it. And pulses strong enough to overload the front end blind the receiver for the whole recovery time, so the damage follows the blind time, not the jammer's average power. That completes the spread-spectrum levels.",
};

// Used by the tests: the blind fraction of C3's pulses at a period in copies.
export const c3BlindFraction = (t: Truth, copies: number): number => blindFraction(copies, 1, recoveryCopiesOf(t));
