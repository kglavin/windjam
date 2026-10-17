// Data for videos/level3_c1.py and level3_e1.py: the example link, the broadband Eb/J0 the lessons mark, the
// pulse duty, the best-pulse Eb/J0 and the BERs the lessons print.
import { writeFileSync } from 'node:fs';
import { BEST_PULSE_EBJ0, EXAMPLE, LEVEL_3, PULSE_DUTY, bestDuty, flatSteps } from '../../src/engine/lab/levels';
import { berBpsk, undb } from '../../src/engine/lab/theory';

const c1 = flatSteps(LEVEL_3).find((f) => f.step.id === 'C1')?.step;
const marks = c1?.kind === 'lesson' && c1.visual.kind === 'berCurve' ? c1.visual.marks : undefined;
if (!marks || marks.length < 2) throw new Error('level 3 C1 no longer marks the broadband and in-pulse Eb/J0');
const n = 2 ** EXAMPLE.degree - 1;
const gpDb = Number((10 * Math.log10(n)).toFixed(1));
const ebJ0Db = marks[0].db; // broadband, as printed
const onDb = ebJ0Db - 10 * Math.log10(1 / PULSE_DUTY);
const ratio = Number(undb(ebJ0Db).toFixed(1)); // as the E1 text rounds it
writeFileSync(process.argv[2], JSON.stringify({
  gpDb,
  jsDb: Number((gpDb - ebJ0Db).toFixed(1)),
  ebJ0Db,
  duty: PULSE_DUTY,
  onDb,
  berBbn: berBpsk(undb(ebJ0Db)),
  berOn: berBpsk(undb(onDb)),
  ebJ0Ratio: ratio,
  bestPulseEbJ0: BEST_PULSE_EBJ0,
  bestDuty: bestDuty(ratio),
  berBest: bestDuty(ratio) * berBpsk(BEST_PULSE_EBJ0),
}));
