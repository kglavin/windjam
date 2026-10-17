// Data for videos/level1_a1.py: the bits and one code period of the A1 figure.
import { writeFileSync } from 'node:fs';
import { BITS, CHIPS_PER_BIT, spreadingData } from '../../src/ui/lab/visuals/data';

const { code } = spreadingData();
writeFileSync(process.argv[2], JSON.stringify({ bits: BITS, code: code.slice(0, CHIPS_PER_BIT) }));
