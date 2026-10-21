// The computer player (docs/design-computer-player.md): a side played by the engine from what that side knows.
// Each behaviour is a function of the mission state and the side's memory, returning console lines for this turn;
// mission.ts echoes and issues them at the start of a turn. Nothing here reads the enemy's units: the picture, the
// side's own units and orders, the engagements count and the nets' frequencies are what a person at the console sees.
import { bearingDeg, hexToKm } from '../detect';
import { type Hex, axialToOffset, hexDistance, hexRound } from '../hex';
import { getTile, inBounds } from '../map';
import { findPath } from '../path';
import { hexDistanceKm } from '../rf';
import { canEnter } from '../terrain';
import type { Unit } from '../units';
import { unitAt } from '../world';
import { aliasOf, netAliasOf } from './commands';
import { MISSION_RULES as R, type MissionKind, type MissionState, type PlayerSide, type Track } from './types';

export type Behaviour = 'hunt' | 'command' | 'fox' | 'iads-blue' | 'iads-red';

export interface ComputerSide {
  behaviour: Behaviour;
  turnMin: number;
  memory: Record<string, unknown>;
}

export const BEHAVIOURS: Behaviour[] = ['hunt', 'command', 'fox', 'iads-blue', 'iads-red'];

// The behaviour a side plays by default in a mission kind.
export function defaultBehaviour(mission: MissionKind, side: PlayerSide): Behaviour {
  if (mission === 'iads') return side === 'blue' ? 'iads-blue' : 'iads-red';
  if (mission === 'fox') return side === 'blue' ? 'fox' : 'command';
  return side === 'blue' ? 'hunt' : 'command';
}

// One person on a fox hunt acts the minute a listen ends; a staff acts by the turn.
export const computerSide = (behaviour: Behaviour, turnMin = behaviour === 'fox' ? 1 : 5): ComputerSide => ({ behaviour, turnMin, memory: {} });

// --- Helpers: what the side knows ---------------------------------------------------------------------------------

const own = (s: MissionState, side: PlayerSide): Unit[] => s.world.units.filter((u) => u.side === side);
const picture = (s: MissionState, side: PlayerSide): Track[] => (side === 'blue' ? s.tracks : s.redTracks);
const idle = (s: MissionState, u: Unit) => !s.orders[u.id];
const canDf = (u: Unit) => u.kind === 'squad' || u.kind === 'drone';
const front = (side: PlayerSide) => (side === 'blue' ? 90 : 270); // the enemy is east of Blue, west of Red
const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;
const ref = (h: Hex) => {
  const o = axialToOffset(h);
  return `${o.col},${o.row}`;
};
const freqOf = (signature: string): number | undefined => {
  const m = /^(\d+) MHz/.exec(signature);
  return m ? Number(m[1]) : undefined;
};

// The hex `km` along `deg` from `from`.
function hexAlong(s: MissionState, from: Hex, deg: number, km: number): Hex {
  const map = s.world.map;
  const a = hexToKm(map, from);
  const rad = (deg * Math.PI) / 180;
  const x = a.x + km * Math.sin(rad);
  const y = a.y - km * Math.cos(rad);
  const r = y / ((Math.sqrt(3) / 2) * map.hexSizeKm);
  return hexRound(x / map.hexSizeKm - r / 2, r);
}

// A hex the unit can reach near `target`: the target, else the nearest free, enterable hex within three rings.
function reachableNear(s: MissionState, unit: Unit, target: Hex): Hex | undefined {
  const map = s.world.map;
  for (let radius = 0; radius <= 3; radius++) {
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        const h = { q: target.q + dq, r: target.r + dr };
        if (hexDistance(target, h) !== radius || !inBounds(map, h)) continue;
        const tile = getTile(map, h);
        if (!tile || !canEnter(tile.terrain, unit.kind) || unitAt(s.world, h)) continue;
        if (hexDistance(unit.pos, h) === 0) return undefined;
        const path = findPath(s.world, unit.id, h);
        if (path && path.length) return h;
      }
    }
  }
  return undefined;
}

// A move order toward `target`, or none when nothing nearby is reachable.
function moveLine(s: MissionState, unit: Unit, target: Hex): string | undefined {
  const to = reachableNear(s, unit, target);
  return to ? `${aliasOf(unit.id)}: move ${ref(to)}` : undefined;
}

