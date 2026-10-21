// Mission scripts: plain text, one console command per line. The same file can be pasted into the
// console, run headless with `npm run mission <file>`, or checked by the test suite.
//
//   # comment
//   mission hide         optional: play Red in mission 2 (default: find, playing Blue); mission duel plays both
//   scenario s11         optional: build the mission from a scenario (scenarios.ts): its forces, rules, seed, consoles
//   computer red         optional: the engine plays that side (blue, red or both); its script lines are skipped
//   blue> sq1: df e 5    in a duel, prefix each line with the console it is typed into (blue> or red>)
//   seed 1234            optional, first command: fixes the Red schedule and bearing errors
//   expect won           optional: the test suite checks the final status (won | lost | running | ended | draw);
//                        in a duel, expect blue | red | draw checks the winner
//   rejects 2            optional: the number of lines the console is expected to reject
//   sq1: df e 5
//   wait 5

import { knownIdsOf, parseCommand } from './commands';
import { type MissionOptions, createMission, issue } from './mission';
import { scenarioById } from './scenarios';
import type { MissionKind, MissionState, MissionStatus, PlayerSide } from './types';

export interface Script {
  seed?: number;
  mission?: MissionKind; // find (Blue, default), hide (Red) or duel (both)
  scenario?: string; // a scenario id: its forces, rules and seed, unless the script says otherwise
  computer?: PlayerSide[]; // sides the engine plays
  expect?: MissionStatus | PlayerSide; // blue/red: the duel's winner
  rejects?: number; // optional: how many lines the console is expected to reject
  commands: string[]; // console lines, comments and directives removed
}

export function parseScript(text: string): Script {
  const script: Script = { commands: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const comp = /^computer\s+(blue|red|both)$/i.exec(line);
    if (comp) {
      const v = comp[1].toLowerCase();
      script.computer = v === 'both' ? ['blue', 'red'] : [v as PlayerSide];
      continue;
    }
    const sc = /^scenario\s+(\S+)$/i.exec(line);
    if (sc) {
      script.scenario = sc[1].toLowerCase();
      continue;
    }
    const mission = /^mission\s+(find|hide|duel|uav|hunt|fox|iads)$/i.exec(line);
    if (mission) {
      script.mission = mission[1].toLowerCase() as MissionKind;
      continue;
    }
    const seed = /^seed\s+(\d+)$/i.exec(line);
    if (seed) {
      script.seed = Number(seed[1]);
      continue;
    }
    const expect = /^expect\s+(won|lost|running|ended|draw|blue|red)$/i.exec(line);
    if (expect) {
      script.expect = expect[1].toLowerCase() as Script['expect'];
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

// Playing a script a turn at a time: a turn ends just after the next `wait` line at or past `from`, or at the end.
export function turnEnd(commands: string[], from: number): number {
  for (let i = from; i < commands.length; i++) if (/^(?:(?:blue|red)>\s*)?wait\b/i.test(commands[i])) return i + 1;
  return commands.length;
}

// Commands a script may still give for a side the computer plays: the clock, the replay and the looks.
export const sharedCommand = (type: string): boolean => ['wait', 'reveal', 'replay', 'status', 'picture', 'help'].includes(type);

export interface ScriptRun {
  state: MissionState;
  parseErrors: string[]; // lines the console would have rejected
}

// Run a script from a fresh mission. Parse errors are logged in the console style and collected.
// The mission a script starts from: its scenario's, with the script's own seed and mission overriding.
export function missionFromScript(script: Script, defaultSeed: number, computer: PlayerSide[] = script.computer ?? []) {
  const sc = script.scenario ? scenarioById(script.scenario) : undefined;
  if (script.scenario && !sc) throw new Error(`unknown scenario ${script.scenario}`);
  const opts: MissionOptions = sc ? { forces: sc.forces, humans: sc.humans, emcon: sc.emcon, scenario: sc.id, playToEnd: sc.playToEnd } : {};
  if (computer.length) {
    opts.computer = Object.fromEntries(computer.map((side) => [side, true as const]));
    // A computer side needs a console to be issued through.
    const kind = script.mission ?? sc?.mission ?? 'find';
    const base: PlayerSide[] = opts.humans ?? (kind === 'duel' || kind === 'uav' || kind === 'hunt' || kind === 'iads' ? ['blue', 'red'] : kind === 'hide' ? ['red'] : ['blue']);
    opts.humans = [...new Set([...base, ...computer])];
  }
  return createMission(script.seed ?? sc?.seed ?? defaultSeed, script.mission ?? sc?.mission ?? 'find', opts);
}

export function runScript(text: string, defaultSeed = 1, computer?: PlayerSide[]): ScriptRun {
  const script = parseScript(text);
  let state = missionFromScript(script, defaultSeed, computer ?? script.computer ?? []);
  const parseErrors: string[] = [];
  for (const line of script.commands) {
    // In a duel each line names its console: 'blue> ' or 'red> '. Unprefixed lines go to the primary side.
    const pre = /^(blue|red)>\s*/i.exec(line);
    const as = pre ? (pre[1].toLowerCase() as PlayerSide) : state.side;
    const body = pre ? line.slice(pre[0].length) : line;
    const p = parseCommand(body, as, knownIdsOf(state.world));
    if (p.ok && state.computer?.[as] && !sharedCommand(p.command.type)) continue; // the engine plays that side
    if (!p.ok) {
      parseErrors.push(`${line}: ${p.error}`);
      state = { ...state, log: [...state.log, { minute: state.minute, kind: 'error', text: `${line} -> ${p.error}` }] };
      continue;
    }
    state = issue(state, p.command, as);
  }
  return { state, parseErrors };
}

export const formatLog = (state: MissionState): string =>
  state.log
    .filter((e) => !e.side || e.side === state.side || state.humans.includes(e.side))
    .map((e) => `[T+${String(e.minute).padStart(2, '0')}]${e.side && state.humans.length > 1 ? ` ${e.side.padEnd(4)}` : ''} ${e.text}`)
    .join('\n');

// What `expect` is checked against: the winner in a duel, the status otherwise.
export const outcomeOf = (state: MissionState): string => (state.humans.length > 1 ? (state.winner ?? state.status) : state.status);
