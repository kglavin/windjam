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
import { type AssocPicture, associate, interceptsOf } from './associate';
import { sectorOf } from './deception';
import type { Level } from './orbat';
import { DECEPTION_RULES as DEC } from './types';
import { MISSION_RULES as R, type MissionKind, type MissionState, type PlayerSide, type Track } from './types';

export type Behaviour = 'hunt' | 'command' | 'fox' | 'iads-blue' | 'iads-red' | 'deceiver' | 'analyst';

export interface ComputerSide {
  behaviour: Behaviour;
  turnMin: number;
  memory: Record<string, unknown>;
}

export const BEHAVIOURS: Behaviour[] = ['hunt', 'command', 'fox', 'iads-blue', 'iads-red', 'deceiver', 'analyst'];

// The behaviour a side plays by default in a mission kind.
export function defaultBehaviour(mission: MissionKind, side: PlayerSide): Behaviour {
  if (mission === 'iads') return side === 'blue' ? 'iads-blue' : 'iads-red';
  if (mission === 'deception') return side === 'blue' ? 'analyst' : 'deceiver';
  if (mission === 'fox') return side === 'blue' ? 'fox' : 'command';
  return side === 'blue' ? 'hunt' : 'command';
}

// One person on a fox hunt acts the minute a listen ends; a staff acts by the turn; the deception sides act every hour.
export const computerSide = (behaviour: Behaviour, turnMin = behaviour === 'fox' || behaviour === 'deceiver' || behaviour === 'analyst' ? 1 : 5): ComputerSide => ({ behaviour, turnMin, memory: {} });

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

// --- Deception: the deceiver -------------------------------------------------------------------------------------

interface DeceiverMemory {
  moved: Record<string, number>; // the day the ruse's HQ last moved
  loud: Record<number, boolean>; // the days the ruse was turned up
  ordered: Record<number, boolean>;
}

// The deceiver runs the plan (docs/design-deception.md section 8): the ruse chatters more as the operation nears, an
// extra order goes down its tree each afternoon of the last day, and when the plan says so its HQ moves at night the
// way a real one would. It hears nothing of Blue, so it reacts to the clock, not to being found.
function deceiver(s: MissionState, side: PlayerSide, mem: DeceiverMemory): string[] {
  mem.moved ??= {};
  mem.loud ??= {};
  mem.ordered ??= {};
  const lines: string[] = [];
  const hour = s.minute % 24;
  const day = Math.floor(s.minute / 24);
  const orbat = s.orbat ?? [];
  const roots = orbat.filter((n) => n.notional && !n.parent);
  for (const root of roots) {
    const unit = own(s, side).find((u) => u.id === root.id);
    if (!unit) continue;
    const under = orbat.filter((n) => n.parent === root.id);
    if (hour === 2 && s.plan?.moveHqKm && mem.moved[root.id] !== day && idle(s, unit)) {
      // North one night, south the next: the HQ stays in its sector and keeps its distance from the sites.
      const line = moveLine(s, unit, hexAlong(s, unit.pos, day % 2 === 0 ? 0 : 180, s.plan.moveHqKm));
      if (line) {
        lines.push(line);
        mem.moved[root.id] = day;
      }
    }
    if (hour === 12 && day >= 1 && !mem.loud[day]) {
      mem.loud[day] = true;
      for (const n of [root, ...under]) lines.push(`${netAliasOf(n.netId)}: loud 12 ${day >= 2 ? 2 : 1.5}`);
    }
    if (hour === 15 && day >= 2 && !mem.ordered[day]) {
      mem.ordered[day] = true;
      lines.push(`${netAliasOf(root.netId)}: order`);
      for (const n of under.filter((x) => x.level === 'brigade')) lines.push(`${netAliasOf(n.netId)}: order`);
    }
  }
  return lines;
}

// --- Deception: the analyst --------------------------------------------------------------------------------------

interface AnalystMemory {
  assessedAt?: number;
}

const RADIOS_PER_NET = 2.4; // what a net heard stands for: a real division has 102 radios on 42 nets