// The newest bearing on a track, preferring one from `sensorId`.
function latestBearing(t: Track, sensorId?: string) {
  const mine = sensorId ? t.bearings.filter((b) => b.sensorId === sensorId) : [];
  const list = mine.length ? mine : t.bearings;
  return list[list.length - 1];
}

// --- hunt --------------------------------------------------------------------------------------------------------

interface HuntMemory {
  cep: Record<string, number[]>; // CEP by track id, one per turn
  moved: Record<string, number>; // the minute each squad last repositioned
}

function hunt(s: MissionState, side: PlayerSide, mem: HuntMemory, turnMin: number): string[] {
  mem.cep ??= {};
  mem.moved ??= {};
  const lines: string[] = [];
  const tracks = picture(s, side);
  const open = tracks.filter((t) => !t.fix || t.fix.cepKm >= R.winCepKm).sort((a, b) => b.bearings.length - a.bearings.length);
  for (const t of tracks) if (t.fix) (mem.cep[t.id] ??= []).push(t.fix.cepKm);
  const sensors = own(s, side).filter(canDf);
  const fan = [-45, 0, 45];
  let k = 0;
  for (const u of sensors) {
    if (!idle(s, u)) continue;
    const t = open[k % Math.max(1, open.length)];
    const b = t ? latestBearing(t, u.id) : undefined;
    const deg = b ? norm(b.bearingDeg) : norm(front(side) + fan[k % fan.length]);
    lines.push(`${aliasOf(u.id)}: df ${deg} ${turnMin}`);
    k++;
  }
  // A fix that has stopped improving: walk one squad 3 km across its bearing for a better crossing.
  const stuck = tracks.find((t) => {
    const h = mem.cep[t.id] ?? [];
    return t.fix && t.fix.cepKm >= R.winCepKm && h.length >= 3 && h[h.length - 1] >= h[h.length - 3] - 0.05;
  });
  if (stuck) {
    const squad = own(s, side).filter((u) => u.kind === 'squad' && idle(s, u) && (mem.moved[u.id] ?? -99) < s.minute - 2 * turnMin)[0];
    if (squad) {
      const deg = bearingDeg(s.world.map, squad.pos, { q: stuck.fix!.q, r: stuck.fix!.r });
      const line = moveLine(s, squad, hexAlong(s, squad.pos, deg - 90, 3));
      if (line) {
        lines.splice(lines.findIndex((l) => l.startsWith(`${aliasOf(squad.id)}:`)), 1);
        lines.push(line);
        mem.moved[squad.id] = s.minute;
      }
    }
  }
  return lines;
}

// --- command -----------------------------------------------------------------------------------------------------

interface CommandMemory {
  started?: boolean;
  dsss?: boolean;
  antenna?: boolean;
}

function command(s: MissionState, side: PlayerSide, mem: CommandMemory): string[] {
  const lines: string[] = [];
  const nets = s.world.nets.filter((n) => n.side === side);
  const cmd = nets.find((n) => n.topology === 'hub');
  if (!mem.started) {
    mem.started = true;
    // Electronic protection first: silence beyond orders, spread the nets, less power, the backhaul on a beam.
    for (const n of nets) lines.push(`emcon ${netAliasOf(n.id)} 0`);
    for (const n of nets.filter((n) => n.topology !== 'mesh' && n.waveform.kind !== 'dsss')) lines.push(`${netAliasOf(n.id)}: waveform dsss`);
    mem.dsss = true;
    const hq0 = own(s, side).find((u) => u.kind === 'hq');
    const relay0 = own(s, side).find((u) => u.kind === 'relay');
    if (hq0 && hq0.radio.powerW > 10) lines.push(`${aliasOf(hq0.id)}: power 10`);
    if (hq0 && relay0 && cmd?.relay) {
      lines.push(`${aliasOf(hq0.id)}: antenna toward ${aliasOf(relay0.id)}`);
      mem.antenna = true;
    }
  }
  // An order whose window is open and which has not gone: send it.
  const due = s.redOrders.find((o) => o.status === 'pending' && o.sentMin === undefined && o.windowStart <= s.minute && s.minute < o.windowEnd);
  if (due && side === 'red') lines.push('send');
  const tracks = picture(s, side);
  if (!mem.dsss && cmd && cmd.waveform.kind !== 'dsss' && tracks.some((t) => t.signature.startsWith('jammer'))) {
    mem.dsss = true;
    lines.push(`${netAliasOf(cmd.id)}: waveform dsss`);
  }
  const relay = own(s, side).find((u) => u.kind === 'relay');
  const hq = own(s, side).find((u) => u.kind === 'hq');
  if (!mem.antenna && hq && relay && cmd?.relay && s.minute >= 10 && tracks.filter((t) => t.fix).length >= 2) {
    mem.antenna = true;
    lines.push(`${aliasOf(hq.id)}: antenna toward ${aliasOf(relay.id)}`);
  }
  return lines;
}

