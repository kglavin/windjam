// Mission scripts: plain text, one console command per line. The same file can be pasted into the
// console, run headless with `npm run mission <file>`, or checked by the test suite.
//
//   # comment
//   mission hide         optional: play Red in mission 2 (default: find, playing Blue)
//   seed 1234            optional, first command: fixes the Red schedule and bearing errors
//   expect won           optional: the test suite checks the final status (won | lost | running)
//   rejects 2            optional: the number of lines the console is expected to reject
//   sq1: df e 5
//   wait 5

import { parseCommand } from './commands';
import { createMission, issue } from './mission';
import type { MissionKind, MissionState, MissionStatus } from './types';

export interface Script {
  seed?: number;
  mission?: MissionKind; // find (Blue, default) or hide (Red)
  expect?: MissionStatus;
  rejects?: number; // optional: how many lines the console is expected to reject
  commands: string[]; // console lines, comments and directives removed
}

export function parseScript(text: string): Script {
  const script: Script = { commands: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const mission = /^mission\s+(find|hide)$/i.exec(line);
    if (mission) {
      script.mission = mission[1].toLowerCase() as MissionKind;
      continue;
    }
    const seed = /^seed\s+(\d+)$/i.exec(line);
    if (seed) {
      script.seed = Number(seed[1]);
      continue;
    }
    const expect = /^expect\s+(won|lost|running|ended|draw)$/i.exec(line);
    if (expect) {
      script.expect = expect[1].toLowerCase() as MissionStatus;
      continue;
    }
    const rejects = /^rejects\s+(\d+)$/i.exec(line);
    if (rejects) {
      script.rejects = Number(rejects[1]);
      continue;
    }
    script.commands.push(line);
  }
  return script;
}

export interface ScriptRun {
  state: MissionState;
  parseErrors: string[]; // lines the console would have rejected
}

// Run a script from a fresh mission. Parse errors are logged in the console style and collected.
export function runScript(text: string, defaultSeed = 1): ScriptRun {
  const script = parseScript(text);
  let state = createMission(script.seed ?? defaultSeed, script.mission ?? 'find');
  const parseErrors: string[] = [];
  for (const line of script.commands) {
    const p = parseCommand(line, state.side);
    if (!p.ok) {
      parseErrors.push(`${line}: ${p.error}`);
      state = { ...state, log: [...state.log, { minute: state.minute, kind: 'error', text: `${line} -> ${p.error}` }] };
      continue;
    }
    state = issue(state, p.command);
  }
  return { state, parseErrors };
}

export const formatLog = (state: MissionState): string =>
  state.log.filter((e) => !e.side || e.side === state.side).map((e) => `[T+${String(e.minute).padStart(2, '0')}] ${e.text}`).join('\n');
