// Level 10: Many users and antenna arrays (docs/design-level-10.md). Units A to C: many users in one band, near and
// far, finding an unknown code. Every number in the texts is checked in level10.test.ts.
import { createRng } from '../../rng';
import { type User, CHIPS, codeOf, discoverCode } from '../cdma';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level10Truth = shortCodeTruth;

const db = (x: number) => 10 * Math.log10(x);
const pick = <T,>(t: Truth, salt: number, list: T[]): T => list[Math.floor(createRng((t.seed ^ salt) >>> 0)() * list.length)];

// --- Unit A ----------------------------------------------------------------------------------------------------------

export const GOAL_SINR = 2.7; // BER 0.01 for BPSK: Q(√(2 × 2.7)) ≈ 0.01
export const ruleSinrGp = (gp: number, k: number): number => gp / (k - 1);
export const maxUsers = (gp: number): number => Math.floor(1 + gp / GOAL_SINR);
const OFFSETS = [0, 13, 5, 22, 9, 27, 17, 3, 25, 11];
export const exampleUsers = (k: number): User[] => Array.from({ length: k }, (_, i) => ({ code: 2 + i, powerDb: 10, offset: OFFSETS[i] }));
export const a3Users = (t: Truth): number => pick(t, 0xa3, [4, 5, 6, 7, 8]);
const A2_SETS = [{ gp: 63, k: 8 }, { gp: 127, k: 20 }, { gp: 31, k: 4 }, { gp: 255, k: 40 }];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
export const cdmaA2Set = (n: number) => at(A2_SETS, n);

// --- Unit B: near and far --------------------------------------------------------------------------------------------

export const NEAR_FAR: User[] = [{ code: 2, powerDb: 14, offset: 0 }, { code: 9, powerDb: -2, offset: 11 }];
export const b2Numbers = (t: Truth) => {
  const gap = pick(t, 0xb2, [14, 16, 18]);
  const weak = pick(t, 0xb3, [-4, -2, 0]);
  const rhoN = pick(t, 0xb4, [7, 9]);
  return { gap, weak, rhoN, interferenceDb: gap + 20 * Math.log10(rhoN / CHIPS), sicDb: db(CHIPS) + weak };
};

// --- Unit C: finding an unknown code ---------------------------------------------------------------------------------

export const PIECE_STEPS = [5, 10, 20, 50, 100, 200, 400, 800, 1600];
export const DISCOVER_EXAMPLE = { code: 9, snrDb: -6 };
export const c2Setup = (t: Truth) => ({ code: pick(t, 0xc2, [9, 14, 20]), snrDb: pick(t, 0xc3, [-5, -7, -9]) });
// The fewest pieces from which every larger step recovers all 31 chips.
export function fewestPieces(code: number, snrDb: number, seed = 1): number {
  let best = PIECE_STEPS[PIECE_STEPS.length - 1];
  for (let i = PIECE_STEPS.length - 1; i >= 0; i--) {
    if (discoverCode(codeOf(code), snrDb, PIECE_STEPS[i], seed).agree < CHIPS) break;
    best = PIECE_STEPS[i];
  }
  return best;
}

const f1 = (v: number) => v.toFixed(1);

export function level10Values(t: Truth, practiceN: number): Record<string, string> {
  const a2 = cdmaA2Set(practiceN);
  const k3 = a3Users(t);
  const b = b2Numbers(t);
  const c = c2Setup(t);
  return {
    pN: String(practiceN),
    gp: String(t.n),
    k3: String(k3),
    rule3: f1(ruleSinrGp(t.n, k3)),
    max3: String(maxUsers(t.n)),
    max3Raw: f1(1 + t.n / GOAL_SINR),
    pGp: String(a2.gp),
    pK: String(a2.k),
    pRule: f1(ruleSinrGp(a2.gp, a2.k)),
    pMax: String(maxUsers(a2.gp)),
    pMaxRaw: f1(1 + a2.gp / GOAL_SINR),
    gap: String(b.gap),
    weak: String(b.weak),
    rhoN: String(b.rhoN),
    rhoDb: f1(20 * Math.log10(b.rhoN / CHIPS)),
    interf: f1(b.interferenceDb),
    sicDb: f1(b.sicDb),
    snrC: String(c.snrDb),
    pieces: String(fewestPieces(c.code, c.snrDb)),
  };
}

