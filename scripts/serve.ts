// Game server: one mission, two consoles, an umpire. Agents and the browser talk to it over HTTP.
//
//   npm run serve -- --mission uav --seed 1234 --turn 5 --port 8787
//
// Turn mode (--turn N > 0): each side posts its orders, then POST /<side>/end. When both sides have ended their
// turn the clock advances N minutes. A side's `wait` line is refused. With --turn 0 either side may `wait` as in
// the hot-seat game. Both sides are human (duel or uav missions) unless the mission has one console.
//
//   POST /new            {"mission":"uav","seed":1234,"turn":5}      start over
//   GET  /state?side=red[&after=N]   that side's new console lines (cursor N), status, picture, turn info
//   GET  /help?side=red              the side's command list
//   POST /red  (text/plain, one command per line)                  issue orders; returns the lines they produced
//   POST /red/end                    end the side's turn
//   GET  /full                       the whole state for the browser (world without the map, which the seed gives)
//
// Every response is JSON. CORS is open so the Vite dev server's page can poll it.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyseCoverage, analyseDetect, analyseExposure, analyseFix, analyseJs, analyseLink, analysePath, analysePredict, type HypothesisParams, type Pos } from '../src/engine/mission/analyse';
import { analysisCounts } from '../src/engine/mission/c2stats';
import { HELP, UNIT_ALIASES, knownIdsOf, parseCommand } from '../src/engine/mission/commands';
import { createMission, enableC2, inbox, issue, pictureLines, reportNow, statusLines, unitStatusLines, visibleLog, visibleLogFor } from '../src/engine/mission/mission';
import type { JammerMode, UnitKind } from '../src/engine/units';
import type { LogEntry, MissionKind, MissionState, OrderMessage, PlayerSide } from '../src/engine/mission/types';
import { SCENARIOS, scenarioById } from '../src/engine/mission/scenarios';

interface Args {
  mission: MissionKind;
  scenario?: string; // a scenario id: its forces, rules and seed (src/engine/mission/scenarios.ts)
  seed?: number; // absent: the scenario's seed, else random
  turn: number;
  port: number;
  c2?: C2;
}

// C2 mode per side: the unit aliases that have an agent. A side with no entry plays with one console, as before.
type C2 = Partial<Record<PlayerSide, { agents: string[] }>>;

function parseArgs(argv: string[]): Args {
  const a: Args = { mission: 'uav', turn: 5, port: 8787 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--mission') a.mission = v as MissionKind;
    if (k === '--scenario') a.scenario = v;
    if (k === '--seed') a.seed = Number(v);
    if (k === '--turn') a.turn = Number(v);
    if (k === '--port') a.port = Number(v);
    if (k === '--c2-blue' || k === '--c2-red') (a.c2 ??= {})[k === '--c2-blue' ? 'blue' : 'red'] = { agents: (v ?? '').split(',').map((x) => x.trim()).filter(Boolean) };
  }
  return a;
}

interface Game {
  state: MissionState;
  turnMin: number;
  turn: number; // turns completed
  ended: Record<PlayerSide, boolean>; // sides that have ended the current turn
  endedUnits: Set<string>; // C2 unit agents that have ended the current turn, as "blue/sq1"
  unitSince: Record<string, number>; // the minute each unit agent last ended a turn: its intercepts are new from there
  seenOrders: Record<string, number[]>; // the orders each unit agent had in its view when it ended a turn
  history: { turn: number; side: PlayerSide; line: string; minute: number }[]; // every line posted, for the record
  calls: { turn: number; minute: number; method: string; path: string }[]; // every HTTP call, for the record (never the umpire key)
  staff: Tasking[]; // the commander's taskings of the staff, with answers
  staffN: number; // last tasking number
  archived?: boolean;
}

// The staff roles: ES analyst, EW officer (attack), EW officer (protection and own comms), operations planner.
const STAFF_ROLES = ['es', 'ewa', 'ewp', 'ops'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
const isRole = (v: unknown): v is StaffRole => typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);

interface Tasking {
  id: string; // t1, t2, ... one counter per game
  side: PlayerSide;
  role: StaffRole;
  question: string;
  turn: number;
  minute: number;
  askedAt: string;
  answer?: string;
  answeredTurn?: number;
  answeredMinute?: number;
}

