import type { Fix } from '../detect';
import type { Hex } from '../hex';
import type { JammerMode, Side, Unit, Waveform } from '../units';
import type { OrderStatus } from '../timeliness';
import type { World } from '../world';
import type { ComputerSide } from './computer';
import type { Level, OrbatNode, Profile } from './orbat';
import type { Assessment, Sector } from './deception';

export type PlayerSide = 'blue' | 'red';
// duel: both sides human, hide-mission rules. uav: both sides human; Red flies a UAV that must report, Blue tracks it.
// hunt: both sides human; each has an HQ and a UAV, and each UAV hunts the other by its reports.
// fox: a hunter closes on a transmitter on foot. iads: Red runs an air-defence engagement cycle over its nets, Blue
// denies it (docs/design-scenarios.md).
// deception: three days of a division's radio traffic, real and notional, against a few intercept sites (docs/design-deception.md).
export type MissionKind = 'find' | 'hide' | 'duel' | 'uav' | 'hunt' | 'fox' | 'iads' | 'deception';

// One leg of a drone sortie: fly to a point, then listen there (minutes 0 = transit only).
export interface SortieLeg {
  to: Hex;
  centreDeg?: number;
  minutes: number;
}

// Orders a unit can be given from the console. Minutes are mission minutes.
export type MissionCommand =
  | { type: 'df'; unitId: string; centreDeg: number; minutes: number }
  // Deception: an intercept site watches a band, tunes one frequency, or sweeps the whole band, for `minutes` ticks (hours).
  | { type: 'watch'; unitId: string; mode: 'band' | 'freq' | 'sweep'; loMHz: number; hiMHz: number; minutes: number }
  | { type: 'intercepts'; hour?: number } // the intercept log for an hour (the last by default)
  // Deception: the collector's assessment (docs/design-deception.md section 5), the latest line per net, sector or objective stands.
  | { type: 'assess'; what: 'net'; freqMHz: number; level: Level; col: number; row: number; underMHz?: number }
  | { type: 'assess'; what: 'strength'; sector: string; radios: number }
  | { type: 'assess'; what: 'objective'; sector: string; at: number }
  | { type: 'assessment' } // show the assessment and, after the game, its score
  | { type: 'move'; unitId: string; to: Hex }
  | { type: 'sortie'; unitId: string; legs: SortieLeg[] } // drone: fly the plan silent, DF on each leg, hand everything over on return
  | { type: 'stop'; unitId: string }
  | { type: 'wait'; minutes: number }
  | { type: 'status' }
  | { type: 'picture' }
  | { type: 'help' }
  | { type: 'reveal' } // show the truth and open the replay at T+0 (ends a running mission)
  | { type: 'replay'; move: 'next' | 'step' | 'back' | 'exit' }
  // Mission 2 (Red): electronic protection and the orders Red must pass.
  | { type: 'send' }
  | { type: 'order'; toId: string; text: string } // send <unit>: <text>: free text carried to a unit over the net, either side
  | { type: 'emcon'; netId: string; duty: number } // 0..0.2
  | { type: 'power'; unitId: string; watts: number }
  | { type: 'waveform'; netId: string; waveform: Waveform }
  | { type: 'antenna'; unitId: string; towardId?: string } // undefined = omni
  | { type: 'decoy'; unitId: string; netId?: string } // undefined = off
  | { type: 'jam'; unitId: string; netId?: string; mode?: JammerMode } // undefined = off; mode spot by default
  // Mission 4 (Red): the reconnaissance UAV.
  | { type: 'uav'; unitId: string; action: 'launch' | 'burst' | 'hold' | 'resume' | 'route'; legs?: Hex[] }; // route: replace the waypoints

// What a DF task has heard so far from one emitter. Weighted so that averaged error is 1/sqrt(weight).
export interface DfAccumulator {
  emitterId: string;
  signature: string; // what the listener would call it, e.g. "45 MHz hopper"
  trueBearingDeg: number;
  sumSin: number; // weighted circular sum of the measured bearings, weight n / sigma² as above
  sumCos: number;
  weight: number; // sum of n / sigma² over every minute it was heard
  measurements: number;
  samples: { minute: number; what: string }[]; // what was heard each minute: chatter, order n, decoy, DF report...
  heardMin?: number; // moving emitters: the single minute this bearing belongs to (one accumulator per minute)
  emitterPos?: Hex; // moving emitters: where it was that minute (truth, for scoring only)
  sensorPos?: Hex; // moving sensors: where the sensor was that minute
}

