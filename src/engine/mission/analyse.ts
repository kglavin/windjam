// Analysis endpoints as pure functions (state, side, params) => result (design note section 14).
// Each runs the engine's own calculations on what the side knows: its own units, its own picture, and positions
// the caller states as hypotheses. None reads the other side's units, so none can leak the truth.
// A bad input throws an Error; serve.ts turns that into HTTP 400.
import { axialToOffset, hexKey, hexRound, offsetToAxial, type Hex } from '../hex';
import { bearingDeg, emissions, hexToKm, type BearingLine } from '../detect';
import {
  analyzePath,
  bearingSigmaDeg,
  coverageMap,
  fixFromBearings,
  hexDistanceKm,
  hypothesisEmission,
  hypothesisUnit,
  jsCoverageMap,
  linkBudget,
  orderDelivery,
  sensorLook,
  type Hypothesis,
} from '../analysis';
import { RADIO_PRESETS, type JammerMode, type Unit, type UnitKind } from '../units';
import { jammers as jammersOf, netById, unitById } from '../world';
import { motion, nextTransmission, predict, reportingPeriod, type KmFix } from './pattern';
import { MISSION_RULES, type MissionState, type PlayerSide, type Track } from './types';

// A grid position as the console writes it: offset coordinates, column then row.
export interface Pos {
  col: number;
  row: number;
}

// A stated enemy emitter (or any radio): where, what kind, and the radio fields that differ from the preset.
export interface HypothesisParams {
  at: Pos;
  kind: UnitKind;
  powerW?: number;
  antennaM?: number;
  freqMHz?: number;
}

const DEFAULT_ANTENNA_M = 2;
const COVERAGE_RANGE_KM = 40;
const STRONGEST = 10;
const JS_NEAR_KM = 10;
const JAMMER_MODES: JammerMode[] = ['off', 'spot', 'barrage', 'partial', 'multitone', 'pulse', 'swept', 'follower', 'sync'];

const toHex = (p: Pos): Hex => offsetToAxial(p.col, p.row);
const toPos = (h: Hex): Pos => {
  const { col, row } = axialToOffset(h);
  return { col, row };
};

// A position that is a whole number and on the map.
function hexAt(s: MissionState, p: Pos, what: string): Hex {
  if (!p || !Number.isInteger(p.col) || !Number.isInteger(p.row)) throw new Error(`${what} must be a position col,row`);
  const h = toHex(p);
  if (!s.world.map.tiles[hexKey(h)]) throw new Error(`${what} ${p.col},${p.row} is off the map`);
  return h;
}

function ownUnit(s: MissionState, side: PlayerSide, id: string, what = 'unit'): Unit {
  const u = unitById(s.world, id);
  if (!u) throw new Error(`no ${what} ${id}`);
  if (u.side !== side) throw new Error(`${id} is not your unit`);
  return u;
}

function hypothesisOf(s: MissionState, p: HypothesisParams, what: string): Hypothesis {
  if (!(p.kind in RADIO_PRESETS)) throw new Error(`kind must be one of ${Object.keys(RADIO_PRESETS).join(', ')}`);
  for (const [k, v] of [['powerW', p.powerW], ['antennaM', p.antennaM], ['freqMHz', p.freqMHz]] as const)
    if (v !== undefined && !(v > 0)) throw new Error(`${k} must be a positive number`);
  return { pos: hexAt(s, p.at, what), kind: p.kind, powerW: p.powerW, antennaHeightM: p.antennaM, freqMHz: p.freqMHz };
}

// The side's own jammers only: the enemy's are not in its picture.
const ownJam = (s: MissionState, side: PlayerSide) => ({
  jammers: jammersOf(s.world).filter((u) => u.side === side),
  nets: s.world.nets,
  noiseEnv: s.world.noiseEnv,
});

