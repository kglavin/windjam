// Scenario definitions (docs/design-scenarios.md): forces, rules, seed, consoles and chatter. A scenario is played
// by the script in missions/ that names it with a `scenario <id>` directive.
import { type Forces, NETS, SQUAD_QUAD, UNIT_SPECS, type UnitSpec } from '../scenario';
import type { Net, Side, UnitKind, Waveform } from '../units';
import type { MissionKind, PlayerSide } from './types';

export interface Scenario {
  id: string;
  title: string;
  blurb: string; // what the scenario is
  watch: string; // what to look for in the inspector
  mission: MissionKind;
  seed: number;
  forces?: Forces; // absent: the standard forces
  humans?: PlayerSide[]; // consoles; absent: the mission's default
  emcon?: Record<string, number>; // chatter duty per net at the start
  playToEnd?: boolean; // no early win: every scripted step happens before the result is read
}

// The standard forces cut down to the units named (nets keep the members that remain).
export function standardSubset(ids: string[]): Forces {
  const keep = new Set([...ids, 'n-cell', 'n-fm']);
  return {
    units: UNIT_SPECS.filter((u) => keep.has(u.id)),
    nets: NETS.map((n) => ({
      ...n,
      memberIds: n.memberIds.filter((id) => keep.has(id)),
      relay: n.relay && keep.has(n.relay.relayId) ? n.relay : undefined,
    })).filter((n) => n.memberIds.length >= 1 && (!n.hubId || keep.has(n.hubId))),
  };
}

const unit = (id: string, name: string, side: Side, kind: UnitKind, col: number, row: number, extra: Partial<UnitSpec> = {}): UnitSpec => ({ id, name, side, kind, col, row, ...extra });
const net = (id: string, name: string, side: Side, hubId: string | undefined, memberIds: string[], freqMHz: number, waveform: Waveform = { kind: 'fixed' }): Net => ({
  id,
  name,
  side,
  topology: hubId ? 'hub' : 'mesh',
  hubId,
  memberIds,
  freqMHz,
  bandwidthKHz: 25,
  dataRateKbps: 16,
  waveform,
});

const BLUE_STD = ['b-hq', 'b-relay', 'b-sq1', 'b-sq2', 'b-sq3', 'b-uav', 'b-ew'];
const blueOf = (ids: string[]) => standardSubset(ids).units.filter((u) => u.side !== 'red');
const blueNetsOf = (ids: string[]) => standardSubset(ids).nets.filter((n) => n.side === 'blue');

