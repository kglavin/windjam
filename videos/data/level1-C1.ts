// Data for videos/level1_c1.py: the example link's spectrum as the Spectrum instrument draws it (default RBW),
// and the level of its sinc² envelope.
import { writeFileSync } from 'node:fs';
import { EXAMPLE } from '../../src/engine/lab/levels/types';
import { toDb, welchPsd } from '../../src/engine/lab/measure';
import { knownCapture } from '../../src/ui/lab/knownCapture';

const shot = knownCapture(EXAMPLE);
const { freq, psd } = welchPsd(shot.rx, 128);
const db = Array.from(toDb(psd));
const mhz = Array.from(freq, (f) => (f * shot.sampleRateHz) / 1e6);
const rc = EXAMPLE.chipRateMcps;
const sinc2 = (f: number) => (Math.abs(f) < 1e-9 ? 1 : (Math.sin(Math.PI * f) / (Math.PI * f)) ** 2);
let sum = 0;
let n = 0;
mhz.forEach((f, i) => {
  if (Math.abs(f) < 0.5 * rc) {
    sum += db[i] - 10 * Math.log10(sinc2(f / rc));
    n++;
  }
});
const top = Math.ceil(Math.max(...db) / 10) * 10 + 10;
writeFileSync(process.argv[2], JSON.stringify({ mhz, db, envOffset: sum / n, top, chipRateMcps: rc, n: 2 ** EXAMPLE.degree - 1 }));
