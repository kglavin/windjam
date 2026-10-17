// Data for videos/level1_a3.py: the A3 figure's received chips (sent + noise), code, product and sums.
import { writeFileSync } from 'node:fs';
import { CHIPS_PER_BIT, NOISE_SD, despreadData } from '../../src/ui/lab/visuals/data';

const d = despreadData();
writeFileSync(process.argv[2], JSON.stringify({
  chipsPerBit: CHIPS_PER_BIT,
  noiseSd: NOISE_SD,
  bits: d.bits,
  code: d.code,
  sent: d.sent,
  noise: d.received.map((v, k) => v - d.sent[k]),
  sums: d.sums,
}));
