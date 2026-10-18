// Level 8: Codes and synchronization (docs/design-level-8.md). Units A to C: shift registers, rebuilding a code, Gold
// codes. Every number in the texts is checked in level8.test.ts.
import { createRng } from '../../rng';
import { PRIMITIVE_TAPS } from '../pn';
import { type PacketLink, cellMean, detectProb, packetErrorRate, thresholdFor } from '../sync';
import { qfunc } from '../theory';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

// Like levels 1 to 5, the enemy link has a short code of degree 5 to 7.
export const level8Truth = shortCodeTruth;

export const tapsOf = (degree: number): number[] => PRIMITIVE_TAPS[degree];
// The register's other tap (the first is always the last stage).
export const secondTap = (degree: number): number => tapsOf(degree)[1];
export const periodOf = (stages: number): number => 2 ** stages - 1;

// Practice: code length → stages (A2), stages → period (A2), and degree → chips to rebuild (B2).
const A2_LENGTHS = [63, 127, 255, 1023, 31];
const A2_STAGES = [9, 11, 4, 12, 13];
const B2_DEGREES = [6, 9, 11, 7];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
export const a2Length = (n: number) => at(A2_LENGTHS, n);
export const a2Stages = (n: number) => at(A2_STAGES, n);
export const b2Degree = (n: number) => at(B2_DEGREES, n);

// --- Units D and F: the enemy's packets -------------------------------------------------------------------------

const PD_TARGETS = [0.9, 0.95, 0.98];
export const PAYLOAD_BITS = 500;
export const F3_GOAL_PER = 0.5;

// The chip SNR (0.1 dB) that gives the right phase a detection probability of pd at a false-alarm rate of 1e-3.
function chipSnrFor(n: number, pd: number): number {
  const thr = thresholdFor(1e-3);
  let lo = -10;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (qfunc(thr - m) < pd) lo = m;
    else hi = m;
  }
  const mean = (lo + hi) / 2;
  return Math.round(10 * Math.log10((mean * mean) / (2 * n)) * 10) / 10;
}

export function packetLinkOf(t: Truth): PacketLink {
  const pd = PD_TARGETS[Math.floor(createRng((t.seed ^ 0x8d8) >>> 0)() * PD_TARGETS.length)];
  return { n: t.n, preamblePeriods: t.n, payloadBits: PAYLOAD_BITS, chipSnrDb: chipSnrFor(t.n, pd), pfaCell: 1e-3 };
}
// The J/S at which the right phase's correlation sits on the threshold: 2n ÷ (J/S) = threshold².
export const ruleJsDb = (n: number): number => 10 * Math.log10((2 * n) / thresholdFor(1e-3) ** 2);

// Practice: D2's code length and chip rate; F2's code length and payload bits.
const D2_SETS = [{ n: 63, rate: 1 }, { n: 127, rate: 2 }, { n: 31, rate: 0.5 }, { n: 255, rate: 1 }];
const F2_SETS = [{ n: 63, bits: 1000 }, { n: 127, bits: 200 }, { n: 31, bits: 2000 }, { n: 255, bits: 500 }];
export const d2Set = (n: number) => at(D2_SETS, n);
export const f2Set = (n: number) => at(F2_SETS, n);

const trim = (v: number) => String(Number(v.toFixed(2)));