export const LEVEL_10: LevelDef = {
  id: 10,
  title: 'Many users and antenna arrays',
  intro:
    'So far there was one enemy link and one antenna at each end. This level adds many of both. Many users can share one band by each using its own code, and you will see what that costs them and how an attacker can find a code without being told it. Then many antennas: an array can point a beam, put a null on a jammer, and find several transmitters at once.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Many users in one band',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Example: codes sharing a band',
          visual: { kind: 'cdma', example: 'many' },
          paragraphs: [
            'Give every user its own [[code|code]] and they can all send at once, in the same band. The receiver despreads with one user\'s code: that user\'s chips add up, the others\' do not. This is code-division multiple access, CDMA.',
            'The others do not vanish. Each adds a little: its power cut by the [[processing gain|gp]]. With K users of equal power, each sees the other K − 1 as noise: SINR ≈ Gp ÷ (K − 1), when the receiver\'s own noise is small.',
            'That is a first estimate, for codes that look random to each other. Real codes, arriving at different chip offsets, do better or worse user by user: the panel works out each one exactly. Slide the number of users and watch the BER climb.',
          ],
          steps: [
            'Gp = 31. With 6 equal users, each sees 5 others: SINR ≈ 31 ÷ 5 = 6.2.',
            'For a BER of 0.01, BPSK needs SINR of about 2.7.',
            'So the band holds about 1 + 31 ÷ 2.7 = 12 users before each falls below the goal.',
            'More chips per bit, more users: Gp 127 holds about 48.',
          ],
          rule: 'SINR ≈ Gp ÷ (K − 1). Users that fit a BER of 0.01: about 1 + Gp ÷ 2.7.',
          check: {
            question: 'Gp 31 and 11 equal users. What SINR does the rule give?',
            answer: 3.1,
            tol: { abs: 0.05 },
            wrong: '31 ÷ (11 − 1).',
          },
        },
        {
          kind: 'practice',
          id: 'A2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A CDMA band with Gp {pGp} carries {pK} equal users. What SINR does each see by the rule, and how many users fit a BER of 0.01?',
          hint: 'SINR ≈ Gp ÷ (K − 1). Users ≈ 1 + Gp ÷ 2.7, rounded down.',
          fields: [
            { id: 'sinr', label: 'SINR', unit: '', truth: (_t, ctx) => ruleSinrGp(cdmaA2Set(ctx.practiceN ?? 0).gp, cdmaA2Set(ctx.practiceN ?? 0).k), check: { rel: 0.03 }, points: 0 },
            { id: 'max', label: 'Users that fit', unit: '', truth: (_t, ctx) => maxUsers(cdmaA2Set(ctx.practiceN ?? 0).gp), check: { abs: 1 }, points: 0 },
          ],
          worked: ['{pGp} ÷ ({pK} − 1) = {pRule}.', '1 + {pGp} ÷ 2.7 = {pMaxRaw}: {pMax} users.'],
        },
        {
          kind: 'apply',
          id: 'A3',
          title: 'The enemy: its net',
          instruments: [],
          task: 'An enemy net shares one band with Gp {gp}; {k3} stations send at equal power. What SINR does each see by the rule, and how many stations could the band hold at a BER of 0.01?',
          hint: 'SINR ≈ Gp ÷ (K − 1). Stations ≈ 1 + Gp ÷ 2.7, rounded down.',
          fields: [
            { id: 'sinr', label: 'SINR', unit: '', truth: (t) => ruleSinrGp(t.n, a3Users(t)), check: { rel: 0.03 }, points: 5 },
            { id: 'max', label: 'Stations that fit', unit: '', truth: (t) => maxUsers(t.n), check: { abs: 1 }, points: 10 },
          ],
          reveal: ['{gp} ÷ ({k3} − 1) = {rule3}.', '1 + {gp} ÷ 2.7 = {max3Raw}: about {max3} stations. Each extra station is a little more noise for all the others.'],
        },
      ],
    },
    {
      id: 'B',
      title: 'Near and far',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: the loud one and the quiet one',
          visual: { kind: 'cdma', example: 'nearfar' },
          paragraphs: [
            'Codes only cut the others down by about the processing gain. A user close to the receiver can arrive so much stronger than a far one that even cut down it buries the far one: the near-far problem.',
            'One cure is power control: tell the near ones to turn down. Another is successive cancellation: decode the strongest user first, rebuild its chips exactly, subtract them, then decode the next.',
          ],
          steps: [
            'The near user arrives at 14 dB per chip, the far one at −2 dB: 16 dB apart.',
            'At their offset the near user\'s code overlaps the far one\'s by about 6/31 of its chips, so after despreading it still adds about 16 − 14 = 2 dB more than the far user\'s own signal. The far user\'s BER: 0.38.',
            'Cancel the near user first. What is left is the far user and the noise: SINR = 31 × 10^(−0.2) ≈ 19.6, and its BER falls to about 0.000005.',
          ],
          rule: 'A strong user buries a weak one by its power gap less what the code cuts. Decode the strong one, subtract it, then decode the weak.',
          check: {
            question: 'A strong user is 20 dB above a weak one; their codes overlap by 1/10 (−20 dB). How many dB above the weak user\'s signal is the strong one after despreading?',
            unit: 'dB',
            answer: 0,
            tol: { abs: 0.1 },
            wrong: '20 + 20 × log10(1/10) = 20 − 20.',
          },
        },
        {
          kind: 'apply',
          id: 'B2',
          title: 'The enemy: a near and a far station',
          instruments: [],
          task: 'Two enemy stations share a band (Gp 31): the near one arrives {gap} dB above the far one, which is at {weak} dB per chip. Their codes overlap by about {rhoN}/31. How many dB does the near one end up above the far one\'s signal after despreading, and what SINR in dB does the far one get once the near one is cancelled?',
          hint: 'Gap plus 20 × log10(overlap). After cancelling: Gp in dB plus the far one\'s dB per chip.',
          fields: [
            { id: 'interf', label: 'Near above far, after despreading', unit: 'dB', truth: (t) => b2Numbers(t).interferenceDb, check: { abs: 0.3 }, points: 7 },
            { id: 'sic', label: 'Far SINR after cancelling', unit: 'dB', truth: (t) => b2Numbers(t).sicDb, check: { abs: 0.3 }, points: 8 },
          ],
          reveal: ['{gap} + 20 × log10({rhoN}/31) = {gap} + ({rhoDb}) = {interf} dB.', 'After cancelling: 10 × log10(31) + ({weak}) = {sicDb} dB.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'Finding an unknown code',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: a code out of the noise',
          visual: { kind: 'discover', link: 'example' },
          paragraphs: [
            'You do not know the enemy\'s code, and its chips are below the noise. But a short code repeats every bit. Cut the received chips into pieces one code period long: every piece holds the same code, flipped by its data bit, plus fresh noise.',
            'Average how each chip in a piece goes with every other chip. The noise averages away; the code\'s pattern does not, and the bit flips do not spoil it because a flip turns the whole piece over at once. The strongest pattern in that average is the code.',
            'A long code never repeats within what you capture, so this finds nothing: one more reason real links spread data with long codes.',
          ],
          steps: [
            'The example: a 31-chip code at −6 dB per chip.',
            'With 5 pieces the estimate gets 27 of 31 chips right. With 20 or more it gets all 31.',
            'The weaker the signal, the more pieces it takes.',
          ],
          rule: 'A short code can be found blind by averaging code-length pieces; the weaker the signal, the more pieces. A long code cannot.',
          check: {
            question: 'At 1 Mcps a 31-chip code repeats every 31 µs. How long a capture holds 1600 pieces, in ms?',
            unit: 'ms',
            answer: 49.6,
            tol: { abs: 0.1 },
            wrong: '1600 × 31 µs.',
          },
        },
        {
          kind: 'apply',
          id: 'C2',
          title: 'The enemy: find its code',
          instruments: ['discover'],
          task: 'You have captured an enemy station whose code you do not know, at {snrC} dB per chip. Slide the number of pieces averaged: what is the fewest that finds all 31 chips, and keeps finding them with more?',
          hint: 'Watch the count of chips found as you slide up.',
          fields: [
            { id: 'pieces', label: 'Fewest pieces', unit: '', truth: (t) => fewestPieces(c2Setup(t).code, c2Setup(t).snrDb), check: { exact: true }, points: 10 },
          ],
          reveal: ['From {pieces} pieces on, every chip of the code is found.'],
        },
      ],
    },
  ],
  debrief:
    'Codes let many users share a band, each paying for the others in interference: SINR ≈ Gp ÷ (K − 1). A near user can bury a far one, which cancellation undoes. And a short code can be found without being told it, by averaging pieces of the signal: one more reason links spread data with long codes.',
};