// --- fox ---------------------------------------------------------------------------------------------------------

interface FoxMemory {
  last?: 'listen' | 'walk';
  bearingsSeen?: number;
  shy?: boolean;
  listenDeg?: number;
}

function fox(s: MissionState, side: PlayerSide, mem: FoxMemory): string[] {
  const hunter = own(s, side).find((u) => u.kind === 'squad');
  if (!hunter || !idle(s, hunter)) return [];
  const tracks = picture(s, side);
  // The track to follow: the one whose newest bearing is sharpest (a stronger signal is a nearer fox).
  const target = [...tracks].sort((a, b) => latestBearing(a).sigmaDeg - latestBearing(b).sigmaDeg)[0];
  const total = tracks.reduce((n, t) => n + t.bearings.length, 0);
  const heardNew = total > (mem.bearingsSeen ?? 0);
  if (mem.last === 'listen' && !heardNew) mem.shy = true;
  mem.bearingsSeen = total;
  const listen = (deg: number) => {
    mem.last = 'listen';
    mem.listenDeg = deg;
    return `${aliasOf(hunter.id)}: df ${norm(deg)} ${mem.shy ? 6 : 4}`;
  };
  if (mem.last === 'walk' || mem.last === undefined) {
    const deg = target ? latestBearing(target).bearingDeg : (mem.listenDeg ?? front(side));
    return [listen(deg)];
  }
  if (!target) {
    // Heard nothing yet: walk 4 km toward the enemy's side and listen again there.
    const line = moveLine(s, hunter, hexAlong(s, hunter.pos, front(side), 4));
    if (line) {
      mem.last = 'walk';
      return [line];
    }
    return [listen(front(side))];
  }
  // After a listen: walk to the fix if it is tight, else 4 km along the newest bearing.
  const b = latestBearing(target);
  const goal = target.fix && target.fix.cepKm < 2 ? { q: target.fix.q, r: target.fix.r } : hexAlong(s, hunter.pos, b.bearingDeg, 6);
  for (const km of [0, 5, 4, 3, 2]) {
    const to = km === 0 ? goal : hexAlong(s, hunter.pos, b.bearingDeg, km);
    const line = moveLine(s, hunter, to);
    if (line) {
      mem.last = 'walk';
      return [line];
    }
  }
  return [listen(b.bearingDeg)];
}

// --- iads-blue ---------------------------------------------------------------------------------------------------

interface IadsBlueMemory extends HuntMemory {
  jamming?: 'track' | 'fire' | 'barrage';
  jamSince?: number;
}

function iadsBlue(s: MissionState, side: PlayerSide, mem: IadsBlueMemory, turnMin: number): string[] {
  const lines = hunt(s, side, mem, turnMin);
  const ew = own(s, side).find((u) => u.kind === 'jammer');
  if (!ew) return lines;
  const nets = s.world.nets.filter((n) => n.side !== side && n.side !== 'neutral');
  const isNet = (t: Track) => nets.some((n) => n.freqMHz === freqOf(t.signature));
  // The node: the busiest fixed track on the enemy's nets.
  const node = picture(s, side).filter((t) => t.fix && isNet(t)).sort((a, b) => b.bearings.length - a.bearings.length)[0];
  if (!node?.fix) return lines;
  const fixHex = { q: node.fix.q, r: node.fix.r };
  const km = hexDistanceKm(s.world.map, ew.pos, fixHex);
  if (km > 5.5 && idle(s, ew)) {
    const line = moveLine(s, ew, hexAlong(s, ew.pos, bearingDeg(s.world.map, ew.pos, fixHex), km - 4));
    if (line) lines.push(line);
    return lines;
  }
  if (!idle(s, ew)) return lines;
  const track = nets.find((n) => n.id.endsWith('-track')) ?? nets[0];
  const fire = nets.find((n) => n.id.endsWith('-fire'));
  const eng = s.iads?.engagements ?? [];
  const recent = eng.filter((e) => e.minute >= s.minute - 2 * R.limitMin);
  const lastCycle = eng.length ? eng.filter((e) => e.minute === eng[eng.length - 1].minute) : [];
  if (!mem.jamming) {
    mem.jamming = 'track';
    mem.jamSince = s.minute;
    lines.push(`${aliasOf(ew.id)}: jam ${netAliasOf(track.id)}`);
  } else if (s.minute - (mem.jamSince ?? 0) >= 10 && lastCycle.length && lastCycle.every((e) => e.ok)) {
    // Two cycles on and the engagements still complete: change the leg, then the mode.
    if (mem.jamming === 'track' && fire) {
      mem.jamming = 'fire';
      lines.push(`${aliasOf(ew.id)}: jam ${netAliasOf(fire.id)}`);
    } else if (mem.jamming !== 'barrage') {
      mem.jamming = 'barrage';
      lines.push(`${aliasOf(ew.id)}: jam ${netAliasOf(track.id)} barrage`);
    }
    mem.jamSince = s.minute;
  }
  void recent;
  return lines;
}