const GAMES_DIR = join(process.cwd(), 'games');
const args = parseArgs(process.argv.slice(2));
// The umpire's key: /full and /history show the whole truth, so a player must not be able to call them.
const UMPIRE_KEY = process.env.WINDJAM_UMPIRE_KEY ?? Math.random().toString(36).slice(2, 10);
let game = newGame(args.mission, args.seed, args.turn, args.c2, args.scenario);

// A game from a mission kind on the standard forces, or from a scenario (its own forces, rules and consoles; the seed
// given here overrides the scenario's).
function newGame(mission: MissionKind, seedArg: number | undefined, turnMin: number, c2?: C2, scenario?: string): Game {
  const sc = scenario ? scenarioById(scenario) : undefined;
  if (scenario && !sc) throw new Error(`unknown scenario ${scenario}. Scenarios: ${SCENARIOS.map((x) => x.id).join(' ')}`);
  const seed = seedArg ?? sc?.seed ?? Math.floor(Math.random() * 1_000_000);
  const state = sc ? createMission(seed, sc.mission, { forces: sc.forces, humans: sc.humans, emcon: sc.emcon, scenario: sc.id, playToEnd: sc.playToEnd }) : createMission(seed, mission);
  for (const side of ['blue', 'red'] as const) {
    const entry = c2?.[side];
    if (entry) enableC2(state, side, entry.agents);
  }
  return { state, turnMin, turn: 0, ended: { blue: false, red: false }, endedUnits: new Set(), unitSince: {}, seenOrders: {}, history: [], calls: [], staff: [], staffN: 0 };
}

// The path as the audit keeps it: the query string without the umpire's key.
const auditPath = (url: URL): string => {
  const q = new URLSearchParams(url.searchParams);
  q.delete('key');
  const qs = q.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
};

const sideOf = (q: URLSearchParams): PlayerSide | undefined => {
  const s = q.get('side');
  return s === 'blue' || s === 'red' ? s : undefined;
};

// Query parsing for /analyse/*: a bad value throws and the route answers 400.
const need = (q: URLSearchParams, k: string): string => {
  const v = q.get(k);
  if (v === null || v === '') throw new Error(`${k} is required`);
  return v;
};
const num = (q: URLSearchParams, k: string): number | undefined => {
  const v = q.get(k);
  if (v === null || v === '') return undefined;
  if (!Number.isFinite(Number(v))) throw new Error(`${k} must be a number`);
  return Number(v);
};
const needNum = (q: URLSearchParams, k: string): number => {
  const v = num(q, k);
  if (v === undefined) throw new Error(`${k} is required`);
  return v;
};
const pos = (v: string, k: string): Pos => {
  const m = /^(-?\d+),(-?\d+)$/.exec(v);
  if (!m) throw new Error(`${k} must be col,row`);
  return { col: Number(m[1]), row: Number(m[2]) };
};
const needPos = (q: URLSearchParams, k: string): Pos => pos(need(q, k), k);
const optPos = (q: URLSearchParams, k: string): Pos | undefined => (q.get(k) ? pos(need(q, k), k) : undefined);
// Repeatable sensor=col,row[,kind] for /analyse/exposure; kind defaults to squad.
const sensors = (q: URLSearchParams): HypothesisParams[] | undefined => {
  const all = q.getAll('sensor');
  if (all.length === 0) return undefined;
  return all.map((v) => {
    const m = /^(-?\d+),(-?\d+)(?:,(\w+))?$/.exec(v);
    if (!m) throw new Error('sensor must be col,row or col,row,kind');
    return { at: { col: Number(m[1]), row: Number(m[2]) }, kind: (m[3] ?? 'squad') as UnitKind };
  });
};
const hypothesis = (q: URLSearchParams): HypothesisParams => ({
  at: needPos(q, 'at'),
  kind: need(q, 'kind') as UnitKind,
  powerW: num(q, 'powerW'),
  antennaM: num(q, 'antennaM'),
  freqMHz: num(q, 'f'),
});