export type Order =
  | { kind: 'df'; centreDeg: number; startMin: number; endMin: number; heard: Record<string, DfAccumulator> }
  | { kind: 'watch'; mode: 'band' | 'freq' | 'sweep'; loMHz: number; hiMHz: number; startMin: number; endMin: number; heard: Record<string, DfAccumulator> }
  | { kind: 'move'; path: Hex[]; minutesPerHex: number; progress: number }
  | {
      kind: 'sortie';
      legs: SortieLeg[];
      legIndex: number; // leg being flown or listened on; legs.length means heading home
      phase: 'out' | 'df' | 'back';
      path: Hex[]; // remaining hexes in the current flight leg
      minutesPerHex: number;
      progress: number;
      dfEndMin?: number; // set when a DF phase starts
      heard: Record<string, DfAccumulator>; // current leg
      done: { pos: Hex; heard: Record<string, DfAccumulator> }[]; // finished legs, reported on return
      restoreRangeKm?: number; // control range to put back when the drone is home
    };

// One bearing as it reaches HQ.
export interface ReportedBearing {
  emitterId: string;
  signature: string;
  sensorId: string;
  sensorPos: Hex;
  bearingDeg: number;
  sigmaDeg: number;
  measurements: number;
  samples: { minute: number; what: string }[];
  minute: number; // when it reached HQ (the report's minute)
  heardMin?: number; // moving emitters: the minute the bearing was taken
  emitterPos?: Hex; // moving emitters: truth that minute, for scoring only
}

export interface Report {
  side: PlayerSide; // whose HQ it is going to
  unitId: string;
  minute: number; // when it was written
  bearings: ReportedBearing[];
}

// A side's picture of one enemy emitter. Grouped by true emitter (perfect association, a stated simplification).
export interface Track {
  id: string; // E1, E2, ... for Blue's picture; B1, B2, ... for Red's
  emitterId: string;
  signature: string;
  bearings: ReportedBearing[];
  fix?: Fix; // static emitter: from every bearing; moving emitter: the latest minute's fix
  // Moving emitter (a UAV): one fix per minute that had bearings from two sites, oldest first.
  moving?: boolean;
  fixes?: { minute: number; fix: Fix }[];
}

export type LogKind = 'order' | 'report' | 'hq' | 'error' | 'info' | 'replay';

export interface LogEntry {
  minute: number;
  kind: LogKind;
  text: string;
  side?: PlayerSide; // which console sees it; undefined means both (the debrief shows everything)
  unitId?: string; // set when a unit's own order produced the line: that unit's console shows it
}

// 'ended' means the player asked for the reveal before the mission resolved. 'draw' is mission 2 only.
export type MissionStatus = 'running' | 'won' | 'lost' | 'draw' | 'ended';

// A one-minute transmission that is not background chatter: an order being sent, an acknowledgement, a report.
export interface Burst {
  minute: number;
  unitId: string;
  netId: string;
  what: string;
}

// Mission 2: an order Red's HQ must pass to a squad inside a window.
export interface RedOrder {
  n: number;
  toId: string;
  windowStart: number;
  windowEnd: number;
  sentMin?: number;
  status: 'pending' | OrderStatus;
}

// An order a commander sends to one of its units over the net, with the receipt HQ holds for it.
// 'pending' until the unit's acknowledgement gets back. 'lost' means HQ heard nothing in time, whether or not the unit got it.
export interface OrderMessage {
  n: number;
  side: PlayerSide;
  fromId: string;
  toId: string;
  text: string;
  sentMin: number;
  arriveMin?: number; // set when the order is going to reach the unit; undefined while it is lost on the way
  ackMin?: number; // the minute the acknowledgement reached HQ
  status: 'pending' | OrderStatus;
}

// The opponent's pre-planned commands, from a mission-1 script.
export interface Playbook {
  name: string;
  schedule: { minute: number; command: MissionCommand }[];
}

