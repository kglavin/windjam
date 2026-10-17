// Data for videos/level4_c1.py: a tone against the example's short code, swept from the carrier to 100 kHz. The BER
// is the lesson's theory (berToneShortCode, phase-averaged); the response is the share of the tone's power that
// reaches the bit decision, the code's own spectrum at the tone's offset.
import { writeFileSync } from 'node:fs';
import { EXAMPLE, EX_EBN0_DB, EX_JS_DB, exampleBers } from '../../src/engine/lab/levels';
import { mSequence } from '../../src/engine/lab/pn';
import { berBpsk, berToneShortCode, undb } from '../../src/engine/lab/theory';

const code = mSequence(EXAMPLE.degree);
const n = code.length;
const rcKhz = EXAMPLE.chipRateMcps * 1000;
const eb = undb(EX_EBN0_DB);
const js = undb(EX_JS_DB);
const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const response = (fTc: number) => {
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    re += code[k] * Math.cos(2 * Math.PI * fTc * (k + 0.5));
    im += code[k] * Math.sin(2 * Math.PI * fTc * (k + 0.5));
  }
  return ((re * re + im * im) * sinc(fTc) ** 2) / n;
};
const khz = Array.from({ length: 401 }, (_, i) => i * 0.25);
const phases = Array.from({ length: 64 }, (_, q) => ((q + 0.5) * 2 * Math.PI) / 64);
const lineBers = phases.map((p) => berToneShortCode(eb, js, code, 1 / n, p));
const b = exampleBers();
writeFileSync(process.argv[2], JSON.stringify({
  n,
  lineKhz: rcKhz / n,
  ebN0Db: EX_EBN0_DB,
  jsDb: EX_JS_DB,
  khz,
  ber: khz.map((k) => berToneShortCode(eb, js, code, k / rcKhz)),
  response: khz.map((k) => response(k / rcKhz)),
  carrier: b.carrier,
  line: b.line,
  bbn: b.bbn,
  noJam: berBpsk(eb),
  lineMin: Math.min(...lineBers),
  lineMax: Math.max(...lineBers),
}));
