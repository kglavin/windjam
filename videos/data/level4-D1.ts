// Data for videos/level4_d1.py: the Peaks figure's 8 tones, the phases the engine gives them (zero, random with the
// figure's seed, Newman) and each set's PAPR, so the video's tones are the figure's.
import { writeFileSync } from 'node:fs';
import { createRng } from '../../src/engine/rng';
import { PEAK_CHIPS, PEAK_RANDOM_SEED, PEAK_S, PEAK_SPACING, PEAK_TONES, peakSet } from '../../src/engine/lab/peaks';

// The same draws jammers.ts makes for phases: 'random' (one rng() per tone, in order).
const rng = createRng(PEAK_RANDOM_SEED);
const phases = {
  zero: Array.from({ length: PEAK_TONES }, () => 0),
  random: Array.from({ length: PEAK_TONES }, () => 2 * Math.PI * rng()),
  newman: Array.from({ length: PEAK_TONES }, (_, i) => (Math.PI * i * i) / PEAK_TONES),
};
const sets = Object.fromEntries((['zero', 'random', 'newman'] as const).map((k) => {
  const s = peakSet(k);
  return [k, { paprDb: s.paprDb, peak: s.peakPower / s.meanPower, env: s.env.map((v) => v / s.meanPower) }];
}));
writeFileSync(process.argv[2], JSON.stringify({
  q: PEAK_TONES, spacing: PEAK_SPACING, s: PEAK_S, chips: PEAK_CHIPS, phases, sets,
}));
