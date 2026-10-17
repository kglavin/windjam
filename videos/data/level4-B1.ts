// Data for videos/level4_b1.py: the example link with a short and a long code, the lesson's tone and the theory BERs.
import { writeFileSync } from 'node:fs';
import { KNOWN_EBN0_DB, LONG_DEGREE } from '../../src/engine/lab/berRun';
import { EXAMPLE, LEVEL_4, TONE_FTC, flatSteps } from '../../src/engine/lab/levels';
import { mSequence } from '../../src/engine/lab/pn';
import { berBpskJammed, berToneLongCode, undb } from '../../src/engine/lab/theory';

const step = flatSteps(LEVEL_4).find((f) => f.step.id === 'B1')?.step;
if (step?.kind !== 'lesson' || step.visual.kind !== 'berRunDemo') throw new Error('level 4 B1 is no longer a run demo');
const n = 2 ** EXAMPLE.degree - 1;
const jsDb = step.visual.jsDb ?? 10;
const ebN0 = undb(KNOWN_EBN0_DB);
writeFileSync(process.argv[2], JSON.stringify({
  n,
  chipRateMcps: EXAMPLE.chipRateMcps,
  jsDb,
  fTc: TONE_FTC,
  shortCode: Array.from(mSequence(EXAMPLE.degree)),
  longCode: Array.from(mSequence(LONG_DEGREE).slice(0, 3 * n)), // the first three bits' worth
  berBbn: berBpskJammed(ebN0, n / undb(jsDb)),
  berTone: berToneLongCode(ebN0, n, undb(jsDb), TONE_FTC),
}));
