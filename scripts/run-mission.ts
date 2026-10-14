// Headless mission runner: npm run mission -- missions/01-two-squads-triangulate.txt
import { readFileSync } from 'node:fs';
import { MISSION_RULES } from '../src/engine/mission/types';
import { deliveredOrders, realFixes } from '../src/engine/mission/mission';
import { formatLog, parseScript, runScript } from '../src/engine/mission/script';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run mission -- <script.txt>');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const script = parseScript(text);
const { state, parseErrors } = runScript(text);

console.log(formatLog(state));
console.log('');
const fixed = realFixes(state);
console.log(`Result: ${state.status} at T+${state.minute}. Blue tracks ${state.tracks.length}, real fixes under ${MISSION_RULES.winCepKm} km: ${fixed}/${MISSION_RULES.fixesToWin}.${state.mission === 'hide' ? ` Red orders on time: ${deliveredOrders(state)}/${MISSION_RULES.redOrderCount}. Red tracks on Blue: ${state.redTracks.length}.` : ''}`);
for (const t of [...state.tracks, ...state.redTracks]) {
  console.log(
    `  ${t.id} ${t.signature.padEnd(16)} ${t.bearings.length} bearing${t.bearings.length === 1 ? ' ' : 's'}` +
      (t.fix ? ` · CEP ${t.fix.cepKm.toFixed(2)} km · actually ${t.fix.missKm.toFixed(2)} km off` : ' · no fix'),
  );
}
if (parseErrors.length) {
  console.log(`\n${parseErrors.length} line(s) the console would reject:`);
  for (const e of parseErrors) console.log(`  ${e}`);
}
if (script.expect && script.expect !== state.status) {
  console.log(`\nExpected ${script.expect}, got ${state.status}.`);
  process.exit(1);
}
if (parseErrors.length !== (script.rejects ?? 0)) {
  console.log(`\nExpected ${script.rejects ?? 0} rejected line(s), got ${parseErrors.length}.`);
  process.exit(1);
}
process.exit(0);
