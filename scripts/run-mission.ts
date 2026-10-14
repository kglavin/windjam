// Headless mission runner: npm run mission -- missions/01-two-squads-triangulate.txt
import { readFileSync } from 'node:fs';
import { MISSION_RULES } from '../src/engine/mission/types';
import { deliveredOrders, realFixes, uavFixes, uavGaps } from '../src/engine/mission/mission';
import { UAV_RULES } from '../src/engine/mission/types';
import { formatLog, outcomeOf, parseScript, runScript } from '../src/engine/mission/script';

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
console.log(`Result: ${outcomeOf(state)} at T+${state.minute}. Blue tracks ${state.tracks.length}, real fixes under ${MISSION_RULES.winCepKm} km: ${fixed}/${MISSION_RULES.fixesToWin}.${state.mission === 'hide' || state.mission === 'duel' ? ` Red orders on time: ${deliveredOrders(state)}/${MISSION_RULES.redOrderCount}.` : ''}${state.mission === 'hunt' ? ` Found: ${state.found ? `${state.found.by} at T+${state.found.minute} from ${state.found.km.toFixed(1)} km` : 'no'}.` : ''}${state.mission === 'uav' ? ` UAV fixes under ${UAV_RULES.winCepKm} km: ${uavFixes(state)}/${UAV_RULES.fixesToWin}, reports lost: ${uavGaps(state)}/${state.uav?.telemetry.length ?? 0}.` : ''}${state.mission !== 'find' ? ` Red tracks on Blue: ${state.redTracks.length}.` : ''}`);
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
if (script.expect && script.expect !== outcomeOf(state)) {
  console.log(`\nExpected ${script.expect}, got ${outcomeOf(state)}.`);
  process.exit(1);
}
if (parseErrors.length !== (script.rejects ?? 0)) {
  console.log(`\nExpected ${script.rejects ?? 0} rejected line(s), got ${parseErrors.length}.`);
  process.exit(1);
}
process.exit(0);