// Path loss between two grid positions at a frequency.
export function analysePath(
  s: MissionState,
  _side: PlayerSide,
  p: { from: Pos; to: Pos; freqMHz: number; fromAntennaM?: number; toAntennaM?: number },
) {
  if (!(p.freqMHz > 0)) throw new Error('freqMHz must be a positive number');
  const path = analyzePath(
    s.world.map,
    hexAt(s, p.from, 'from'),
    p.fromAntennaM ?? DEFAULT_ANTENNA_M,
    hexAt(s, p.to, 'to'),
    p.toAntennaM ?? DEFAULT_ANTENNA_M,
    p.freqMHz,
  );
  const w = path.worstObstacle;
  return {
    totalLossDb: path.totalLossDb,
    lineOfSight: path.lineOfSight,
    distanceKm: path.distanceKm,
    worstObstacle: w && { pos: toPos(w.hex), distanceKm: w.distanceKm, obstacleTopM: w.obstacleTopM, rayM: w.rayM, v: w.v },
  };
}

// One of the side's own links: quality and BER, SNR each way, and how an order fares over it (direct path only).
export function analyseLink(s: MissionState, side: PlayerSide, p: { netId: string; a: string; b: string }) {
  const a = ownUnit(s, side, p.a);
  const b = ownUnit(s, side, p.b);
  const net = netById(s.world, p.netId);
  if (!net || net.side !== side) throw new Error(`${p.netId} is not your net`);
  if (a.id === b.id) throw new Error('a and b must be different units');
  for (const u of [a, b]) if (!net.memberIds.includes(u.id)) throw new Error(`${u.id} is not a member of ${net.id}`);
  const budget = linkBudget(s.world.map, net, a, b, ownJam(s, side));
  const order = orderDelivery([budget], net);
  return {
    quality: budget.quality,
    ber: budget.ber,
    snrDb: { [`${a.id}>${b.id}`]: budget.forward.snrDb, [`${b.id}>${a.id}`]: budget.reverse.snrDb },
    order: { status: order.status, latencyS: order.latencyS, deliveryProbability: order.deliveryProbability },
  };
}

// Where one transmitter can be heard by a squad-class receiver, within 40 km.
export function analyseCoverage(
  s: MissionState,
  side: PlayerSide,
  p: { unit: string } | HypothesisParams,
  o: { minDbm?: number; full?: boolean } = {},
) {
  const minDbm = o.minDbm ?? -110;
  let tx: { pos: Hex; powerW: number; antennaHeightM: number; gainDbi: number; freqMHz: number };
  if ('unit' in p) {
    const u = ownUnit(s, side, p.unit);
    const net = s.world.nets.find((n) => n.memberIds.includes(u.id));
    if (!net) throw new Error(`${u.id} is on no net, so it has no frequency`);
    tx = { pos: u.pos, powerW: u.radio.powerW, antennaHeightM: u.radio.antennaHeightM, gainDbi: u.radio.gainDbi, freqMHz: net.freqMHz };
  } else {
    const h = hypothesisOf(s, p, 'at');
    const u = hypothesisUnit(h);
    tx = { pos: u.pos, powerW: u.radio.powerW, antennaHeightM: u.radio.antennaHeightM, gainDbi: u.radio.gainDbi, freqMHz: hypothesisEmission(h).freqMHz };
  }
  const squad = RADIO_PRESETS.squad;
  const map = s.world.map;
  const grid = coverageMap(map, tx, { antennaHeightM: squad.antennaHeightM, gainDbi: squad.gainDbi }, COVERAGE_RANGE_KM);
  const cells = Object.entries(grid).map(([key, c]) => ({ hex: map.tiles[key].hex, rxDbm: c.rxDbm, lineOfSight: c.lineOfSight }));
  const above = cells.filter((c) => c.rxDbm >= minDbm);
  const maxRangeKm = above.reduce((m, c) => Math.max(m, hexDistanceKm(map, tx.pos, c.hex)), 0);
  const strongest = [...cells].sort((x, y) => y.rxDbm - x.rxDbm).slice(0, STRONGEST).map((c) => ({ pos: toPos(c.hex), rxDbm: c.rxDbm }));
  return {
    minDbm,
    hexesAbove: above.length,
    maxRangeKm,
    strongest,
    ...(o.full ? { cells: cells.map((c) => ({ pos: toPos(c.hex), rxDbm: c.rxDbm, lineOfSight: c.lineOfSight })) } : {}),
  };
}

