// Level 1: A quiet signal. Texts, tolerances and scoring (design sections 7 and 8).
import {
  type KnownLinkInfo,
  type LevelDef,
  type Truth,
  EXAMPLE,
  FIRST_PRACTICE,
  PRACTICE,
  pr,
  shortCodeTruth,
} from './types';

// Level 1: a short code, one code period per bit, so Gp = n.
export const level1Truth = shortCodeTruth;

export const LEVEL_1: LevelDef = {
  id: 1,
  title: 'A quiet signal',
  intro:
    'An enemy radio link uses spread spectrum. In this level you learn what that means and take the link apart: how fast it sends chips, how long its code is, and how much that protects it. Each idea comes with a worked example first, then one for you to try, then the real thing.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'What spreading does',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Bits become chips',
          visual: { kind: 'spreading' },
          video: 'level1-A1',
          paragraphs: [
            'A radio link sends bits. The top row shows 4 bits: +1, −1, −1, +1. Each bit lasts 7 µs.',
            'Spread spectrum multiplies every bit by a fast pattern called the code. The middle row is the code: 7 short pulses called chips, each 1 µs long, repeated for every bit.',
            'The bottom row is what the transmitter sends: bit × code. A +1 bit sends the code as it is. A −1 bit sends it upside down.',
            'So each bit becomes 7 chips, and chips go by 7 times faster than bits.',
          ],
          check: {
            question: 'With this 7-chip code, how many chips are sent for 10 bits?',
            unit: 'chips',
            answer: 70,
            tol: { exact: true },
            wrong: 'Each bit becomes 7 chips, so 10 bits become 10 × 7.',
          },
        },
        {
          kind: 'lesson',
          id: 'A2',
          title: 'Spreading makes the signal wide and low',
          visual: { kind: 'spreadVsUnspread' },
          video: 'level1-A2',
          paragraphs: [
            'This plot is a spectrum: how much power the signal has at each frequency. The orange line is the bits sent without the code. The blue line is the same bits sent with the code.',
            'Short pulses take up more frequencies than long ones. The chips are 7 times shorter than the bits, so the blue signal is 7 times wider: its hump runs from −1 MHz to +1 MHz, the orange one only from about −0.14 to +0.14 MHz.',
            'Both carry the same power. Spread over 7 times the width, the blue signal is about 7 times lower at each frequency. That is why spread spectrum is hard to see: it can sit below the noise.',
          ],
          check: {
            question: 'If each bit became 70 chips instead of 7, how many times wider would the spread signal be than the unspread one?',
            unit: 'times',
            answer: 70,
            tol: { exact: true },
            wrong: 'The width follows the chips. 70 chips per bit makes each chip 70 times shorter than a bit.',
          },
        },
        {
          kind: 'lesson',
          id: 'A3',
          title: 'The receiver gets the bits back',
          visual: { kind: 'despread' },
          video: 'level1-A3',
          paragraphs: [
            'The friendly receiver knows the code. It multiplies what it receives by the same code again. A chip times itself is always +1, so the code cancels out and the bits come back (third row).',
            "Then it adds up the 7 chips of each bit (bottom row). The signal's 7 chips all point the same way, so they add up to 7. Noise does not follow the code: its chips point up and down at random and mostly cancel.",
            'So after adding, the signal has gained 7 times on the noise. This gain is called the processing gain, Gp. It equals the number of chips per bit.',
            'A receiver without the code cannot do this. That is the advantage the link has over you, and over any jammer.',
            'These lessons use a short code: the same 7 chips for every bit, so the pattern is easy to see. Most links in this lab do the same, because it keeps the measurements simple. Real links often send the preamble with a short code, which helps a receiver lock on, but spread the data with a long code: a pseudo-random sequence far longer than a bit, known to both ends. Every bit is then multiplied by a different stretch of it, with no repeating pattern to find, so guessing the code is hopeless. Gp is still the number of chips per bit. Level 4 meets a long code.',
          ],
          check: {
            question: 'A code has 63 chips per bit. What is its processing gain, in times?',
            unit: 'times',
            answer: 63,
            tol: { exact: true },
            wrong: 'Gp is the number of chips per bit.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Find the enemy signal',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Why you have to get close',
          visual: { kind: 'interceptCompare' },
          paragraphs: [
            'Your intercept receiver does not know the code, so it gets no processing gain. It sees the signal only where the signal is stronger than the noise.',
            "Chip SNR is the signal's power divided by the noise power in the signal's band, in dB. 0 dB means equal; −10 dB means the signal is 10 times weaker than the noise.",
            'Left: the intercept is far away. Chip SNR is −15 dB and the spectrum is flat noise. Right: the intercept is close. Chip SNR is +20 dB and the hump stands out.',
          ],
        },
        {
          kind: 'find',
          id: 'B2',
          title: 'Find the real link',
          atLeastDb: 3,
          instruments: ['spectrum'],
          task:
            'Now the real enemy link. Drag your intercept (amber) toward the enemy transmitter (blue), or type its position, until the chip SNR under At the intercept reaches +3 dB.',
          hint: 'Halving the distance gains about 12 dB.',
          reveal: [
            'Found: chip SNR {interceptSnr} dB. The friendly receiver hears the same link at {rxSnr} dB, below the noise, and still decodes it, because despreading gives it the processing gain.',
          ],
        },
      ],
    },
    {
      id: 'C',
      title: 'Chip rate',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: reading the chip rate',
          visual: { kind: 'spectrum', link: 'example', annotate: true },
          video: 'level1-C1',
          paragraphs: [
            'This is the spectrum of the 31-chip example link, which sends 1 million chips per second.',
            'The fine bumps come from the pattern of the code. What matters is the overall shape, the dashed envelope: one wide hump that falls to zero at ± the chip rate.',
          ],
          steps: [
            'Find the deepest dip on each side of the central hump. These dips are called nulls. Here they are at −1.0 MHz and +1.0 MHz.',
            'Null-to-null bandwidth = right null − left null = 1.0 − (−1.0) = 2.0 MHz.',
            'Chip rate = null-to-null bandwidth ÷ 2 = 1.0 Mcps (million chips per second).',
          ],
          rule: 'The nulls sit at ± the chip rate. Each chip lasts 1 ÷ chip rate: here 1 µs.',
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it: practice link',
          link: 'practice',
          visual: { kind: 'spectrum', link: 'practice' },
          task:
            'Click the spectrum to put the marker on the first null to the right of the hump and read its frequency. Enter the chip rate.',
          hint: 'The first null is the first deep dip to the right of the central hump. The chip rate equals its frequency.',
          fields: [
            {
              id: 'chipRate',
              label: 'Chip rate',
              unit: 'Mcps',
              truth: (_t, ctx) => pr(ctx).chipRateMcps,
              check: { rel: 0.05 },
              points: 0,
            },
          ],
          worked: [
            'The nulls are at −{pChipRate} MHz and +{pChipRate} MHz.',
            'Null-to-null bandwidth = {pChipRate} − (−{pChipRate}) = {pBandwidth} MHz.',
            'Chip rate = {pBandwidth} ÷ 2 = {pChipRate} Mcps.',
          ],
        },
        {
          kind: 'apply',
          id: 'C3',
          title: 'Your turn: the enemy link',
          instruments: ['spectrum'],
          annotate: 'nulls',
          task: 'Same method on the enemy link.',
          hint: 'If the nulls are hard to see, move the intercept closer or choose a finer resolution bandwidth (RBW).',
          fields: [
            {
              id: 'chipRate',
              label: 'Chip rate',
              unit: 'Mcps',
              truth: (t) => t.chipRateMcps,
              check: { rel: 0.05 },
              points: 15,
            },
          ],
          reveal: [
            'The nulls are at ±{chipRate} MHz.',
            'Null-to-null bandwidth = {bandwidth} MHz.',
            'Chip rate = {chipRate} Mcps, so each chip lasts {chipUs} µs.',
          ],
        },
      ],
    },
    {
      id: 'D',
      title: 'Code length',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: reading the code length',
          visual: { kind: 'autocorr', link: 'example', annotate: true },
          video: 'level1-D1',
          paragraphs: [
            'Every transmission starts with a preamble: the code sent over and over with no data on it. Because the code repeats, the signal looks like itself again after one code length.',
            'The autocorrelation plot measures that: how alike the signal is to itself delayed by a given time. 1 means identical, 0 means unrelated.',
          ],
          steps: [
            'The first peak is always at 0: no delay.',
            'The next peaks are at 31 µs, 62 µs and 93 µs. The spacing, 31 µs, is the code period.',
            'Code length = period × chip rate = 31 µs × 1 Mcps = 31 chips.',
          ],
          rule: 'Peaks repeat every code period. Chips in the code = period × chip rate.',
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it: practice link',
          link: 'practice',
          visual: { kind: 'autocorr', link: 'practice' },
          task:
            "This practice link's chip rate is {pChipRate} Mcps (you measured it in C2). Move over the plot to find the code period, then the code length.",
          hint: 'Length = period × chip rate.',
          fields: [
            {
              id: 'period',
              label: 'Code period',
              unit: 'µs',
              group: 0,
              prompt: 'Read the delay of the first peak after 0.',
              truth: (_t, ctx) => pr(ctx).periodUs,
              check: { rel: 0.03 },
              points: 0,
            },
            {
              id: 'length',
              label: 'Code length',
              unit: 'chips',
              group: 1,
              prompt: 'Code length = {pPeriodUs} µs × {pChipRate} Mcps =',
              truth: (_t, ctx) => pr(ctx).n,
              check: { exact: true },
              points: 0,
            },
          ],
          worked: ['The first peak after 0 is at {pPeriodUs} µs.', 'Code length = {pPeriodUs} µs × {pChipRate} Mcps = {pN} chips.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'Your turn: the enemy link',
          instruments: ['autocorr'],
          annotate: 'codePeriods',
          task:
            "The enemy link's chip rate is {chipRate} Mcps (confirmed in C3). Same method: find the code period, then the code length.",
          hint: 'Choose a shorter maximum lag if the peaks are crowded, a longer one if you see none after 0.',
          fields: [
            {
              id: 'period',
              label: 'Code period',
              unit: 'µs',
              group: 0,
              prompt: 'Read the delay of the first peak after 0.',
              truth: (t) => t.n / t.chipRateMcps,
              check: { rel: 0.03 },
              points: 5,
            },
            {
              id: 'length',
              label: 'Code length',
              unit: 'chips',
              group: 1,
              prompt: 'Code length = {periodUs} µs × {chipRate} Mcps =',
              truth: (t) => t.n,
              check: { exact: true },
              points: 10,
            },
          ],
          reveal: ['The peaks are every {periodUs} µs.', 'Code length = {periodUs} µs × {chipRate} Mcps = {n} chips.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'Processing gain',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: processing gain in dB',
          visual: { kind: 'dbTable' },
          paragraphs: [
            'The example link sends one code period per bit, so each bit is 31 chips and Gp = 31.',
            'Gains are usually given in decibels (dB): dB = 10 × log10(ratio). A few to remember: 2 times is 3 dB, 10 times is 10 dB, 100 times is 20 dB. The table has more.',
          ],
          steps: [
            'Gp = 31 chips per bit → 10 × log10(31) = 14.9 dB.',
            'Bit rate = chip rate ÷ chips per bit = 1000 kchips/s ÷ 31 = 32.3 kbps.',
          ],
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it: practice link',
          link: 'practice',
          visual: { kind: 'dbTable' },
          task: 'The practice link has {pN} chips per bit at {pChipRate} Mcps. Enter its Gp in dB and its bit rate.',
          hint: 'Use the table, or 10 × log10({pN}). Bit rate = {pChipRateK} ÷ {pN} kbps.',
          fields: [
            {
              id: 'gpDb',
              label: 'Processing gain',
              unit: 'dB',
              truth: (_t, ctx) => pr(ctx).gpDb,
              check: { abs: 0.5 },
              points: 0,
            },
            {
              id: 'bitRate',
              label: 'Bit rate',
              unit: 'kbps',
              truth: (_t, ctx) => pr(ctx).bitRateKbps,
              check: { rel: 0.05 },
              points: 0,
            },
          ],
          worked: ['Gp = {pN} → 10 × log10({pN}) = {pGpDb} dB.', 'Bit rate = {pChipRateK} kchips/s ÷ {pN} = {pBitRate} kbps.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'Your turn: the enemy link',
          instruments: [],
          visual: { kind: 'dbTable' },
          task: 'The enemy link has {n} chips per bit at {chipRate} Mcps (confirmed in C3 and D3). Enter its Gp in dB and its bit rate.',
          fields: [
            {
              id: 'gpDb',
              label: 'Processing gain',
              unit: 'dB',
              truth: (t) => t.gpDb,
              check: { abs: 1 },
              points: 15,
            },
            {
              id: 'bitRate',
              label: 'Bit rate',
              unit: 'kbps',
              truth: (t) => t.bitRateKbps,
              check: { rel: 0.05 },
              points: 5,
            },
          ],
          reveal: ['Gp = {n} → 10 × log10({n}) = {gpDb} dB.', 'Bit rate = {chipRateK} kchips/s ÷ {n} = {bitRate} kbps.'],
        },
      ],
    },
    {
      id: 'F',
      title: "The receiver's margin",
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: "Example: what the receiver's decoder sees",
          visual: { kind: 'none' },
          paragraphs: [
            "The friendly receiver's budget shows its SNR before despreading. Despreading adds Gp. What its decoder then sees is Eb/N0, the energy of one bit over the noise: Eb/N0 = SNR + Gp, in dB.",
          ],
          steps: ['Example: SNR −8.0 dB and Gp 14.9 dB.', 'Eb/N0 = −8.0 + 14.9 = 6.9 dB.'],
          rule:
            'The link needs about 9.6 dB of Eb/N0 for fewer than 1 error in 100,000 bits. Anything above that is margin, and a jammer has to take the margin away to break the link.',
        },
        {
          kind: 'apply',
          id: 'F2',
          title: "Your turn: the enemy link's margin",
          instruments: [],
          prediction: true,
          task:
            "The friendly receiver's SNR is under Signal path in the budget; its Gp is {gpDb} dB (confirmed in E3). Enter its Eb/N0.",
          fields: [
            {
              id: 'rxEbN0',
              label: 'Eb/N0 at the receiver',
              unit: 'dB',
              truth: (_t, ctx) => ctx.rxEbN0Db,
              check: { abs: 1 },
              points: 20,
              partial: { abs: 3, points: 10 },
            },
          ],
          reveal: ['Eb/N0 = {rxSnr} + {gpDb} = {rxEbN0} dB.', 'Margin = {rxEbN0} − 9.6 = {margin} dB.'],
        },
      ],
    },
    {
      id: 'G',
      title: 'Check your understanding',
      steps: [
        {
          kind: 'questions',
          id: 'G1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'Why can the friendly receiver decode the link when its SNR is below 0 dB?',
              options: [
                'It multiplies by the code and adds up the chips of each bit, gaining Gp',
                'It has a bigger antenna',
                'The noise is lower where it is',
              ],
              correct: 0,
              explain:
                "Despreading adds up the chips of each bit. The signal's chips add up and the noise's mostly cancel, a gain of Gp. Without the code you cannot do this.",
              points: 10,
            },
            {
              id: 'q2',
              text: 'The chip rate doubles and the bit rate stays the same. What happens?',
              options: [
                'The signal gets twice as wide and Gp doubles (+3 dB)',
                'The signal gets twice as wide and Gp stays the same',
                'Gp doubles and the width stays the same',
              ],
              correct: 0,
              explain:
                'Twice the chips per second at the same bits per second means twice the chips per bit, so Gp doubles, and chips half as long, so the signal is twice as wide.',
              points: 10,
            },
            {
              id: 'q3',
              text: 'Your intercept shows only flat noise. What should you do?',
              options: [
                'Move closer to the transmitter to raise the chip SNR',
                'Wait for the preamble',
                'Look at the autocorrelation instead',
              ],
              correct: 0,
              explain:
                'Without the code you get no processing gain, so the only way to see the signal is more signal: get closer, or use a better antenna.',
              points: 10,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'You took an unknown spread-spectrum link apart from outside. You found it, read its chip rate from the spectrum\'s nulls, its code length from the preamble\'s repeats, and worked out its processing gain: {gpDb} dB. In level 2 a jammer tries to beat that gain.',
};


const fixed = (v: number, d: number) => v.toFixed(d);
const trim1 = (v: number) => String(Number(v.toFixed(1)));
const sig3 = (v: number) => String(Number(v.toPrecision(3)));

// Placeholder values for the level texts: the hidden truth plus live scene values.
export function textValues(
  t: Truth,
  live: { interceptSnrDb?: number; rxSnrDb: number; rxEbN0Db: number },
  practice: KnownLinkInfo = FIRST_PRACTICE,
): Record<string, string> {
  const period = t.n / t.chipRateMcps;
  // Eb/N0 is shown as the sum of the rounded SNR and Gp, so the reveal's arithmetic adds up on screen.
  const shownEbN0 = Number(fixed(live.rxSnrDb, 1)) + Number(fixed(t.gpDb, 1));
  return {
    interceptSnr: fixed(live.interceptSnrDb ?? 0, 1),
    rxSnr: fixed(live.rxSnrDb, 1),
    rxEbN0: fixed(shownEbN0, 1),
    margin: fixed(shownEbN0 - 9.6, 1),
    chipRate: fixed(t.chipRateMcps, 1),
    chipRateK: String(Math.round(t.chipRateMcps * 1000)),
    bandwidth: fixed(2 * t.chipRateMcps, 1),
    chipUs: fixed(1 / t.chipRateMcps, 1),
    n: String(t.n),
    degree: String(t.degree),
    periodUs: trim1(period),
    gpDb: fixed(t.gpDb, 1),
    bitRate: sig3(t.bitRateKbps),
    pChipRate: fixed(practice.chipRateMcps, 1),
    pBandwidth: fixed(2 * practice.chipRateMcps, 1),
    pN: String(practice.n),
    pPeriodUs: trim1(practice.periodUs),
    pGpDb: fixed(practice.gpDb, 1),
    pBitRate: sig3(practice.bitRateKbps),
    pChipRateK: String(Math.round(practice.chipRateMcps * 1000)),
  };
}