// One analysis call. The logic is in analyse.ts; this only turns a query string into its params.
function analyse(name: string, side: PlayerSide, q: URLSearchParams): unknown {
  const s = game.state;
  switch (name) {
    case 'path':
      return analysePath(s, side, { from: needPos(q, 'from'), to: needPos(q, 'to'), freqMHz: needNum(q, 'f'), fromAntennaM: num(q, 'fromAntennaM'), toAntennaM: num(q, 'toAntennaM') });
    case 'link':
      return analyseLink(s, side, { netId: need(q, 'net'), a: need(q, 'a'), b: need(q, 'b') });
    case 'coverage':
      return analyseCoverage(s, side, q.get('unit') ? { unit: need(q, 'unit') } : hypothesis(q), { minDbm: num(q, 'minDbm'), full: q.get('full') === '1' });
    case 'detect':
      return analyseDetect(s, side, { sensor: need(q, 'sensor'), ...hypothesis(q) });
    case 'js':
      return analyseJs(s, side, {
        jammer: need(q, 'jammer'),
        mode: need(q, 'mode') as JammerMode,
        rx: needPos(q, 'rx'),
        netId: q.get('net') || undefined,
        tx: optPos(q, 'tx'),
        txKind: (q.get('txKind') || undefined) as UnitKind | undefined,
        freqMHz: num(q, 'f'),
        waveform: q.get('waveform') || undefined,
      });
    case 'fix': {
      const bearings = q.get('bearings');
      return analyseFix(s, side, bearings ? { bearings: JSON.parse(bearings) } : { track: need(q, 'track') }, { add: optPos(q, 'add'), addSigmaDeg: num(q, 'sigma') });
    }
    case 'predict':
      return analysePredict(s, side, { track: need(q, 'track') });
    case 'exposure':
      return analyseExposure(s, side, { sensors: sensors(q) });
  }
  throw new Error(`no such analysis ${name}`);
}

// Who the clock is waiting for: each side's commander ("blue") and each unit agent of a C2 side ("blue/sq1").
function waitingFor(g: Game): string[] {
  if (g.state.status !== 'running' || g.turnMin <= 0) return [];
  const out: string[] = [];
  for (const h of g.state.humans) {
    if (!g.ended[h]) out.push(h);
    // A side's units act after its commander has ended, so they are listed only then.
    if (g.ended[h]) for (const a of g.state.c2?.[h]?.agents ?? []) if (!g.endedUnits.has(`${h}/${a}`)) out.push(`${h}/${a}`);
  }
  return out;
}

// Lines the side's console shows, with a cursor so a client can ask only for what is new.
function consoleSince(g: Game, side: PlayerSide, after: number): { lines: string[]; cursor: number } {
  const all = visibleLog(g.state, side);
  const fmt = (e: LogEntry) => `[T+${String(e.minute).padStart(2, '0')}] ${e.text}`;
  // The cursor is an index into the full log, so lines of the other side keep it stable.
  const log = g.state.log;
  const lines: string[] = [];
  for (let i = after; i < log.length; i++) {
    const e = log[i];
    if (!e.side || e.side === side) lines.push(fmt(e));
  }
  void all;
  return { lines, cursor: log.length };
}

function summary(g: Game, side?: PlayerSide) {
  const s = g.state;
  return {
    mission: s.mission,
    scenario: s.scenario ?? null,
    seed: s.seed,
    minute: s.minute,
    limitMin: s.limitMin,
    status: s.status,
    winner: s.winner ?? null,
    turn: g.turn,
    turnMin: g.turnMin,
    waitingFor: waitingFor(g),
    yourTurnEnded: side ? g.ended[side] : undefined,
    humans: s.humans,
  };
}

// The error texts the engine logged for a side since a log index: a refusal of the line just issued.
function engineErrors(g: Game, side: PlayerSide, from: number): string[] {
  return g.state.log.slice(from).filter((e) => e.kind === 'error' && (!e.side || e.side === side)).map((e) => e.text);
}