// What one of the side's sensors would get from a stated emitter: SNR, detection odds, bearing accuracy.
export function analyseDetect(s: MissionState, side: PlayerSide, p: { sensor: string } & HypothesisParams) {
  const sensor = ownUnit(s, side, p.sensor, 'sensor');
  const h = hypothesisOf(s, p, 'at');
  const look = sensorLook(s.world.map, hypothesisUnit(h), sensor, hypothesisEmission(h), {
    pfa: MISSION_RULES.pfa,
    noiseEnv: s.world.noiseEnv,
    limiter: false,
    seed: s.seed,
  });
  return {
    snrDb: look.snrDb,
    pdPerSweep: look.pd,
    pdPerMinute: 1 - (1 - look.pd) ** MISSION_RULES.sweepsPerMinute,
    bearingSigmaDeg: bearingSigmaDeg(look.snrDb),
    lineOfSight: look.lineOfSight,
  };
}

// One of the side's jammers in a chosen mode against a net, seen from a receiver position.
// The net's hub is the transmitter. When the hub is not the side's own unit its position is unknown to the side, so
// the caller states it as `tx`.
export function analyseJs(s: MissionState, side: PlayerSide, p: { jammer: string; mode: JammerMode; netId: string; rx: Pos; tx?: Pos }) {
  const unit = ownUnit(s, side, p.jammer, 'jammer');
  if (!unit.jammer) throw new Error(`${unit.id} has no jammer`);
  if (!JAMMER_MODES.includes(p.mode)) throw new Error(`mode must be one of ${JAMMER_MODES.join(', ')}`);
  const net = netById(s.world, p.netId);
  if (!net) throw new Error(`no net ${p.netId}`);
  const rx = hexAt(s, p.rx, 'rx');
  const hub = net.hubId ? unitById(s.world, net.hubId) : undefined;
  let txUnit: Unit;
  if (hub && hub.side === side) txUnit = hub;
  else if (p.tx) txUnit = hypothesisUnit({ pos: hexAt(s, p.tx, 'tx'), kind: 'hq' });
  else throw new Error(`the transmitter of ${net.id} is not yours: give tx as a position`);
  const jammer: Unit = { ...unit, jammer: { ...unit.jammer, mode: p.mode, targetNetId: net.id } };
  const squad = RADIO_PRESETS.squad;
  const map = s.world.map;
  const tx = { pos: txUnit.pos, powerW: txUnit.radio.powerW, antennaHeightM: txUnit.radio.antennaHeightM, gainDbi: txUnit.radio.gainDbi, freqMHz: net.freqMHz };
  // Far enough to include every hex within JS_NEAR_KM of rx.
  const reach = hexDistanceKm(map, tx.pos, rx) + JS_NEAR_KM;
  const grid = jsCoverageMap(map, tx, { antennaHeightM: squad.antennaHeightM, gainDbi: squad.gainDbi }, jammer, net, s.world.nets, reach);
  const here = grid[hexKey(rx)];
  const near = Object.entries(grid).filter(([k]) => hexDistanceKm(map, rx, map.tiles[k].hex) <= JS_NEAR_KM);
  return {
    jsDb: here.jsDb,
    avgJsDb: here.avgJsDb,
    fraction: here.fraction,
    nearJammedShare: near.length ? near.filter(([, c]) => c.avgJsDb > 0).length / near.length : 0,
  };
}

const fixOut = (s: MissionState, f: { q: number; r: number; cepKm: number; ellipse: { aKm: number; bKm: number; angleRad: number } }) => ({
  // Rounded to the nearest hex; km gives the exact point (x east, y south from the grid origin).
  pos: toPos(hexRound(f.q, f.r)),
  km: hexToKm(s.world.map, f),
  cepKm: f.cepKm,
  ellipse: f.ellipse,
});

