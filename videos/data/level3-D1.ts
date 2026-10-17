// Data for videos/level3_d1.py: the lesson's two pulsed jammers and the theory BERs the lesson quotes.
import { writeFileSync } from 'node:fs';
import { KNOWN_EBN0_DB } from '../../src/engine/lab/berRun';
import { EXAMPLE, LEVEL_3, flatSteps } from '../../src/engine/lab/levels';
import { berBpskJammed, berPulsedBpsk, undb } from '../../src/engine/lab/theory';

const step = flatSteps(LEVEL_3).find((f) => f.step.id === 'D1')?.step;
if (step?.kind !== 'lesson' || step.visual.kind !== 'berRunDemo' || !step.visual.variants) throw new Error('level 3 D1 is no longer a pulsed demo');
const pulses = step.visual.variants.map((v) => v.jammer).filter((j) => j.kind === 'pulsed');
if (pulses.length !== 2) throw new Error('level 3 D1 should compare two pulsed jammers');
const [long, short] = [...pulses].sort((a, b) => b.periodChips - a.periodChips);
const n = 2 ** EXAMPLE.degree - 1;
const jsDb = step.visual.jsDb ?? 10;
const ebN0 = undb(KNOWN_EBN0_DB);
const ebJ0 = n / undb(jsDb);
writeFileSync(process.argv[2], JSON.stringify({
  n,
  chipRateMcps: EXAMPLE.chipRateMcps,
  jsDb,
  duty: long.duty,
  longPeriodChips: long.periodChips,
  shortPeriodChips: short.periodChips,
  berLong: berPulsedBpsk(ebN0, ebJ0, long.duty), // whole bits hit, the rest clean
  berInPulse: berBpskJammed(ebN0, long.duty * ebJ0), // a bit inside a pulse
  berShort: berBpskJammed(ebN0, ebJ0), // averaged within each bit: as broadband noise
}));
