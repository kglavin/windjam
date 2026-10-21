// Missions: turn-based orders, DF tasks, reports over the radio net, each side's picture of the other.
//   Mission 1, "Find the enemy": Blue hunts a hidden, static Red.           docs/mission-find-the-enemy.md
//   Mission 2, "Stay hidden":    Red passes its orders while a scripted Blue hunts it.   docs/mission-stay-hidden.md
// Both run on the same engine: ground truth in `world`, one set of unit orders, a picture per side.

import { type DetectOptions, type Emission, type Fix, bearingDeg, bearingSigmaDeg, emissions, fixFromBearings, gaussian, sensorLook } from '../detect';
import { type Hex, axialToOffset, hexEquals, hexKey, hexLine } from '../hex';
import { hexDistanceKm } from '../rf';
import { createRng } from '../rng';
import { type Forces, createScenario, refToHex } from '../scenario';
import { RADIO_PRESETS, type Net, type Unit } from '../units';
import { DEFAULTS as JAM_DEFAULTS } from '../ew';
import { type LinkView, type World, allLinkBudgets, jammers, nearestFreeHex, step, unitAt, unitById } from '../world';
import { linkBudget } from '../budget';
import type { OrderStatus } from '../timeliness';
import { findPath } from '../path';
import { getTile } from '../map';
import { TERRAIN, accessLabel, canEnter } from '../terrain';
import { HELP, UNIT_ALIASES, aliasOf, knownIdsOf, netAliasOf, parseCommand } from './commands';
import { PLAYBOOKS } from './playbooks';
import {
  MISSION_RULES as R,
  enemyOf,
  type DfAccumulator,
  type LogEntry,
  type LogKind,
  type MissionCommand,
  type MissionEvent,
  type MissionKind,
  type MissionState,
  type Order,
  type OrderMessage,
  type PlayerSide,
  type Playbook,
  type Report,
  type ReportedBearing,
  type Snapshot,
  type Track,
  UAV_RULES as U,
  HUNT_RULES as H,
  type UavState,
  FOX_RULES as FOX,
  IADS_RULES as IADS,
} from './types';

// How a scenario builds its mission: its own forces, which sides are consoles, chatter settings, and its id.
export interface MissionOptions {
  forces?: Forces;
  humans?: PlayerSide[];
  emcon?: Record<string, number>; // net id to chatter duty, applied at the start
  scenario?: string;
  playToEnd?: boolean; // no early win: a teaching replay should show every step
}

export function createMission(seed: number, mission: MissionKind = 'find', opts: MissionOptions = {}): MissionState {
  const base = createScenario(seed, opts.forces);
  // Jammers start off in both missions.
  const world: World = { ...base, units: base.units.map((u) => (u.jammer ? { ...u, jammer: { mode: 'off' } } : u)) };
  const side: PlayerSide = mission === 'hide' ? 'red' : 'blue';
  const state: MissionState = {
    world,
    mission,
    side,
    humans: opts.humans ?? (mission === 'duel' || mission === 'uav' || mission === 'hunt' || mission === 'iads' ? ['blue', 'red'] : [side]),
    seed,
    minute: 0,
    limitMin: mission === 'hunt' ? H.limitMin : mission === 'fox' ? FOX.limitMin : mission === 'iads' ? IADS.limitMin : R.limitMin,
    orders: {},
    held: [],
    tracks: [],
    redTracks: [],
    log: [],
    events: [],
    status: 'running',
    nextTrackNo: 1,
    nextRedTrackNo: 1,
    history: [],
    bursts: [],
    emcon: {},
    redOrders: [],
    messages: [],
    nextOrderNo: 1,
    scenario: opts.scenario,
    playToEnd: opts.playToEnd,
  };
  if (opts.emcon) state.emcon = { ...opts.emcon };
  if (mission === 'fox') {
    log(state, 'info', `Mission: fox hunt. Get a squad within ${FOX.foundKm} km of a Red transmitter within ${FOX.limitMin} minutes.`, 'both');
    log(state, 'info', 'The hunter keeps its own picture: df, read the bearing, move along it, df again. Type help.', 'blue');
  } else if (mission === 'iads') {
    state.iads = { engagements: [], nextLauncher: 0 };
    log(state, 'info', `Mission: air defence. Every ${IADS.cycleMin} minutes each Red radar reports a track to the fire control node, which orders a launcher. An engagement counts when both reach on time.`, 'both');
    log(state, 'info', `Blue wins by denying ${IADS.denyToWin} engagements: find the links and jam them (ew: jam <net> [mode]). Red wins with ${IADS.completeToWin} completed at T+${IADS.limitMin}; otherwise a draw.`, 'both');
  } else if (mission === 'find') {
    log(state, 'info', `Mission: find the enemy. Fix ${R.fixesToWin} Red emitters to CEP under ${R.winCepKm} km within ${R.limitMin} minutes.`);
    log(state, 'info', 'Red is hidden. Your squads and the UAV can take bearings (df). Reports reach HQ over your radio net. Type help.');
  } else if (mission === 'duel') {
    state.redOrders = redOrderSchedule(world);
    log(state, 'info', `Duel: Blue hunts, Red hides. Blue wins with ${R.fixesToWin} fixes under ${R.winCepKm} km on real Red emitters before T+${R.limitMin}.`, 'both');
    log(state, 'info', `Red wins if Blue has fewer at T+${R.limitMin} and Red delivered ${R.redOrdersToWin} of ${R.redOrderCount} orders on time. Otherwise a draw. wait from either console advances the clock.`, 'both');
    log(state, 'info', 'Red is hidden. Your squads and the UAV can take bearings (df). Type help.', 'blue');
    if (state.redOrders.length) log(state, 'info', `Every transmission is a bearing for Blue. Type help for your electronic-protection measures; send passes the current order. Order 1 is for ${unitById(world, state.redOrders[0].toId)!.name}, window T+0-${R.redOrderWindowMin}.`, 'red');
  } else if (mission === 'hunt') {
    setupHunt(state);
    log(state, 'info', `Mission: UAV hunt. Each side has an HQ and a UAV. A UAV must report to its HQ every ${H.reportEveryMin} minutes; every report is a burst the other side can hear.`, 'both');
    log(state, 'info', `Win: your UAV hears the other UAV's report from within ${H.interceptKm} km. Draw at T+${H.limitMin}. HQ and the UAV both listen all round; the UAV's bearings reach HQ with its next report.`, 'both');
    log(state, 'info', 'uav: route <col>,<row>; ... sets the search; uav: launch flies it; uav: burst reports now; uav: hold pauses. uav: power, uavlink: waveform and uav: antenna toward hq shape the burst. Type help and status.', 'both');
  } else if (mission === 'uav') {
    addRedUav(state);
    log(state, 'info', `Mission: track the UAV. Red's UAV flies a ${U.waypoints}-waypoint route and must report to Red HQ at least every ${U.reportEveryMin} minutes.`, 'both');
    log(state, 'info', `Blue wins with ${U.fixesToWin} position fixes under ${U.winCepKm} km on the UAV. Red wins if the route is flown with at most ${U.maxGaps} report lost and Blue has fewer fixes. Otherwise a draw at T+${R.limitMin}.`, 'both');
    log(state, 'info', 'The UAV reports only when it transmits. Take bearings from two sites in the same minute to fix where it was. ew: jam uavlink costs Red reports. Type help.', 'blue');
    log(state, 'info', 'uav: launch starts the route; uav: burst reports now (and resets the clock); uav: hold pauses at the next waypoint. Lower uav power and a DSSS uavlink are harder to hear, and harder for HQ to receive. Type help.', 'red');
  } else {
    state.playbook = buildPlaybook(seed);
    state.redOrders = redOrderSchedule(world);
    if (state.redOrders.length === 0) return finish(state);
    log(state, 'info', `Mission: stay hidden. Blue is hunting you. It wins with ${R.fixesToWin} fixes under ${R.winCepKm} km; you win if it has fewer at T+${R.limitMin} and you delivered ${R.redOrdersToWin} of your ${R.redOrderCount} orders on time.`);
    log(state, 'info', 'Every transmission is a bearing for Blue. Type help for your electronic-protection measures; send passes the current order.');
    log(state, 'info', `Order 1 is for ${unitById(world, state.redOrders[0].toId)!.name}, window T+0-${R.redOrderWindowMin}.`);
  }
  return finish(state);
}

const finish = (state: MissionState): MissionState => {
  state.history = [snapshot(state)];
  return state;
};

// Put a side in C2 mode: the unit aliases in `agents` get an agent, every other unit of the side executes its orders itself.
// A side with an EW team also gets an EW net (Blue 56 MHz, Red 50 MHz): a hub net from HQ with no chatter, so it carries
// orders and acknowledgements and nothing else. Games without C2 keep the nets they had.
export function enableC2(s: MissionState, side: PlayerSide, agents: string[]): void {
  if (!s.humans.includes(side)) throw new Error(`c2: ${side} is not a console in this mission`);
  const bad = agents.filter((a) => !UNIT_ALIASES[side][a]);
  if (bad.length) throw new Error(`c2: unknown ${side} unit ${bad.join(', ')}. Units: ${Object.keys(UNIT_ALIASES[side]).join(' ')}`);
  s.c2 = { ...s.c2, [side]: { agents } };
  const hq = s.world.units.find((u) => u.side === side && u.kind === 'hq');
  const ew = s.world.units.find((u) => u.side === side && u.kind === 'jammer');
  const id = `${side}-ew`;
  if (!hq || !ew || s.world.nets.some((n) => n.id === id)) return;
  const net: Net = {
    id,
    name: `${side === 'blue' ? 'Blue' : 'Red'} EW Net`,
    side,
    topology: 'hub',
    hubId: hq.id,
    memberIds: [hq.id, ew.id],
    freqMHz: side === 'blue' ? 56 : 50,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  };
  s.world = { ...s.world, nets: [...s.world.nets, net] };
  s.emcon[id] = 0; // no chatter: the net radiates only for orders and acknowledgements
}

// Mission 4: Red's reconnaissance UAV, its telemetry net, and a seeded route over the contested middle.
const UAV_ROUTE_REF: [number, number][] = [
  [24, 8], [21, 6], [18, 5], [16, 8], [15, 12], [16, 16], [19, 15], [21, 12], [24, 14], [26, 10],
];
function addRedUav(state: MissionState) {
  const rng = createRng(state.seed ^ 0x5eed);
  const jitter = () => Math.round((rng() - 0.5) * 2); // up to a kilometre either way
  const route = UAV_ROUTE_REF.map(([c, r]) => refToHex(c + jitter(), r + jitter()));
  state.uav = addUav(state, 'red', route, { speedKmh: U.speedKmh, enduranceMin: U.enduranceMin, linkW: U.linkW, reportEveryMin: U.reportEveryMin, landsWhenDone: true });
}

// A side's UAV, flown from its HQ, with its own telemetry net (Blue 62 MHz, Red 65 MHz). Both start on the ground.
function addUav(
  state: MissionState,
  side: PlayerSide,
  route: Hex[],
  o: { speedKmh: number; enduranceMin: number; linkW: number; reportEveryMin: number; landsWhenDone: boolean },
): UavState {
  const hq = state.world.units.find((u) => u.side === side && u.kind === 'hq')!;
  const occupied = new Set(state.world.units.map((u) => hexKey(u.pos)));
  const pos = nearestFreeHex(state.world.map, occupied, hq.pos, () => true, 6);
  const id = `${side[0]}-uav`;
  const name = `${side === 'blue' ? 'Blue' : 'Red'} UAV`;
  const uav: Unit = {
    id,
    name,
    side,
    kind: 'drone',
    pos,
    radio: { ...RADIO_PRESETS.drone, powerW: o.linkW },
    parentId: hq.id,
    drone: { speedKmh: o.speedKmh, enduranceMin: o.enduranceMin },
  };
  const net: Net = {
    id: `${side}-uav`,
    name: `${name} Link`,
    side,
    topology: 'hub',
    hubId: hq.id,
    memberIds: [hq.id, uav.id],
    freqMHz: side === 'blue' ? 62 : 65,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  };
  state.world = { ...state.world, units: [...state.world.units.filter((u) => u.id !== id), uav], nets: [...state.world.nets, net] };
  state.emcon[net.id] = 0; // the controller's uplink is silent: only the UAV's reports radiate
  return { unitId: uav.id, side, netId: net.id, route, nextWp: 0, holding: false, telemetry: [], reportEveryMin: o.reportEveryMin, landsWhenDone: o.landsWhenDone, heard: {} };
}

// Mission 5: two HQs far apart on the wide map, nothing else; a UAV each, launched from the console.
function setupHunt(state: MissionState) {
  const map = state.world.map;
  const hqs = state.world.units.filter((u) => u.kind === 'hq');
  const placed = hqs.map((hq) => {
    const [c, r] = H.hqRef[hq.side as PlayerSide];
    return { ...hq, pos: nearestFreeHex(map, new Set<string>(), refToHex(c, r), (t) => TERRAIN[t].access === 'all', 12) };
  });
  state.world = { ...state.world, units: placed, nets: [] };
  const o = { speedKmh: H.speedKmh, enduranceMin: H.enduranceMin, linkW: H.linkW, reportEveryMin: H.reportEveryMin, landsWhenDone: false };
  state.blueUav = addUav(state, 'blue', [], o);
  state.uav = addUav(state, 'red', [], o);
}

// Which Blue plan this seed draws, as a minute-stamped timetable.
function buildPlaybook(seed: number): Playbook {
  const pb = PLAYBOOKS[seed % PLAYBOOKS.length];
  const schedule: Playbook['schedule'] = [];
  let minute = 0;
  for (const raw of pb.script.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const p = parseCommand(line, 'blue');
    if (!p.ok) continue;
    if (p.command.type === 'wait') minute += p.command.minutes;
    else if (p.command.type === 'df' || p.command.type === 'move' || p.command.type === 'sortie' || p.command.type === 'stop') schedule.push({ minute, command: p.command });
  }
  return { name: pb.name, schedule };
}

function redOrderSchedule(world: World) {
  const squads = world.units.filter((u) => u.side === 'red' && u.kind === 'squad').map((u) => u.id);
  if (squads.length === 0) return [];
  const pick = (i: number) => squads[i % squads.length];
  const order = [pick(0), pick(2), pick(1), pick(0), pick(2), pick(1)];
  return Array.from({ length: R.redOrderCount }, (_, i) => ({
    n: i + 1,
    toId: order[i % order.length],
    windowStart: i * R.redOrderWindowMin,
    windowEnd: (i + 1) * R.redOrderWindowMin,
    status: 'pending' as const,
  }));
}

// Log lines carry the side whose console shows them. Lines about the mission itself carry none. A line a unit's own order produces also carries the unit.
function log(s: MissionState, kind: LogKind, text: string, side: PlayerSide | 'both' = s.actor ?? s.side, unitId?: string) {
  s.log = [...s.log, { minute: s.minute, kind, text, side: side === 'both' ? undefined : side, ...(unitId ? { unitId } : {}) }];
}

const stamp = (deg: number) => `${Math.round(deg)}°`;