export function level8Values(t: Truth, practiceN: number): Record<string, string> {
  const b2 = b2Degree(practiceN);
  const pk = packetLinkOf(t);
  const d2 = d2Set(practiceN);
  const f2 = f2Set(practiceN);
  const snrLin = 10 ** (pk.chipSnrDb / 10);
  return {
    pN: String(practiceN),
    n: String(t.n),
    degree: String(t.degree),
    chipRate: trim(t.chipRateMcps),
    periodUs: trim(t.n / t.chipRateMcps),
    chips2n: String(2 * t.degree),
    tap2: String(secondTap(t.degree)),
    taps: tapsOf(t.degree).join(' and '),
    predicted: String(t.n - 2 * t.degree),
    pLen: String(a2Length(practiceN)),
    pStages: String(Math.log2(a2Length(practiceN) + 1)),
    pStages2: String(a2Stages(practiceN)),
    pPeriod: String(periodOf(a2Stages(practiceN))),
    pDegree: String(b2),
    pChips: String(2 * b2),
    pPredicted: String(periodOf(b2) - 2 * b2),
    snr: pk.chipSnrDb.toFixed(1),
    snrLin: snrLin.toFixed(3),
    maxSearchUs: trim((t.n * t.n) / t.chipRateMcps),
    peak: (Math.sqrt(2 * t.n * snrLin)).toFixed(2),
    peakSq: (2 * t.n * snrLin).toFixed(1),
    pdEnemy: detectProb(pk).toFixed(2),
    preChips: String(pk.preamblePeriods * pk.n),
    payChips: String(PAYLOAD_BITS * pk.n),
    ruleJs: ruleJsDb(t.n).toFixed(1),
    perRule: trim(packetErrorRate(pk, { on: 'preamble', jsDb: Number(ruleJsDb(t.n).toFixed(1)) })),
    dN: String(d2.n),
    dRate: trim(d2.rate),
    dPeriodUs: trim(d2.n / d2.rate),
    dMaxUs: trim((d2.n * d2.n) / d2.rate),
    dMean: String((d2.n + 1) / 2),
    fN: String(f2.n),
    fBits: String(f2.bits),
    fJs: ruleJsDb(f2.n).toFixed(1),
    fTwoN: String(2 * f2.n),
    fRatio: trim(f2.bits / f2.n),
  };
}