// --- iads-red ----------------------------------------------------------------------------------------------------

interface IadsRedMemory {
  started?: boolean;
  trackDsss?: boolean;
  fireDsss?: boolean;
  pointed?: string;
  moved: Record<string, number>;
}

function iadsRed(s: MissionState, side: PlayerSide, mem: IadsRedMemory): string[] {
  mem.moved ??= {};
  const lines: string[] = [];
  const nets = s.world.nets.filter((n) => n.side === side);
  const track = nets.find((n) => n.id.endsWith('-track'));
  const fire = nets.find((n) => n.id.endsWith('-fire'));
  const fc = own(s, side).find((u) => u.kind === 'hq');
  if (!mem.started) {
    mem.started = true;
    for (const n of nets) lines.push(`emcon ${netAliasOf(n.id)} 0`);
    return lines;
  }
  const eng = s.iads?.engagements ?? [];
  if (!eng.length || !fc) return lines;
  const last = eng.filter((e) => e.minute === eng[eng.length - 1].minute);
  const reportFail = last.find((e) => e.reportStatus !== 'on time');
  const orderFail = last.find((e) => e.reportStatus === 'on time' && e.orderStatus !== 'on time');
  if (reportFail && track) {
    if (!mem.trackDsss) {
      mem.trackDsss = true;
      lines.push(`${netAliasOf(track.id)}: waveform dsss`);
    }
    if (mem.pointed !== reportFail.radarId) {
      mem.pointed = reportFail.radarId;
      lines.push(`${aliasOf(fc.id)}: antenna toward ${aliasOf(reportFail.radarId)}`);
    }
  }
  if (orderFail && fire) {
    if (!mem.fireDsss) {
      mem.fireDsss = true;
      lines.push(`${netAliasOf(fire.id)}: waveform dsss`);
    }
    const launcher = orderFail.launcherId ? own(s, side).find((u) => u.id === orderFail.launcherId) : undefined;
    if (launcher && idle(s, launcher) && (mem.moved[launcher.id] ?? -99) < s.minute - 15) {
      // Away from the jammer if the picture has it fixed, else away from the enemy's side.
      const jam = picture(s, side).find((t) => t.signature.startsWith('jammer') && t.fix);
      const away = jam ? norm(bearingDeg(s.world.map, { q: jam.fix!.q, r: jam.fix!.r }, launcher.pos)) : norm(front(side) + 180);
      const line = moveLine(s, launcher, hexAlong(s, launcher.pos, away, 2));
      if (line) {
        lines.push(line);
        mem.moved[launcher.id] = s.minute;
      }
    }
  }
  return lines;
}

// --- The turn ----------------------------------------------------------------------------------------------------

// The console lines a computer side gives at the start of this turn.
export function computerTurn(s: MissionState, side: PlayerSide): string[] {
  const c = s.computer?.[side];
  if (!c) return [];
  const mem = c.memory as Record<string, unknown>;
  switch (c.behaviour) {
    case 'hunt':
      return hunt(s, side, mem as unknown as HuntMemory, c.turnMin);
    case 'command':
      return command(s, side, mem as CommandMemory);
    case 'fox':
      return fox(s, side, mem as FoxMemory);
    case 'iads-blue':
      return iadsBlue(s, side, mem as unknown as IadsBlueMemory, c.turnMin);
    case 'iads-red':
      return iadsRed(s, side, mem as unknown as IadsRedMemory);
  }
}
