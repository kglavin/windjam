import { type Hex, hexEquals, hexDistance, hexKey } from './hex';
import { type HexMap, getTile, inBounds } from './map';
import { TERRAIN, type TerrainType, accessLabel, canEnter } from './terrain';
import { type NoiseEnv, hexDistanceKm } from './rf';
import { type LinkBudget, linkBudget } from './budget';
import { type LinkQuality, qualityFromBer } from './ew';
import { type OrderDelivery, orderDelivery } from './timeliness';
import type { JammerConfig, Link, Net, Unit, Waveform } from './units';
import { netLinks } from './units';

// A rectangle of hexes in offset (col, row) coordinates.
export interface GridArea {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
}

export interface World {
  seed: number;
  tick: number;
  map: HexMap;
  home: GridArea; // the operating area the map opens on
  noiseEnv: NoiseEnv; // man-made noise everywhere: rural, or urban (stronger and impulsive)
  esLimiter: Record<'blue' | 'red', boolean>; // ES front-end limiter against impulsive noise
  // Each side's ES detector false-alarm probability per channel look (notes section 2).
  esPfa: Record<'blue' | 'red', number>;
  units: Unit[];
  nets: Net[];
}

// Every change to the world goes through a command. Humans, scripts and AI issue the same ones.
export type Command =
  | { type: 'moveUnit'; unitId: string; to: Hex }
  | { type: 'setJammer'; unitId: string; config: JammerConfig }
  | { type: 'setWaveform'; netId: string; waveform: Waveform }
  | { type: 'setPfa'; side: 'blue' | 'red'; pfa: number }
  | { type: 'setLimiter'; side: 'blue' | 'red'; on: boolean }
  | { type: 'setNoiseEnv'; env: NoiseEnv };

export interface StepResult {
  world: World;
  rejected: { command: Command; reason: string }[];
}

export const unitById = (world: World, id: string): Unit | undefined =>
  world.units.find((u) => u.id === id);

export const unitAt = (world: World, h: Hex): Unit | undefined =>
  world.units.find((u) => hexEquals(u.pos, h));

export const allLinks = (world: World): Link[] => world.nets.flatMap(netLinks);

export const netById = (world: World, id: string): Net | undefined =>
  world.nets.find((n) => n.id === id);

export const jammers = (world: World): Unit[] => world.units.filter((u) => u.jammer);

// Two-hop route through a cross-band relay: member to relay on the retrans net, relay to hub on the main net.
export interface RelayRoute {
  relayId: string;
  retransNetId: string;
  memberHop: LinkBudget;
  hubHop: LinkBudget;
  ber: number;
}

export interface LinkView {
  link: Link;
  budget: LinkBudget; // direct path
  relay?: RelayRoute; // when the net has a relay and this link is hub to a member other than the relay
  route: 'direct' | 'relay'; // relay only when direct is not good and relay is better
  ber: number;
  quality: LinkQuality;
  order: OrderDelivery; // timeliness of one order sent over the route in use
}

// A bit survives two hops only if it survives both.
export const twoHopBer = (p1: number, p2: number): number => 1 - (1 - p1) * (1 - p2);

export function allLinkBudgets(world: World): LinkView[] {
  const jam = { jammers: jammers(world), nets: world.nets, noiseEnv: world.noiseEnv };
  return allLinks(world).map((link) => {
    const net = netById(world, link.netId)!;
    const a = unitById(world, link.aId)!;
    const b = unitById(world, link.bId)!;
    const budget = linkBudget(world.map, net, a, b, jam);
    const direct: LinkView = { link, budget, route: 'direct', ber: budget.ber, quality: budget.quality, order: NO_ORDER };

    const cfg = net.relay;
    if (!cfg || link.aId !== net.hubId || link.bId === cfg.relayId) return withOrder(direct, net);
    const relayUnit = unitById(world, cfg.relayId);
    const retrans = netById(world, cfg.retransNetId);
    if (!relayUnit || !retrans) return withOrder(direct, net);

    const memberHop = linkBudget(world.map, retrans, b, relayUnit, jam);
    const hubHop = linkBudget(world.map, net, a, relayUnit, jam);
    const relay: RelayRoute = {
      relayId: cfg.relayId,
      retransNetId: cfg.retransNetId,
      memberHop,
      hubHop,
      ber: twoHopBer(memberHop.ber, hubHop.ber),
    };
    // Prefer direct while it is good: one hop means less delay and one less point to jam.
    const useRelay = budget.quality !== 'good' && relay.ber < budget.ber;
    return useRelay
      ? withOrder({ ...direct, relay, route: 'relay', ber: relay.ber, quality: qualityFromBer(relay.ber) }, net)
      : withOrder({ ...direct, relay }, net);
  });
}

// The budgets a link's traffic actually crosses on its chosen route.
export const activeHops = (v: LinkView): LinkBudget[] =>
  v.route === 'relay' && v.relay ? [v.relay.memberHop, v.relay.hubHop] : [v.budget];