// Structured record of what happened, for the sequence chart and analysis. One minute can hold many.
export type MissionEvent =
  | { kind: 'emit'; minute: number; unitId: string; what: string; signature: string } // a transmission during the minute
  | { kind: 'capture'; minute: number; sensorId: string; emitterId: string; what: string; snrDb: number; bearingDeg: number; sigmaDeg: number; freqMHz?: number; signature?: string } // sensor heard emitter; the bearing it measured that minute (compass degrees)
  | { kind: 'report'; minute: number; unitId: string; side: PlayerSide; bearings: number; delivered: boolean } // DF report sent (or held)
  | { kind: 'release'; minute: number; unitId: string; side: PlayerSide } // a held report finally reached HQ
  | { kind: 'track'; minute: number; side: PlayerSide; trackId: string; emitterId: string; cepKm?: number; first: boolean } // picture changed
  | { kind: 'send'; minute: number; orderN: number; fromId: string; toId: string; status: string } // Red order transmitted
  | { kind: 'ack'; minute: number; unitId: string; side: PlayerSide; orderN: number } // a unit's acknowledgement of an order reached HQ
  | { kind: 'busy'; minute: number; unitId: string; task: 'df' | 'sortie' | 'move'; detail: string }; // what a unit was doing this minute

// The picture at the end of one minute, kept for the replay.
// The settings a link budget depends on, kept per minute so a replay minute's budgets are that minute's.
export interface SnapshotSettings {
  units: Record<string, { powerW: number; antenna?: Unit['antenna']; decoy?: Unit['decoy']; jammer?: Unit['jammer'] }>;
  nets: Record<string, Waveform>;
  emcon: Record<string, number>;
}

export interface Snapshot {
  minute: number;
  positions: Record<string, Hex>; // every unit
  settings?: SnapshotSettings; // absent in states saved before the replay inspector
  tracks: Track[]; // Blue's picture
  redTracks: Track[]; // Red's picture
  sectors: { pos: Hex; centreDeg: number; halfWidthDeg: number; label: string }[];
  plans: { unitId: string; from: Hex; points: Hex[] }[];
}

export interface MissionState {
  world: World; // ground truth for both sides
  mission: MissionKind;
  side: PlayerSide; // the player (in a duel: the primary console; both sides are human)
  humans: PlayerSide[]; // which sides take orders from a console
  winner?: PlayerSide | 'draw'; // set when the mission resolves
  seed: number;
  minute: number;
  limitMin: number;
  orders: Record<string, Order>; // both sides' unit orders, keyed by unit id
  held: Report[]; // written but not yet delivered to the side's HQ
  tracks: Track[]; // Blue's picture of Red
  redTracks: Track[]; // Red's picture of Blue
  log: LogEntry[];
  events: MissionEvent[];
  status: MissionStatus;
  nextTrackNo: number;
  nextRedTrackNo: number;
  history: Snapshot[]; // one per minute, index = minute
  replay?: { minute: number }; // set while stepping through the reveal
  // Emissions beyond chatter, and the chatter settings themselves (per net, share of minutes).
  bursts: Burst[];
  emcon: Record<string, number>;
  // Mission 2.
  playbook?: Playbook;
  redOrders: RedOrder[];
  // Orders over the net (any mission, either side).
  messages: OrderMessage[];
  nextOrderNo: number;
  // C2 mode, per side (set by the server at /new): the unit aliases that have an agent. Any other unit of a C2 side is auto:
  // it executes an order's text literally when the order arrives.
  c2?: Partial<Record<PlayerSide, { agents: string[] }>>;
  // Mission 4.
  uav?: UavState; // Red's UAV (missions 4 and 5)
  blueUav?: UavState; // Blue's UAV (mission 5)
  found?: { by: PlayerSide; minute: number; km: number; sensorId: string; mutual?: boolean }; // mission 5: who heard the other UAV from close by, first (mutual: both in the same minute, a draw); fox: the hunter within reach
  scenario?: string; // the scenario this mission was built from, if any
  playToEnd?: boolean; // scenarios: no early win; the result is read at the time limit
  computer?: Partial<Record<PlayerSide, ComputerSide>>; // sides the engine plays (docs/design-computer-player.md)
  // Deception: the nets' traffic profiles and the true order of battle (for the reveal and the score).
  profiles?: Record<string, Profile>;
  orbat?: OrbatNode[];
  sectors?: Sector[];
  objective?: { sector: string; tick: number }; // the real operation: where and when
  assessment?: Assessment; // Blue's, scored at the end
  iads?: IadsState;
  actor?: PlayerSide; // transient: which side's console current log lines belong to
}