function sectorLabel(centreDeg: number): string {
  const names: Record<number, string> = { 0: 'north', 45: 'northeast', 90: 'east', 135: 'southeast', 180: 'south', 225: 'southwest', 270: 'west', 315: 'northwest' };
  const lo = (centreDeg - R.sectorHalfWidthDeg + 360) % 360;
  const hi = (centreDeg + R.sectorHalfWidthDeg) % 360;
  return `${names[centreDeg] ?? stamp(centreDeg)} (${stamp(lo)}-${stamp(hi)})`;
}

const canDf = (u: Unit) => u.kind === 'squad' || u.kind === 'drone';
// Untasked ES (mission 2, Red): squads and the relay listen all round. The EW team is a transmitter, not an ES node.
const canIntercept = (u: Unit) => u.kind === 'squad' || u.kind === 'relay';

function minutesPerHex(s: MissionState, u: Unit): number {
  if (u.kind === 'hq') return R.hqMinutesPerHex;
  if (u.kind !== 'drone') return R.squadMinutesPerHex;
  return u.drone ? (s.world.map.hexSizeKm / u.drone.speedKmh) * 60 : R.droneMinutesPerHex;
}
const enduranceMin = (u: Unit) => u.drone?.enduranceMin ?? R.droneEnduranceMin;

// Copy the parts of the state that a turn mutates.
// A UAV state is mutated by orders and ticks, so each turn works on its own copy.
const cloneUav = (u?: UavState): UavState | undefined => (u ? { ...u, route: [...u.route], telemetry: [...u.telemetry], heard: { ...u.heard } } : undefined);

function clone(s: MissionState): MissionState {
  return {
    ...s,
    orders: { ...s.orders },
    held: [...s.held],
    tracks: s.tracks.map((t) => ({ ...t, bearings: [...t.bearings] })),
    redTracks: s.redTracks.map((t) => ({ ...t, bearings: [...t.bearings] })),
    bursts: [...s.bursts],
    emcon: { ...s.emcon },
    events: [...s.events],
    redOrders: s.redOrders.map((o) => ({ ...o })),
    messages: s.messages.map((o) => ({ ...o })),
    ...(s.c2 ? { c2: { ...s.c2 } } : {}),
    uav: cloneUav(s.uav),
    blueUav: cloneUav(s.blueUav),
    actor: undefined,
  };
}

const updateUnit = (s: MissionState, id: string, patch: (u: Unit) => Unit) => {
  s.world = { ...s.world, units: s.world.units.map((u) => (u.id === id ? patch(u) : u)) };
};

export function issue(state: MissionState, cmd: MissionCommand, as: PlayerSide = state.side): MissionState {
  const s = clone(state);
  s.actor = as; // console lines from this command belong to the side that typed it
  if (cmd.type === 'help') {
    for (const line of HELP[as]) log(s, 'info', line);
    return s;
  }
  if (cmd.type === 'status') {
    for (const line of statusLines(s, as)) log(s, 'info', line);
    return s;
  }
  if (cmd.type === 'picture') {
    for (const line of pictureLines(s, as)) log(s, 'info', line);
    return s;
  }
  if (cmd.type === 'reveal' || cmd.type === 'replay') {
    replayCommand(s, cmd);
    return s;
  }
  if (s.status !== 'running') {
    log(s, 'error', 'The mission is over. Start a new one to continue.');
    return s;
  }
  if (cmd.type === 'wait') return advance(s, cmd.minutes);
  if (cmd.type === 'send') {
    send(s);
    return s;
  }
  if (cmd.type === 'order') {
    sendOrder(s, as, cmd.toId, cmd.text);
    return s;
  }
  if (cmd.type === 'emcon') {
    const net = s.world.nets.find((n) => n.id === cmd.netId);
    if (!net || net.side !== as) {
      log(s, 'error', 'emcon applies to your own nets.');
      return s;
    }
    s.emcon[cmd.netId] = cmd.duty;
    log(s, 'order', `${net.name}: chatter set to ${Math.round(cmd.duty * 100)}% of minutes${cmd.duty === 0 ? ' (silence: orders only)' : ''}.`);
    return s;
  }
  if (cmd.type === 'waveform') {
    const net = s.world.nets.find((n) => n.id === cmd.netId);
    if (!net || net.side !== as) {
      log(s, 'error', 'waveform applies to your own nets.');
      return s;
    }
    const r = step(s.world, [{ type: 'setWaveform', netId: cmd.netId, waveform: cmd.waveform }]);
    s.world = r.world;
    const w = cmd.waveform;
    log(s, 'order', `${net.name}: waveform ${w.kind === 'fixed' ? 'fixed frequency' : w.kind === 'fh' ? `hopping ${w.hopsPerSec}/s` : `DSSS ${w.chipRateMcps} Mcps`}.`);
    return s;
  }

  const unit = unitById(s.world, cmd.unitId);
  if (!unit) {
    log(s, 'error', `No unit ${cmd.unitId}`);
    return s;
  }
  if (unit.side !== as) {
    log(s, 'error', `${unit.name} is not yours to command.`);
    return s;
  }
  if (cmd.type === 'uav') {
    uavCommand(s, cmd, unit);
    return s;
  }
  if (cmd.type === 'power') {
    const max = unit.kind === 'drone' ? U.maxW : RADIO_PRESETS[unit.kind].powerW;
    if (max <= 0) {
      log(s, 'error', `${unit.name} has no transmitter.`);
      return s;
    }
    const watts = Math.min(max, Math.max(0.1, cmd.watts));
    updateUnit(s, unit.id, (u) => ({ ...u, radio: { ...u.radio, powerW: watts } }));
    log(s, 'order', `${unit.name}: transmit power ${watts} W${watts < cmd.watts ? ` (maximum for this radio)` : ''}.`);
    return s;
  }
  if (cmd.type === 'antenna') {
    if (unit.kind !== 'hq' && unit.kind !== 'relay' && unit.id !== s.uav?.unitId) {
      log(s, 'error', `Only HQ and the relay${s.uav ? ' and the UAV' : ''} carry a directional antenna.`);
      return s;
    }
    if (!cmd.towardId) {
      updateUnit(s, unit.id, (u) => ({ ...u, antenna: undefined }));
      log(s, 'order', `${unit.name}: antenna omnidirectional.`);
      return s;
    }
    const target = unitById(s.world, cmd.towardId);
    if (!target || target.side !== as || target.id === unit.id) {
      log(s, 'error', 'Point the antenna at one of your other units.');
      return s;
    }
    updateUnit(s, unit.id, (u) => ({ ...u, antenna: { towardId: target.id, boresight: target.pos } }));
    log(s, 'order', `${unit.name}: antenna pointed at ${target.name}: +6 dBi within 30°, 20 dB down everywhere else, including towards anything off that line.`);
    return s;
  }
  if (cmd.type === 'decoy') {
    if (!unit.jammer) {
      log(s, 'error', 'Only the EW team can act as a decoy.');
      return s;
    }
    if (!cmd.netId) {
      updateUnit(s, unit.id, (u) => ({ ...u, decoy: undefined }));
      log(s, 'order', `${unit.name}: decoy off.`);
      return s;
    }
    if (unit.jammer.mode !== 'off') {
      log(s, 'error', `${unit.name} is jamming; one transmitter. Turn jamming off first.`);
      return s;
    }
    const net = s.world.nets.find((n) => n.id === cmd.netId);
    if (!net || net.side !== as) {
      log(s, 'error', 'The decoy imitates one of your own nets.');
      return s;
    }
    updateUnit(s, unit.id, (u) => ({ ...u, decoy: { netId: net.id } }));
    log(s, 'order', `${unit.name}: transmitting dummy traffic as ${net.name} (${signatureOf(net)}) from where it stands.`);
    return s;
  }
  if (cmd.type === 'jam') {
    if (!unit.jammer) {
      log(s, 'error', `${unit.name} has no jammer.`);
      return s;
    }
    if (!cmd.netId) {
      s.world = step(s.world, [{ type: 'setJammer', unitId: unit.id, config: { mode: 'off' } }]).world;
      log(s, 'order', `${unit.name}: jammer off.`);
      return s;
    }
    if (unit.decoy) {
      log(s, 'error', `${unit.name} is running a decoy; one transmitter. Turn the decoy off first.`);
      return s;
    }
    const net = s.world.nets.find((n) => n.id === cmd.netId);
    const mode = cmd.mode ?? 'spot';
    const config = { mode, targetNetId: cmd.netId, ...(mode === 'partial' ? { bandFraction: JAM_DEFAULTS.bandFraction } : mode === 'pulse' ? { dutyCycle: JAM_DEFAULTS.dutyCycle } : mode === 'multitone' ? { tones: JAM_DEFAULTS.tones } : {}) };
    const r = step(s.world, [{ type: 'setJammer', unitId: unit.id, config }]);
    if (r.rejected.length) {
      log(s, 'error', r.rejected[0].reason);
      return s;
    }
    s.world = r.world;
    log(s, 'order', `${unit.name}: ${mode === 'spot' ? 'spot-jamming' : `${mode} jamming`} ${net?.name ?? cmd.netId}. Their reports will be held while their links are down. You are now their loudest emitter.`);
    return s;
  }
  unitCommand(s, cmd, unit);
  return s;
}

// Missions 4 and 5: the UAV states in play, and the one a unit belongs to.
const uavStates = (s: MissionState): UavState[] => [s.uav, s.blueUav].filter((x): x is UavState => !!x);
const uavStateOf = (s: MissionState, unitId: string): UavState | undefined => uavStates(s).find((x) => x.unitId === unitId);

// UAV orders. Launch flies the route; route replaces the waypoints; burst reports now; hold pauses at the next waypoint.
function uavCommand(s: MissionState, cmd: Extract<MissionCommand, { type: 'uav' }>, unit: Unit) {
  const uav = uavStateOf(s, unit.id);
  const action = cmd.action;
  if (!uav) {
    log(s, 'error', `${unit.name} has no route to fly in this mission.`);
    return;
  }
  if (uav.doneMin !== undefined) {
    log(s, 'error', `${unit.name} has completed its route and landed.`);
    return;
  }
  const legsText = (route: Hex[]) =>
    route
      .map((h) => {
        const { col, row } = axialToOffset(h);
        return `${col},${row}`;
      })
      .join('; ');
  if (action === 'route') {
    const legs = cmd.legs ?? [];
    if (legs.length === 0) {
      log(s, 'error', 'route needs at least one waypoint, e.g. uav: route 60,80; 70,90');
      return;
    }
    uav.route = legs;
    uav.nextWp = 0;
    uav.holding = false;
    delete s.orders[unit.id]; // the current leg is abandoned; the next tick starts the new route from here
    log(s, 'order', `${unit.name}: new route, ${legs.length} waypoint${legs.length === 1 ? '' : 's'}: ${legsText(legs)}.${uav.launchedMin === undefined ? ' Launch to fly it.' : ''}`);
    return;
  }
  if (action === 'launch') {
    if (uav.launchedMin !== undefined) {
      log(s, 'error', `${unit.name} is already airborne.`);
      return;
    }
    uav.launchedMin = s.minute;
    uav.lastBurstMin = s.minute;
    uav.holding = false;
    log(s, 'order', `${unit.name}: launched at T+${s.minute}${uav.route.length ? `, ${uav.route.length} waypoints: ${legsText(uav.route)}` : ', no route yet: uav: route <col>,<row>; ...'}. It must report to HQ every ${uav.reportEveryMin} min.`);
    return;
  }
  if (uav.launchedMin === undefined) {
    log(s, 'error', `${unit.name} is not airborne. uav: launch first.`);
    return;
  }
  if (action === 'burst') {
    if (s.bursts.some((b) => b.minute === s.minute && b.unitId === unit.id)) {
      log(s, 'info', `${unit.name} is already reporting this minute.`);
      return;
    }
    s.bursts.push({ minute: s.minute, unitId: unit.id, netId: uav.netId, what: 'telemetry' });
    log(s, 'order', `${unit.name}: reporting to HQ this minute. The next forced report moves to T+${s.minute + uav.reportEveryMin}.`);
    return;
  }
  if (action === 'hold') {
    uav.holding = true;
    log(s, 'order', `${unit.name}: will hold at waypoint ${Math.min(uav.nextWp + 1, uav.route.length)} until resumed. Reports continue.`);
    return;
  }
  uav.holding = false;
  log(s, 'order', `${unit.name}: resuming the route.`);
}

// Start the next leg when the UAV is airborne and idle; at the end of the route, land (mission 4) or loiter (mission 5).
function flyUav(s: MissionState, uav: UavState) {
  if (uav.launchedMin === undefined || uav.doneMin !== undefined) return;
  const unit = unitById(s.world, uav.unitId)!;
  if (s.orders[unit.id]) return; // still flying a leg
  if (uav.nextWp >= uav.route.length) {
    if (!uav.landsWhenDone) return; // loitering until a new route arrives
    uav.doneMin = s.minute;
    log(s, 'order', `${unit.name}: route complete at T+${s.minute}, landing. No more reports.`);
    return;
  }
  if (uav.holding) return;
  const wp = uav.route[uav.nextWp];
  const path = pathTo(unit, wp);
  uav.nextWp += 1;
  if (path.length === 0) return; // already there: next tick takes the following waypoint
  const perHex = minutesPerHex(s, unit);
  s.orders[unit.id] = { kind: 'move', path, minutesPerHex: perHex, progress: 0 };
  const { col, row } = axialToOffset(wp);
  log(s, 'order', `${unit.name}: to waypoint ${uav.nextWp}/${uav.route.length} at ${col},${row}, about ${Math.ceil(path.length * perHex)} min.`);
}

// A report is forced when the interval has run out. Afterwards: did HQ receive what was sent this minute? A delivered
// report also carries every bearing the UAV has taken since its last one (mission 5), which HQ merges on arrival.
function uavReports(s: MissionState, m: number, phase: 'before' | 'after', uav: UavState) {
  if (uav.launchedMin === undefined || uav.doneMin !== undefined) return;
  if (phase === 'before') {
    const due = (uav.lastBurstMin ?? uav.launchedMin) + uav.reportEveryMin;
    if (m >= due && !s.bursts.some((b) => b.minute === m && b.unitId === uav.unitId)) {
      s.bursts.push({ minute: m, unitId: uav.unitId, netId: uav.netId, what: 'telemetry (forced)' });
    }
    return;
  }
  const burst = s.bursts.find((b) => b.minute === m && b.unitId === uav.unitId);
  if (!burst) return;
  uav.lastBurstMin = m;
  // Only the UAV-to-HQ direction carries the report, so the uplink's state (and jamming at the UAV) does not count.
  const unit = unitById(s.world, uav.unitId)!;
  const net = s.world.nets.find((n) => n.id === uav.netId)!;
  const hq = unitById(s.world, net.hubId!)!;
  const down = linkBudget(s.world.map, net, hq, unit, { jammers: jammers(s.world), nets: s.world.nets, noiseEnv: s.world.noiseEnv }).reverse;
  const delivered = down.quality !== 'denied';
  const forced = /forced/.test(burst.what);
  uav.telemetry.push({ minute: m, delivered, forced });
  const gaps = uav.telemetry.filter((t) => !t.delivered).length;
  const { col, row } = axialToOffset(unit.pos);
  log(
    s,
    delivered ? 'report' : 'hq', // a lost report is an event, not a rejected order
    `${unit.name}: report${forced ? ' (forced)' : ''} at T+${m} from ${col},${row} ${delivered ? `received by HQ (${down.quality}, SNR ${down.snrDb.toFixed(0)} dB${down.jamFraction > 0 ? ', jammed in part' : ''}).` : `lost: link denied (${Number.isFinite(down.jsDb) ? `J/S ${down.jsDb.toFixed(0)} dB, ` : ""}SNR ${down.snrDb.toFixed(0)} dB).${uav.landsWhenDone ? ` ${gaps} of ${U.maxGaps} allowed.` : ''}`}`,
    uav.side,
  );
  if (!delivered) return;
  const heard = Object.values(uav.heard);
  if (heard.length === 0) return;
  const report = writeReport(s, unit, unit.pos, heard);
  uav.heard = {};
  log(s, 'report', `${unit.name}: ${report.bearings.length} bearing${report.bearings.length === 1 ? '' : 's'} came down with the report.`, uav.side);
  merge(s, report);
}

