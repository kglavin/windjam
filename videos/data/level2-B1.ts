// Data for videos/level2_b1.py: the example link's chips per bit and the lesson's Gp and J/S.
import { writeFileSync } from 'node:fs';
import { EXAMPLE, LEVEL_2, flatSteps } from '../../src/engine/lab/levels';

const step = flatSteps(LEVEL_2).find((f) => f.step.id === 'B1')?.step;
if (step?.kind !== 'lesson' || step.visual.kind !== 'despreadBars' || step.visual.gpDb === undefined || step.visual.jsDb === undefined) {
  throw new Error('level 2 B1 is no longer a despreadBars lesson with fixed Gp and J/S');
}
writeFileSync(process.argv[2], JSON.stringify({
  n: 2 ** EXAMPLE.degree - 1,
  chipRateMcps: EXAMPLE.chipRateMcps,
  gpDb: step.visual.gpDb,
  jsDb: step.visual.jsDb,
}));
