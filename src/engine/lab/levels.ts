// Link lab level definitions: hidden truth, steps, tolerances, texts and scoring (design sections 7 and 8).
// Pure: no React, no storage.
import { createRng } from '../rng';

export interface Truth {
  seed: number;
  degree: 5 | 6 | 7;
  n: number; // code length in chips, 2^degree - 1
  chipRateMcps: number;
  bitRateKbps: number;
  gp: number;
  gpDb: number;
  carrierCyclesPerChip: number;
}

const DEGREES = [5, 6, 7] as const;
const CHIP_RATES = [0.5, 1, 2];

// Level 1: a short code, one code period per bit, so Gp = n.
export function level1Truth(seed: number): Truth {
  const rng = createRng(seed);
  const degree = DEGREES[Math.floor(rng() * DEGREES.length)];
  const chipRateMcps = CHIP_RATES[Math.floor(rng() * CHIP_RATES.length)];
  const carrierCyclesPerChip = rng() * 0.003;
  const n = 2 ** degree - 1;
  return {
    seed,
    degree,
    n,
    chipRateMcps,
    bitRateKbps: (chipRateMcps * 1000) / n,
    gp: n,
    gpDb: 10 * Math.log10(n),
    carrierCyclesPerChip,
  };
}

// Live values from the scene budget at the moment of submission.
export interface Ctx {
  rxSnrDb: number;
  rxEbN0Db: number;
}

export interface FieldDef {
  id: string;
  label: string;
  unit: string;
  truth: (t: Truth, ctx: Ctx) => number;
  check: { rel?: number; abs?: number; exact?: boolean };
  points: number;
  // Reduced credit for an answer outside `check` but inside this tolerance.
  partial?: { abs: number; points: number };
}

export function checkField(f: FieldDef, value: number, t: Truth, ctx: Ctx): { ok: boolean; truth: number; points: number } {
  const truth = f.truth(t, ctx);
  const err = Math.abs(value - truth);
  const within = (c: { rel?: number; abs?: number; exact?: boolean }) => {
    if (!Number.isFinite(value)) return false;
    if (c.exact) return value === truth;
    if (c.rel !== undefined) return err <= c.rel * Math.abs(truth);
    if (c.abs !== undefined) return err <= c.abs;
    return false;
  };
  const ok = within(f.check);
  if (ok) return { ok, truth, points: f.points };
  if (f.partial && Number.isFinite(value) && err <= f.partial.abs) return { ok, truth, points: f.partial.points };
  return { ok, truth, points: 0 };
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correct: number;
  explain: string;
  points: number;
}

export interface StepDef {
  id: string;
  title: string;
  task: string;
  hint?: string;
  instruments: ('spectrum' | 'autocorr')[];
  goal:
    | { kind: 'interceptSnr'; atLeastDb: number }
    | { kind: 'fields'; fields: FieldDef[] }
    | { kind: 'questions'; questions: Question[] };
  reveal: string;
  tryThis?: string;
  annotate?: 'nulls' | 'codePeriods';
}

export interface LevelDef {
  id: number;
  title: string;
  intro: string;
  steps: StepDef[];
  debrief: string;
  passMark: number;
}