// Mission 4 scores.
export const uavFixes = (s: MissionState): number => {
  const t = s.uav && s.tracks.find((x) => x.emitterId === s.uav!.unitId);
  return t?.fixes?.filter((f) => f.fix.cepKm < U.winCepKm).length ?? 0;
};
export const uavGaps = (s: MissionState): number => s.uav?.telemetry.filter((t) => !t.delivered).length ?? 0;

// Orders shared by both sides: df, move, sortie, stop. The caller has checked ownership.
function unitCommand(s: MissionState, cmd: Extract<MissionCommand, { type: 'df' | 'move' | 'sortie' | 'stop' }>, unit: Unit) {
  const name = unit.name;
  if (cmd.type === 'stop') {
    if (s.orders[unit.id]?.kind === 'sortie') {
      log(s, 'error', `${name} is on a silent sortie and cannot be reached until it returns.`);
      return;
    }
    if (s.orders[unit.id]) {
      delete s.orders[unit.id];
      log(s, 'order', `${name}: order cancelled.`);
    } else log(s, 'info', `${name} has no order.`);
    return;
  }
  if (s.orders[unit.id]?.kind === 'sortie') {
    log(s, 'error', `${name} is on a silent sortie and cannot be reached until it returns.`);
    return;
  }
  if (s.orders[unit.id]) log(s, 'info', `${name}: previous order replaced.`);
  if (cmd.type === 'sortie') {
    if (unit.kind !== 'drone') {
      log(s, 'error', `Only the UAV can fly a sortie.`);
      return;
    }
    if (cmd.legs.some((l) => l.minutes < 0 || !Number.isInteger(l.minutes))) {
      log(s, 'error', 'sortie legs need whole minutes.');
      return;
    }
    // Endurance: every flight leg, the return from the last waypoint, and the time on station.
    let from = unit.pos;
    let flightHexes = 0;
    for (const leg of cmd.legs) {
      flightHexes += hexLine(from, leg.to).length - 1;
      from = leg.to;
    }
    const parent = unitById(s.world, unit.parentId ?? '');
    flightHexes += parent ? hexLine(from, parent.pos).length - 1 : 0;
    const perHex = minutesPerHex(s, unit);
    const flightMin = Math.ceil(flightHexes * perHex);
    const stationMin = cmd.legs.reduce((a, l) => a + l.minutes, 0);
    if (flightMin + stationMin > enduranceMin(unit)) {
      log(s, 'error', `${name}: that plan needs about ${flightMin + stationMin} min (${flightMin} flying, ${stationMin} on station); endurance is ${enduranceMin(unit)} min.`);
      return;
    }
    s.orders[unit.id] = {
      kind: 'sortie',
      legs: cmd.legs,
      legIndex: 0,
      phase: 'out',
      path: hexLine(unit.pos, cmd.legs[0].to).slice(1),
      minutesPerHex: perHex,
      progress: 0,
      heard: {},
      done: [],
      restoreRangeKm: unit.controlRangeKm,
    };
    // Autonomous: no control link, so the 5 km tether does not apply until it is home.
    updateUnit(s, unit.id, (u) => ({ ...u, controlRangeKm: undefined }));
    const plan = cmd.legs
      .map((l) => {
        const { col, row } = axialToOffset(l.to);
        return l.minutes > 0 ? `${col},${row} DF ${sectorLabel(l.centreDeg!)} ${l.minutes} min` : `${col},${row} transit`;
      })
      .join('; ');
    log(s, 'order', `${name}: silent sortie, ${cmd.legs.length} leg${cmd.legs.length === 1 ? '' : 's'}: ${plan}; then home. About ${flightMin + stationMin} min, radio silent until it returns.`);
    return;
  }
  if (cmd.type === 'df') {
    if (!canDf(unit)) {
      log(s, 'error', `${name} has no DF receiver. Only squads and the UAV can take bearings.`);
      return;
    }
    s.orders[unit.id] = { kind: 'df', centreDeg: cmd.centreDeg, startMin: s.minute, endMin: s.minute + cmd.minutes, heard: {} };
    log(s, 'order', `${name}: DF ${sectorLabel(cmd.centreDeg)} for ${cmd.minutes} min.`);
    return;
  }
  // move
  if (unit.kind === 'hq' && (s.mission === 'find' || unit.side === 'blue')) {
    log(s, 'error', `${name} does not move in this mission.`);
    return;
  }
  if (hexEquals(unit.pos, cmd.to)) {
    log(s, 'info', `${name} is already there.`);
    return;
  }
  // Drones fly straight; ground units route around terrain they cannot enter and around other units.
  const path = unit.kind === 'drone' ? hexLine(unit.pos, cmd.to).slice(1) : findPath(s.world, unit.id, cmd.to);
  if (!path || path.length === 0) {
    const tile = getTile(s.world.map, cmd.to);
    const { col, row } = axialToOffset(cmd.to);
    log(s, 'error', `${name}: no route to ${col},${row}${tile && !canEnter(tile.terrain, unit.kind) ? ` (${tile.terrain}: ${accessLabel(tile.terrain)})` : unitAt(s.world, cmd.to) ? ' (occupied)' : ''}.`);
    return;
  }
  const perHex = minutesPerHex(s, unit);
  s.orders[unit.id] = { kind: 'move', path, minutesPerHex: perHex, progress: 0 };
  const { col, row } = axialToOffset(cmd.to);
  log(s, 'order', `${name}: moving to ${col},${row}, ${path.length} hexes, about ${Math.ceil(path.length * perHex)} min.${unit.kind === 'hq' ? ' HQ cannot transmit while moving.' : ''}`);
}

// Mission 2: transmit the current order.
function send(s: MissionState) {
  if (s.mission === 'find' || s.mission === 'uav' || s.mission === 'hunt' || s.actor !== 'red') {
    log(s, 'error', s.mission === 'duel' ? 'Only the red console sends orders.' : 'There is nothing to send in this mission.');
    return;
  }
  const order = s.redOrders.find((o) => o.status === 'pending' && o.windowStart <= s.minute && s.minute < o.windowEnd);
  if (!order) {
    const next = s.redOrders.find((o) => o.status === 'pending' && o.windowStart > s.minute);
    log(s, 'error', next ? `No order due now. Order ${next.n} opens at T+${next.windowStart}.` : 'No orders left to send.');
    return;
  }
  const hubNet = s.world.nets.find((n) => n.side === 'red' && n.topology === 'hub')!;
  const hq = unitById(s.world, hubNet.hubId!)!;
  if (s.orders[hq.id]?.kind === 'move') {
    log(s, 'error', 'HQ is moving and cannot transmit. Wait until it arrives, or stop it.');
    return;
  }
  const to = unitById(s.world, order.toId)!;
  const view = allLinkBudgets(s.world).find((v) => v.link.netId === hubNet.id && v.link.bId === to.id);
  if (!view) {
    log(s, 'error', `${to.name} is not on the command net.`);
    return;
  }
  const status = view.order.status;
  order.sentMin = s.minute;
  order.status = status;
  s.events.push({ kind: 'send', minute: s.minute, orderN: order.n, fromId: hq.id, toId: to.id, status });
  // Who transmits: HQ, the relay on the way if the route goes through it, and the squad's acknowledgement.
  const what = `order ${order.n}`;
  s.bursts.push({ minute: s.minute, unitId: hq.id, netId: hubNet.id, what });
  if (view.route === 'relay' && view.relay) {
    s.bursts.push({ minute: s.minute, unitId: view.relay.relayId, netId: hubNet.id, what: `${what} relayed` });
    s.bursts.push({ minute: s.minute, unitId: view.relay.relayId, netId: view.relay.retransNetId, what: `${what} relayed` });
    s.bursts.push({ minute: s.minute + 1, unitId: to.id, netId: view.relay.retransNetId, what: `${what} acknowledged` });
  } else {
    s.bursts.push({ minute: s.minute + 1, unitId: to.id, netId: hubNet.id, what: `${what} acknowledged` });
  }
  log(s, 'order', `HQ: order ${order.n} sent to ${to.name} ${view.route === 'relay' ? 'via the relay' : 'direct'}. ${status === 'on time' ? 'Delivered, on time.' : status === 'late' ? `Delivered late (${view.order.latencyS.toFixed(0)} s on a degraded link).` : 'Lost: the link is down.'}`);
}

// The link HQ uses to reach a unit: the view on a hub net of the side whose member is the unit. A side can have
// several hub nets (the command net, a UAV's own link), so look in each. A drone on none goes through its parent.
// Undefined for a unit on no net (the EW teams, HQ itself).
export function memberLink(s: MissionState, unitId: string, links: LinkView[]): LinkView | undefined {
  const unit = unitById(s.world, unitId);
  if (!unit) return undefined;
  const hubNets = s.world.nets.filter((n) => n.side === unit.side && n.topology === 'hub');
  const viewOf = (id: string) => links.find((v) => hubNets.some((n) => n.id === v.link.netId) && v.link.bId === id);
  return viewOf(unit.id) ?? (unit.kind === 'drone' && unit.parentId ? viewOf(unit.parentId) : undefined);
}

// Send a free-text order from a side's HQ to one of its units: a one-minute burst on the hub net, and on the retrans net when the relay carries it.
// Delivery and the unit's acknowledgement are decided in deliverOrders.
export function sendOrder(s: MissionState, side: PlayerSide, toId: string, text: string) {
  const to = unitById(s.world, toId);
  if (!to) {
    log(s, 'error', `No unit ${toId}`, side);
    return;
  }
  if (to.side !== side) {
    log(s, 'error', `${to.name} is not yours to command.`, side);
    return;
  }
  if (to.kind === 'drone' && s.orders[to.id]?.kind === 'sortie') {
    log(s, 'error', `${to.name} is on a silent sortie and cannot be reached until it returns.`, side);
    return;
  }
  const view = memberLink(s, to.id, allLinkBudgets(s.world));
  if (!view) {
    log(s, 'error', `${to.name} is on no net HQ can reach.`, side);
    return;
  }
  // The order goes out on the net that reaches the unit, from that net's hub.
  const hubNetId = view.link.netId;
  const hq = unitById(s.world, view.link.aId)!;
  if (s.orders[hq.id]?.kind === 'move') {
    log(s, 'error', 'HQ is moving and cannot transmit. Wait until it arrives, or stop it.', side);
    return;
  }
  const n = s.nextOrderNo++;
  // An order on a good link is in the unit's inbox at once (same-turn delivery); the tick still does the arrival work.
  const msg: OrderMessage = { n, side, fromId: hq.id, toId: to.id, text, sentMin: s.minute, status: 'pending' };
  if (view.order.status === 'on time') msg.arriveMin = s.minute;
  s.messages.push(msg);
  s.events.push({ kind: 'send', minute: s.minute, orderN: n, fromId: hq.id, toId: to.id, status: 'pending' });
  const what = `order ${n}`;
  s.bursts.push({ minute: s.minute, unitId: hq.id, netId: hubNetId, what });
  if (view.route === 'relay' && view.relay) {
    s.bursts.push({ minute: s.minute, unitId: view.relay.relayId, netId: hubNetId, what: `${what} relayed` });
    s.bursts.push({ minute: s.minute, unitId: view.relay.relayId, netId: view.relay.retransNetId, what: `${what} relayed` });
  }
  log(s, 'order', `HQ: order ${n} to ${to.name} sent.`, side);
}

// How long HQ waits for an acknowledgement before it marks an order lost, and the longest a late order is delayed.
const ACK_TIMEOUT_MIN = 3;
const ORDER_LATE_CAP_MIN = 5;

// An auto unit (a unit of a C2 side with no agent) carries out an order's text literally the minute it arrives. The command is
// issued as at minute m, so a DF task that starts here runs for the minutes it was given, from this minute.
function autoExecute(s: MissionState, m: number, msg: OrderMessage, unit: Unit) {
  const c2 = s.c2?.[msg.side];
  const alias = aliasOf(unit.id);
  if (!c2 || c2.agents.includes(alias)) return;
  const p = parseCommand(`${alias}: ${msg.text}`, msg.side, knownIdsOf(s.world));
  if (!p.ok) {
    log(s, 'error', `${unit.name}: cannot execute order ${msg.n}: ${p.error}`, msg.side, unit.id);
    return;
  }
  const minute = s.minute;
  s.minute = m;
  Object.assign(s, issue(s, p.command, msg.side));
  s.minute = minute;
  s.actor = undefined;
}

// Orders in flight, one minute: decide arrival once at the send minute (an on-time order was decided in sendOrder), hand the order to the unit, send its acknowledgement, and mark orders lost at HQ.
function deliverOrders(s: MissionState, m: number, links: LinkView[]) {
  // Auto units act after the bookkeeping: issue() returns a new state with its own copy of messages, so running it
  // inside this loop would leave the loop updating messages that are no longer in the state.
  const arrived: { msg: OrderMessage; unit: Unit }[] = [];
  for (const msg of s.messages) {
    if (m === msg.sentMin && msg.arriveMin === undefined) {
      const view = memberLink(s, msg.toId, links);
      if (view && view.order.status !== 'lost') {
        msg.arriveMin = view.order.status === 'on time' ? m : m + Math.min(ORDER_LATE_CAP_MIN, Math.ceil(view.order.latencyS / 60));
      }
    }
    const unit = unitById(s.world, msg.toId)!;
    if (m === msg.arriveMin) {
      log(s, 'order', `${unit.name}: order ${msg.n} received: ${msg.text}`, msg.side, unit.id);
      arrived.push({ msg, unit });
      const view = memberLink(s, msg.toId, links);
      const netId = view ? (view.route === 'relay' && view.relay ? view.relay.retransNetId : view.link.netId) : s.world.nets.find((n) => n.side === msg.side && n.topology === 'hub')!.id;
      s.bursts.push({ minute: m, unitId: unit.id, netId, what: `ack order ${msg.n}` });
      if (view && view.order.status !== 'lost') {
        msg.ackMin = m;
        s.events.push({ kind: 'ack', minute: m, unitId: unit.id, side: msg.side, orderN: msg.n });
        msg.status = msg.arriveMin === msg.sentMin ? 'on time' : 'late';
        log(s, 'order', `HQ: order ${msg.n} acknowledged by ${unit.name}.`, msg.side);
      }
    }
    if (msg.status === 'pending' && msg.ackMin === undefined && m - (msg.arriveMin ?? msg.sentMin) >= ACK_TIMEOUT_MIN) {
      msg.status = 'lost';
      log(s, 'hq', `HQ: order ${msg.n} to ${unit.name}: no acknowledgement, lost.`, msg.side); // an event, not a rejected command
    }
  }
  for (const { msg, unit } of arrived) autoExecute(s, m, msg, unit);
}

