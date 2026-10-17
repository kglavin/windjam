// Data for videos/level1_d1.py: the example code and the example link's autocorrelation over its preamble,
// 0 to 100 µs, as the Autocorr instrument draws it.
import { writeFileSync } from 'node:fs';
import { EXAMPLE } from '../../src/engine/lab/levels/types';
import { autocorrelation } from '../../src/engine/lab/measure';
import { mSequence } from '../../src/engine/lab/pn';
import { knownCapture } from '../../src/ui/lab/knownCapture';

const shot = knownCapture(EXAMPLE);
const usPerSample = 1e6 / shot.sampleRateHz;
const maxLag = Math.round(100 / usPerSample);
const mag = autocorrelation(shot.rx, maxLag, 0, shot.preambleSamples).mag;
writeFileSync(process.argv[2], JSON.stringify({
  code: Array.from(mSequence(EXAMPLE.degree)),
  chipRateMcps: EXAMPLE.chipRateMcps,
  lagUs: Array.from({ length: maxLag + 1 }, (_, i) => i * usPerSample),
  mag: Array.from(mag),
  usPerSample,
}));
