import { type Hex, hexDistance, hexKey, offsetToAxial } from './hex';
import { type HexMap, generateMap, getTile, inBounds } from './map';
import { TERRAIN, type TerrainType, canEnter } from './terrain';
import { RADIO_PRESETS, type Net, type Side, type Unit, type UnitKind } from './units';
import { type GridArea, type World, highestFreeHex, nearestFreeHex } from './world';
import { linkBudget } from './budget';
import { orderDelivery } from './timeliness';

interface UnitSpec {
  id: string;
  name: string;
  side: Side;
  kind: UnitKind;
  // Position on a 1 km reference grid (32 x 20), scaled to the real hex size.
  col: number;
  row: number;
  highGround?: boolean;
  parentId?: string; // drones: the unit flying them
  controlRangeKm?: number;
  drone?: { speedKmh: number; enduranceMin: number };
}

// Squad-launched quadcopter: hand-launched, about 40 km/h, half an hour aloft.
export const SQUAD_QUAD = { speedKmh: 40, enduranceMin: 30 } as const;

// Blue holds the west, Red the east, civilian emitters sit between them.
const UNIT_SPECS: UnitSpec[] = [
  { id: 'b-hq', name: 'Blue HQ', side: 'blue', kind: 'hq', col: 3, row: 10 },
  { id: 'b-relay', name: 'Blue Relay', side: 'blue', kind: 'relay', col: 6, row: 10, highGround: true },
  { id: 'b-sq1', name: 'Blue Squad 1', side: 'blue', kind: 'squad', col: 9, row: 4 },
  { id: 'b-sq2', name: 'Blue Squad 2', side: 'blue', kind: 'squad', col: 10, row: 10 },
  { id: 'b-sq3', name: 'Blue Squad 3', side: 'blue', kind: 'squad', col: 9, row: 16 },
  { id: 'b-uav', name: 'Blue UAV', side: 'blue', kind: 'drone', col: 12, row: 9, parentId: 'b-sq2', controlRangeKm: 5, drone: SQUAD_QUAD },
  { id: 'b-ew', name: 'Blue EW Team', side: 'blue', kind: 'jammer', col: 13, row: 9, highGround: true },
  { id: 'r-hq', name: 'Red HQ', side: 'red', kind: 'hq', col: 28, row: 10 },
  { id: 'r-relay', name: 'Red Relay', side: 'red', kind: 'relay', col: 25, row: 12, highGround: true },
  { id: 'r-ew', name: 'Red EW Team', side: 'red', kind: 'jammer', col: 19, row: 12, highGround: true },
  { id: 'r-sq1', name: 'Red Squad 1', side: 'red', kind: 'squad', col: 22, row: 4 },
  { id: 'r-sq2', name: 'Red Squad 2', side: 'red', kind: 'squad', col: 21, row: 10 },
  { id: 'r-sq3', name: 'Red Squad 3', side: 'red', kind: 'squad', col: 22, row: 16 },
  { id: 'n-cell', name: 'Cell Tower', side: 'neutral', kind: 'civil', col: 16, row: 3 },
  { id: 'n-fm', name: 'FM Broadcast', side: 'neutral', kind: 'civil', col: 15, row: 17 },
];

const NETS: Net[] = [
  {
    id: 'blue-cmd',
    name: 'Blue Command Net',
    side: 'blue',
    topology: 'hub',
    hubId: 'b-hq',
    relay: { relayId: 'b-relay', retransNetId: 'blue-retrans' },
    memberIds: ['b-hq', 'b-relay', 'b-sq1', 'b-sq2', 'b-sq3'],
    freqMHz: 60,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  },
  {
    // The relay's second radio. Squads use it to reach the relay; the relay forwards on 60 MHz to HQ.
    id: 'blue-retrans',
    name: 'Blue Retrans',
    side: 'blue',
    topology: 'retrans',
    memberIds: ['b-relay', 'b-sq1', 'b-sq2', 'b-sq3'],
    freqMHz: 70,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  },
  {
    id: 'red-cmd',
    name: 'Red Command Net',
    side: 'red',
    topology: 'hub',
    hubId: 'r-hq',
    relay: { relayId: 'r-relay', retransNetId: 'red-retrans' },
    memberIds: ['r-hq', 'r-relay', 'r-sq1', 'r-sq2', 'r-sq3'],
    freqMHz: 45,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    // Slow hopping (about 160 bits per hop): spot jamming barely touches it, a follower can.
    waveform: { kind: 'fh', hopsPerSec: 100 },
  },
  {
    id: 'red-retrans',
    name: 'Red Retrans',
    side: 'red',
    topology: 'retrans',
    memberIds: ['r-relay', 'r-sq1', 'r-sq2', 'r-sq3'],
    freqMHz: 48,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  },
  {
    id: 'red-squad',
    name: 'Red Squad Net',
    side: 'red',
    topology: 'mesh',
    memberIds: ['r-sq1', 'r-sq2', 'r-sq3'],
    freqMHz: 52,
    bandwidthKHz: 25,
    dataRateKbps: 16,
    waveform: { kind: 'fixed' },
  },
];

// The operating area is 32 km wide and about 17 km deep, cut into 500 m hexes. It sits in the middle of a
// world 4 x 4 times larger (128 x 69 km) that units can move out into.
export const HEX_SIZE_KM = 0.5;
const SCALE = 1 / HEX_SIZE_KM; // hexes per km
const AREA = { cols: 32 * SCALE, rows: 20 * SCALE };
const WORLD_FACTOR = 4;
const COLS = AREA.cols * WORLD_FACTOR;
const ROWS = AREA.rows * WORLD_FACTOR;
// Even row offset keeps the odd-row shove of the reference grid.
const HOME: GridArea = { col0: (COLS - AREA.cols) / 2, row0: (ROWS - AREA.rows) / 2, cols: AREA.cols, rows: AREA.rows };