// The orders that have reached a unit since a minute, for the unit's own view. An order on a good link reaches the unit
// as it is sent; a late one arrives in the tick of its arrival minute, so it is in the inbox from the next minute on.
export function inbox(s: MissionState, unitId: string, sinceMin: number): OrderMessage[] {
  return s.messages.filter(
    (o) => o.toId === unitId && o.arriveMin !== undefined && o.arriveMin >= sinceMin && (o.arriveMin === o.sentMin || o.arriveMin < s.minute),
  );
}

// A side's orders and where each stands, for the commander's view.
export function receipts(s: MissionState, side: PlayerSide): OrderMessage[] {
  return s.messages.filter((o) => o.side === side);
}

// Advance the clock one minute at a time.
export function advance(state: MissionState, minutes: number): MissionState {
  let s = clone(state);
  for (let i = 0; i < minutes && s.status === 'running'; i++) s = tick(s);
  return s;
}

// Seeded chatter: is this radio transmitting on this net during this minute, at the net's duty?
export function chatterActive(seed: number, unitId: string, netId: string, minute: number, duty: number): boolean {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const ch of `${unitId}|${netId}|${minute}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return h / 4294967296 < duty;
}

// Mission 1 compatibility: Red chatter at the default duty.
export const redActive = (seed: number, unitId: string, netId: string, minute: number) => chatterActive(seed, unitId, netId, minute, R.redDuty);

export function dutyOf(s: MissionState, net: Net): number {
  return s.emcon[net.id] ?? (net.side === 'red' ? R.redDuty : R.blueDuty);
}

// Smallest angle between two bearings.
const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360) - 180;

export function signatureOf(net: Net): string {
  const w = net.waveform;
  return `${net.freqMHz} MHz ${w.kind === 'fh' ? 'hopper' : w.kind === 'dsss' ? 'DSSS' : 'fixed'}`;
}

// What a unit is radiating during minute m: chatter, scheduled bursts, a decoy, a jammer, a UAV's control link.
// `sweeps` is how many of the minute's ES sweeps can catch it: a short burst is on the air for only a few.
export function emissionsAt(s: MissionState, u: Unit, m: number): { em: Emission; signature: string; what: string; sweeps?: number }[] {
  const out: { em: Emission; signature: string; what: string; sweeps?: number }[] = [];
  const nets = s.world.nets;
  if (u.jammer && u.jammer.mode !== 'off') {
    for (const em of emissions(u, nets)) out.push({ em, signature: em.label, what: 'jamming' });
    return out;
  }
  if (u.decoy) {
    const net = nets.find((n) => n.id === u.decoy!.netId);
    if (net) {
      const asMember = { ...net, memberIds: [...net.memberIds, u.id] };
      for (const em of emissions({ ...u, jammer: undefined }, [asMember])) out.push({ em, signature: signatureOf(net), what: 'decoy' });
    }
    return out;
  }
  if (u.kind === 'drone') {
    // Mission 4: the reconnaissance UAV radiates only when it reports to its controller.
    const burst = s.bursts.find((b) => b.minute === m && b.unitId === u.id);
    if (burst) {
      const net = nets.find((n) => n.id === burst.netId);
      const sweeps = Math.max(1, Math.ceil((R.sweepsPerMinute * U.burstSec) / 60));
      if (net && u.radio.powerW > 0) for (const em of emissions(u, [net])) out.push({ em, signature: `${net.freqMHz} MHz UAV link`, what: burst.what, sweeps });
      return out;
    }
    // Linked DF: the control and video downlink is up. A sortie is silent.
    const parent = unitById(s.world, u.parentId ?? '');
    const hub = nets.find((n) => n.side === u.side && n.topology === 'hub');
    if (s.orders[u.id]?.kind === 'df' && parent && hub) {
      const radio = { ...u, radio: { ...u.radio, powerW: R.uavLinkW } };
      for (const em of emissions(radio, [{ ...hub, memberIds: [...hub.memberIds, u.id] }])) out.push({ em, signature: `${hub.freqMHz} MHz UAV link`, what: 'UAV link' });
    }
    return out;
  }
  if (u.radio.powerW <= 0) return out;
  // A jammer that is not jamming still answers on the EW net (its own emissions are the jam band, so ask as a plain radio).
  for (const em of emissions({ ...u, jammer: undefined }, nets)) {
    const net = nets.find((n) => n.memberIds.includes(u.id) && n.freqMHz === em.freqMHz);
    if (!net) continue;
    const burst = s.bursts.find((b) => b.minute === m && b.unitId === u.id && b.netId === net.id);
    if (burst) out.push({ em, signature: signatureOf(net), what: burst.what });
    else if (chatterActive(s.seed, u.id, net.id, m, dutyOf(s, net))) out.push({ em, signature: signatureOf(net), what: 'chatter' });
  }
  return out;
}

function tick(s: MissionState): MissionState {
  const opts: DetectOptions = { pfa: R.pfa, noiseEnv: s.world.noiseEnv, limiter: false, seed: s.seed };
  const m = s.minute; // the minute now beginning; logs and reports are stamped at its end
  // The opponent's playbook speaks first, at the start of the minute, exactly as a player typing before 'wait'.
  if (s.playbook) {
    const opp = enemyOf(s.humans[0]);
    s.actor = opp;
    for (const item of s.playbook.schedule.filter((x) => x.minute === m)) {
      const unit = unitById(s.world, item.command.type === 'wait' ? '' : (item.command as { unitId: string }).unitId);
      if (unit && unit.side === opp && (item.command.type === 'df' || item.command.type === 'move' || item.command.type === 'sortie' || item.command.type === 'stop')) {
        unitCommand(s, item.command, unit);
      }
    }
    s.actor = undefined;
  }
  s.minute = m + 1;
  const rng = createRng((s.seed * 1000003 + m * 7919) >>> 0);
  refreshAntennas(s);
  let links = allLinkBudgets(s.world);

  // Held reports retry first: a link may have come back.
  s.held = s.held.filter((r) => !deliver(s, r, links));

  // Orders sent over the net arrive, are acknowledged, or time out.
  deliverOrders(s, m, links);

  // Air defence: the engagement cycle, on the links as they stand this minute.
  if (s.mission === 'iads') iadsCycle(s, m, links);

  // Mission 4: the UAV takes its next leg, and a report is forced if the interval has run out.
  for (const uav of uavStates(s)) {
    s.actor = uav.side;
    flyUav(s, uav);
    uavReports(s, m, 'before', uav);
    s.actor = undefined;
  }

  for (const [unitId, order] of Object.entries(s.orders)) {
    const unit = unitById(s.world, unitId)!;
    s.actor = unit.side as PlayerSide;

    if (order.kind === 'move') {
      const leg = fly(s, unitId, order.path, order.progress + 1 / order.minutesPerHex);
      if (leg.stopped || leg.path.length === 0) {
        delete s.orders[unitId];
        const { col, row } = axialToOffset(unitById(s.world, unitId)!.pos);
        log(s, leg.stopped ? 'error' : 'order', `${unit.name}: ${leg.stopped ? `stopped at ${col},${row}: ${leg.stopped}` : `arrived at ${col},${row}.`}`, undefined, unit.id);
        refreshAntennas(s);
        links = allLinkBudgets(s.world);
      } else s.orders[unitId] = { ...order, path: leg.path, progress: leg.progress };
      continue;
    }

    if (order.kind === 'df') {
      const heard = listen(s, unit, order.centreDeg, R.sectorHalfWidthDeg, order.heard, m, rng, opts);
      s.orders[unitId] = { ...order, heard };
      if (s.minute >= order.endMin) {
        delete s.orders[unitId];
        const report = writeReport(s, unit, unit.pos, Object.values(heard));
        file(s, unit, report, `DF ${sectorLabel(order.centreDeg)} done`, links);
      }
      continue;
    }

    // Silent sortie: fly each leg, listen on it, then home and hand everything over.
    const drone = unit;
    const parent = unitById(s.world, drone.parentId ?? '');
    if (order.phase === 'out') {
      const leg = fly(s, unitId, order.path, order.progress + 1 / order.minutesPerHex);
      const here = unitById(s.world, unitId)!.pos;
      if (!leg.stopped && leg.path.length > 0) {
        s.orders[unitId] = { ...order, path: leg.path, progress: leg.progress };
        continue;
      }
      const cur = order.legs[order.legIndex];
      if (leg.stopped) log(s, 'error', `${unit.name}: leg ${order.legIndex + 1} cut short (${leg.stopped}).`, undefined, unit.id);
      if (cur.minutes > 0) {
        s.orders[unitId] = { ...order, phase: 'df', path: [], progress: 0, dfEndMin: s.minute + cur.minutes, heard: {} };
        log(s, 'order', `${unit.name}: leg ${order.legIndex + 1}/${order.legs.length} on station, DF ${sectorLabel(cur.centreDeg!)} for ${cur.minutes} min, radio silent.`, undefined, unit.id);
      } else {
        s.orders[unitId] = nextLeg(s, unit, { ...order, done: [...order.done] }, here);
      }
      continue;
    }
    if (order.phase === 'df') {
      const cur = order.legs[order.legIndex];
      const heard = listen(s, unit, cur.centreDeg!, R.sectorHalfWidthDeg, order.heard, m, rng, opts);
      s.orders[unitId] = { ...order, heard };
      if (order.dfEndMin !== undefined && s.minute >= order.dfEndMin) {
        const n = Object.keys(heard).length;
        log(s, 'order', `${unit.name}: leg ${order.legIndex + 1} done, ${n} emitter${n === 1 ? '' : 's'} heard.`, undefined, unit.id);
        s.orders[unitId] = nextLeg(s, unit, { ...order, heard: {}, done: [...order.done, { pos: unit.pos, heard }] }, unit.pos);
      }
      continue;
    }
    // back
    const leg = fly(s, unitId, order.path, order.progress + 1 / order.minutesPerHex);
    const now = unitById(s.world, unitId)!;
    const home = parent ? hexDistanceKm(s.world.map, now.pos, parent.pos) <= R.handoverKm : false;
    if (!home && !leg.stopped && leg.path.length > 0) {
      s.orders[unitId] = { ...order, path: leg.path, progress: leg.progress };
      continue;
    }
    if (!home && parent && !leg.stopped) {
      // The squad moved: fly another leg towards it.
      const next = pathTo(now, parent.pos);
      if (next.length > 0) {
        s.orders[unitId] = { ...order, path: next, progress: leg.progress };
        continue;
      }
    }
    delete s.orders[unitId];
    updateUnit(s, unitId, (u) => ({ ...u, controlRangeKm: order.restoreRangeKm }));
    links = allLinkBudgets(s.world);
    const bearings = order.done.flatMap((d) => writeReport(s, now, d.pos, Object.values(d.heard)).bearings);
    const via = parent && home ? parent : now;
    if (!home) log(s, 'error', `${unit.name}: back but not within ${R.handoverKm} km of its squad; reporting from where it is.`, undefined, unit.id);
    file(s, via, { side: via.side as PlayerSide, unitId: via.id, minute: s.minute, bearings }, `back from sortie (${order.done.length} leg${order.done.length === 1 ? '' : 's'}), handed over`, links, unit.name, unit.id);
  }
  s.actor = undefined;

  // Mission 4: did this minute's UAV report reach HQ from where the UAV now is?
  for (const uav of uavStates(s)) uavReports(s, m, 'after', uav);

  // Fox hunt: a Blue squad within reach of a Red transmitter has found it.
  if (s.mission === 'fox' && !s.found) {
    for (const hunter of s.world.units.filter((u) => u.side === 'blue' && u.kind === 'squad')) {
      for (const fox of s.world.units.filter((u) => u.side === 'red' && u.radio.powerW > 0)) {
        const km = hexDistanceKm(s.world.map, hunter.pos, fox.pos);
        if (km <= FOX.foundKm && !s.found) {
          s.found = { by: 'blue', minute: m, km, sensorId: hunter.id };
          log(s, 'hq', `${hunter.name} is ${km.toFixed(1)} km from ${fox.name}: found.`, 'both');
        }
      }
    }
  }

  // Mission 5: each HQ and each airborne UAV listens all round. HQ's bearings reach the picture now; the UAV's wait
  // for its next delivered report. A UAV that hears the other UAV's report from close by has found it.
  if (s.mission === 'hunt') {
    for (const side of ['blue', 'red'] as const) {
      const uav = side === 'blue' ? s.blueUav : s.uav;
      const hq = s.world.units.find((u) => u.side === side && u.kind === 'hq')!;
      const hqHeard = Object.values(listen(s, hq, 0, 180, {}, m, rng, opts));
      if (hqHeard.length) {
        s.actor = side;
        merge(s, writeReport(s, hq, hq.pos, hqHeard));
        s.actor = undefined;
      }
      const drone = uav && uav.launchedMin !== undefined ? unitById(s.world, uav.unitId) : undefined;
      if (!uav || !drone) continue;
      const before = s.events.length;
      uav.heard = listen(s, drone, 0, 180, uav.heard, m, rng, opts);
      for (const e of s.events.slice(before)) {
        if (e.kind !== 'capture') continue;
        const target = unitById(s.world, e.emitterId);
        if (!target || target.kind !== 'drone') continue;
        const km = hexDistanceKm(s.world.map, drone.pos, target.pos);
        if (km > H.interceptKm) continue;
        if (!s.found) {
          s.found = { by: side, minute: m, km, sensorId: drone.id };
          log(s, 'hq', `${drone.name} heard ${target.name}'s report from ${km.toFixed(1)} km: found.`, 'both');
        } else if (s.found.minute === m && s.found.by !== side) {
          // Both reported inside 3 km in the same minute: each found the other.
          s.found.mutual = true;
          log(s, 'hq', `${drone.name} heard ${target.name}'s report from ${km.toFixed(1)} km in the same minute: both found each other.`, 'both');
        }
      }
    }
  }

  // Record what every unit radiated and did during the minute, for the sequence chart.
  for (const u of s.world.units) {
    for (const e of emissionsAt(s, u, m)) s.events.push({ kind: 'emit', minute: m, unitId: u.id, what: e.what, signature: e.signature });
    const o = s.orders[u.id];
    if (o) {
      const detail = o.kind === 'df' ? sectorLabel(o.centreDeg) : o.kind === 'move' ? `${o.path.length} hexes to go` : `${o.phase}${o.phase === 'df' ? ' ' + sectorLabel(o.legs[o.legIndex].centreDeg!) : ''}`;
      s.events.push({ kind: 'busy', minute: m, unitId: u.id, task: o.kind, detail });
    }
  }

  // Mission 2: Red's untasked ES listens all round and reports what it heard this minute, as one console line.
  if (s.mission !== 'find') {
    const heardBy: Record<string, Set<string>> = {};
    for (const sensor of s.world.units.filter((u) => u.side === 'red' && canIntercept(u))) {
      const heard = listen(s, sensor, 0, 180, {}, m, rng, opts);
      const list = Object.values(heard);
      if (list.length === 0) continue;
      for (const h of list) (heardBy[h.signature] ??= new Set()).add(sensor.id);
      const report = writeReport(s, sensor, sensor.pos, list);
      if (routeToHq(s, sensor.id, links).ok) merge(s, report);
      else s.held = [...s.held, report];
    }
    const sigs = Object.entries(heardBy);
    if (sigs.length) log(s, 'report', `Intercepts: ${sigs.map(([sig, who]) => `${sig} (${who.size} sensor${who.size === 1 ? '' : 's'})`).join(', ')}.`, 'red');
    // Orders whose window has closed unsent are lost.
    for (const o of s.redOrders) {
      if (o.status === 'pending' && s.minute >= o.windowEnd) {
        o.status = 'lost';
        log(s, 'error', `Order ${o.n} to ${unitById(s.world, o.toId)!.name} was never sent: lost.`, 'red');
      }
    }
    const opening = s.redOrders.find((o) => o.windowStart === s.minute);
    if (opening) log(s, 'info', `Order ${opening.n} is for ${unitById(s.world, opening.toId)!.name}, window T+${opening.windowStart}-${opening.windowEnd}.`, 'red');
  }

  s.history = [...s.history, snapshot(s)];
  resolve(s);
  return s;
}