function validateSetJammer(world: World, unitId: string, config: JammerConfig): string | null {
  const unit = unitById(world, unitId);
  if (!unit) return `No unit ${unitId}`;
  if (!unit.jammer) return `${unit.name} has no jammer`;
  if ((config.mode === 'spot' || config.mode === 'follower') && !(config.targetNetId && netById(world, config.targetNetId)))
    return `${config.mode === 'spot' ? 'Spot' : 'Follower'} jamming needs a target net`;
  if (config.reactionUs !== undefined && !(config.reactionUs >= 0)) return 'Reaction time must be 0 or more';
  return null;
}

function validateSetWaveform(world: World, netId: string, waveform: Waveform): string | null {
  if (!netById(world, netId)) return `No net ${netId}`;
  if (waveform.kind === 'fh' && !(waveform.hopsPerSec > 0)) return 'Hop rate must be above 0';
  return null;
}

function validateMove(world: World, unitId: string, to: Hex): string | null {
  const unit = unitById(world, unitId);
  if (!unit) return `No unit ${unitId}`;
  if (!inBounds(world.map, to)) return 'Destination is off the map';
  const tile = getTile(world.map, to);
  if (!tile) return 'No tile there';
  if (!canEnter(tile.terrain, unit.kind)) return `${unit.name} cannot enter ${TERRAIN[tile.terrain].label.toLowerCase()} (${accessLabel(tile.terrain)})`;
  const occupant = unitAt(world, to);
  if (occupant && occupant.id !== unitId) return `Hex occupied by ${occupant.name}`;
  if (unit.parentId && unit.controlRangeKm !== undefined) {
    const parent = unitById(world, unit.parentId);
    const km = parent ? hexDistanceKm(world.map, parent.pos, to) : Infinity;
    if (km > unit.controlRangeKm)
      return `${unit.name} must stay within ${unit.controlRangeKm} km of ${parent?.name ?? 'its controller'} (that hex is ${km.toFixed(1)} km)`;
  }
  return null;
}

function validate(world: World, command: Command): string | null {
  switch (command.type) {
    case 'moveUnit':
      return validateMove(world, command.unitId, command.to);
    case 'setJammer':
      return validateSetJammer(world, command.unitId, command.config);
    case 'setWaveform':
      return validateSetWaveform(world, command.netId, command.waveform);
    case 'setPfa':
      return command.pfa > 0 && command.pfa < 1 ? null : 'False-alarm probability must be between 0 and 1';
    case 'setLimiter':
    case 'setNoiseEnv':
      return null;
  }
}

function apply(world: World, command: Command): World {
  switch (command.type) {
    case 'moveUnit':
      return { ...world, units: world.units.map((u) => (u.id === command.unitId ? { ...u, pos: command.to } : u)) };
    case 'setJammer':
      return { ...world, units: world.units.map((u) => (u.id === command.unitId ? { ...u, jammer: { ...command.config } } : u)) };
    case 'setWaveform':
      return { ...world, nets: world.nets.map((n) => (n.id === command.netId ? { ...n, waveform: { ...command.waveform } } : n)) };
    case 'setPfa':
      return { ...world, esPfa: { ...world.esPfa, [command.side]: command.pfa } };
    case 'setLimiter':
      return { ...world, esLimiter: { ...world.esLimiter, [command.side]: command.on } };
    case 'setNoiseEnv':
      return { ...world, noiseEnv: command.env };
  }
}

// Pure: returns a new world, never mutates the input.
export function step(world: World, commands: Command[]): StepResult {
  let current = world;
  const rejected: StepResult['rejected'] = [];
  for (const command of commands) {
    const reason = validate(current, command);
    if (reason) rejected.push({ command, reason });
    else current = apply(current, command);
  }
  return { world: { ...current, tick: world.tick + 1 }, rejected };
}

// Nearest free hex to `target` whose terrain passes `allowed`.
export function nearestFreeHex(map: HexMap, occupied: Set<string>, target: Hex, allowed: (t: TerrainType) => boolean, maxRadius = 6): Hex {
  const candidates = Object.values(map.tiles)
    .filter((t) => allowed(t.terrain) && !occupied.has(hexKey(t.hex)))
    .map((t) => ({ hex: t.hex, d: hexDistance(t.hex, target) }))
    .filter((c) => c.d <= maxRadius)
    .sort((x, y) => x.d - y.d);
  if (candidates.length === 0) throw new Error(`No free hex near ${hexKey(target)}`);
  return candidates[0].hex;
}

// Highest free hex within `radius` of `target` whose terrain passes `allowed`. Used to site relays on high ground.
export function highestFreeHex(map: HexMap, occupied: Set<string>, target: Hex, allowed: (t: TerrainType) => boolean, radius = 3): Hex {
  const candidates = Object.values(map.tiles)
    .filter((t) => allowed(t.terrain) && !occupied.has(hexKey(t.hex)))
    .filter((t) => hexDistance(t.hex, target) <= radius)
    .sort((x, y) => y.elevationM - x.elevationM);
  if (candidates.length === 0) return nearestFreeHex(map, occupied, target, allowed);
  return candidates[0].hex;
}

// Placeholder until the route is known; withOrder fills it in.
const NO_ORDER: OrderDelivery = { hops: [], deliveryProbability: 1, latencyS: 0, status: 'on time' };

function withOrder(v: LinkView, net: Net): LinkView {
  return { ...v, order: orderDelivery(activeHops(v), net) };
}
