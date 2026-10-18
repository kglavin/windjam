// Data for videos/level0_f3.py: the free space loss and the fade probabilities the lesson quotes, from the engine.
import { writeFileSync } from 'node:fs';
import { fadeProbability, freeSpaceDb } from '../../src/engine/lab/urban';

writeFileSync(process.argv[2], JSON.stringify({
  fsl: freeSpaceDb(300, 10),
  fades: [10, 20, 30].map((m) => ({ margin: m, p: fadeProbability(m) })),
}));