// Air defence (docs/design-scenarios.md D3): every cycle each radar sends a track report to the fire control node on
// the report net, and the node sends an engagement order to the next launcher on the order net. Each leg is on time,
// late or lost by the link's order delivery as it stands this minute; both must be on time to engage. Both legs are
// bursts Blue can hear.
function iadsCycle(s: MissionState, m: number, links: LinkView[]) {
  const I = s.iads;
  if (!I || m === 0 || m % IADS.cycleMin !== 0) return;
  const fc = s.world.units.find((u) => u.side === 'red' && u.kind === 'hq');
  const track = s.world.nets.find((n) => n.side === 'red' && n.id.endsWith('-track'));
  const fire = s.world.nets.find((n) => n.side === 'red' && n.id.endsWith('-fire'));
  if (!fc || !track || !fire) return;
  const radars = s.world.units.filter((u) => u.side === 'red' && u.kind === 'relay' && track.memberIds.includes(u.id));
  const launchers = s.world.units.filter((u) => u.side === 'red' && u.kind === 'squad' && fire.memberIds.includes(u.id));
  const linkOf = (net: Net, a: string, b: string) =>
    links.find((v) => v.link.netId === net.id && ((v.link.aId === a && v.link.bId === b) || (v.link.aId === b && v.link.bId === a)));
  s.actor = 'red';
  for (const radar of radars) {
    const report = linkOf(track, fc.id, radar.id)?.order.status ?? 'lost';
    const n = s.nextOrderNo++;
    s.bursts.push({ minute: m, unitId: radar.id, netId: track.id, what: 'track report' });
    s.events.push({ kind: 'send', minute: m, orderN: n, fromId: radar.id, toId: fc.id, status: report });
    let launcher: Unit | undefined;
    let order: OrderStatus = 'lost';
    if (report !== 'lost' && launchers.length) {
      launcher = launchers[I.nextLauncher++ % launchers.length];
      order = linkOf(fire, fc.id, launcher.id)?.order.status ?? 'lost';
      const k = s.nextOrderNo++;
      s.bursts.push({ minute: m, unitId: fc.id, netId: fire.id, what: 'engagement order' });
      s.events.push({ kind: 'send', minute: m, orderN: k, fromId: fc.id, toId: launcher.id, status: order });
    }
    const ok = report === 'on time' && order === 'on time';
    I.engagements.push({ minute: m, radarId: radar.id, reportStatus: report, launcherId: launcher?.id, orderStatus: order, ok });
    log(s, 'hq', `${radar.name} → ${fc.name}: track report ${report}${launcher ? `; ${fc.name} → ${launcher.name}: engagement order ${order}` : ''}: ${ok ? 'engaged' : 'missed'}.`, 'red');
  }
  s.actor = undefined;
}

// Win, lose, draw.
function resolve(s: MissionState) {
  const fixes = realFixes(s);
  // A scenario played to the end resolves only at the limit (fox hunts still end when the fox is found).
  const early = !s.playToEnd || s.mission === 'fox';
  if (s.mission === 'find') {
    if (early && fixes >= R.fixesToWin) end(s, 'won');
    else if (s.minute >= s.limitMin) end(s, 'lost');
    return;
  }
  if (s.mission === 'fox') {
    if (s.found) {
      s.winner = 'blue';
      end(s, 'won');
    } else if (s.minute >= s.limitMin) {
      s.winner = 'red';
      end(s, 'lost');
    }
    return;
  }
  if (s.mission === 'iads' && s.iads) {
    const denied = s.iads.engagements.filter((e) => !e.ok).length;
    const done = s.iads.engagements.filter((e) => e.ok).length;
    if (early && denied >= IADS.denyToWin) {
      s.winner = 'blue';
      end(s, 'won');
    } else if (s.minute >= s.limitMin) {
      s.winner = denied >= IADS.denyToWin ? 'blue' : done >= IADS.completeToWin ? 'red' : 'draw';
      end(s, s.winner === 'red' ? 'lost' : 'draw');
    }
    return;
  }
  if (s.mission === 'hunt') {
    if (s.found) {
      s.winner = s.found.mutual ? 'draw' : s.found.by;
      end(s, s.found.mutual ? 'draw' : s.found.by === 'blue' ? 'won' : 'lost');
    } else if (s.minute >= s.limitMin) {
      s.winner = 'draw';
      end(s, 'draw');
    }
    return;
  }
  if (s.mission === 'uav') {
    // Blue wins on fixes; Red wins when the route is flown with its reports delivered; the clock makes a draw.
    const done = s.uav?.doneMin !== undefined;
    if (early && uavFixes(s) >= U.fixesToWin) {
      s.winner = 'blue';
      end(s, 'won');
    } else if (done || s.minute >= s.limitMin) {
      s.winner = done && uavGaps(s) <= U.maxGaps ? 'red' : 'draw';
      end(s, s.winner === 'red' ? 'lost' : 'draw');
    }
    return;
  }
  if (s.mission === 'duel') {
    // Status is from Blue's seat (the primary console); the winner field is what the panel shows.
    if (early && fixes >= R.fixesToWin) {
      s.winner = 'blue';
      end(s, 'won');
    } else if (s.minute >= s.limitMin) {
      s.winner = fixes >= R.fixesToWin ? 'blue' : deliveredOrders(s) >= R.redOrdersToWin ? 'red' : 'draw';
      end(s, s.winner === 'red' ? 'lost' : 'draw');
    }
    return;
  }
  if (early && fixes >= R.fixesToWin) end(s, 'lost');
  else if (s.minute >= s.limitMin) end(s, fixes >= R.fixesToWin ? 'lost' : deliveredOrders(s) >= R.redOrdersToWin ? 'won' : 'draw');
}

// Blue fixes under the CEP limit on real Red C2 emitters. A fix on the decoy does not count.
export function realFixes(s: MissionState): number {
  return s.tracks.filter((t) => t.fix && t.fix.cepKm < R.winCepKm && unitById(s.world, t.emitterId)?.kind !== 'jammer').length;
}
export const deliveredOrders = (s: MissionState): number => s.redOrders.filter((o) => o.status === 'on time').length;

// Directional antennas follow the unit they are pointed at.
function refreshAntennas(s: MissionState) {
  for (const u of s.world.units) {
    if (!u.antenna) continue;
    const target = unitById(s.world, u.antenna.towardId);
    if (target && !hexEquals(target.pos, u.antenna.boresight)) updateUnit(s, u.id, (x) => ({ ...x, antenna: { towardId: target.id, boresight: target.pos } }));
  }
}

// Move a unit along `path` with `progress` whole hexes available this minute. Stops at the first rejected hex.
function fly(s: MissionState, unitId: string, path: Hex[], progress: number): { path: Hex[]; progress: number; stopped?: string } {
  let stopped: string | undefined;
  while (progress >= 1 && path.length > 0 && !stopped) {
    const result = step(s.world, [{ type: 'moveUnit', unitId, to: path[0] }]);
    if (result.rejected.length > 0) {
      // A drone flies over an occupied hex; if that hex is the destination, it stops next to it.
      const flyer = unitById(s.world, unitId)?.kind === 'drone' && /occupied/i.test(result.rejected[0].reason);
      if (flyer) {
        path = path.slice(1);
        progress -= 1; // the overflown hex still takes its time
        if (path.length === 0) break;
        continue;
      }
      stopped = result.rejected[0].reason;
    } else {
      s.world = result.world;
      path = path.slice(1);
      progress -= 1;
    }
  }
  return { path, progress, stopped };
}

// Advance a sortie to its next leg from `here`, or turn for home after the last one.
function nextLeg(s: MissionState, drone: Unit, order: Extract<Order, { kind: 'sortie' }>, here: Hex): Order {
  const next = order.legIndex + 1;
  if (next < order.legs.length) {
    const { col, row } = axialToOffset(order.legs[next].to);
    log(s, 'order', `${drone.name}: flying to leg ${next + 1} at ${col},${row}.`);
    return { ...order, legIndex: next, phase: 'out', path: hexLine(here, order.legs[next].to).slice(1), progress: 0, dfEndMin: undefined };
  }
  const parent = unitById(s.world, drone.parentId ?? '');
  const path = parent ? pathTo(drone, parent.pos) : [];
  log(s, 'order', `${drone.name}: plan complete, returning to ${parent?.name ?? 'base'}, about ${Math.ceil(path.length * order.minutesPerHex)} min.`);
  return { ...order, legIndex: next, phase: 'back', path, progress: 0, dfEndMin: undefined };
}

// Straight path from a unit towards a target, stopping one hex short so it never tries to enter an occupied hex.
function pathTo(unit: Unit, target: Hex): Hex[] {
  const line = hexLine(unit.pos, target).slice(1);
  return line.length > 0 && hexEquals(line[line.length - 1], target) ? line.slice(0, -1) : line;
}