// Apply console lines for a side. In turn mode `wait` is the server's job.
function post(g: Game, side: PlayerSide, text: string): { accepted: string[]; rejected: string[]; lines: string[] } {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const before = g.state.log.length;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim().replace(/^(blue|red)>\s*/i, '');
    if (!line) continue;
    if (/^(mission|expect|rejects|seed)\s+\S+$/i.test(line)) continue;
    if (g.state.status !== 'running' && !/^(status|picture|help|reveal|next|step|back|exit)$/i.test(line)) {
      rejected.push(`${line}: the mission is over`);
      continue;
    }
    const p = parseCommand(line, side, knownIdsOf(g.state.world));
    if (!p.ok) {
      rejected.push(`${line}: ${p.error}`);
      g.state = { ...g.state, log: [...g.state.log, { minute: g.state.minute, kind: 'error', text: p.error, side }] };
      continue;
    }
    if (p.command.type === 'wait' && g.turnMin > 0) {
      rejected.push(`${line}: in turn mode the clock advances when both sides have ended their turn (POST /${side}/end)`);
      continue;
    }
    if (p.command.type === 'reveal' && g.state.status === 'running') {
      rejected.push(`${line}: reveal ends the mission; only the umpire may do that (POST /end)`);
      continue;
    }
    // The commander sits at HQ, so HQ's own settings and moves stay direct; every other unit is tasked over the net.
    const target = 'unitId' in p.command ? g.state.world.units.find((u) => u.id === p.command.unitId) : undefined;
    if (g.state.c2?.[side] && UNIT_COMMANDS.has(p.command.type) && target?.kind !== 'hq') {
      rejected.push(`${line}: in C2 mode, task units with send <unit>: <order>`);
      continue;
    }
    g.history.push({ turn: g.turn, side, line, minute: g.state.minute });
    const mark = g.state.log.length;
    g.state = issue(g.state, p.command, side);
    // A wait runs the clock, and errors logged while it runs (a move stopped by terrain) are not the wait's refusal.
    const refused = p.command.type === 'wait' ? [] : engineErrors(g, side, mark);
    if (refused.length) rejected.push(`${line}: ${refused.join(' · ')}`);
    else accepted.push(line);
  }
  return { accepted, rejected, lines: consoleSince(g, side, before).lines };
}

// What a commander in C2 mode may not do: every command that tasks one unit directly.
const UNIT_COMMANDS = new Set(['df', 'move', 'sortie', 'stop', 'power', 'antenna', 'decoy', 'jam', 'uav']);
// What a unit agent may post, as the first word of a line.
const UNIT_VERBS = new Set(['df', 'move', 'sortie', 'launch', 'stop', 'burst', 'hold', 'resume', 'route', 'jam', 'decoy', 'power', 'antenna']);

const seatOf = (g: Game, side: PlayerSide, alias: string): string | undefined => {
  const agents = g.state.c2?.[side]?.agents;
  return agents?.includes(alias) ? UNIT_ALIASES[side][alias] : undefined;
};

// A unit's console lines since a cursor into the full log: its own lines and the mission-wide ones.
// What a unit has not seen yet: the orders that have reached it and were not in its view when it last ended a turn,
// and the minute its intercepts start (what it hears in minute m is captured in the tick after its turn at m).
function unitNews(g: Game, side: PlayerSide, alias: string, unitId: string): { orders: OrderMessage[]; heard: number } {
  const key = `${side}/${alias}`;
  const seen = new Set(g.seenOrders[key] ?? []);
  return { orders: inbox(g.state, unitId, 0).filter((o) => !seen.has(o.n)), heard: g.unitSince[key] ?? 0 };
}

function unitConsoleSince(g: Game, unitId: string, after: number): { lines: string[]; cursor: number } {
  const log = g.state.log;
  const mine = new Set(visibleLogFor(g.state, unitId));
  const lines: string[] = [];
  for (let i = after; i < log.length; i++) if (mine.has(log[i])) lines.push(`[T+${String(log[i].minute).padStart(2, '0')}] ${log[i].text}`);
  return { lines, cursor: log.length };
}

// The side's command list, cut to what one unit can do, without the unit prefix: the unit agent posts "df e 5".
function unitHelp(side: PlayerSide, alias: string): string[] {
  const own = HELP[side].flatMap((l) => {
    const m = /^(<unit>|\w+):\s+(.*)$/.exec(l);
    return m && (m[1] === '<unit>' || m[1] === alias) ? [m[2]] : [];
  });
  return [...own, 'report                             send what this unit has heard so far to HQ now (a transmission)', 'status                             your position, order, link, inbox and what you heard', 'help                               this list'];
}