export const LEVEL_8: LevelDef = {
  id: 8,
  title: 'Codes and synchronization',
  intro:
    'Until now the enemy receiver simply knew the code and was locked to it. This level opens both up: where the code comes from, how little of it you need to rebuild it, and how a receiver finds the code\'s timing at the start of each message. That last step is the link\'s weak point.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Shift registers',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Example: a 5-stage register',
          visual: { kind: 'register', degree: 5 },
          video: 'level8-A1',
          paragraphs: [
            'The [[codes|code]] in this lab come from a [[shift register|shift-register]]: a row of stages, each holding a 0 or a 1. At every step each bit moves one stage along, the last one comes out as the next [[chip|chip]], and a new bit comes in at the front.',
            'The new bit is the sum of a few stages, the taps, counted modulo 2 (1 + 1 = 0). With the right taps the register runs through every pattern except all zeros before it repeats.',
          ],
          steps: [
            'This register has 5 stages and taps on stages 5 and 3.',
            'Press Step: the bits shift, stage 5 comes out as a chip, and stage 5 + stage 3 goes in at the front.',
            'There are 2^5 = 32 patterns of 5 bits. All zeros would stay all zeros, so it never appears: the register runs through the other 31 and starts again.',
            'Period = 2^5 − 1 = 31 chips: the 31-chip example code. 16 of its chips are 1 and 15 are 0.',
          ],
          rule: 'A register of n stages with the right taps repeats every 2^n − 1 chips: an [[m-sequence|m-sequence]].',
          check: {
            question: 'A register has 10 stages. What is the period of its m-sequence, in chips?',
            answer: 1023,
            tol: { exact: true },
            wrong: '2^10 − 1.',
          },
        },
        {
          kind: 'practice',
          id: 'A2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'register', degree: 5 },
          task: 'A code repeats every {pLen} chips: how many stages has its register? And what is the period of a {pStages2}-stage register?',
          hint: 'Period = 2^n − 1, so n = log2(period + 1).',
          fields: [
            { id: 'stages', label: 'Stages', unit: '', truth: (_t, ctx) => Math.log2(a2Length(ctx.practiceN ?? 0) + 1), check: { exact: true }, points: 0 },
            { id: 'period', label: 'Period', unit: 'chips', truth: (_t, ctx) => periodOf(a2Stages(ctx.practiceN ?? 0)), check: { exact: true }, points: 0 },
          ],
          worked: ['{pLen} + 1 = 2^{pStages}, so {pStages} stages.', '2^{pStages2} − 1 = {pPeriod} chips.'],
        },
        {
          kind: 'apply',
          id: 'A3',
          title: 'The enemy: its register',
          instruments: ['autocorr'],
          task: 'The enemy link sends {chipRate} Mcps. Measure its code length from the autocorrelation, as in level 1, then work out its register.',
          hint: 'The peaks are one code period apart. Code length = period × chip rate. Stages = log2(length + 1).',
          fields: [
            { id: 'length', label: 'Code length', unit: 'chips', truth: (t) => t.n, check: { exact: true }, points: 5 },
            { id: 'stages', label: 'Stages', unit: '', truth: (t) => t.degree, check: { exact: true }, points: 10 },
          ],
          reveal: ['The peaks are {periodUs} µs apart: {periodUs} × {chipRate} = {n} chips.', '{n} + 1 = 2^{degree}: a register of {degree} stages, taps {taps}.'],
        },
      ],
    },
    {
      id: 'B',
      title: 'Rebuilding a code',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: 10 chips give away 31',
          visual: { kind: 'rebuild', link: 'example' },
          video: 'level8-B1',
          paragraphs: [
            'A register of n stages is fixed by n bits of state and its taps. So a short stretch of its chips is enough to find it, and then every chip that follows.',
            'The [[Berlekamp–Massey|berlekamp-massey]] method finds the shortest register that makes a given stretch of chips. That length is the code\'s [[linear complexity|linear-complexity]]: n for an m-sequence. 2n chips in a row are always enough; fewer can fit a wrong register.',
          ],
          steps: [
            'The example code comes from 5 stages. Capture 10 chips: 2 × 5.',
            'Berlekamp–Massey finds a register of 5 stages with taps 5 and 3.',
            'Run it on: it predicts the other 21 chips of the period exactly, and every period after.',
            'Move the slider below 10 and watch the prediction break: too few chips fit more than one register.',
          ],
          rule: 'An m-sequence of n stages is rebuilt from 2n chips. A spreading code is not a cipher: real links protect the code with a generator that is not a plain register, or with encryption.',
          check: {
            question: 'The enemy code comes from a 7-stage register. How many chips in a row does an attacker need to rebuild it?',
            unit: 'chips',
            answer: 14,
            tol: { exact: true },
            wrong: '2 × 7.',
          },
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A code comes from a {pDegree}-stage register. How many chips must you capture to rebuild it, and how many chips of each period does the rebuilt register then predict?',
          hint: 'Capture 2n chips. One period is 2^n − 1 chips; the rest of it is predicted.',
          fields: [
            { id: 'chips', label: 'Chips to capture', unit: '', truth: (_t, ctx) => 2 * b2Degree(ctx.practiceN ?? 0), check: { exact: true }, points: 0 },
            { id: 'predicted', label: 'Chips predicted', unit: '', truth: (_t, ctx) => periodOf(b2Degree(ctx.practiceN ?? 0)) - 2 * b2Degree(ctx.practiceN ?? 0), check: { exact: true }, points: 0 },
          ],
          worked: ['2 × {pDegree} = {pChips} chips.', 'Period 2^{pDegree} − 1; minus the {pChips} captured: {pPredicted} predicted.'],
        },
        {
          kind: 'apply',
          id: 'B3',
          title: 'The enemy: rebuild its code',
          instruments: ['rebuild'],
          task: 'You have captured the enemy code chip by chip. How many chips do you need to rebuild it? Set the capture to that, and read the register Berlekamp–Massey finds: what is its second tap?',
          hint: 'You found its register length in A3. Capture twice that.',
          fields: [
            { id: 'chips', label: 'Chips needed', unit: '', truth: (t) => 2 * t.degree, check: { exact: true }, points: 5 },
            { id: 'tap', label: 'Second tap', unit: '', truth: (t) => secondTap(t.degree), check: { exact: true }, points: 10 },
          ],
          reveal: ['{degree} stages: 2 × {degree} = {chips2n} chips.', 'Taps {taps}. The rebuilt register predicts the other {predicted} chips of each period, and every period after.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'Gold codes',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Many codes in one band',
          visual: { kind: 'gold' },
          paragraphs: [
            'Many links can share a band if each uses its own code and the codes look unlike each other at every offset. One m-sequence family has few such members.',
            '[[Gold codes|gold-code]] fix that. Take two m-sequences of the same length that suit each other, a preferred pair, and add them chip by chip at every one of their N offsets. With the pair itself that gives N + 2 codes.',
            'Any two of them cross-correlate at only three values. For 31 chips: −1, −9 or +7, against a peak of 31 when a code meets itself. Level 10 builds on this to separate many users.',
          ],
          check: {
            question: 'A preferred pair of 127-chip m-sequences. How many Gold codes does it give?',
            answer: 129,
            tol: { exact: true },
            wrong: 'N + 2 = 127 + 2.',
          },
        },
      ],
    },
    {
      id: 'D',
      title: 'Acquisition',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: the sliding correlator',
          visual: { kind: 'acquire' },
          video: 'level8-D1',
          paragraphs: [
            'Before a receiver can despread, it must know where the [[code|code]] starts. Each message begins with a [[preamble|preamble]], the code sent over and over, and the receiver searches it: [[acquisition|acquisition]].',
            'It tries one starting point (a code phase) at a time: it multiplies one code period by its copy of the code and adds up. On the right phase the chips line up and the sum is large; on the wrong ones it is noise. This is a [[sliding correlator|sliding-correlator]].',
            'It locks on the first phase whose sum passes a threshold. A high threshold misses the right phase more often; a low one locks on a wrong phase by chance, a [[false alarm|false-alarm]]. Either way the message is lost.',
          ],
          steps: [
            'The example code has 31 phases. Each test takes one code period, 31 µs at 1 Mcps, so a full search takes 31 × 31 = 961 µs. On average the right phase comes up after about 16 tests.',
            'The threshold is set so a wrong phase passes only 1 time in 1000: 3.09 in units of the noise.',
            'The right phase\'s sum, in the same units, is √(2 × 31 × Ec/N0). At Ec/N0 = −4 dB (0.398): √24.7 = 4.97.',
            '4.97 is 1.88 above the threshold, so the right phase is detected 97% of the time: Q(−1.88) = 0.97.',
          ],
          rule: 'Correlation peak = √(2 × n × Ec/N0), in noise units. The preamble must last as many code periods as there are phases to search.',
          check: {
            question: 'A code has 127 chips. At most how many phases must the sliding correlator test?',
            answer: 127,
            tol: { exact: true },
            wrong: 'One phase for every chip of the code.',
          },
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A code of {dN} chips at {dRate} Mcps. How long does a full search take, and after how many tests does the right phase come up on average?',
          hint: 'One test = one code period = {dN} ÷ {dRate} µs. A full search tests every phase. On average: (n + 1) ÷ 2 tests.',
          fields: [
            { id: 'max', label: 'Full search', unit: 'µs', truth: (_t, ctx) => (d2Set(ctx.practiceN ?? 0).n ** 2) / d2Set(ctx.practiceN ?? 0).rate, check: { rel: 0.01 }, points: 0 },
            { id: 'mean', label: 'Tests on average', unit: '', truth: (_t, ctx) => (d2Set(ctx.practiceN ?? 0).n + 1) / 2, check: { abs: 0.5 }, points: 0 },
          ],
          worked: ['One test = {dPeriodUs} µs. Full search = {dN} × {dPeriodUs} = {dMaxUs} µs.', 'On average ({dN} + 1) ÷ 2 = {dMean} tests.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'The enemy: its search',
          instruments: [],
          task: 'The enemy receiver searches its {n}-chip code at {chipRate} Mcps and hears the chips at Ec/N0 = {snr} dB. How many phases does it test at most, how long does that take, and how high is the right phase\'s correlation peak in noise units?',
          hint: 'Phases = chips. Time = phases × one code period. Peak = √(2 × n × Ec/N0), Ec/N0 as a ratio.',
          fields: [
            { id: 'cells', label: 'Phases', unit: '', truth: (t) => t.n, check: { exact: true }, points: 5 },
            { id: 'time', label: 'Full search', unit: 'µs', truth: (t) => (t.n * t.n) / t.chipRateMcps, check: { rel: 0.01 }, points: 5 },
            { id: 'peak', label: 'Correlation peak', unit: '', truth: (t) => cellMean(packetLinkOf(t)), check: { rel: 0.05 }, points: 10 },
          ],
          reveal: [
            '{n} phases, each one code period: {n} × {periodUs} = {maxSearchUs} µs.',
            '{snr} dB = {snrLin}. Peak = √(2 × {n} × {snrLin}) = √{peakSq} = {peak}, against a threshold of 3.09: detected {pdEnemy} of the time.',
          ],
        },
      ],
    },
    {
      id: 'E',
      title: 'Tracking',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Keeping the lock',
          visual: { kind: 'scurve' },
          video: 'level8-E1',
          paragraphs: [
            'Once locked, the receiver must stay locked: its clock and the transmitter\'s drift apart, and the distance between them can change. A [[delay-locked loop|dll]] keeps the timing.',
            'Besides the prompt correlator it runs two more: one half a chip early, one half a chip late. On time, both see the same, and early − late = 0. If the receiver runs late, the early one sits nearer the peak than the late one: early − late turns positive, and the loop moves the timing earlier. If it runs early, the difference turns negative and pulls the other way.',
            'This S-curve only steers within about a chip. A jolt bigger than that, or a jammer that buries the correlators, loses the lock, and the receiver must search again.',
          ],
          check: {
            question: 'The receiver\'s timing is exactly right. What is early − late?',
            answer: 0,
            tol: { abs: 0.001 },
            wrong: 'On time, the early and late correlators are the same distance from the peak.',
          },
        },
      ],
    },
    {
      id: 'F',
      title: 'Jamming the sync',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Example: jam the preamble, lose the packet',
          visual: { kind: 'packets', variants: [{ label: 'Preamble only', on: 'preamble' }, { label: 'Payload only', on: 'payload' }], jsDb: 8 },
          video: 'level8-F1',
          paragraphs: [
            'A receiver that never locks despreads nothing: the whole packet is lost. So a [[jammer|jammer]] can aim at the search instead of the bits: [[sync jamming|sync-jamming]].',
            'The search fails when the right phase\'s correlation sinks below the threshold. That happens when 2n ÷ (J/S) falls to about the threshold squared, 9.6: J/S ≈ 10 × log10(2n ÷ 9.6) dB.',
          ],
          steps: [
            'The example: 31-chip code, a 31-period preamble (961 chips), 500 payload bits (15,500 chips).',
            '10 × log10(62 ÷ 9.6) = 8.1 dB. Run both at J/S 8 dB.',
            'Preamble only: about 2 packets in 3 lost. Payload only: about 9 in 10.',
            'But the preamble jammer is on for 961 chips, the payload jammer for 15,500: 16 times the energy for a little more damage.',
          ],
          rule: 'Jam the sync: J/S ≈ 10 × log10(2n ÷ 9.6) dB on the preamble alone loses most packets, for a fraction of the energy of jamming the payload.',
          check: {
            question: 'A 500-bit payload follows a preamble of 31 code periods; each bit is one code period. How many times longer is the payload?',
            answer: 500 / 31,
            tol: { abs: 0.1 },
            wrong: '500 ÷ 31.',
          },
        },
        {
          kind: 'practice',
          id: 'F2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A link with a {fN}-chip code sends a preamble of {fN} periods and {fBits} payload bits. What J/S on the preamble breaks its search, and how many times less energy is that than jamming its payload at the same J/S?',
          hint: 'J/S ≈ 10 × log10(2n ÷ 9.6). Energy goes with time on: payload periods ÷ preamble periods.',
          fields: [
            { id: 'js', label: 'J/S on the preamble', unit: 'dB', truth: (_t, ctx) => ruleJsDb(f2Set(ctx.practiceN ?? 0).n), check: { abs: 0.3 }, points: 0 },
            { id: 'ratio', label: 'Energy ratio', unit: 'times', truth: (_t, ctx) => f2Set(ctx.practiceN ?? 0).bits / f2Set(ctx.practiceN ?? 0).n, check: { rel: 0.03 }, points: 0 },
          ],
          worked: ['10 × log10({fTwoN} ÷ 9.6) = {fJs} dB.', '{fBits} payload periods ÷ {fN} preamble periods = {fRatio} times.'],
        },
        {
          kind: 'apply',
          id: 'F3',
          title: 'The enemy: break its sync',
          instruments: [],
          task: 'Your jammer\'s battery lets it run for only a short burst per packet: enough for the preamble, not the payload. How many chips long is the enemy preamble ({n}-chip code, {n} periods)? Then choose a J/S, jam only the preamble, and lose at least half the packets.',
          hint: 'Preamble chips = periods × chips per period. J/S ≈ 10 × log10(2n ÷ 9.6).',
          fields: [
            { id: 'chips', label: 'Preamble', unit: 'chips', truth: (t) => t.n * t.n, check: { exact: true }, points: 5 },
            {
              id: 'js',
              label: 'J/S on the preamble',
              unit: 'dB',
              truth: (t) => ruleJsDb(t.n),
              check: { abs: 1 },
              range: { min: -10, max: 30, message: 'From −10 to 30 dB.' },
              points: 5,
            },
          ],
          run: {
            link: 'hidden',
            js: 'fixed',
            jammer: { kind: 'bbn' },
            sync: { linkFrom: packetLinkOf, jammerFrom: (v) => ({ on: 'preamble', jsDb: v.js ?? 0 }) },
            runInput: { field: 'js', label: 'J/S on the preamble', unit: 'dB' },
          },
          goal: {
            kind: 'deny',
            berAtLeast: F3_GOAL_PER,
            measure: 'per',
            points: 20,
            task: 'Run. Change the J/S and run again until half the packets are lost.',
            notYet: 'Not there yet: more J/S on the preamble.',
          },
          reveal: [
            'Preamble: {n} periods × {n} chips = {preChips} chips, against {payChips} for the payload.',
            'J/S ≈ 10 × log10(2 × {n} ÷ 9.6) = {ruleJs} dB loses {perRule} of the packets.',
          ],
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
              text: 'Why does a plain m-sequence give no secrecy?',
              options: ['It repeats too slowly', '2n chips in a row rebuild the register and every chip after', 'Its chips are too short'],
              correct: 1,
              explain: 'A register of n stages has linear complexity n. Berlekamp–Massey rebuilds it from 2n chips.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'Why does jamming the preamble lose packets for far less energy than jamming the payload?',
              options: ['Without a lock the receiver despreads nothing, so the whole packet is lost', 'The preamble is sent with less power', 'The payload has no processing gain'],
              correct: 0,
              explain: 'The preamble is short, and breaking the search loses every bit that follows it.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'What does the sliding correlator\'s threshold trade?',
              options: ['Chip rate against bit rate', 'Power against bandwidth', 'Missed locks against false locks'],
              correct: 2,
              explain: 'Higher: fewer false locks but more missed ones. Lower: the opposite.',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'A spreading code is a shift register: 2n captured chips rebuild it, so the code alone protects nothing. Before it can despread, a receiver must find the code\'s timing with a sliding correlator, trading missed locks against false ones. That search is the weak point: jamming the short preamble loses whole packets for a fraction of the energy of jamming the bits.',
};