// The bias a sensor has towards one emitter for the whole game: a fixed gaussian draw from a hash of the seed and ids.
// It does not touch the mission rng and averaging cannot remove it.
export function siteErrorDeg(seed: number, sensorId: string, emitterId: string): number {
  let h = 2166136261;
  for (const c of `${seed}|${sensorId}|${emitterId}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return R.siteErrorDeg * gaussian(createRng(h));
}

// One minute of listening over a sector from where the sensor stands now, for enemy emitters transmitting this minute.
function listen(s: MissionState, sensor: Unit, centreDeg: number, halfWidthDeg: number, prevHeard: Record<string, DfAccumulator>, m: number, rng: () => number, opts: DetectOptions) {
  const heard = { ...prevHeard };
  const enemy = enemyOf(sensor.side);
  for (const emitter of s.world.units.filter((u) => u.side === enemy)) {
    const trueDeg = bearingDeg(s.world.map, sensor.pos, emitter.pos);
    if (halfWidthDeg < 180 && Math.abs(angleDiff(trueDeg, centreDeg)) > halfWidthDeg) continue;
    for (const { em, signature, what, sweeps = R.sweepsPerMinute } of emissionsAt(s, emitter, m)) {
      const look = sensorLook(s.world.map, emitter, sensor, em, opts);
      if (look.pd < R.minPd) continue; // too weak for a usable bearing
      const heardProb = 1 - (1 - look.pd) ** sweeps;
      if (rng() >= heardProb) continue;
      const n = Math.max(1, Math.round(sweeps * look.pd));
      const sigma = bearingSigmaDeg(look.snrDb);
      // This minute's measurement: n sweeps averaged, plus the fixed site error for this sensor and emitter.
      const measSigma = sigma / Math.sqrt(n);
      const measured = (trueDeg + siteErrorDeg(s.seed, sensor.id, emitter.id) + measSigma * gaussian(rng) + 360) % 360;
      s.events.push({ kind: 'capture', minute: m, sensorId: sensor.id, emitterId: emitter.id, what, snrDb: look.snrDb, bearingDeg: measured, sigmaDeg: measSigma });
      const w = n / (sigma * sigma);
      const rad = (measured * Math.PI) / 180;
      // A moving emitter gets one accumulator per minute: averaging across minutes would smear its track.
      const moving = emitter.kind === 'drone';
      const key = moving ? `${emitter.id}@${m}` : emitter.id;
      const prev = heard[key];
      heard[key] = {
        emitterId: emitter.id,
        signature: prev?.signature ?? signature,
        trueBearingDeg: trueDeg,
        weight: (prev?.weight ?? 0) + w,
        sumSin: (prev?.sumSin ?? 0) + w * Math.sin(rad),
        sumCos: (prev?.sumCos ?? 0) + w * Math.cos(rad),
        measurements: (prev?.measurements ?? 0) + n,
        samples: [...(prev?.samples ?? []), { minute: m, what: what }].filter((x, i, a) => a.findIndex((y) => y.minute === x.minute && y.what === x.what) === i),
        heardMin: moving ? m : undefined,
        emitterPos: moving ? emitter.pos : undefined,
        sensorPos: sensor.kind === 'drone' ? sensor.pos : undefined, // a flying sensor reports from where it was
      };
    }
  }
  return heard;
}

// Log a finished task and send its report to HQ, or hold it if the route is down. Sending is itself a burst.
function file(s: MissionState, via: Unit, report: Report, what: string, links: LinkView[], who = via.name, ownerId = via.id, at = s.minute - 1) {
  const summary = `${report.bearings.length} emitter${report.bearings.length === 1 ? '' : 's'}, ${report.bearings.reduce((a, b) => a + b.measurements, 0)} measurements`;
  if (report.bearings.length === 0) {
    log(s, 'report', `${who}: ${what}. Nothing heard.`, undefined, ownerId);
    return;
  }
  // A fox hunter keeps its own picture: no report goes over the air and none is held.
  const own = s.mission === 'fox';
  const hub = s.world.nets.find((n) => n.side === via.side && n.topology === 'hub');
  if (!own && hub && via.id !== hub.hubId) s.bursts.push({ minute: at, unitId: via.id, netId: hub.id, what: 'DF report' });
  const delivered = own || routeToHq(s, via.id, links).ok;
  s.events.push({ kind: 'report', minute: at, unitId: via.id, side: via.side as PlayerSide, bearings: report.bearings.length, delivered });
  if (delivered) {
    log(s, 'report', `${who}: ${what}. ${summary}. Reported to HQ.`, undefined, ownerId);
    if (!own && hub?.hubId) s.bursts.push({ minute: at, unitId: hub.hubId, netId: hub.id, what: 'report acknowledged' });
    merge(s, report);
  } else {
    s.held = [...s.held, report];
    log(s, 'report', `${who}: ${what}. ${summary}. Report held: no link to HQ.`, undefined, ownerId);
  }
}

// A finished DF task becomes one bearing per emitter heard, with the averaged error.
export function writeReport(s: MissionState, sensor: Unit, sensorPos: Hex, heard: DfAccumulator[]): Report {
  const bearings: ReportedBearing[] = heard.map((h) => {
    const sigmaDeg = Math.sqrt(1 / h.weight + R.siteErrorDeg ** 2);
    return {
      emitterId: h.emitterId,
      signature: h.signature,
      sensorId: sensor.id,
      sensorPos: h.sensorPos ?? sensorPos,
      bearingDeg: ((Math.atan2(h.sumSin, h.sumCos) * 180) / Math.PI + 360) % 360, // weighted circular mean of the measurements
      sigmaDeg,
      measurements: h.measurements,
      samples: h.samples,
      minute: s.minute,
      heardMin: h.heardMin,
      emitterPos: h.emitterPos,
    };
  });
  return { side: sensor.side as PlayerSide, unitId: sensor.id, minute: s.minute, bearings };
}

// A unit sends what it has heard so far, now. A DF task keeps running with an empty accumulator; a sortie is radio silent.
// Returns a new state, as issue() does.
export function reportNow(state: MissionState, unitId: string): MissionState {
  const s = clone(state);
  const unit = unitById(s.world, unitId);
  if (!unit) return s;
  s.actor = unit.side as PlayerSide;
  const o = s.orders[unitId];
  if (o?.kind === 'sortie') log(s, 'error', `${unit.name}: radio silent until it returns.`, undefined, unit.id);
  else if (o?.kind === 'df') {
    const report = writeReport(s, unit, unit.pos, Object.values(o.heard));
    s.orders[unitId] = { ...o, heard: {} };
    file(s, unit, report, `DF ${sectorLabel(o.centreDeg)} report so far`, allLinkBudgets(s.world), unit.name, unit.id, s.minute);
  } else log(s, 'info', 'Nothing to report.', undefined, unit.id);
  s.actor = undefined;
  return s;
}

// Does this unit currently have a working path to its HQ? Drones report through their parent.
export function routeToHq(s: MissionState, unitId: string, links: LinkView[]): { ok: boolean; via: string } {
  const unit = unitById(s.world, unitId);
  if (!unit) return { ok: false, via: 'unknown unit' };
  const hubNet = s.world.nets.find((n) => n.side === unit.side && n.topology === 'hub');
  if (!hubNet) return { ok: false, via: 'no command net' };
  if (unit.id === hubNet.hubId) return { ok: true, via: 'at HQ' };
  if (unit.kind === 'drone') {
    const parent = unit.parentId ? routeToHq(s, unit.parentId, links) : { ok: false, via: 'no controller' };
    return { ok: parent.ok, via: `via ${unitById(s.world, unit.parentId ?? '')?.name ?? 'controller'}, ${parent.via}` };
  }
  const link = links.find((v) => v.link.netId === hubNet.id && v.link.bId === unit.id);
  if (!link) return { ok: false, via: 'not on the command net' };
  return { ok: link.order.status !== 'lost', via: `${link.route}, ${link.order.status}` };
}

// Merge a report into its side's picture if the unit can reach HQ. Returns true when delivered.
function deliver(s: MissionState, report: Report, links: LinkView[]): boolean {
  if (!routeToHq(s, report.unitId, links).ok) return false;
  s.events.push({ kind: 'release', minute: s.minute - 1, unitId: report.unitId, side: report.side });
  merge(s, report);
  return true;
}

const pictureOf = (s: MissionState, side: PlayerSide): Track[] => (side === 'blue' ? s.tracks : s.redTracks);

// Add a delivered report to its side's picture.
function merge(s: MissionState, report: Report) {
  const side = report.side;
  const prev = s.actor;
  s.actor = side;
  let picture = pictureOf(s, side);
  for (const b of report.bearings) {
    let track = picture.find((t) => t.emitterId === b.emitterId);
    if (!track) {
      const id = side === 'blue' ? `E${s.nextTrackNo++}` : `B${s.nextRedTrackNo++}`;
      track = { id, emitterId: b.emitterId, signature: b.signature, bearings: [] };
      picture = [...picture, track];
      log(s, 'hq', `HQ: new track ${track.id} (${track.signature}).`);
      s.events.push({ kind: 'track', minute: Math.max(0, s.minute - 1), side, trackId: track.id, emitterId: b.emitterId, first: true });
    }
    track.bearings = [...track.bearings, b];
    const before = track.fix;
    if (b.heardMin !== undefined) {
      // Moving emitter: a fix needs bearings from two sites in the same minute. Each minute's fix stands on its own.
      track.moving = true;
      const minutes = [...new Set(track.bearings.map((x) => x.heardMin).filter((x): x is number => x !== undefined))].sort((x, y) => x - y);
      const fixes: { minute: number; fix: Fix }[] = [];
      for (const minute of minutes) {
        const same = track.bearings.filter((x) => x.heardMin === minute);
        const fix = fixFromBearings(s.world.map, same, same[0].emitterPos);
        if (fix) fixes.push({ minute, fix });
      }
      const had = new Set((track.fixes ?? []).map((f) => f.minute));
      track.fixes = fixes;
      track.fix = fixes.length ? fixes[fixes.length - 1].fix : undefined;
      // Only the mission's target UAV is narrated minute by minute; other moving tracks just update quietly.
      const target = b.emitterId === s.uav?.unitId;
      for (const f of fixes.filter((x) => !had.has(x.minute))) {
        const { col, row } = axialToOffset({ q: Math.round(f.fix.q), r: Math.round(f.fix.r) });
        if (target) log(s, 'hq', `HQ: ${track.id} was near ${col},${row} at T+${f.minute}: CEP ${f.fix.cepKm.toFixed(2)} km (${f.fix.cepKm < U.winCepKm ? 'counts' : 'too loose'}).`);
        s.events.push({ kind: 'track', minute: Math.max(0, s.minute - 1), side, trackId: track.id, emitterId: b.emitterId, cepKm: f.fix.cepKm, first: false });
      }
      continue;
    }
    track.fix = fixFromBearings(s.world.map, track.bearings, unitById(s.world, b.emitterId)?.pos);
    if (track.fix) {
      // Say so when a fix appears, crosses the win threshold, or improves by a fifth. Minute-by-minute nudges stay quiet.
      const crossed = before && before.cepKm >= R.winCepKm && track.fix.cepKm < R.winCepKm;
      const better = before && track.fix.cepKm < before.cepKm * 0.8;
      if (!before || crossed || better) {
        log(s, 'hq', `HQ: ${track.id} ${before ? 'refined' : 'fixed'}: CEP ${track.fix.cepKm.toFixed(2)} km from ${track.bearings.length} bearings.`);
        s.events.push({ kind: 'track', minute: Math.max(0, s.minute - 1), side, trackId: track.id, emitterId: b.emitterId, cepKm: track.fix.cepKm, first: false });
      }
    }
  }
  if (side === 'blue') s.tracks = picture;
  else s.redTracks = picture;
  s.actor = prev;
}

function end(s: MissionState, status: 'won' | 'lost' | 'draw' | 'ended') {
  s.status = status;
  const fixes = realFixes(s);
  if (s.mission === 'find') {
    log(
      s,
      'hq',
      status === 'won'
        ? `Mission complete at T+${s.minute}: ${fixes} emitters fixed.`
        : status === 'lost'
          ? `Time is up at T+${s.minute}: ${fixes} of ${R.fixesToWin} emitters fixed.`
          : `Mission ended at T+${s.minute} for the debrief: ${fixes} of ${R.fixesToWin} emitters fixed.`,
      'both',
    );
  } else if (s.mission === 'fox') {
    const f = s.found;
    log(
      s,
      'hq',
      status === 'ended'
        ? `Hunt ended at T+${s.minute} for the debrief: the fox was not found.`
        : f
          ? `Found at T+${f.minute}: ${unitById(s.world, f.sensorId)?.name ?? 'the hunter'} within ${f.km.toFixed(1)} km of the fox.`
          : `Time is up at T+${s.minute}: the fox was not found.`,
      'both',
    );
  } else if (s.mission === 'iads' && s.iads) {
    const denied = s.iads.engagements.filter((e) => !e.ok).length;
    const done = s.iads.engagements.filter((e) => e.ok).length;
    log(
      s,
      'hq',
      status === 'ended'
        ? `Mission ended at T+${s.minute} for the debrief: ${done} engagements completed, ${denied} denied.`
        : s.winner === 'blue'
          ? `Blue wins at T+${s.minute}: ${denied} engagements denied (${done} completed).`
          : s.winner === 'red'
            ? `Red wins at T+${s.minute}: ${done} engagements completed, ${denied} denied.`
            : `Draw at T+${s.minute}: ${done} engagements completed (${IADS.completeToWin} to win), ${denied} denied (${IADS.denyToWin} to deny).`,
      'both',
    );
  } else if (s.mission === 'hunt') {
    const f = s.found;
    log(
      s,
      'hq',
      status === 'ended'
        ? `Mission ended at T+${s.minute} for the debrief: neither UAV found the other.`
        : f?.mutual
          ? `Draw at T+${f.minute}: both UAVs reported inside ${H.interceptKm} km in the same minute and found each other.`
          : f
            ? `${f.by === 'blue' ? 'Blue' : 'Red'} wins at T+${f.minute}: ${unitById(s.world, f.sensorId)?.name ?? 'its UAV'} heard the other UAV's report from ${f.km.toFixed(1)} km.`
            : `Draw at T+${s.minute}: neither UAV found the other.`,
      'both',
    );
  } else if (s.mission === 'uav') {
    const f = uavFixes(s);
    const g = uavGaps(s);
    const flown = s.uav?.doneMin !== undefined ? `route complete at T+${s.uav!.doneMin}` : s.uav?.launchedMin === undefined ? 'UAV never launched' : `${s.uav!.nextWp} of ${s.uav!.route.length} waypoints`;
    log(
      s,
      'hq',
      status === 'ended'
        ? `Mission ended at T+${s.minute} for the debrief: Blue has ${f} of ${U.fixesToWin} fixes on the UAV; ${flown}, ${g} report${g === 1 ? '' : 's'} lost.`
        : s.winner === 'blue'
          ? `Blue wins at T+${s.minute}: ${f} position fixes on the UAV under ${U.winCepKm} km.`
          : s.winner === 'red'
            ? `Red wins at T+${s.minute}: ${flown} with ${g} report${g === 1 ? '' : 's'} lost; Blue fixed it ${f} time${f === 1 ? '' : 's'}.`
            : `Draw at T+${s.minute}: Blue has ${f} of ${U.fixesToWin} fixes; ${flown}, ${g} report${g === 1 ? '' : 's'} lost (${U.maxGaps} allowed).`,
      'both',
    );
  } else if (s.mission === 'duel') {
    const d = deliveredOrders(s);
    log(
      s,
      'hq',
      status === 'ended'
        ? `Duel ended at T+${s.minute} for the debrief: Blue has ${fixes} of ${R.fixesToWin} fixes, Red delivered ${d} of ${R.redOrderCount} orders on time.`
        : s.winner === 'blue'
          ? `Blue wins at T+${s.minute}: ${fixes} Red emitters fixed.`
          : s.winner === 'red'
            ? `Red wins at T+${s.minute}: Blue has ${fixes} of ${R.fixesToWin} fixes, and Red delivered ${d} of ${R.redOrderCount} orders on time.`
            : `Draw at T+${s.minute}: Blue has ${fixes} of ${R.fixesToWin} fixes, but Red delivered only ${d} of ${R.redOrderCount} orders on time (${R.redOrdersToWin} needed).`,
      'both',
    );
  } else {
    const d = deliveredOrders(s);
    log(
      s,
      'hq',
      status === 'won'
        ? `You stayed hidden: Blue has ${fixes} of ${R.fixesToWin} fixes at T+${s.minute}, and you delivered ${d} of ${R.redOrderCount} orders on time.`
        : status === 'lost'
          ? `Blue fixed ${fixes} of your emitters at T+${s.minute}. You were found.`
          : status === 'draw'
            ? `Hidden but not commanding: Blue has ${fixes} fixes, but you delivered only ${d} of ${R.redOrderCount} orders on time (${R.redOrdersToWin} needed).`
            : `Mission ended at T+${s.minute} for the debrief: Blue has ${fixes} fixes, you delivered ${d} orders on time.`,
      'both',
    );
  }
  if (status === 'ended') return;
  log(s, 'info', 'Type reveal to see the truth and step through how the picture built up.', 'both');
}

// The truth against what each side made of it.
export function revealLines(s: MissionState): string[] {
  const lines: string[] = [];
  const describe = (picture: Track[], e: Unit) => {
    const t = picture.find((x) => x.emitterId === e.id);
    return !t ? 'never heard' : !t.fix ? `${t.id}, ${t.bearings.length} bearing, no fix` : `${t.id}, fix ${t.fix.missKm.toFixed(2)} km off (CEP ${t.fix.cepKm.toFixed(2)} km)`;
  };
  if (s.mission === 'find') {
    for (const e of s.world.units.filter((u) => u.side === 'red' && u.radio.powerW > 0)) {
      const { col, row } = axialToOffset(e.pos);
      lines.push(`Reveal: ${e.name} at ${col},${row}: ${describe(s.tracks, e)}.`);
      if (s.tracks.some((t) => t.emitterId === e.id)) lines.push(`  Blue ${heardTimeline(s, s.tracks, e.id)}.`);
    }
    return lines;
  }
  if (s.mission === 'hunt') {
    for (const uav of uavStates(s)) {
      const unit = unitById(s.world, uav.unitId)!;
      const { col, row } = axialToOffset(unit.pos);
      const rep = uav.telemetry.map((t) => `T+${t.minute}${t.forced ? '*' : ''}${t.delivered ? '' : ' lost'}`);
      lines.push(`Reveal: ${unit.name} ${uav.launchedMin === undefined ? 'never launched' : `launched T+${uav.launchedMin}`}, ended at ${col},${row}. Reports (* forced): ${rep.length ? rep.join(', ') : 'none'}.`);
      const enemy = uavStates(s).find((x) => x.side !== uav.side);
      const t = enemy && pictureOf(s, uav.side).find((x) => x.emitterId === enemy.unitId);
      lines.push(`Reveal: ${uav.side === 'blue' ? 'Blue' : 'Red'} on the other UAV: ${t ? `${t.id}, ${t.bearings.length} bearings, ${t.fixes?.length ?? 0} fixes` : 'never heard'}.`);
      if (t) lines.push(`  ${uav.side === 'blue' ? 'Blue' : 'Red'} ${heardTimeline(s, pictureOf(s, uav.side), enemy!.unitId)}.`);
    }
    if (s.found) lines.push(`Reveal: found at T+${s.found.minute} by ${unitById(s.world, s.found.sensorId)?.name} from ${s.found.km.toFixed(1)} km.`);
    return lines;
  }
  if (s.mission === 'uav' && s.uav) {
    const uav = s.uav;
    const wp = uav.route.map((h, i) => {
      const { col, row } = axialToOffset(h);
      return `${i + 1}: ${col},${row}`;
    });
    lines.push(`Reveal: Red UAV route ${wp.join('; ')}. ${uav.launchedMin === undefined ? 'Never launched.' : `Launched T+${uav.launchedMin}${uav.doneMin !== undefined ? `, complete T+${uav.doneMin}` : `, reached ${uav.nextWp} waypoints`}.`}`);
    const rep = uav.telemetry.map((t) => `T+${t.minute}${t.forced ? '*' : ''}${t.delivered ? '' : ' lost'}`);
    lines.push(`Reveal: UAV reports (* forced): ${rep.length ? rep.join(', ') : 'none'}.`);
    const t = s.tracks.find((x) => x.emitterId === uav.unitId);
    if (!t) lines.push('Reveal: Blue never heard the UAV.');
    else {
      lines.push(`Reveal: Blue track ${t.id} on the UAV: ${t.bearings.length} bearings, ${t.fixes?.length ?? 0} position fixes, ${uavFixes(s)} under ${U.winCepKm} km.`);
      for (const f of t.fixes ?? []) lines.push(`  T+${f.minute}: CEP ${f.fix.cepKm.toFixed(2)} km, actually ${f.fix.missKm.toFixed(2)} km off.`);
      lines.push(`  Blue ${heardTimeline(s, s.tracks, uav.unitId)}.`);
    }
    for (const e of s.world.units.filter((u) => u.side === 'blue')) {
      const { col, row } = axialToOffset(e.pos);
      lines.push(`Reveal: ${e.name} at ${col},${row}: Red ${describe(s.redTracks, e)}.`);
    }
    return lines;
  }
  if (s.playbook) lines.push(`Reveal: Blue ran the "${s.playbook.name}" plan.`);
  for (const e of s.world.units.filter((u) => u.side === 'red')) {
    const decoy = e.kind === 'jammer';
    const what = describe(s.tracks, e);
    const { col, row } = axialToOffset(e.pos);
    lines.push(`Reveal: Blue on ${e.name}${s.mission === 'duel' ? ` at ${col},${row}` : ''}: ${what}${decoy && /fix/.test(what) ? ' (a decoy, did not count)' : ''}.`);
    if (s.tracks.some((t) => t.emitterId === e.id)) lines.push(`  Blue ${heardTimeline(s, s.tracks, e.id)}.`);
  }
  for (const e of s.world.units.filter((u) => u.side === 'blue')) {
    const { col, row } = axialToOffset(e.pos);
    lines.push(`Reveal: ${e.name} at ${col},${row}: ${s.mission === 'duel' ? 'Red' : 'you'} ${describe(s.redTracks, e)}.`);
  }
  for (const o of s.redOrders) lines.push(`Reveal: order ${o.n} to ${unitById(s.world, o.toId)!.name}: ${o.status}${o.sentMin !== undefined ? ` (sent T+${o.sentMin})` : ''}.`);
  return lines;
}