// Apply one unit agent's lines. The server prefixes the unit's alias; only unit verbs, report, status and help pass.
function postUnit(g: Game, side: PlayerSide, alias: string, text: string): { accepted: string[]; rejected: string[]; lines: string[] } {
  const unitId = UNIT_ALIASES[side][alias];
  const accepted: string[] = [];
  const rejected: string[] = [];
  const extra: string[] = [];
  const before = g.state.log.length;
  // Lines the unit's own command produced carry its id, so its console shows them later.
  const tag = (from: number) => {
    g.state = { ...g.state, log: g.state.log.map((e, i) => (i >= from && e.side === side && !e.unitId ? { ...e, unitId } : e)) };
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const verb = line.split(/\s+/)[0].toLowerCase();
    if (g.state.status !== 'running' && verb !== 'status' && verb !== 'help') {
      rejected.push(`${line}: the mission is over`);
      continue;
    }
    if (verb === 'help') {
      extra.push(...unitHelp(side, alias));
      accepted.push(line);
      continue;
    }
    if (verb === 'status') {
      const news = unitNews(g, side, alias, unitId);
      extra.push(...unitStatusLines(g.state, unitId, news.heard, news.orders));
      accepted.push(line);
      continue;
    }
    const mark = g.state.log.length;
    if (verb === 'report') {
      g.history.push({ turn: g.turn, side, line: `${alias}: ${line}`, minute: g.state.minute });
      g.state = reportNow(g.state, unitId);
      tag(mark);
      accepted.push(line);
      continue;
    }
    if (!UNIT_VERBS.has(verb)) {
      rejected.push(`${line}: a unit may use ${[...UNIT_VERBS].join(' ')} report status help`);
      continue;
    }
    const p = parseCommand(`${alias}: ${line}`, side, knownIdsOf(g.state.world));
    if (!p.ok) {
      rejected.push(`${line}: ${p.error}`);
      g.state = { ...g.state, log: [...g.state.log, { minute: g.state.minute, kind: 'error', text: p.error, side, unitId }] };
      continue;
    }
    g.history.push({ turn: g.turn, side, line: `${alias}: ${line}`, minute: g.state.minute });
    g.state = issue(g.state, p.command, side);
    tag(mark);
    const refused = engineErrors(g, side, mark);
    if (refused.length) rejected.push(`${line}: ${refused.join(' · ')}`);
    else accepted.push(line);
  }
  const lines = g.state.log.slice(before).filter((e) => !e.side || (e.side === side && e.unitId === unitId)).map((e) => `[T+${String(e.minute).padStart(2, '0')}] ${e.text}`);
  return { accepted, rejected, lines: [...lines, ...extra] };
}

function endTurn(g: Game, side: PlayerSide): { advanced: boolean; minute: number } {
  g.ended[side] = true;
  return advanceIfReady(g);
}

// A unit agent ends its turn. Its intercepts next turn start from this minute, and the orders now in its view are
// marked seen so they are not shown again.
function endUnit(g: Game, side: PlayerSide, alias: string): { advanced: boolean; minute: number } {
  const key = `${side}/${alias}`;
  const unitId = seatOf(g, side, alias);
  g.endedUnits.add(key);
  g.unitSince[key] = g.state.minute;
  if (unitId) g.seenOrders[key] = [...new Set([...(g.seenOrders[key] ?? []), ...inbox(g.state, unitId, 0).map((o) => o.n)])];
  return advanceIfReady(g);
}

function advanceIfReady(g: Game): { advanced: boolean; minute: number } {
  if (g.turnMin <= 0 || g.state.status !== 'running') return { advanced: false, minute: g.state.minute };
  if (waitingFor(g).length > 0) return { advanced: false, minute: g.state.minute };
  g.state = issue(g.state, { type: 'wait', minutes: g.turnMin }, g.state.side);
  g.turn += 1;
  g.ended = { blue: false, red: false };
  g.endedUnits = new Set();
  if (g.state.status !== 'running') archive(g);
  return { advanced: true, minute: g.state.minute };
}

