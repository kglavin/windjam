// The Peaks figure's data: 8 tones 0.05 cycles per chip apart, in phase, with random phases and with Newman phases,
// all at the same average power. Generated at 4 samples per chip so the tones are pure (no chip-filter weighting)
// and the peak of 8 tones in phase is exactly 8 times the average.
import { createRng } from '../rng';
import { jammer, jammerStats } from './jammers';

export const PEAK_TONES = 8;
export const PEAK_SPACING = 0.05; // cycles per chip
export const PEAK_S = 4;
export const PEAK_CHIPS = 40; // two periods of the pattern (it repeats every 1 / 0.05 = 20 chips)
export const PEAK_RANDOM_SEED = 8; // a random phase set whose PAPR is close to the mean over many sets

export type PeakKind = 'zero' | 'random' | 'newman';

export interface PeakSet {
  kind: PeakKind;
  env: number[]; // |x|^2 per sample, average power 1
  meanPower: number;
  peakPower: number;
  paprDb: number;
}

export function peakSet(kind: PeakKind, seed = PEAK_RANDOM_SEED): PeakSet {
  const x = jammer({ kind: 'multitone', q: PEAK_TONES, spacing: PEAK_SPACING, phases: kind }, 1)(PEAK_CHIPS * PEAK_S, PEAK_S, createRng(seed), 0);
  const env: number[] = [];
  for (let i = 0; i < x.re.length; i++) env.push(x.re[i] * x.re[i] + x.im[i] * x.im[i]);
  return { kind, env, ...jammerStats(x) };
}

// Mean PAPR in dB of random phase sets over seeds 1..count.
export function meanRandomPaprDb(count = 200): number {
  let sum = 0;
  for (let s = 1; s <= count; s++) sum += peakSet('random', s).paprDb;
  return sum / count;
}