// The fix the side's bearings support, from its picture track or from supplied bearings. missKm needs the truth,
// so the fix is computed without it and never reported.
export function analyseFix(
  s: MissionState,
  side: PlayerSide,
  p: { track: string } | { bearings: { sensorPos: Pos; bearingDeg: number; sigmaDeg: number }[] },
  o: { add?: Pos; addSigmaDeg?: number } = {},
) {
  const map = s.world.map;
  let lines: BearingLine[];
  if ('track' in p) {
    const track: Track | undefined = (side === 'blue' ? s.tracks : s.redTracks).find((t) => t.id === p.track);
    if (!track) throw new Error(`no track ${p.track} in your picture`);
    let use = track.bearings;
    if (track.moving) {
      const minutes = track.bearings.map((b) => b.heardMin).filter((m): m is number => m !== undefined);
      const latest = track.fixes?.length ? track.fixes[track.fixes.length - 1].minute : Math.max(...minutes);
      use = track.bearings.filter((b) => b.heardMin === latest);
    }
    lines = use.map((b) => ({ sensorPos: b.sensorPos, bearingDeg: b.bearingDeg, sigmaDeg: b.sigmaDeg }));
  } else {
    if (!Array.isArray(p.bearings)) throw new Error('bearings must be an array');
    lines = p.bearings.map((b, i) => {
      if (!(Number.isFinite(b.bearingDeg) && b.sigmaDeg > 0)) throw new Error(`bearing ${i}: need bearingDeg and sigmaDeg > 0`);
      return { sensorPos: hexAt(s, b.sensorPos, `bearing ${i} sensorPos`), bearingDeg: b.bearingDeg, sigmaDeg: b.sigmaDeg };
    });
  }
  const fix = fixFromBearings(map, lines);
  if (!fix) {
    const reason = lines.length < 2 ? 'fewer than two bearings' : 'bearings do not cross: same site, or near parallel';
    return { fix: null, reason };
  }
  const out: { fix: ReturnType<typeof fixOut>; cepWithSite?: number | null } = { fix: fixOut(s, fix) };
  if (o.add) {
    const sigma = o.addSigmaDeg ?? 2;
    if (!(sigma > 0)) throw new Error('addSigmaDeg must be positive');
    const site = hexAt(s, o.add, 'add');
    const extra: BearingLine = { sensorPos: site, bearingDeg: bearingDeg(map, site, fix), sigmaDeg: sigma };
    out.cepWithSite = fixFromBearings(map, [...lines, extra])?.cepKm ?? null;
  }
  return out;
}

// When the side's picture says an emitter transmits, and where it will be next time (pattern of life, WP-2.6).
// Only what the picture supports is returned: a part that cannot be worked out is left out.
export function analysePredict(s: MissionState, side: PlayerSide, p: { track: string }) {
  const track = (side === 'blue' ? s.tracks : s.redTracks).find((t) => t.id === p.track);
  if (!track) throw new Error(`no track ${p.track} in your picture`);
  const heard = track.moving
    ? track.bearings.map((b) => b.heardMin).filter((m): m is number => m !== undefined)
    : track.bearings.flatMap((b) => b.samples.map((x) => x.minute));
  const transmissions = [...new Set(heard)].sort((a, b) => a - b);
  const period = reportingPeriod(transmissions);
  // s.minute is the minute about to be played, so the next transmission is after the minute just finished.
  const nextMinute = nextTransmission(transmissions, s.minute - 1);
  const map = s.world.map;
  const kmFixes: KmFix[] = (track.fixes ?? []).map((f) => ({ minute: f.minute, ...hexToKm(map, { q: f.fix.q, r: f.fix.r }) }));
  const mo = motion(kmFixes);
  let predictedAt: Pos | undefined;
  if (mo && nextMinute !== undefined) {
    const at = predict(kmFixes, nextMinute);
    if (at) {
      const r = at.y / ((Math.sqrt(3) / 2) * map.hexSizeKm);
      predictedAt = toPos(hexRound(at.x / map.hexSizeKm - r / 2, r));
    }
  }
  const heardPart = `${transmissions.length} transmission${transmissions.length === 1 ? '' : 's'}${period ? `, period ${period.period} min` : ''}`;
  const parts = kmFixes.length ? [heardPart, `${kmFixes.length} fix${kmFixes.length === 1 ? '' : 'es'}`] : [heardPart];
  return {
    track: track.id,
    transmissions,
    ...(period ? { period: { period: period.period, phase: period.phase, score: period.score } } : {}),
    ...(nextMinute !== undefined ? { nextMinute } : {}),
    ...(mo ? { motion: { speedKmPerMin: mo.speedKmPerMin, headingDeg: mo.headingDeg } } : {}),
    ...(predictedAt ? { predictedAt } : {}),
    basis: parts.join('; '),
  };
}

