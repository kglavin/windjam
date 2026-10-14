import type { Fix } from '../detect';
import type { Hex } from '../hex';
import type { Side, Waveform } from '../units';
import type { OrderStatus } from '../timeliness';
import type { World } from '../world';

export type PlayerSide = 'blue' | 'red';
export type MissionKind = 'find' | 'hide' | 'duel'; // duel: both sides human, hide-mission rules

// One leg of a drone sortie: fly to a point, then listen there (minutes 0 = transit only).
export interface SortieLeg {
  to: Hex;
  centreDeg?: number;
  minutes: number;
}

// Orders a unit can be given from the console. Minutes are mission minutes.
export type MissionCommand =
  | { type: 'df'; unitId: string; centreDeg: number; minutes: number }
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
  | { type: 'emcon'; netId: string; duty: number } // 0..0.2
  | { type: 'power'; unitId: string; watts: number }
  | { type: 'waveform'; netId: string; waveform: Waveform }
  | { type: 'antenna'; unitId: string; towardId?: string } // undefined = omni
  | { type: 'decoy'; unitId: string; netId?: string } // undefined = off
  | { type: 'jam'; unitId: string; netId?: string }; // undefined = off

// What a DF task has heard so far from one emitter. Weighted so that averaged error is 1/sqrt(weight).
export interface DfAccumulator {
  emitterId: string;
  signature: string; // what the listener would call it, e.g. "45 MHz hopper"
  trueBearingDeg: number;
  weight: number; // sum of n / sigma² over every minute it was heard
  measurements: number;
  samples: { minute: number; what: string }[]; // what was heard each minute: chatter, order n, decoy, DF report...
}

export type Order =
  | { kind: 'df'; centreDeg: number; startMin: number; endMin: number; heard: Record<string, DfAccumulator> }
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
  minute: number;
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
  fix?: Fix;
}

export type LogKind = 'order' | 'report' | 'hq' | 'error' | 'info' | 'replay';

export interface LogEntry {
  minute: number;
  kind: LogKind;
  text: string;
  side?: PlayerSide; // which console sees it; undefined means both (the debrief shows everything)
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

// The opponent's pre-planned commands, from a mission-1 script.
export interface Playbook {
  name: string;
  schedule: { minute: number; command: MissionCommand }[];
}

// Structured record of what happened, for the sequence chart and analysis. One minute can hold many.
export type MissionEvent =
  | { kind: 'emit'; minute: number; unitId: string; what: string; signature: string } // a transmission during the minute
  | { kind: 'capture'; minute: number; sensorId: string; emitterId: string; what: string; snrDb: number } // sensor heard emitter
  | { kind: 'report'; minute: number; unitId: string; side: PlayerSide; bearings: number; delivered: boolean } // DF report sent (or held)
  | { kind: 'release'; minute: number; unitId: string; side: PlayerSide } // a held report finally reached HQ
  | { kind: 'track'; minute: number; side: PlayerSide; trackId: string; emitterId: string; cepKm?: number; first: boolean } // picture changed
  | { kind: 'send'; minute: number; orderN: number; fromId: string; toId: string; status: string } // Red order transmitted
  | { kind: 'busy'; minute: number; unitId: string; task: 'df' | 'sortie' | 'move'; detail: string }; // what a unit was doing this minute

// The picture at the end of one minute, kept for the replay.
export interface Snapshot {
  minute: number;
  positions: Record<string, Hex>; // every unit
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
  actor?: PlayerSide; // transient: which side's console current log lines belong to
}

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