// A fox hunt: Blue HQ and one hunter on foot; the foxes given.
const foxForces = (foxes: { id: string; name: string; col: number; row: number; freqMHz: number }[]): Forces => ({
  units: [
    unit('b-hq', 'Blue HQ', 'blue', 'hq', 3, 10),
    unit('b-sq1', 'Hunter', 'blue', 'squad', 9, 10),
    ...foxes.map((f) => unit(f.id, f.name, 'red', 'squad', f.col, f.row)),
  ],
  nets: [net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-sq1'], 60), ...foxes.map((f) => net(`red-${f.id.slice(2)}`, `${f.name} Radio`, 'red', undefined, [f.id], f.freqMHz))],
});

// An air-defence net: a fire control node, radar sites on high ground reporting to it, launchers it orders.
const iadsForces = (decoy = false): Forces => ({
  units: [
    ...blueOf(BLUE_STD),
    unit('r-fc', 'Red Fire Control', 'red', 'hq', 27, 10),
    unit('r-radar1', 'Red Radar 1', 'red', 'relay', 22, 5, { highGround: true }),
    unit('r-radar2', 'Red Radar 2', 'red', 'relay', 21, 10, { highGround: true }),
    unit('r-radar3', 'Red Radar 3', 'red', 'relay', 22, 15, { highGround: true }),
    unit('r-l1', 'Red Launcher 1', 'red', 'squad', 25, 7),
    unit('r-l2', 'Red Launcher 2', 'red', 'squad', 25, 13),
    unit('r-l3', 'Red Launcher 3', 'red', 'squad', 29, 6),
    unit('r-l4', 'Red Launcher 4', 'red', 'squad', 29, 14),
    ...(decoy ? [unit('r-ew', 'Red EW Team', 'red', 'jammer', 18, 12, { highGround: true })] : []),
  ],
  nets: [
    ...blueNetsOf(BLUE_STD),
    net('red-track', 'Red Track Net', 'red', 'r-fc', ['r-fc', 'r-radar1', 'r-radar2', 'r-radar3'], 47),
    net('red-fire', 'Red Fire Net', 'red', 'r-fc', ['r-fc', 'r-l1', 'r-l2', 'r-l3', 'r-l4'], 49),
  ],
});

export const SCENARIOS: Scenario[] = [
  {
    id: 's01',
    title: 'Crossing angle',
    blurb: 'Two squads close together fix a transmitter, then a third far to the north joins.',
    watch: 'Fix tab: the same emitter from a 15° crossing and from a 60° one; the ellipse is long along the lines.',
    mission: 'find',
    seed: 1234,
    forces: {
      units: [unit('b-hq', 'Blue HQ', 'blue', 'hq', 3, 10), unit('b-sq1', 'Blue Squad 1', 'blue', 'squad', 10, 9), unit('b-sq2', 'Blue Squad 2', 'blue', 'squad', 10, 11), unit('b-sq3', 'Blue Squad 3', 'blue', 'squad', 16, 4), unit('r-hq', 'Red HQ', 'red', 'hq', 26, 10)],
      nets: [net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-sq1', 'b-sq2', 'b-sq3'], 60), net('red-cmd', 'Red Command Net', 'red', 'r-hq', ['r-hq'], 45)],
    },
    emcon: { 'red-cmd': 0.6 },
  },
  {
    id: 's02',
    title: 'The weak bearing',
    blurb: 'A near squad, a far squad and the UAV take bearings on a 5 W transmitter.',
    watch: 'Fix tab, bearing origin: σ from SNR; the weak bearing barely tightens the ellipse.',
    mission: 'find',
    seed: 1234,
    humans: ['blue', 'red'],
    forces: {
      units: [unit('b-hq', 'Blue HQ', 'blue', 'hq', 3, 10), unit('b-sq1', 'Blue Squad 1', 'blue', 'squad', 14, 6), unit('b-sq2', 'Blue Squad 2', 'blue', 'squad', 6, 14), unit('b-uav', 'Blue UAV', 'blue', 'drone', 15, 6, { parentId: 'b-sq1', controlRangeKm: 5, drone: SQUAD_QUAD }), unit('r-hq', 'Red HQ', 'red', 'hq', 24, 7)],
      nets: [net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-sq1', 'b-sq2'], 60), net('red-cmd', 'Red Command Net', 'red', 'r-hq', ['r-hq'], 45)],
    },
    emcon: { 'red-cmd': 0.6 },
  },
  {
    id: 's03',
    title: 'The long link',
    blurb: 'Two squads 30 km forward at 1 W report over a long link, until Red jams the command net at T+15.',
    watch: 'Link tab on HQ to Squad 1: the budget at 1 W, then J/S and the relay route once the jammer is on; Minute tab: reports held.',
    mission: 'duel',
    seed: 1234,
    forces: {
      units: [unit('b-hq', 'Blue HQ', 'blue', 'hq', -12, 10), unit('b-relay', 'Blue Relay', 'blue', 'relay', 13, 10, { highGround: true }), unit('b-sq1', 'Blue Squad 1', 'blue', 'squad', 20, 7), unit('b-sq2', 'Blue Squad 2', 'blue', 'squad', 20, 13), unit('r-hq', 'Red HQ', 'red', 'hq', 28, 10), unit('r-ew', 'Red EW Team', 'red', 'jammer', 20, 10, { highGround: true })],
      nets: [
        { ...net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-relay', 'b-sq1', 'b-sq2'], 60), relay: { relayId: 'b-relay', retransNetId: 'blue-retrans' } },
        { ...net('blue-retrans', 'Blue Retrans', 'blue', undefined, ['b-relay', 'b-sq1', 'b-sq2'], 70), topology: 'retrans' },
        net('red-cmd', 'Red Command Net', 'red', 'r-hq', ['r-hq', 'r-ew'], 45),
      ],
    },
  },
  { id: 's04', playToEnd: true, title: 'Power discipline', blurb: 'Red steps its HQ down: 10 W, antenna toward the relay, DSSS. Blue hunts throughout.', watch: 'Link tab: each order above the budget it changed; Fix tab: the CEP on Red HQ stops improving after each step.', mission: 'duel', seed: 1234 },
  { id: 's05', playToEnd: true, title: 'The decoy', blurb: 'Red EW runs a decoy with the command net\'s signature while Blue hunts.', watch: 'Fix tab: a tight fix that is actually 12 km off; Minute tab: the emits say decoy.', mission: 'duel', seed: 1234 },
  {
    id: 's06',
    playToEnd: true,
    title: 'Waveform race',
    blurb: 'Red\'s command net goes fixed, then slow hopping, then DSSS while three squads listen.',
    watch: 'Minute tab: captures thin out, then stop; Link tab: the processing gain line on Red\'s own budget.',
    mission: 'duel',
    seed: 1234,
    forces: standardSubset(['b-hq', 'b-relay', 'b-sq1', 'b-sq2', 'b-sq3', 'r-hq', 'r-relay', 'r-sq1', 'r-sq2']),
  },
  { id: 's07', playToEnd: true, title: 'Jammer against the clock', blurb: 'Blue EW cycles spot, barrage and pulse against Red\'s command net while Red passes orders.', watch: 'Link tab: J/S, the clear/jammed/lost split and the order verdict per mode; the orders list shows each mode change.', mission: 'duel', seed: 1234 },
  {
    id: 's08',
    title: 'Sortie geometry',
    blurb: 'The UAV flies a two-leg silent sortie and brings both legs\' bearings back at once.',
    watch: 'Fix tab, a moving sensor: the two legs cross from one platform.',
    mission: 'find',
    seed: 1234,
    forces: {
      units: [unit('b-hq', 'Blue HQ', 'blue', 'hq', 3, 10), unit('b-sq2', 'Blue Squad 2', 'blue', 'squad', 10, 10), unit('b-uav', 'Blue UAV', 'blue', 'drone', 12, 9, { parentId: 'b-sq2', controlRangeKm: 5, drone: SQUAD_QUAD }), unit('r-hq', 'Red HQ', 'red', 'hq', 27, 10)],
      nets: [net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-sq2'], 60), net('red-cmd', 'Red Command Net', 'red', 'r-hq', ['r-hq'], 45)],
    },
    emcon: { 'red-cmd': 0.6 },
  },
  {
    id: 's09',
    playToEnd: true,
    title: 'Find the hub',
    blurb: 'Nine Red radios chatter; Blue goes for the one that sends most.',
    watch: 'Minute tab: nine emitters a minute; Fix tab per track: the hub tightens first.',
    mission: 'find',
    seed: 1234,
    forces: {
      units: [
        unit('b-hq', 'Blue HQ', 'blue', 'hq', 3, 10), unit('b-sq1', 'Blue Squad 1', 'blue', 'squad', 10, 5), unit('b-sq3', 'Blue Squad 3', 'blue', 'squad', 10, 15), unit('b-uav', 'Blue UAV', 'blue', 'drone', 12, 6, { parentId: 'b-sq1', controlRangeKm: 5, drone: SQUAD_QUAD }),
        unit('r-hq', 'Red HQ', 'red', 'hq', 27, 10), unit('r-relay', 'Red Relay 1', 'red', 'relay', 24, 7, { highGround: true }), unit('r-relay2', 'Red Relay 2', 'red', 'relay', 24, 13, { highGround: true }),
        unit('r-sq1', 'Red Squad 1', 'red', 'squad', 21, 3), unit('r-sq2', 'Red Squad 2', 'red', 'squad', 20, 7), unit('r-sq3', 'Red Squad 3', 'red', 'squad', 21, 10), unit('r-sq4', 'Red Squad 4', 'red', 'squad', 20, 13), unit('r-sq5', 'Red Squad 5', 'red', 'squad', 21, 17), unit('r-sq6', 'Red Squad 6', 'red', 'squad', 23, 10),
      ],
      nets: [
        net('blue-cmd', 'Blue Command Net', 'blue', 'b-hq', ['b-hq', 'b-sq1', 'b-sq3'], 60),
        net('red-cmd', 'Red Command Net', 'red', 'r-hq', ['r-hq', 'r-relay', 'r-relay2', 'r-sq1', 'r-sq2', 'r-sq3', 'r-sq4', 'r-sq5', 'r-sq6'], 45),
        net('red-squad', 'Red Squad Net', 'red', undefined, ['r-sq1', 'r-sq2', 'r-sq3', 'r-sq4', 'r-sq5', 'r-sq6'], 52),
      ],
    },
  },
  { id: 's10', playToEnd: true, title: 'The HQ that moves', blurb: 'Red HQ relocates every 15 minutes and keeps chattering.', watch: 'Fix tab: bearings from before and after a move disagree; the ellipse grows and the true miss shows the lag.', mission: 'duel', seed: 1234 },
  { id: 's11', title: 'Plain fox hunt', blurb: 'One hunter on foot against a transmitter that talks most of the time.', watch: 'Fix tab: bearings from successive places on one platform; the ellipse shrinks as the baseline opens.', mission: 'fox', seed: 1234, humans: ['blue', 'red'], forces: foxForces([{ id: 'r-fox', name: 'Fox', col: 20, row: 9, freqMHz: 50 }]), emcon: { 'red-fox': 0.9 } },
  { id: 's12', title: 'The shy fox', blurb: 'The fox transmits one minute in five; the hunter must listen longer at each stop.', watch: 'Minute tab: empty minutes; bearing origin: σ from one capture against several.', mission: 'fox', seed: 1234, humans: ['blue', 'red'], forces: foxForces([{ id: 'r-fox', name: 'Fox', col: 20, row: 9, freqMHz: 50 }]), emcon: { 'red-fox': 0.2 } },
  { id: 's13', title: 'The moving fox', blurb: 'The fox walks a kilometre between transmissions.', watch: 'Fix tab: old bearings pull the fix behind the fox; the ellipse grows and the true miss shows the lag.', mission: 'fox', seed: 1234, humans: ['blue', 'red'], forces: foxForces([{ id: 'r-fox', name: 'Fox', col: 20, row: 9, freqMHz: 50 }]), emcon: { 'red-fox': 0.9 } },
  { id: 's14', title: 'Two foxes', blurb: 'Two transmitters on nearby frequencies; the hunter closes on the nearer.', watch: 'Minute tab: two emitters; Fix tab per track, and why the nearer tightens faster.', mission: 'fox', seed: 1234, humans: ['blue', 'red'], forces: foxForces([{ id: 'r-fox1', name: 'Fox 1', col: 19, row: 6, freqMHz: 50 }, { id: 'r-fox2', name: 'Fox 2', col: 21, row: 13, freqMHz: 53 }]), emcon: { 'red-fox1': 0.9, 'red-fox2': 0.9 } },
  { id: 's15', playToEnd: true, title: 'Map the net', blurb: 'Red runs its engagement cycle; Blue listens and fixes the nodes.', watch: 'Minute tab: the reporting rhythm every 5 minutes, the fire control node sending most; Fix tab on each node.', mission: 'iads', seed: 1234, forces: iadsForces() },
  { id: 's16', playToEnd: true, title: 'Cut the reports', blurb: 'Blue jams the track-report net once the fire control node is fixed; Red raises radar power.', watch: 'Link tab: report links late then lost; Red\'s power order beside its effect; Minute tab: engagements missed.', mission: 'iads', seed: 1234, forces: iadsForces() },
  { id: 's17', playToEnd: true, title: 'Cut the orders', blurb: 'Blue jams the fire-order net; Red moves a launcher to high ground.', watch: 'Link tab: the path losses that decide which launcher the jammer reaches; the order verdict per launcher.', mission: 'iads', seed: 1234, forces: iadsForces() },
  { id: 's18', playToEnd: true, title: 'Decoy radar', blurb: 'A Red decoy emits the track net\'s signature 6 km from the real node; Blue fixes it first, then jams the net.', watch: 'Fix tab: the tightest 47 MHz track is the EW team transmitting a decoy; Link tab: a report leg under jamming.', mission: 'iads', seed: 1234, forces: iadsForces(true) },
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