// Which of the side's own transmitters the enemy can probably hear. The enemy's sensors are hypotheses: the caller's
// list, or a squad at each fix in the side's picture. Nothing reads the enemy's units.
export function analyseExposure(s: MissionState, side: PlayerSide, o: { sensors?: HypothesisParams[] } = {}) {
  const map = s.world.map;
  let sensors: Hypothesis[];
  let source: string;
  if (o.sensors) {
    if (!Array.isArray(o.sensors)) throw new Error('sensors must be an array');
    sensors = o.sensors.map((h, i) => hypothesisOf(s, h, `sensor ${i} at`));
    source = 'stated by the caller';
  } else {
    sensors = [];
    for (const t of side === 'blue' ? s.tracks : s.redTracks) {
      const f = t.fixes?.length ? t.fixes[t.fixes.length - 1].fix : t.fix;
      if (!f) continue;
      const pos = hexRound(f.q, f.r);
      if (map.tiles[hexKey(pos)]) sensors.push({ pos, kind: 'squad' });
    }
    source = 'a squad at each fix in your picture';
  }
  const opts = { pfa: 1e-3, noiseEnv: s.world.noiseEnv, limiter: false, seed: s.seed };
  const transmitters = s.world.units
    .filter((u) => u.side === side && u.radio.powerW > 0)
    .map((u) => ({ u, ems: emissions(u, s.world.nets) }))
    .filter((x) => x.ems.length > 0);
  const units = transmitters.map(({ u, ems }) => {
    let best: { at: Hex; snrDb: number; pd: number } | undefined;
    for (const h of sensors) {
      const sensor = hypothesisUnit(h);
      for (const em of ems) {
        const look = sensorLook(map, u, sensor, em, opts);
        if (!best || look.pd > best.pd) best = { at: h.pos, snrDb: look.snrDb, pd: look.pd };
      }
    }
    return {
      unit: u.id,
      worst: best
        ? {
            sensorAt: toPos(best.at),
            snrDb: best.snrDb,
            pdPerSweep: best.pd,
            pdPerMinute: 1 - (1 - best.pd) ** MISSION_RULES.sweepsPerMinute,
          }
        : null,
      sensors: sensors.length,
    };
  });
  // At VHF ranges most transmitters are heard every minute (pdPerMinute 1), so SNR decides the order among them:
  // it is the margin the enemy has, and what lower power or an antenna would have to remove.
  units.sort((a, b) => (b.worst?.pdPerMinute ?? -1) - (a.worst?.pdPerMinute ?? -1) || (b.worst?.snrDb ?? -Infinity) - (a.worst?.snrDb ?? -Infinity));
  const basis = sensors.length
    ? `${sensors.length} sensor hypothes${sensors.length === 1 ? 'is' : 'es'}, ${source}`
    : `no sensor hypotheses: ${o.sensors ? 'the list is empty' : 'your picture has no fixes'}, so exposure is unknown`;
  return { units, basis };
}
