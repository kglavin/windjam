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
import { HELP, parseCommand } from '../src/engine/mission/commands';
import { createMission, issue, pictureLines, statusLines, visibleLog } from '../src/engine/mission/mission';
import type { LogEntry, MissionKind, MissionState, PlayerSide } from '../src/engine/mission/types';

interface Args {
  mission: MissionKind;
  seed: number;
  turn: number;
  port: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { mission: 'uav', seed: Math.floor(Math.random() * 1_000_000), turn: 5, port: 8787 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--mission') a.mission = v as MissionKind;
    if (k === '--seed') a.seed = Number(v);
    if (k === '--turn') a.turn = Number(v);
    if (k === '--port') a.port = Number(v);
  }
  return a;
}

interface Game {
  state: MissionState;
  turnMin: number;
  turn: number; // turns completed
  ended: Record<PlayerSide, boolean>; // sides that have ended the current turn
  history: { turn: number; side: PlayerSide; line: string; minute: number }[]; // every line posted, for the record
}

const args = parseArgs(process.argv.slice(2));
let game = newGame(args.mission, args.seed, args.turn);

function newGame(mission: MissionKind, seed: number, turnMin: number): Game {
  return { state: createMission(seed, mission), turnMin, turn: 0, ended: { blue: false, red: false }, history: [] };
}

const sideOf = (q: URLSearchParams): PlayerSide | undefined => {
  const s = q.get('side');
  return s === 'blue' || s === 'red' ? s : undefined;
};

function waitingFor(g: Game): PlayerSide[] {
  if (g.state.status !== 'running' || g.turnMin <= 0) return [];
  return g.state.humans.filter((h) => !g.ended[h]);
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
    const p = parseCommand(line, side);
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
    g.history.push({ turn: g.turn, side, line, minute: g.state.minute });
    g.state = issue(g.state, p.command, side);
    accepted.push(line);
  }
  return { accepted, rejected, lines: consoleSince(g, side, before).lines };
}

function endTurn(g: Game, side: PlayerSide): { advanced: boolean; minute: number } {
  g.ended[side] = true;
  if (g.turnMin <= 0 || g.state.status !== 'running') return { advanced: false, minute: g.state.minute };
  if (g.state.humans.some((h) => !g.ended[h])) return { advanced: false, minute: g.state.minute };
  g.state = issue(g.state, { type: 'wait', minutes: g.turnMin }, g.state.side);
  g.turn += 1;
  g.ended = { blue: false, red: false };
  return { advanced: true, minute: g.state.minute };
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
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, { ...summary(game), endpoints: ['GET /state?side=', 'GET /help?side=', 'POST /blue', 'POST /red', 'POST /blue/end', 'POST /red/end', 'POST /new', 'POST /end', 'GET /full', 'GET /history'] });
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      const side = sideOf(q);
      if (!side) return send(res, 400, { error: 'side=blue|red' });
      const after = Number(q.get('after') ?? 0);
      const c = consoleSince(game, side, after);
      return send(res, 200, { ...summary(game, side), console: c.lines, cursor: c.cursor, status_lines: statusLines(game.state, side), picture: pictureLines(game.state, side) });
    }
    if (req.method === 'GET' && url.pathname === '/help') {
      const side = sideOf(q);
      if (!side) return send(res, 400, { error: 'side=blue|red' });
      return send(res, 200, { help: HELP[side] });
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
    if (req.method === 'POST' && url.pathname === '/new') {
      const body = await readBody(req);
      const o = body ? (JSON.parse(body) as Partial<Args>) : {};
      game = newGame(o.mission ?? game.state.mission, o.seed ?? Math.floor(Math.random() * 1_000_000), o.turn ?? game.turnMin);
      return send(res, 200, summary(game));
    }
    if (req.method === 'POST' && url.pathname === '/end') {
      // Umpire: stop the game and open the debrief.
      if (game.state.status === 'running') game.state = issue(game.state, { type: 'reveal' }, game.state.side);
      return send(res, 200, summary(game));
    }
    return send(res, 404, { error: 'no such endpoint' });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
});

server.listen(args.port, () => {
  console.log(`Windjam server on http://localhost:${args.port}  mission ${game.state.mission} seed ${game.state.seed} turn ${args.turn} min`);
  console.log(`Watch it: http://localhost:5173/?server=http://localhost:${args.port}`);
});