export const LEVEL_1: LevelDef = {
  id: 1,
  title: 'A quiet signal',
  intro:
    'An enemy link uses direct-sequence spread spectrum (DSSS). Before you can attack it you need its shape: how fast it chips, how long its code is, and how much processing gain that gives it. Those numbers decide how much jamming power every attack in the later levels will need.',
  passMark: 60,
  steps: [
    {
      id: 'find',
      title: 'Find the signal',
      instruments: ['spectrum'],
      goal: { kind: 'interceptSnr', atLeastDb: 3 },
      task:
        'Your intercept receiver (amber) is far from the enemy transmitter, and the spectrum shows only noise. Drag the intercept toward the transmitter, or type its position, until its chip SNR is at least +3 dB.',
      hint:
        'Watch Chip SNR under At the intercept. Halving the distance gains about 12 dB on a two-ray path and 6 dB in free space.',
      reveal:
        "The signal is out of the noise at {interceptSnr} dB per chip. Now look at the friendly receiver: its SNR is {rxSnr} dB, below the noise, yet the link works. A DSSS transmitter spreads each bit over many chips, so per hertz it is weaker than the noise. The friendly receiver knows the code and adds the chips of each bit back together (despreading), which recovers the processing gain. You don't know the code, so you have to get closer.",
    },
    {
      id: 'chiprate',
      title: 'Bandwidth and chip rate',
      instruments: ['spectrum'],
      annotate: 'nulls',
      task:
        'Each chip is a rectangular pulse, so the spectrum has a sinc² shape: a main lobe centred on the carrier, first nulls at ± the chip rate, and smaller side lobes beyond. Click the spectrum to put the marker on each first null and read its frequency. Enter the null-to-null bandwidth and the chip rate.',
      hint: 'If the nulls are hard to see, choose a finer resolution bandwidth or move the intercept closer.',
      goal: {
        kind: 'fields',
        fields: [
          {
            id: 'bandwidth',
            label: 'Null-to-null bandwidth',
            unit: 'MHz',
            truth: (t) => 2 * t.chipRateMcps,
            check: { rel: 0.1 },
            points: 5,
          },
          {
            id: 'chipRate',
            label: 'Chip rate',
            unit: 'Mcps',
            truth: (t) => t.chipRateMcps,
            check: { rel: 0.05 },
            points: 10,
          },
        ],
      },
      reveal:
        'Chip rate {chipRate} Mcps. The nulls sit at ±{chipRate} MHz, so the main lobe is {bandwidth} MHz wide, and each chip lasts 1/Rc = {chipUs} µs.',
    },
    {
      id: 'code',
      title: 'Code length',
      instruments: ['autocorr'],
      annotate: 'codePeriods',
      task:
        'Every transmission starts with a preamble: the spreading code repeated with no data on it. A repeating sequence matches itself when shifted by a whole period, so the autocorrelation of the preamble has a peak at every multiple of the code period. Set the window to preamble, read the spacing between peaks, and work out how many chips the code has: period × chip rate.',
      hint: 'Move over the plot to read the lag. Choose a longer maximum lag if you see fewer than two peaks.',
      goal: {
        kind: 'fields',
        fields: [
          {
            id: 'period',
            label: 'Code period',
            unit: 'µs',
            truth: (t) => t.n / t.chipRateMcps,
            check: { rel: 0.02 },
            points: 0,
          },
          {
            id: 'length',
            label: 'Code length',
            unit: 'chips',
            truth: (t) => t.n,
            check: { exact: true },
            points: 10,
          },
        ],
      },
      reveal:
        'The code is {n} chips long, period {periodUs} µs. {n} = 2^{degree} − 1: a maximal-length sequence from a {degree}-stage shift register. The main peak is a triangle two chips wide at its base, because shifting by a chip or more leaves the chips unrelated.',
      tryThis:
        'Switch the window to data. The peaks vanish: each bit multiplies a whole code period by +1 or −1 at random, so the shifted copies agree with either sign equally often and cancel. Now switch the mode to fluctuation. It averages the square of correlations over short windows, which does not cancel, so the code period shows again. That is how you would find a short code that has no preamble.',
    },
    {
      id: 'gain',
      title: 'Processing gain',
      instruments: ['autocorr'],
      task:
        'This link uses a short code: one full code period per bit. So a bit lasts one code period, the bit rate is 1 / period, and the processing gain is Gp = chip rate / bit rate, the number of chips per bit. Enter the bit rate and Gp in dB (10·log10 Gp).',
      goal: {
        kind: 'fields',
        fields: [
          {
            id: 'bitRate',
            label: 'Bit rate',
            unit: 'kbps',
            truth: (t) => t.bitRateKbps,
            check: { rel: 0.05 },
            points: 5,
          },
          {
            id: 'gpDb',
            label: 'Processing gain',
            unit: 'dB',
            truth: (t) => t.gpDb,
            check: { abs: 1 },
            points: 10,
          },
        ],
      },
      reveal:
        'Gp = {n} = {gpDb} dB. After despreading, the signal stands {gpDb} dB higher relative to anything that does not carry the code, a jammer included. Broadband noise therefore needs {gpDb} dB more power to do the damage it would do to an unspread link.',
    },
    {
      id: 'predict',
      title: "Predict the receiver's Eb/N0",
      instruments: [],
      task:
        "Under Signal path the budget shows the friendly receiver's SNR in the chip bandwidth. Predict the Eb/N0 its correlator sees after despreading.",
      goal: {
        kind: 'fields',
        fields: [
          {
            id: 'rxEbN0',
            label: 'Eb/N0 at the receiver',
            unit: 'dB',
            truth: (_t, ctx) => ctx.rxEbN0Db,
            check: { abs: 1 },
            points: 30,
            partial: { abs: 3, points: 15 },
          },
        ],
      },
      reveal:
        'Eb/N0 = SNR + Gp = {rxSnr} + {gpDb} = {rxEbN0} dB. Coherent BPSK needs about 9.6 dB for an error rate of 1 in 100,000, so this link has {margin} dB of margin. Every attack in the next levels has to eat through that margin, after losing Gp to despreading.',
    },
    {
      id: 'questions',
      title: 'Check your understanding',
      instruments: [],
      task: 'Three short questions. One attempt each.',
      goal: {
        kind: 'questions',
        questions: [
          {
            id: 'q1',
            text: 'Why could the friendly receiver decode a signal below the noise when your intercept could not see it at a similar SNR?',
            options: [
              'Despreading adds up the chips of each bit, which only a receiver that knows the code can do',
              'The friendly receiver has a better antenna',
              'The noise is lower at the friendly receiver',
            ],
            correct: 0,
            explain:
              'Only a receiver holding the code can despread. Despreading gains Gp for the signal and nothing for noise or a jammer, so the friendly receiver works at a chip SNR an interceptor cannot use.',
            points: 10,
          },
          {
            id: 'q2',
            text: 'If the chip rate doubled and the data rate stayed the same, what would happen?',
            options: [
              'Bandwidth and Gp both double: Gp rises by 3 dB',
              'Bandwidth doubles and Gp stays the same',
              'Gp doubles and the bandwidth stays the same',
            ],
            correct: 0,
            explain:
              'Gp is chips per bit. Twice the chip rate at the same bit rate means twice the chips per bit and twice the occupied bandwidth.',
            points: 10,
          },
          {
            id: 'q3',
            text: 'Why did the autocorrelation peaks disappear in the data window?',
            options: [
              'Random data flips the sign of whole code periods, so shifted copies cancel',
              'The noise is stronger during data',
              'The code changes after the preamble',
            ],
            correct: 0,
            explain:
              'The code is the same throughout. Each bit multiplies one period by ±1, so a shift of one period lines up periods with random relative signs, and their contributions cancel on average.',
            points: 10,
          },
        ],
      },
      reveal: '',
    },
  ],
  debrief:
    "You measured the link from outside. The spectrum's nulls gave the chip rate, the preamble's autocorrelation gave the code length, and together they gave the processing gain: {gpDb} dB. Every attack pays that price, because despreading dilutes anything that does not carry the code. Level 2 measures exactly how much broadband noise that costs.",
};

