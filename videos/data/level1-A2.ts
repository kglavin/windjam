// Data for videos/level1_a2.py: the A1 bits and the chips they become, shown above the spectra.
import { writeFileSync } from 'node:fs';
import { BITS, CHIPS_PER_BIT, spreadingData } from '../../src/ui/lab/visuals/data';

const { sent } = spreadingData();
writeFileSync(process.argv[2], JSON.stringify({ bits: BITS, chipsPerBit: CHIPS_PER_BIT, sent }));
