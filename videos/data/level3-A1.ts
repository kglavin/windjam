// Data for videos/level3_a1.py: the band fraction and duty the level 3 lessons use.
import { writeFileSync } from 'node:fs';
import { LEVEL_3, PULSE_DUTY, flatSteps } from '../../src/engine/lab/levels';

const b1 = flatSteps(LEVEL_3).find((f) => f.step.id === 'B1')?.step;
const partial = b1?.kind === 'lesson' && b1.visual.kind === 'berRunDemo' ? b1.visual.variants?.find((v) => v.jammer.kind === 'partial')?.jammer : undefined;
if (!partial || partial.kind !== 'partial') throw new Error('level 3 B1 no longer has a partial-band variant');
writeFileSync(process.argv[2], JSON.stringify({ rho: partial.rho, duty: PULSE_DUTY }));
