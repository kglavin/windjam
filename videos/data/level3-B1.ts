// Data for videos/level3_b1.py: the example link, the lesson's two jammers and their theory BERs, from the same
// functions the lesson's demo uses.
import { writeFileSync } from 'node:fs';
import { KNOWN_EBN0_DB } from '../../src/engine/lab/berRun';
import { EXAMPLE, LEVEL_3, flatSteps } from '../../src/engine/lab/levels';
import { berBpskJammed, berPartialBandDsss, sincSquaredMean, undb } from '../../src/engine/lab/theory';

const step = flatSteps(LEVEL_3).find((f) => f.step.id === 'B1')?.step;
const partial = step?.kind === 'lesson' && step.visual.kind === 'berRunDemo' ? step.visual.variants?.find((v) => v.jammer.kind === 'partial')?.jammer : undefined;
if (!partial || partial.kind !== 'partial' || step?.kind !== 'lesson' || step.visual.kind !== 'berRunDemo') throw new Error('level 3 B1 no longer has a partial-band variant');
const jsDb = step.visual.jsDb ?? 10; // the demo's default
const n = 2 ** EXAMPLE.degree - 1;
const ebN0 = undb(KNOWN_EBN0_DB);
const js = undb(jsDb);
const weight = sincSquaredMean(-partial.rho / 2, partial.rho / 2);
writeFileSync(process.argv[2], JSON.stringify({
  n,
  chipRateMcps: EXAMPLE.chipRateMcps,
  jsDb,
  rho: partial.rho,
  weight, // the partial-band jammer's level after despreading, relative to broadband noise of the same J/S
  berBbn: berBpskJammed(ebN0, n / js),
  berPartial: berPartialBandDsss(ebN0, n, js, partial.rho),
}));
