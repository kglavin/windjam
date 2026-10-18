// Level 8: Codes and synchronization (docs/design-level-8.md). Units A to C: shift registers, rebuilding a code, Gold
// codes. Every number in the texts is checked in level8.test.ts.
import { PRIMITIVE_TAPS } from '../pn';
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

const trim = (v: number) => String(Number(v.toFixed(2)));

export function level8Values(t: Truth, practiceN: number): Record<string, string> {
  const b2 = b2Degree(practiceN);
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
          paragraphs: [
            'The [[codes|code]] in this lab come from a shift register: a row of stages, each holding a 0 or a 1. At every step each bit moves one stage along, the last one comes out as the next [[chip|chip]], and a new bit comes in at the front.',
            'The new bit is the sum of a few stages, the taps, counted modulo 2 (1 + 1 = 0). With the right taps the register runs through every pattern except all zeros before it repeats.',
          ],
          steps: [
            'This register has 5 stages and taps on stages 5 and 3.',
            'Press Step: the bits shift, stage 5 comes out as a chip, and stage 5 + stage 3 goes in at the front.',
            'There are 2^5 = 32 patterns of 5 bits. All zeros would stay all zeros, so it never appears: the register runs through the other 31 and starts again.',
            'Period = 2^5 − 1 = 31 chips: the 31-chip example code. 16 of its chips are 1 and 15 are 0.',
          ],
          rule: 'A register of n stages with the right taps repeats every 2^n − 1 chips: an m-sequence.',
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
          paragraphs: [
            'A register of n stages is fixed by n bits of state and its taps. So a short stretch of its chips is enough to find it, and then every chip that follows.',
            'The Berlekamp–Massey method finds the shortest register that makes a given stretch of chips. That length is the code\'s linear complexity: n for an m-sequence. 2n chips in a row are always enough; fewer can fit a wrong register.',
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
            'Gold codes fix that. Take two m-sequences of the same length that suit each other, a preferred pair, and add them chip by chip at every one of their N offsets. With the pair itself that gives N + 2 codes.',
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
  ],
  debrief:
    'A spreading code is a shift register: n stages repeat every 2^n − 1 chips, and 2n captured chips rebuild it completely, so the code alone protects nothing. Gold codes give many codes that look unlike each other, so many links can share a band.',
};