// The analyst tasks the sites and reads the picture (docs/design-deception.md section 8). Tasking: a sweep first,
// then each site watches the busiest 8 MHz no other site covers. Every twelve hours from the first day's end it
// assesses from the association: the hour of a net's orders gives its level, the parent comes from the acknowledging
// station, a ruse is a sector whose battalions have no company nets under them while another sector's do. Strength
// is nets times what a net stands for; the objective is the sector that fell silent (six hours after), else the one
// with most real nets, at the end.
function analyst(s: MissionState, side: PlayerSide, mem: AnalystMemory): string[] {
  const lines: string[] = [];
  const sites = own(s, side).filter((u) => u.kind === 'squad');
  const captures = s.events.filter((e) => e.kind === 'capture' && e.freqMHz !== undefined && sites.some((u) => u.id === e.sensorId)) as Extract<MissionState['events'][number], { kind: 'capture' }>[];
  // Tasking.
  const covered: [number, number][] = sites.filter((u) => !idle(s, u)).map((u) => s.orders[u.id]).filter((o): o is Extract<NonNullable<typeof o>, { kind: 'watch' }> => o?.kind === 'watch').map((o) => [o.loMHz, o.hiMHz]);
  for (const site of sites) {
    if (!idle(s, site)) continue;
    if (captures.length < 20) {
      lines.push(`${aliasOf(site.id)}: sweep 4`);
      continue;
    }
    let best: { lo: number; score: number } | undefined;
    for (let lo = DEC.bandMHz[0]; lo + DEC.watchMHz <= DEC.bandMHz[1]; lo += 1) {
      const hi = lo + DEC.watchMHz;
      const inBand = captures.filter((c) => c.freqMHz! >= lo && c.freqMHz! < hi);
      const score = inBand.filter((c) => !covered.some(([a, b]) => c.freqMHz! >= a && c.freqMHz! < b)).length;
      if (!best || score > best.score) best = { lo, score };
    }
    if (best && best.score > 0) {
      lines.push(`${aliasOf(site.id)}: watch ${best.lo}-${best.lo + DEC.watchMHz} 12`);
      covered.push([best.lo, best.lo + DEC.watchMHz]);
    } else lines.push(`${aliasOf(site.id)}: sweep 4`);
  }
  // Assessment.
  const due = (s.minute >= 24 && s.minute % 12 === 0) || s.minute === s.limitMin - 1;
  if (!due || mem.assessedAt === s.minute || !s.sectors) return lines;
  mem.assessedAt = s.minute;
  const sectors = s.sectors;
  const p = associate(s.world.map, interceptsOf(s.events, new Set(sites.map((u) => u.id)), (id) => s.world.units.find((u) => u.id === id)?.pos));
  const hubOf = (n: AssocPicture['nets'][number]) => p.emitters.find((e) => e.id === n.hubId);
  const hourOf = (n: AssocPicture['nets'][number]) => (n.orderTicks.length ? Math.min(...n.orderTicks.map((t) => t % 24)) : undefined);
  const children = (n: AssocPicture['nets'][number]) => p.nets.filter((x) => x.parentNetId === n.id);
  const levelOf = (n: AssocPicture['nets'][number]): Level | undefined => {
    const h = hourOf(n);
    if (h === undefined) return undefined;
    if (h <= 6) return 'division';
    if (h === 7) return children(n).length ? 'brigade' : 'recce';
    if (h === 8) return 'battalion';
    return n.emitterIds.length >= 3 ? 'artillery' : 'company';
  };
  // Where a net sits: its hub's fix, else any fixed station's. Off the map (a bad crossing) counts as unplaced.
  const placeOf = (n: AssocPicture['nets'][number]): Hex | undefined => {
    const fixed = [hubOf(n), ...n.emitterIds.map((id) => p.emitters.find((x) => x.id === id))].filter((e) => e?.fix);
    const f = fixed[0]?.fix;
    if (!f) return undefined;
    const h = hexRound(f.q, f.r);
    return inBounds(s.world.map, h) ? h : undefined;
  };
  const sectorOfNet = (n: AssocPicture['nets'][number]) => {
    const h = placeOf(n);
    return h ? sectorOf(sectors, axialToOffset(h).row)?.id : undefined;
  };
  // The ruse: a sector whose battalions have no company nets (a lone one is its artillery) while another sector's do.
  const bySector: Record<string, { nets: AssocPicture['nets'][number][]; bn: number; coy: number; last: number }> = Object.fromEntries(sectors.map((x) => [x.id, { nets: [], bn: 0, coy: 0, last: -1 }]));
  for (const n of p.nets) {
    const sec = sectorOfNet(n);
    if (!sec) continue;
    const b = bySector[sec];
    b.nets.push(n);
    const lv = levelOf(n);
    if (lv === 'battalion') b.bn++;
    if (lv === 'company') b.coy++;
    for (const id of n.emitterIds) b.last = Math.max(b.last, p.emitters.find((x) => x.id === id)?.lastTick ?? -1);
  }
  const companiesSeen = Object.values(bySector).some((b) => b.coy >= 5);
  const ruseSectors = new Set(Object.entries(bySector).filter(([, b]) => companiesSeen && b.bn >= 2 && b.coy <= 1).map(([id]) => id));
  const ruse = (n: AssocPicture['nets'][number]) => {
    const sec = sectorOfNet(n);
    return !!sec && ruseSectors.has(sec);
  };
  for (const n of p.nets) {
    const hub = hubOf(n);
    const lv = levelOf(n);
    if (!hub?.fix || !lv || ruse(n)) continue;
    const h = hexRound(hub.fix.q, hub.fix.r);
    if (!inBounds(s.world.map, h)) continue;
    const { col, row } = axialToOffset(h);
    const parent = n.parentNetId ? p.nets.find((x) => x.id === n.parentNetId) : undefined;
    lines.push(`assess net ${n.freqMHz} ${lv} at ${col},${row}${parent ? ` under ${parent.freqMHz}` : ''}`);
  }
  for (const sec of sectors) lines.push(`assess strength ${sec.id} ${ruseSectors.has(sec.id) ? 0 : Math.round(bySector[sec.id].nets.length * RADIOS_PER_NET)}`);
  const real = sectors.map((x) => x.id).filter((id) => !ruseSectors.has(id) && bySector[id].nets.length > 0);
  const quiet = real.filter((id) => s.minute - bySector[id].last >= 2 && bySector[id].nets.length >= 5);
  const target = quiet[0] ?? real.sort((a, b) => bySector[b].nets.length - bySector[a].nets.length)[0];
  if (target) lines.push(`assess objective ${target} at T+${quiet.includes(target) ? bySector[target].last + 6 : s.limitMin}`);
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
    case 'deceiver':
      return deceiver(s, side, mem as unknown as DeceiverMemory);
    case 'analyst':
      return analyst(s, side, mem as AnalystMemory);
  }
}