// Mission 4: Red's reconnaissance UAV flies a fixed route and must report to its controller every few minutes.
export interface UavState {
  unitId: string;
  side: PlayerSide;
  reportEveryMin: number;
  landsWhenDone: boolean; // mission 4: the route ends the flight; mission 5: the UAV loiters and waits for a new route
  heard: Record<string, DfAccumulator>; // bearings the UAV has taken since its last delivered report
  netId: string; // the telemetry link
  route: Hex[]; // waypoints, in order
  nextWp: number; // index of the waypoint being flown to; route.length when the route is done
  launchedMin?: number;
  doneMin?: number; // route complete
  holding: boolean; // ordered to hold at the next waypoint
  lastBurstMin?: number; // the UAV counts from launch until it first reports
  telemetry: { minute: number; delivered: boolean; forced: boolean }[]; // every report burst and whether HQ got it
}

export const UAV_RULES = {
  reportEveryMin: 3, // a report is forced when this long has passed since the last one
  burstSec: 6, // a report is a short burst: an ES sweep (2.3 s) catches it only if it is on the channel at the time
  fixesToWin: 5, // Blue: position fixes on the UAV under the CEP limit
  winCepKm: 1,
  maxGaps: 1, // Red: reports HQ never received, at most
  speedKmh: 60,
  enduranceMin: 90,
  linkW: 2, // telemetry transmit power at launch
  maxW: 10,
  waypoints: 10,
} as const;

export const MISSION_RULES = {
  limitMin: 60,
  fixesToWin: 3,
  winCepKm: 1,
  redDuty: 0.2, // default share of minutes each Red radio chatters
  blueDuty: 0.05, // Blue's chatter when Red is listening
  sectorHalfWidthDeg: 45,
  sweepsPerMinute: 25, // one sweep of 2320 channels takes about 2.3 s
  siteErrorDeg: 1, // bearing error that averaging cannot remove
  pfa: 1e-3,
  minPd: 0.1, // a sweep weaker than this is treated as not heard: no bearing from near-noise detections
  squadMinutesPerHex: 1.5, // about 20 km/h on 500 m hexes
  hqMinutesPerHex: 3, // HQ packs up and moves at about 10 km/h
  droneMinutesPerHex: 0.5,
  droneEnduranceMin: 40, // defaults for drones without a profile
  handoverKm: 1, // how close the drone must get to its squad to hand over a report
  wedgeRangeKm: 30, // how far a single-bearing wedge is drawn
  uavLinkW: 2, // the UAV's control and video downlink while on a linked DF
  // Mission 2.
  redOrdersToWin: 4,
  redOrderCount: 6,
  redOrderWindowMin: 10,
} as const;

export const enemyOf = (side: Side): PlayerSide => (side === 'blue' ? 'red' : 'blue');

// Mission 5: two HQs far apart, one UAV each. The first UAV to hear the other's report from close by finds it.
// A scenario's air-defence cycle: each radar reports a track to the fire control node, which orders a launcher.
export interface Engagement {
  minute: number;
  radarId: string;
  reportStatus: OrderStatus;
  launcherId?: string;
  orderStatus: OrderStatus;
  ok: boolean; // both legs on time
}
export interface IadsState {
  engagements: Engagement[];
  nextLauncher: number;
}

// The deception mission ticks in hours.
export const DECEPTION_RULES = {
  limitTicks: 72, // three days
  sweepsPerTick: 1500, // an hour of 2.3 s sweeps
  hqTicksPerHex: 0.1, // an HQ packs up and moves at about 5 km/h
  ticksPerHex: 0.05, // 10 km/h for the rest
  // Collection (docs/design-deception.md section 4): a site's operators watch at most this much band at once; tuned to
  // one frequency they catch every burst; a sweep of the whole band catches a tenth of them.
  watchMHz: 8,
  tuneSweepFactor: 2,
  sweepShare: 0.1,
  bandMHz: [30, 88] as [number, number],
} as const;

export const FOX_RULES = {
  limitMin: 60,
  foundKm: 1, // a hunter this close to a transmitter has found it
} as const;

export const IADS_RULES = {
  limitMin: 60,
  cycleMin: 5, // a track report from every radar this often, from T+5
  denyToWin: 6, // Blue: engagements denied (either leg late or lost)
  completeToWin: 8, // Red, at the end: engagements with both legs on time
} as const;

export const HUNT_RULES = {
  limitMin: 180,
  reportEveryMin: 5,
  interceptKm: 3, // a report heard by a UAV from within this distance is a find
  speedKmh: 60,
  enduranceMin: 240,
  linkW: 2,
  hqRef: { blue: [-18, 10], red: [50, 10] } as Record<PlayerSide, [number, number]>, // on the 1 km reference grid
} as const;
