// Data for the level 5 videos (level5_a1.py, level5_b1.py, level5_c1.py): the example's copies, jammers, front end
// and theory BERs, from the functions the lessons print. Each level5-<step>.ts writes this to its own path.
import { writeFileSync } from 'node:fs';
import {
  BLIND_PULSES, COPIES, EXAMPLE, EX_BLIND_PERIOD, EX_JS5_DB, EX_RECOVERY_COPIES, ONE_COPY, WHOLE_BIT, exampleFrontEnd, exampleTheory,
} from '../../src/engine/lab/levels';
import { berBpsk, berRepetitionMajority, undb } from '../../src/engine/lab/theory';

const n = 2 ** EXAMPLE.degree - 1;
const pulseCopies = (j: typeof ONE_COPY) => (j.kind === 'pulsed' ? { periodCopies: j.periodChips / n, onCopies: (j.duty * j.periodChips) / n } : null);
const copyEbJ0 = n / undb(EX_JS5_DB); // per copy, broadband
writeFileSync(process.argv[2], JSON.stringify({
  n,
  copies: COPIES,
  jsDb: EX_JS5_DB,
  gpDb: 10 * Math.log10(n),
  vote: { p: 0.1, after: berRepetitionMajority(0.1, COPIES), p2: 0.01, after2: berRepetitionMajority(0.01, COPIES) },
  oneCopy: pulseCopies(ONE_COPY),
  wholeBit: pulseCopies(WHOLE_BIT),
  copyBerBbn: berBpsk(copyEbJ0),
  copyBerOn: berBpsk(copyEbJ0 / 3), // a copy inside a pulse on 1/3 of the time
  berBbn: exampleTheory({ kind: 'bbn' }),
  berOneCopy: exampleTheory(ONE_COPY),
  berWholeBit: exampleTheory(WHOLE_BIT),
  blindPeriod: EX_BLIND_PERIOD,
  recoveryCopies: EX_RECOVERY_COPIES,
  blindDuty: BLIND_PULSES.kind === 'pulsed' ? BLIND_PULSES.duty : 0,
  berBlind: exampleTheory(BLIND_PULSES, exampleFrontEnd()),
}));