export const LEVELS: LevelDef[] = [LEVEL_1];

export function fillText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

const fixed = (v: number, d: number) => v.toFixed(d);

// Placeholder values for the level texts: the hidden truth plus live scene values.
export function textValues(t: Truth, live: { interceptSnrDb?: number; rxSnrDb: number; rxEbN0Db: number }): Record<string, string> {
  const period = t.n / t.chipRateMcps;
  // Eb/N0 is shown as the sum of the rounded SNR and Gp, so the reveal's arithmetic adds up on screen.
  const shownEbN0 = Number(fixed(live.rxSnrDb, 1)) + Number(fixed(t.gpDb, 1));
  return {
    interceptSnr: fixed(live.interceptSnrDb ?? 0, 1),
    rxSnr: fixed(live.rxSnrDb, 1),
    rxEbN0: fixed(shownEbN0, 1),
    margin: fixed(shownEbN0 - 9.6, 1),
    chipRate: fixed(t.chipRateMcps, 2),
    bandwidth: fixed(2 * t.chipRateMcps, 2),
    chipUs: fixed(1 / t.chipRateMcps, 1),
    n: String(t.n),
    degree: String(t.degree),
    periodUs: fixed(period, 1),
    gpDb: fixed(t.gpDb, 1),
  };
}