// Starting positions avoid mountains so the player discovers mountaintop sites themselves.
const openGround = (t: TerrainType) => TERRAIN[t].access === 'all';

export function createScenario(seed: number): World {
  const map = generateMap(seed, COLS, ROWS, HEX_SIZE_KM);
  const occupied = new Set<string>();
  const units: Unit[] = UNIT_SPECS.map((spec) => {
    const target: Hex = offsetToAxial(HOME.col0 + Math.round(spec.col * SCALE), HOME.row0 + Math.round(spec.row * SCALE));
    const pos = spec.highGround
      ? highestFreeHex(map, occupied, target, openGround, Math.round(3 * SCALE))
      : nearestFreeHex(map, occupied, target, openGround, Math.round(6 * SCALE));
    occupied.add(hexKey(pos));
    const unit: Unit = { id: spec.id, name: spec.name, side: spec.side, kind: spec.kind, pos, radio: { ...RADIO_PRESETS[spec.kind] } };
    if (spec.kind === 'jammer') unit.jammer = { mode: 'off' };
    if (spec.parentId) {
      unit.parentId = spec.parentId;
      unit.controlRangeKm = spec.controlRangeKm;
      unit.drone = spec.drone;
    }
    return unit;
  });
  const world: World = {
    seed,
    tick: 0,
    map,
    home: HOME,
    noiseEnv: 'rural',
    esPfa: { blue: 1e-3, red: 1e-3 },
    esLimiter: { blue: false, red: false },
    units,
    nets: NETS.map((n) => ({ ...n, memberIds: [...n.memberIds] })),
  };
  return ensureLinks(world);
}

// Is this member's route to its hub (direct, or through the net's relay) usable from where it stands?
function linkedToHub(world: World, net: Net, unit: Unit): boolean {
  const hub = world.units.find((u) => u.id === net.hubId);
  if (!hub) return true;
  // The same test the mission uses for "link to HQ": an order would get through (delivery probability over a half).
  const jam = { jammers: [], nets: world.nets, noiseEnv: world.noiseEnv };
  const direct = linkBudget(world.map, net, hub, unit, jam);
  if (orderDelivery([direct], net).status !== 'lost') return true;
  const relayUnit = net.relay && world.units.find((u) => u.id === net.relay!.relayId);
  const retrans = net.relay && world.nets.find((n) => n.id === net.relay!.retransNetId);
  if (!relayUnit || !retrans || relayUnit.id === unit.id) return false;
  const memberHop = linkBudget(world.map, retrans, unit, relayUnit, jam);
  const hubHop = linkBudget(world.map, net, hub, relayUnit, jam);
  return orderDelivery([memberHop, hubHop], net).status !== 'lost';
}

// Every unit starts able to reach its HQ. Terrain varies with the seed, so a squad or relay that lands behind a
// ridge is nudged to the nearest hex it can stand on that has a working link. Relays go first, since squads
// may depend on them. A drone follows its squad so it stays inside control range.
function ensureLinks(world: World): World {
  const w: World = { ...world, units: world.units.map((u) => ({ ...u })) };
  const byKind = (k: UnitKind) => w.units.filter((u) => u.kind === k);
  for (const unit of [...byKind('relay'), ...byKind('squad')]) {
    const net = w.nets.find((n) => n.topology === 'hub' && n.side === unit.side && n.memberIds.includes(unit.id));
    if (!net || unit.id === net.hubId || linkedToHub(w, net, unit)) continue;
    const occupied = new Set(w.units.filter((u) => u.id !== unit.id).map((u) => hexKey(u.pos)));
    const allowed = (t: TerrainType) => canEnter(t, unit.kind) && (unit.kind === 'relay' || openGround(t));
    const from = unit.pos;
    let best: Hex | undefined;
    for (let radius = 1; radius <= 12 && !best; radius++) {
      const ring = ringHexes(w.map, from, radius).filter((h) => !occupied.has(hexKey(h)) && allowed(getTile(w.map, h)!.terrain));
      // Relays prefer height within the ring; squads the nearest hex, as listed.
      if (unit.kind === 'relay') ring.sort((a, b) => getTile(w.map, b)!.elevationM - getTile(w.map, a)!.elevationM);
      for (const h of ring) {
        unit.pos = h;
        if (linkedToHub(w, net, unit)) {
          best = h;
          break;
        }
      }
      if (!best) unit.pos = from;
    }
    if (!best) continue;
    for (const drone of w.units.filter((u) => u.parentId === unit.id && u.controlRangeKm !== undefined)) {
      const taken = new Set(w.units.filter((u) => u.id !== drone.id).map((u) => hexKey(u.pos)));
      drone.pos = nearestFreeHex(w.map, taken, best, () => true, 4);
    }
  }
  return w;
}

function ringHexes(map: HexMap, centre: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      const h = { q: centre.q + dq, r: centre.r + dr };
      if (hexDistance(centre, h) === radius && inBounds(map, h) && getTile(map, h)) out.push(h);
    }
  }
  return out;
}

// A point on the 1 km reference grid (32 x 20 over the home area), as a hex. Missions use it to lay out routes.
export function refToHex(col: number, row: number): Hex {
  return offsetToAxial(HOME.col0 + Math.round(col * SCALE), HOME.row0 + Math.round(row * SCALE));
}