function snapshot(s: MissionState): Snapshot {
  return {
    minute: s.minute,
    positions: Object.fromEntries(s.world.units.map((u) => [u.id, u.pos])),
    tracks: s.tracks.map((t) => ({ ...t, bearings: [...t.bearings] })),
    redTracks: s.redTracks.map((t) => ({ ...t, bearings: [...t.bearings] })),
    sectors: activeSectors(s),
    plans: flightPlans(s),
    settings: {
      units: Object.fromEntries(s.world.units.map((u) => [u.id, { powerW: u.radio.powerW, antenna: u.antenna, decoy: u.decoy, jammer: u.jammer }])),
      nets: Object.fromEntries(s.world.nets.map((n) => [n.id, n.waveform])),
      emcon: { ...s.emcon },
    },
  };
}

// Minutes where something happened: the picture changed, or the console reported an order, a report or a fix.
// Plain movement between those moments is seen by stepping, not stopped at.
function eventMinutes(s: MissionState): number[] {
  const said = new Set(s.log.filter((e) => e.kind === 'order' || e.kind === 'report' || e.kind === 'hq').map((e) => e.minute));
  const out: number[] = [];
  for (let i = 1; i < s.history.length; i++) {
    const a = s.history[i - 1];
    const b = s.history[i];
    const changed = JSON.stringify(b.tracks) !== JSON.stringify(a.tracks) || JSON.stringify(b.redTracks) !== JSON.stringify(a.redTracks);
    if (changed || said.has(b.minute)) out.push(b.minute);
  }
  return out;
}

// Replay commands: reveal, next, step, back, exit. Reveal ends a running mission first.
function replayCommand(s: MissionState, cmd: Extract<MissionCommand, { type: 'reveal' | 'replay' }>) {
  if (s.status === 'running') {
    if (cmd.type !== 'reveal') {
      log(s, 'error', 'Type reveal first. It ends the mission and opens the debrief.');
      return;
    }
    end(s, 'ended');
  }
  const last = s.history.length - 1;
  if (cmd.type === 'reveal') {
    for (const line of revealLines(s)) log(s, 'info', line, 'both');
    s.replay = { minute: 0 };
    log(s, 'replay', `Replay at T+0. next jumps to the next event (${eventMinutes(s).length} in all), step and back move one minute, exit leaves the replay.`, 'both');
    return;
  }
  if (!s.replay) {
    log(s, 'error', 'Type reveal first to open the replay.');
    return;
  }
  if (cmd.move === 'exit') {
    s.replay = undefined;
    log(s, 'replay', 'Replay closed. Showing the final picture.', 'both');
    return;
  }
  const cur = s.replay.minute;
  let to = cur;
  if (cmd.move === 'step') to = Math.min(last, cur + 1);
  else if (cmd.move === 'back') to = Math.max(0, cur - 1);
  else to = eventMinutes(s).find((m) => m > cur) ?? last;
  if (to === cur) {
    log(s, 'replay', cmd.move === 'back' ? 'Already at T+0.' : `End of the replay at T+${cur}. Type exit to leave it.`, 'both');
    return;
  }
  s.replay = { minute: to };
  // Replay what both consoles said during the minutes being stepped over.
  const lo = Math.min(cur, to);
  const hi = Math.max(cur, to);
  const said = s.log.filter((e) => e.kind !== 'replay' && e.kind !== 'info' && e.kind !== 'error' && e.minute > lo && e.minute <= hi);
  const snap = s.history[to];
  const redEmitters = s.world.units.filter((u) => u.side === 'red' && u.radio.powerW > 0).length;
  const blueHeard = new Set(snap.tracks.map((t) => t.emitterId)).size;
  const blueFixed = snap.tracks.filter((t) => t.fix).length;
  const summary =
    s.mission === 'find'
      ? `T+${to}: ${said.length === 0 ? 'quiet. ' : ''}${blueHeard} of ${redEmitters} Red emitters heard, ${blueFixed} fixed.`
      : s.humans.length > 1
        ? `T+${to}: ${said.length === 0 ? 'quiet. ' : ''}Blue has heard ${blueHeard} of ${redEmitters} Red emitters, ${blueFixed} fixed; Red has ${snap.redTracks.length} tracks on Blue.`
        : `T+${to}: ${said.length === 0 ? 'quiet. ' : ''}Blue has heard ${blueHeard} of your ${redEmitters} emitters, ${blueFixed} fixed; you have ${snap.redTracks.length} tracks on Blue.`;
  s.log = [...s.log, { minute: to, kind: 'replay', text: summary }];
  for (const e of cmd.move === 'back' ? said.reverse() : said) {
    s.log = [...s.log, { minute: e.minute, kind: 'replay', text: `  ${e.side && (s.humans.length > 1 || e.side !== s.side) ? `[${e.side}] ` : ''}${e.text}` }];
  }
}

// One unit's status line: where it is, what it is doing, its link to HQ, held reports and radio settings.
function unitLine(s: MissionState, u: Unit, links: LinkView[]): string {
  const { col, row } = axialToOffset(u.pos);
  const o = s.orders[u.id];
  const order = !o
    ? 'idle'
    : o.kind === 'df'
      ? `DF ${sectorLabel(o.centreDeg)} until T+${o.endMin}`
      : o.kind === 'move'
        ? `moving, ${o.path.length} hexes to go`
        : `sortie leg ${Math.min(o.legIndex + 1, o.legs.length)}/${o.legs.length}, ${o.phase === 'out' ? `flying (${o.path.length} hexes)` : o.phase === 'df' ? `DF ${sectorLabel(o.legs[o.legIndex].centreDeg!)} until T+${o.dfEndMin}` : `returning (${o.path.length} hexes)`}, radio silent`;
  const route = routeToHq(s, u.id, links);
  const held = s.held.filter((r) => r.unitId === u.id).length;
  const link = route.via === 'not on the command net' ? 'no radio net' : `${route.ok ? 'ok' : 'LOST'} (${route.via})`;
  const ep = [
    u.radio.powerW > 0 && u.kind !== 'drone' ? `${u.radio.powerW} W` : '',
    u.antenna ? `antenna → ${unitById(s.world, u.antenna.towardId)?.name ?? '?'}` : '',
    u.decoy ? `decoy as ${s.world.nets.find((n) => n.id === u.decoy!.netId)?.name}` : '',
    u.jammer && u.jammer.mode !== 'off' ? `jamming ${u.jammer.targetNetId}` : '',
  ].filter(Boolean);
  return `${aliasOf(u.id).padEnd(5)} ${u.name.padEnd(13)} at ${col},${row} · ${order} · link to HQ: ${link}${held ? ` · ${held} report held` : ''}${ep.length ? ` · ${ep.join(', ')}` : ''}`;
}

export function statusLines(s: MissionState, side: PlayerSide = s.side): string[] {
  const links = allLinkBudgets(s.world);
  const lines: string[] = [];
  if (s.mission === 'hunt') {
    const mine = side === 'blue' ? s.blueUav : s.uav;
    const theirs = side === 'blue' ? s.uav : s.blueUav;
    const unit = mine && unitById(s.world, mine.unitId);
    if (mine && unit) {
      const { col, row } = axialToOffset(unit.pos);
      const flight = mine.launchedMin === undefined ? 'on the ground: uav: route ..., then uav: launch' : `airborne since T+${mine.launchedMin}, at ${col},${row}, ${mine.route.length - mine.nextWp} waypoint${mine.route.length - mine.nextWp === 1 ? '' : 's'} to go${mine.holding ? ', holding' : ''}`;
      const due = mine.launchedMin === undefined ? '' : ` Next forced report T+${(mine.lastBurstMin ?? mine.launchedMin) + mine.reportEveryMin}.`;
      lines.push(`T+${s.minute} of ${s.limitMin} min. ${unit.name} ${flight}. Reports: ${mine.telemetry.filter((x) => x.delivered).length} received, ${mine.telemetry.filter((x) => !x.delivered).length} lost.${due} Bearings waiting for the next report: ${Object.keys(mine.heard).length}.`);
    }
    const t = theirs && pictureOf(s, side).find((x) => x.emitterId === theirs.unitId);
    const last = t?.bearings[t.bearings.length - 1];
    lines.push(
      t && last
        ? `Enemy UAV: track ${t.id}, ${t.bearings.length} bearing${t.bearings.length === 1 ? '' : 's'}, last ${Math.round(last.bearingDeg)}° from ${unitById(s.world, last.sensorId)?.name ?? last.sensorId} at T+${last.heardMin ?? last.minute}${t.fix ? `; latest fix CEP ${t.fix.cepKm.toFixed(1)} km` : ''}.`
        : 'Enemy UAV: not heard yet.',
    );
    for (const net of s.world.nets.filter((n) => n.side === side)) {
      const w = net.waveform;
      lines.push(`net ${netAliasOf(net.id).padEnd(7)} ${net.name.padEnd(16)} ${net.freqMHz} MHz · ${w.kind === 'fixed' ? 'fixed' : w.kind === 'fh' ? `hopping ${w.hopsPerSec}/s` : `DSSS ${w.chipRateMcps} Mcps`}`);
    }
  } else if (s.mission === 'uav' && s.uav) {
    const uav = s.uav;
    const t = s.tracks.find((x) => x.emitterId === uav.unitId);
    if (side === 'blue') {
      lines.push(`T+${s.minute} of ${s.limitMin} min. UAV position fixes under ${U.winCepKm} km: ${uavFixes(s)}/${U.fixesToWin}.${t ? ` Track ${t.id}: ${t.bearings.length} bearings, ${t.fixes?.length ?? 0} fixes.` : ' UAV not heard yet.'}`);
    } else {
      const flown = uav.doneMin !== undefined ? `route complete at T+${uav.doneMin}` : uav.launchedMin === undefined ? 'UAV on the ground: uav: launch' : `airborne since T+${uav.launchedMin}, waypoint ${uav.nextWp}/${uav.route.length}${uav.holding ? ', holding' : ''}`;
      const due = uav.launchedMin === undefined || uav.doneMin !== undefined ? '' : ` Next forced report T+${(uav.lastBurstMin ?? uav.launchedMin) + U.reportEveryMin}.`;
      lines.push(`T+${s.minute} of ${s.limitMin} min. ${flown}. Reports: ${uav.telemetry.filter((x) => x.delivered).length} received, ${uavGaps(s)} lost (${U.maxGaps} allowed).${due} Tracks on Blue: ${s.redTracks.length}.`);
      for (const net of s.world.nets.filter((n) => n.side === 'red')) {
        const w = net.waveform;
        lines.push(`net ${netAliasOf(net.id).padEnd(7)} ${net.name.padEnd(16)} ${net.freqMHz} MHz · ${w.kind === 'fixed' ? 'fixed' : w.kind === 'fh' ? `hopping ${w.hopsPerSec}/s` : `DSSS ${w.chipRateMcps} Mcps`} · chatter ${Math.round(dutyOf(s, net) * 100)}%`);
      }
    }
  } else if (s.mission === 'fox') {
    const f = s.found;
    lines.push(side === 'blue'
      ? `T+${s.minute} of ${s.limitMin} min. Tracks: ${s.tracks.length}. ${f ? `Found at T+${f.minute}.` : `Not found yet: get within ${FOX.foundKm} km.`}`
      : `T+${s.minute} of ${s.limitMin} min. ${f ? 'The hunter found you.' : 'Not found yet.'} Tracks on Blue: ${s.redTracks.length}.`);
  } else if (s.mission === 'iads' && s.iads) {
    const denied = s.iads.engagements.filter((e) => !e.ok).length;
    const done = s.iads.engagements.filter((e) => e.ok).length;
    lines.push(`T+${s.minute} of ${s.limitMin} min. Engagements: ${done} completed, ${denied} denied (Blue needs ${IADS.denyToWin}, Red ${IADS.completeToWin}). Tracks: ${pictureOf(s, side).length}.`);
    if (side === 'red') {
      for (const net of s.world.nets.filter((n) => n.side === 'red')) {
        const w = net.waveform;
        lines.push(`net ${netAliasOf(net.id).padEnd(7)} ${net.name.padEnd(16)} ${net.freqMHz} MHz · ${w.kind === 'fixed' ? 'fixed' : w.kind === 'fh' ? `hopping ${w.hopsPerSec}/s` : `DSSS ${w.chipRateMcps} Mcps`} · chatter ${Math.round(dutyOf(s, net) * 100)}%`);
      }
    }
  } else if (side === 'blue') {
    lines.push(`T+${s.minute} of ${s.limitMin} min. Tracks: ${s.tracks.length}, fixed under ${R.winCepKm} km: ${realFixes(s)}/${R.fixesToWin}.`);
  } else {
    const cur = s.redOrders.find((o) => o.status === 'pending' && o.windowStart <= s.minute && s.minute < o.windowEnd);
    lines.push(`T+${s.minute} of ${s.limitMin} min. Orders on time: ${deliveredOrders(s)}/${R.redOrderCount} (${R.redOrdersToWin} to win). Tracks on Blue: ${s.redTracks.length}.`);
    lines.push(cur ? `Current order: ${cur.n} to ${unitById(s.world, cur.toId)!.name}, window closes T+${cur.windowEnd}. Type send.` : 'No order due now.');
    for (const net of s.world.nets.filter((n) => n.side === 'red')) {
      const w = net.waveform;
      lines.push(`net ${netAliasOf(net.id).padEnd(7)} ${net.name.padEnd(16)} ${net.freqMHz} MHz · ${w.kind === 'fixed' ? 'fixed' : w.kind === 'fh' ? `hopping ${w.hopsPerSec}/s` : `DSSS ${w.chipRateMcps} Mcps`} · chatter ${Math.round(dutyOf(s, net) * 100)}%`);
    }
  }
  const c2 = s.c2?.[side];
  if (c2) {
    const mine = s.world.units.filter((x) => x.side === side && x.kind !== 'hq').map((x) => aliasOf(x.id));
    const auto = mine.filter((a) => !c2.agents.includes(a));
    lines.push(`Unit agents: ${c2.agents.length ? c2.agents.join(', ') : 'none'}. Auto: ${auto.length ? auto.join(', ') : 'none'}.`);
    const sent = receipts(s, side);
    const acked = sent.filter((o) => o.ackMin !== undefined);
    const item = (o: OrderMessage, since: boolean) => `n${o.n} to ${aliasOf(o.toId)}${since ? ` since T+${o.sentMin}` : ''}`;
    const group = (label: string, list: OrderMessage[], since: boolean) => `${label} ${list.length}${list.length ? ` (${list.map((o) => item(o, since)).join(', ')})` : ''}`;
    const ackText = acked.length ? ` (on time ${acked.filter((o) => o.status === 'on time').length}, late ${acked.filter((o) => o.status === 'late').length})` : '';
    lines.push(`Orders: ${sent.length} sent; acknowledged ${acked.length}${ackText}; ${group('pending', sent.filter((o) => o.status === 'pending'), true)}; ${group('lost', sent.filter((o) => o.status === 'lost'), false)}.`);
  }
  for (const u of s.world.units.filter((x) => x.side === side)) lines.push(unitLine(s, u, links));
  return lines;
}