// A finished game is written to games/<mission>-<seed>-<time>.json: the orders each side gave, the full console
// of each side, the reveal, and the outcome. `npm run games` tabulates the folder.
function archive(g: Game) {
  if (g.archived) return;
  g.archived = true;
  const s = g.state;
  const revealed = issue(s, { type: 'reveal' }, s.side);
  const record = {
    mission: s.mission,
    seed: s.seed,
    turnMin: g.turnMin,
    turns: g.turn,
    endedAt: s.minute,
    status: s.status,
    winner: s.winner ?? s.status,
    finishedAt: new Date().toISOString(),
    c2: s.c2 ?? null,
    messages: s.messages,
    units: s.world.units.map(({ id, name, side }) => ({ id, name, side })),
    calls: g.calls,
    analyses: analysisCounts(g.calls),
    staff: g.staff,
    orders: g.history,
    console: { blue: consoleSince(g, 'blue', 0).lines, red: consoleSince(g, 'red', 0).lines },
    reveal: revealed.log.filter((e) => e.kind === 'info' && /^Reveal:/.test(e.text)).map((e) => e.text),
    summary: { blue: statusLines(s, 'blue'), red: statusLines(s, 'red') },
  };
  mkdirSync(GAMES_DIR, { recursive: true });
  const file = join(GAMES_DIR, `${s.mission}-${s.seed}-${record.finishedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(`archived ${file}: ${record.winner} at T+${s.minute}`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = url.searchParams;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  // The umpire's GUI polls /full every second; the audit is for what the players did.
  if (url.pathname !== '/full') game.calls.push({ turn: game.turn, minute: game.state.minute, method: req.method ?? 'GET', path: auditPath(url) });
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, { ...summary(game), endpoints: ['GET /state?side=', 'GET /help?side=', 'POST /blue', 'POST /red', 'POST /blue/end', 'POST /red/end', 'GET /state?side=&unit=', 'POST /<side>/<unit>', 'POST /<side>/<unit>/end', 'POST /<side>/<unit>/report', 'POST /<side>/ask', 'GET /<side>/staff?role=', 'POST /<side>/staff/<role>', 'GET /analyse/<name>?side=', 'POST /new', 'POST /end', 'GET /full', 'GET /history'] });
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      const side = sideOf(q);
      if (!side) return send(res, 400, { error: 'side=blue|red' });
      const after = Number(q.get('after') ?? 0);
      const alias = q.get('unit');
      if (alias) {
        const unitId = seatOf(game, side, alias);
        if (!unitId) return send(res, 403, { error: `no agent seat for ${alias}` });
        const u = unitConsoleSince(game, unitId, after);
        const news = unitNews(game, side, alias, unitId);
        const mine = news.orders.map((o) => ({ n: o.n, text: o.text, sentMin: o.sentMin, arriveMin: o.arriveMin }));
        return send(res, 200, { ...summary(game, side), yourTurnEnded: game.endedUnits.has(`${side}/${alias}`), hqTurnEnded: game.ended[side], unit: alias, console: u.lines, cursor: u.cursor, status_lines: unitStatusLines(game.state, unitId, news.heard, news.orders), inbox: mine });
      }
      const c = consoleSince(game, side, after);
      // The staff the commander has tasked this turn and last, answered or not.
      const staff = game.staff.filter((t) => t.side === side && t.turn >= game.turn - 1).map(({ id, role, question, answer, turn }) => ({ id, role, question, ...(answer !== undefined ? { answer } : {}), turn }));
      return send(res, 200, { ...summary(game, side), console: c.lines, cursor: c.cursor, status_lines: statusLines(game.state, side), picture: pictureLines(game.state, side), staff });
    }
    if (req.method === 'GET' && url.pathname === '/help') {
      const side = sideOf(q);
      if (!side) return send(res, 400, { error: 'side=blue|red' });
      return send(res, 200, { help: HELP[side] });
    }
    const an = /^\/analyse\/(\w+)$/.exec(url.pathname);
    if (req.method === 'GET' && an) {
      const side = sideOf(q);
      if (!side) return send(res, 400, { error: 'side=blue|red' });
      try {
        return send(res, 200, analyse(an[1], side, q));
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (req.method === 'GET' && (url.pathname === '/full' || url.pathname === '/history') && q.get('key') !== UMPIRE_KEY) {
      return send(res, 403, { error: 'umpire only: pass the key the server printed at start (?key=...)' });
    }
    if (req.method === 'GET' && url.pathname === '/full') {
      // The map is large and fixed by the seed; the browser rebuilds it from createScenario(seed).
      const { world, ...rest } = game.state;
      const { map, ...worldRest } = world;
      void map;
      return send(res, 200, { ...summary(game), state: { ...rest, world: worldRest }, ended: game.ended });
    }
    if (req.method === 'GET' && url.pathname === '/history') return send(res, 200, { history: game.history });
    if (req.method === 'POST' && (url.pathname === '/blue' || url.pathname === '/red')) {
      const side = url.pathname.slice(1) as PlayerSide;
      if (!game.state.humans.includes(side)) return send(res, 400, { error: `${side} is not a console in this mission` });
      const body = await readBody(req);
      const text = req.headers['content-type']?.includes('application/json') ? String((JSON.parse(body) as { lines?: string; text?: string }).lines ?? (JSON.parse(body) as { text?: string }).text ?? '') : body;
      const r = post(game, side, text);
      return send(res, 200, { ...r, ...summary(game, side) });
    }
    if (req.method === 'POST' && (url.pathname === '/blue/end' || url.pathname === '/red/end')) {
      const side = url.pathname.split('/')[1] as PlayerSide;
      if (!game.state.humans.includes(side)) return send(res, 400, { error: `${side} is not a console in this mission` });
      const r = endTurn(game, side);
      return send(res, 200, { ...r, ...summary(game, side) });
    }
    // Staff taskings: the commander asks, an analyst agent polls for its role and answers. Staff never take part in turn gating.
    const askRoute = /^\/(blue|red)\/ask$/.exec(url.pathname);
    if (req.method === 'POST' && askRoute) {
      const side = askRoute[1] as PlayerSide;
      if (!game.state.humans.includes(side)) return send(res, 400, { error: `${side} is not a console in this mission` });
      if (game.state.status !== 'running') return send(res, 409, { error: 'the mission is over' });
      let b: { role?: unknown; question?: unknown };
      try {
        b = JSON.parse(await readBody(req)) as typeof b;
      } catch {
        return send(res, 400, { error: 'body must be JSON { role, question }' });
      }
      if (!isRole(b?.role)) return send(res, 400, { error: `role must be one of ${STAFF_ROLES.join(', ')}` });
      const question = typeof b.question === 'string' ? b.question.trim() : '';
      if (!question) return send(res, 400, { error: 'question is required' });
      const t: Tasking = { id: `t${++game.staffN}`, side, role: b.role, question, turn: game.turn, minute: game.state.minute, askedAt: new Date().toISOString() };
      game.staff.push(t);
      return send(res, 200, t);
    }
    const staffGet = /^\/(blue|red)\/staff$/.exec(url.pathname);
    if (req.method === 'GET' && staffGet) {
      const side = staffGet[1] as PlayerSide;
      const role = q.get('role');
      if (!isRole(role)) return send(res, 400, { error: `role must be one of ${STAFF_ROLES.join(', ')}` });
      const after = Number(q.get('after') ?? 0);
      const mine = game.staff.filter((t) => t.side === side && t.role === role);
      const brief = (t: Tasking) => ({ id: t.id, role: t.role, question: t.question, turn: t.turn, minute: t.minute });
      // Ops plans across the cell, so it also sees every answered tasking of the side from this turn and last.
      const cell =
        role === 'ops'
          ? game.staff
              .filter((t) => t.side === side && t.answer !== undefined && t.turn >= game.turn - 1)
              .map((t) => ({ ...brief(t), answer: t.answer, answeredTurn: t.answeredTurn, answeredMinute: t.answeredMinute }))
          : undefined;
      return send(res, 200, {
        ...summary(game, side),
        role,
        ...(cell ? { cell } : {}),
        open: mine.filter((t) => t.answer === undefined && Number(t.id.slice(1)) > (Number.isFinite(after) ? after : 0)).map(brief),
        status_lines: statusLines(game.state, side),
        picture: pictureLines(game.state, side),
        answered: mine.filter((t) => t.answer !== undefined).slice(-5).map((t) => ({ ...brief(t), answer: t.answer, answeredTurn: t.answeredTurn, answeredMinute: t.answeredMinute })),
      });
    }
    const staffPost = /^\/(blue|red)\/staff\/(\w+)$/.exec(url.pathname);
    if (req.method === 'POST' && staffPost) {
      const side = staffPost[1] as PlayerSide;
      const role = staffPost[2];
      if (!isRole(role)) return send(res, 400, { error: `role must be one of ${STAFF_ROLES.join(', ')}` });
      let b: { id?: unknown; answer?: unknown };
      try {
        b = JSON.parse(await readBody(req)) as typeof b;
      } catch {
        return send(res, 400, { error: 'body must be JSON { id, answer }' });
      }
      const answer = typeof b?.answer === 'string' ? b.answer.trim() : '';
      if (!answer) return send(res, 400, { error: 'answer is required' });
      const t = game.staff.find((x) => x.side === side && x.id === b.id && x.role === role);
      if (!t) return send(res, 404, { error: `no tasking ${String(b.id)} for ${role}` });
      if (t.answer !== undefined) return send(res, 409, { error: `${t.id} is already answered` });
      t.answer = answer;
      t.answeredTurn = game.turn;
      t.answeredMinute = game.state.minute;
      return send(res, 200, t);
    }
    const unitRoute = /^\/(blue|red)\/(\w+)(?:\/(end|report))?$/.exec(url.pathname);
    if (req.method === 'POST' && unitRoute) {
      const side = unitRoute[1] as PlayerSide;
      const alias = unitRoute[2];
      if (!seatOf(game, side, alias)) return send(res, 403, { error: `no agent seat for ${alias}` });
      const waitHq = () => send(res, 409, { error: 'wait until HQ has ended its turn' });
      const hqOpen = game.turnMin > 0 && game.state.status === 'running' && !game.ended[side];
      if (unitRoute[3] === 'end') {
        if (hqOpen) return waitHq();
        const r = endUnit(game, side, alias);
        return send(res, 200, { ...r, ...summary(game, side), yourTurnEnded: true });
      }
      if (unitRoute[3] === 'report' && hqOpen) return waitHq();
      const body = unitRoute[3] === 'report' ? 'report' : await readBody(req);
      const text = req.headers['content-type']?.includes('application/json') ? String((JSON.parse(body) as { lines?: string; text?: string }).lines ?? (JSON.parse(body) as { text?: string }).text ?? '') : body;
      const acts = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim().split(/\s+/)[0].toLowerCase()).filter((v) => v && v !== 'status' && v !== 'help');
      if (hqOpen && acts.length > 0) return waitHq();
      const r = postUnit(game, side, alias, text);
      return send(res, 200, { ...r, ...summary(game, side), yourTurnEnded: game.endedUnits.has(`${side}/${alias}`) });
    }
    if (req.method === 'POST' && url.pathname === '/new') {
      const body = await readBody(req);
      const o = body ? (JSON.parse(body) as Partial<Args>) : {};
      try {
        game = newGame(o.mission ?? game.state.mission, o.seed, o.turn ?? game.turnMin, o.c2, o.scenario);
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
      return send(res, 200, summary(game));
    }
    if (req.method === 'POST' && url.pathname === '/end') {
      // Umpire: stop the game and open the debrief.
      if (game.state.status === 'running') game.state = issue(game.state, { type: 'reveal' }, game.state.side);
      archive(game);
      return send(res, 200, summary(game));
    }
    return send(res, 404, { error: 'no such endpoint' });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
});

server.listen(args.port, () => {
  console.log(`Windjam server on http://localhost:${args.port}  mission ${game.state.mission} seed ${game.state.seed} turn ${args.turn} min`);
  console.log(`Umpire key ${UMPIRE_KEY} (set WINDJAM_UMPIRE_KEY to choose it). Players must not be given it.`);
  console.log(`Watch it: http://localhost:5173/?server=http://localhost:${args.port}&key=${UMPIRE_KEY}`);
});