export function pictureLines(s: MissionState, side: PlayerSide = s.side): string[] {
  const picture = pictureOf(s, side);
  if (picture.length === 0) return ['No tracks yet.'];
  return picture.map((t) => {
    if (t.fix) {
      const { col, row } = axialToOffset({ q: Math.round(t.fix.q), r: Math.round(t.fix.r) });
      return `${t.id} · ${t.signature} · fixed near ${col},${row}, CEP ${t.fix.cepKm.toFixed(2)} km, ${t.bearings.length} bearings`;
    }
    // No fix: the latest bearings, newest first, with when and from where they were taken.
    const recent = t.bearings.slice(-4).reverse();
    const show = (b: ReportedBearing) => {
      const { col, row } = axialToOffset(b.sensorPos);
      return `${unitById(s.world, b.sensorId)?.name ?? b.sensorId} at ${col},${row}: ${stamp(b.bearingDeg)} ± ${b.sigmaDeg.toFixed(1)}° at T+${b.heardMin ?? b.minute}`;
    };
    return `${t.id} · ${t.signature} · ${t.bearings.length} bearing${t.bearings.length === 1 ? '' : 's'}, no fix${t.bearings.length > 4 ? ', latest' : ''}: ${recent.map(show).join('; ')}`;
  });
}

// The world as the player sees it: the enemy removed.
export function visibleWorld(s: MissionState, side: PlayerSide = s.side): World {
  const enemy = enemyOf(side);
  return { ...s.world, units: s.world.units.filter((u) => u.side !== enemy) };
}

// Sectors being listened to right now by the player's units, for the map.
export function activeSectors(s: MissionState, side?: PlayerSide): { pos: Hex; centreDeg: number; halfWidthDeg: number; label: string }[] {
  return Object.entries(s.orders)
    .filter(([id, o]) => (!side || unitById(s.world, id)?.side === side) && (o.kind === 'df' || (o.kind === 'sortie' && o.phase === 'df')))
    .map(([id, o]) => ({
      pos: unitById(s.world, id)!.pos,
      centreDeg: o.kind === 'df' ? o.centreDeg : (o as Extract<Order, { kind: 'sortie' }>).legs[(o as Extract<Order, { kind: 'sortie' }>).legIndex].centreDeg!,
      halfWidthDeg: R.sectorHalfWidthDeg,
      label: id,
    }));
}

// Remaining waypoints of each of the player's drones on a sortie, ending at its squad, for the map.
export function flightPlans(s: MissionState, side?: PlayerSide): { unitId: string; from: Hex; points: Hex[] }[] {
  const out: { unitId: string; from: Hex; points: Hex[] }[] = [];
  // Missions 4 and 5: each UAV's remaining route (the whole route before launch).
  for (const uav of uavStates(s)) {
    if (uav.doneMin !== undefined || (side && side !== uav.side)) continue;
    const drone = unitById(s.world, uav.unitId);
    if (drone) out.push({ unitId: drone.id, from: drone.pos, points: uav.route.slice(uav.launchedMin === undefined ? 0 : Math.max(0, uav.nextWp - 1)) });
  }
  for (const [id, o] of Object.entries(s.orders)) {
    if (o.kind !== 'sortie') continue;
    const drone = unitById(s.world, id)!;
    if (side && drone.side !== side) continue;
    const parent = unitById(s.world, drone.parentId ?? '');
    const points = o.legs.slice(o.phase === 'df' ? o.legIndex + 1 : o.legIndex).map((l) => l.to);
    if (parent) points.push(parent.pos);
    out.push({ unitId: id, from: drone.pos, points });
  }
  return out;
}

// Enemy units the player has a track on (heard and reported at least once).
// A static emitter counts as found once heard; a moving one (a drone) only once the picture has a fix on it, since a
// lone bearing says nothing about where it is now.
const foundIn = (s: MissionState, picture: Track[]): Set<string> =>
  new Set(picture.filter((t) => unitById(s.world, t.emitterId)?.kind !== 'drone' || t.fix || (t.fixes?.length ?? 0) > 0).map((t) => t.emitterId));
export const foundRedIds = (s: MissionState, side: PlayerSide = s.side): Set<string> => foundIn(s, pictureOf(s, side));

// Enemy units never found, for greying out at the reveal.
export const unfoundRedIds = (s: MissionState, side: PlayerSide = s.side): Set<string> => {
  const found = foundRedIds(s, side);
  const enemy = enemyOf(side);
  return new Set(s.world.units.filter((u) => u.side === enemy && !found.has(u.id)).map((u) => u.id));
};

// The world as it stood at a snapshot: every unit where it was, with the power, antenna, decoy and jammer settings and
// the net waveforms of that minute (settings are absent in states saved before they were kept).
export function worldAt(s: MissionState, snap: Snapshot): World {
  const st = snap.settings;
  return {
    ...s.world,
    units: s.world.units.map((u) => {
      const su = st?.units[u.id];
      return su
        ? { ...u, pos: snap.positions[u.id] ?? u.pos, radio: { ...u.radio, powerW: su.powerW }, antenna: su.antenna, decoy: su.decoy, jammer: su.jammer }
        : { ...u, pos: snap.positions[u.id] ?? u.pos };
    }),
    nets: st ? s.world.nets.map((n) => ({ ...n, waveform: st.nets[n.id] ?? n.waveform })) : s.world.nets,
  };
}

// What the map and panel should show: the live mission, or the replay snapshot while stepping through the reveal.
// `umpire` shows the truth: every unit, both sides' sectors, plans, trails and pictures (E* Blue's tracks on Red, B* Red's on Blue).
export function viewOf(s: MissionState, side: PlayerSide = s.side, umpire = false): {
  truth: World; // every unit, at the positions of the moment shown: use for link budgets
  world: World; // what the map shows: the enemy removed while the mission runs
  tracks: Track[]; // the player's picture
  sectors: Snapshot['sectors'];
  plans: Snapshot['plans'];
  dimUnitIds?: Set<string>; // enemy not yet found at this point
  trails: Trail[]; // where the player's units have been, up to the moment shown
  minute: number;
} {
  const over = s.status !== 'running';
  const enemy = enemyOf(side);
  if (s.replay) {
    const snap = s.history[Math.min(s.replay.minute, s.history.length - 1)];
    const world = worldAt(s, snap);
    const picture = umpire ? [...snap.tracks, ...snap.redTracks] : side === 'blue' ? snap.tracks : snap.redTracks;
    const found = foundIn(s, picture);
    const dim = umpire ? undefined : new Set(s.world.units.filter((u) => u.side === enemy && !found.has(u.id)).map((u) => u.id));
    const umpireTrails = () => [...trails(s, snap.minute, 'blue'), ...trails(s, snap.minute, 'red')];
    // The snapshot keeps both sides' sectors and plans; a side sees only its own.
    const own = (id: string) => umpire || unitById(s.world, id)?.side === side;
    return {
      truth: world,
      world,
      tracks: picture,
      sectors: snap.sectors.filter((x) => own(x.label)),
      plans: snap.plans.filter((x) => own(x.unitId)),
      dimUnitIds: dim,
      trails: umpire ? umpireTrails() : trails(s, snap.minute, side),
      minute: snap.minute,
    };
  }
  if (umpire) {
    return {
      truth: s.world,
      world: s.world,
      tracks: [...pictureOf(s, 'blue'), ...pictureOf(s, 'red')],
      sectors: activeSectors(s),
      plans: flightPlans(s),
      trails: [...trails(s, Infinity, 'blue'), ...trails(s, Infinity, 'red')],
      minute: s.minute,
    };
  }
  return {
    truth: s.world,
    world: over ? s.world : visibleWorld(s, side),
    tracks: pictureOf(s, side),
    sectors: activeSectors(s, side),
    plans: flightPlans(s, side),
    dimUnitIds: over ? unfoundRedIds(s, side) : undefined,
    trails: trails(s, Infinity, side),
    minute: s.minute,
  };
}

export interface Trail {
  unitId: string;
  kind: 'drone' | 'ground';
  points: Hex[]; // one per minute the unit was somewhere new, oldest first, ending at its current position
}

// Where each of the player's units has been, from the minute-by-minute snapshots, up to `uptoMinute`.
export function trails(s: MissionState, uptoMinute = Infinity, side: PlayerSide = s.side): Trail[] {
  const out: Trail[] = [];
  const snaps = s.history.filter((h) => h.minute <= uptoMinute);
  for (const u of s.world.units.filter((x) => x.side === side)) {
    const points: Hex[] = [];
    for (const h of snaps) {
      const p = h.positions[u.id];
      if (p && (points.length === 0 || !hexEquals(points[points.length - 1], p))) points.push(p);
    }
    if (points.length > 1) out.push({ unitId: u.id, kind: u.kind === 'drone' ? 'drone' : 'ground', points });
  }
  return out;
}

// Console lines the player's side should see.
export const visibleLog = (s: MissionState, side: PlayerSide = s.side) => s.log.filter((e) => !e.side || e.side === side);

// A unit's own console: lines its tasks and orders produced, plus mission-wide notices. Not the side's other lines.
export const visibleLogFor = (s: MissionState, unitId: string): LogEntry[] => s.log.filter((e) => e.unitId === unitId || !e.side);

// What a unit knows this turn: its own status line, the orders given (by default every order that reached it since
// sinceMin; the server passes the ones the unit has not been shown yet), and what it heard since sinceMin.
// A capture shows the signal's signature and strength only: the unit cannot know who sent it or where from.
export function unitStatusLines(s: MissionState, unitId: string, sinceMin: number, orders: OrderMessage[] = inbox(s, unitId, sinceMin)): string[] {
  const unit = unitById(s.world, unitId);
  if (!unit) return [];
  const lines = [unitLine(s, unit, allLinkBudgets(s.world))];
  for (const o of orders) lines.push(`order ${o.n} at T+${o.arriveMin}: ${o.text}`);
  const heard = s.events.filter((e): e is Extract<MissionEvent, { kind: 'capture' }> => e.kind === 'capture' && e.sensorId === unitId && e.minute >= sinceMin);
  for (const e of heard) {
    const emitter = unitById(s.world, e.emitterId);
    const signature = emitter?.radio ? emissionsAt(s, emitter, e.minute).find((x) => x.what === e.what)?.signature : undefined;
    lines.push(`T+${e.minute} heard ${signature ?? e.what}, SNR ${Math.round(e.snrDb)} dB, bearing ${Math.round(e.bearingDeg)}° ± ${e.sigmaDeg.toFixed(1)}°`);
  }
  if (heard.length === 0) lines.push('Nothing heard.');
  return lines;
}

// When an emitter was heard by the other side, what gave it away, who heard it, and when it was fixed.
export function heardTimeline(s: MissionState, picture: Track[], emitterId: string, limit = 6): string {
  const t = picture.find((x) => x.emitterId === emitterId);
  if (!t) return 'never heard';
  const byMinute = new Map<number, { what: Set<string>; who: Set<string> }>();
  for (const b of t.bearings) {
    for (const smp of b.samples ?? []) {
      const e = byMinute.get(smp.minute) ?? { what: new Set(), who: new Set() };
      e.what.add(smp.what);
      e.who.add(unitById(s.world, b.sensorId)?.name.replace(/^(Blue|Red) /, '') ?? b.sensorId);
      byMinute.set(smp.minute, e);
    }
  }
  const minutes = [...byMinute.keys()].sort((a, b) => a - b);
  const items = minutes.slice(0, limit).map((m) => {
    const e = byMinute.get(m)!;
    return `T+${m} ${[...e.what].join('/')} (${[...e.who].join(', ')})`;
  });
  const more = minutes.length > limit ? `, +${minutes.length - limit} more` : '';
  const side = picture === s.tracks ? 'blue' : 'red';
  const fixedAt = s.history.find((h) => (side === 'blue' ? h.tracks : h.redTracks).find((x) => x.emitterId === emitterId)?.fix)?.minute;
  const goodAt = s.history.find((h) => {
    const x = (side === 'blue' ? h.tracks : h.redTracks).find((y) => y.emitterId === emitterId);
    return x?.fix && x.fix.cepKm < R.winCepKm;
  })?.minute;
  const fix = t.fix ? `; fixed at T+${fixedAt ?? '?'}${goodAt !== undefined ? `, under ${R.winCepKm} km at T+${goodAt}` : ''}` : '; no fix';
  return `heard ${minutes.length} time${minutes.length === 1 ? '' : 's'}: ${items.join(', ')}${more}${fix}`;
}

// Move the replay to a minute (after the mission has ended). The sequence chart uses this.
export function jumpReplay(state: MissionState, minute: number): MissionState {
  if (state.status === 'running') return state;
  const s = clone(state);
  s.replay = { minute: Math.max(0, Math.min(s.history.length - 1, Math.round(minute))) };
  return s;
}
