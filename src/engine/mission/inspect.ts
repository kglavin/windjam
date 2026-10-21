// The replay inspector's sums (docs/design-replay-inspector.md): what happened in a minute, how a fix was built from
// its bearings, where a bearing's error came from, and which orders set the state a link budget uses. Pure functions
// of a mission state; the panel only renders them.
import { type BearingLine, type Fix, fixFromBearings } from '../detect';
import type { Hex } from '../hex';
import type { HexMap } from '../map';
import { type LogEntry, MISSION_RULES, type MissionEvent, type MissionState, type PlayerSide, type ReportedBearing, type Track } from './types';

type Ev<K extends MissionEvent['kind']> = Extract<MissionEvent, { kind: K }>;

// --- The minute ----------------------------------------------------------------------------------------------------

export interface MinuteGroup {
  emitterId: string;
  emits: Ev<'emit'>[];
  captures: Ev<'capture'>[];
  tracks: Ev<'track'>[];
}

export interface MinuteView {
  minute: number;
  groups: MinuteGroup[]; // by emitter, in the order first seen
  reports: Ev<'report'>[];
  releases: Ev<'release'>[];
  sends: Ev<'send'>[];
  acks: Ev<'ack'>[];
  orders: LogEntry[]; // the console orders typed that minute
}

// Everything that led to the picture at T+minute: the events of the minute that just ended (the record stamps them
// with the minute they happened in, minute − 1; the console reports them at T+minute), and the orders typed at
// T+minute. With a side, only that side's captures, reports, tracks and acknowledgements; transmissions are the truth
// and are always shown (the replay has revealed it).
export function minuteEvents(s: MissionState, minute: number, side?: PlayerSide): MinuteView {
  const at = s.events.filter((e) => e.minute === minute - 1);
  const own = (x: PlayerSide) => !side || x === side;
  const sideOf = (unitId: string): PlayerSide | undefined => {
    const u = s.world.units.find((x) => x.id === unitId);
    return u && u.side !== 'neutral' ? u.side : undefined;
  };
  const groups: MinuteGroup[] = [];
  const group = (emitterId: string) => {
    let g = groups.find((x) => x.emitterId === emitterId);
    if (!g) groups.push((g = { emitterId, emits: [], captures: [], tracks: [] }));
    return g;
  };
  for (const e of at) {
    if (e.kind === 'emit') group(e.unitId).emits.push(e);
    else if (e.kind === 'capture' && own(sideOf(e.sensorId) ?? 'blue')) group(e.emitterId).captures.push(e);
    else if (e.kind === 'track' && own(e.side)) group(e.emitterId).tracks.push(e);
  }
  return {
    minute,
    groups,
    reports: at.filter((e): e is Ev<'report'> => e.kind === 'report' && own(e.side)),
    releases: at.filter((e): e is Ev<'release'> => e.kind === 'release' && own(e.side)),
    sends: at.filter((e): e is Ev<'send'> => e.kind === 'send'),
    acks: at.filter((e): e is Ev<'ack'> => e.kind === 'ack' && own(e.side)),
    orders: s.log.filter((e) => e.kind === 'order' && e.minute === minute && (!side || !e.side || e.side === side)),
  };
}

// --- The fix -------------------------------------------------------------------------------------------------------

export interface FixBuildUp {
  used: ReportedBearing[]; // the first k bearings, in the order they reached HQ
  fix?: Fix; // from those bearings; undefined below two, or when they do not cross
  crossingDeg?: number; // with exactly two: the angle between them, 0 to 90
}

const lineOf = (b: ReportedBearing): BearingLine => ({ sensorPos: b.sensorPos, bearingDeg: b.bearingDeg, sigmaDeg: b.sigmaDeg });

// The angle between two bearings, folded to 0..90: how well two lines cross.
export const crossingDeg = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

// The fix a static emitter's track supports from its first k bearings. `truth` is where the emitter stood, so the
// fix carries its true miss (the replay has revealed it).
export function fixBuildUp(map: HexMap, track: Track, k: number, truth?: Hex): FixBuildUp {
  const used = track.bearings.slice(0, Math.max(0, Math.min(k, track.bearings.length)));
  const fix = used.length >= 2 ? fixFromBearings(map, used.map(lineOf), truth) : undefined;
  return { used, fix, crossingDeg: used.length === 2 ? crossingDeg(used[0].bearingDeg, used[1].bearingDeg) : undefined };
}

// A moving emitter is fixed one minute at a time: the minutes its track has bearings for, oldest first.
export const movingMinutes = (track: Track): number[] =>
  [...new Set(track.bearings.map((b) => b.heardMin).filter((m): m is number => m !== undefined))].sort((a, b) => a - b);

// The fix of a moving emitter at one of those minutes, from that minute's bearings.
export function movingFix(map: HexMap, track: Track, minute: number, truth?: Hex): FixBuildUp {
  const used = track.bearings.filter((b) => b.heardMin === minute);
  const fix = used.length >= 2 ? fixFromBearings(map, used.map(lineOf), truth) : undefined;
  return { used, fix, crossingDeg: used.length === 2 ? crossingDeg(used[0].bearingDeg, used[1].bearingDeg) : undefined };
}

// --- A bearing -----------------------------------------------------------------------------------------------------

export interface BearingOrigin {
  captures: Ev<'capture'>[]; // the minutes the sensor heard the emitter, each with its SNR and that minute's σ
  weight: number; // Σ 1 ÷ σ²
  averagedDeg: number; // 1 ÷ √weight: the error after averaging the minutes
  siteErrorDeg: number; // the part averaging cannot remove
  sigmaDeg: number; // √(averaged² + site²): the bearing's σ
}

// Where a reported bearing's σ came from: its captures, averaged, plus the site error.
export function bearingOrigin(s: MissionState, b: ReportedBearing): BearingOrigin {
  const minutes = new Set(b.samples.map((x) => x.minute));
  const captures = s.events.filter(
    (e): e is Ev<'capture'> => e.kind === 'capture' && e.sensorId === b.sensorId && e.emitterId === b.emitterId && minutes.has(e.minute),
  );
  const weight = captures.reduce((w, c) => w + 1 / (c.sigmaDeg * c.sigmaDeg), 0);
  const averagedDeg = weight > 0 ? 1 / Math.sqrt(weight) : Infinity;
  const siteErrorDeg = MISSION_RULES.siteErrorDeg;
  return { captures, weight, averagedDeg, siteErrorDeg, sigmaDeg: Math.sqrt(averagedDeg * averagedDeg + siteErrorDeg * siteErrorDeg) };
}

// --- Orders --------------------------------------------------------------------------------------------------------

// The console orders up to a minute that changed one of the named units or nets (power, antenna, decoy, jamming,
// waveform, chatter): the log writes each as "<name>: ...". Newest first.
export function ordersAffecting(s: MissionState, minute: number, names: string[]): LogEntry[] {
  const heads = names.map((n) => `${n}:`);
  return s.log.filter((e) => e.kind === 'order' && e.minute <= minute && heads.some((h) => e.text.startsWith(h))).reverse();
}

// --- Lessons -------------------------------------------------------------------------------------------------------

export interface Lesson {
  level: number;
  step: string;
  title: string;
}

// The lab lesson that teaches each sum the inspector shows.
export const LESSONS: Record<string, Lesson> = {
  bearing: { level: 6, step: 'C1', title: 'How sharp is a bearing' },
  two: { level: 6, step: 'D1', title: 'Two bearings and the crossing angle' },
  more: { level: 6, step: 'E1', title: 'Three or more: the ellipse and CEP' },
  moving: { level: 6, step: 'F1', title: 'A moving sensor' },
  budget: { level: 0, step: 'F3', title: 'Radiated power and margin' },
  js: { level: 2, step: 'B1', title: 'J/S and Eb/J0' },
  timeliness: { level: 0, step: 'I1', title: 'Bit errors' },
  spot: { level: 2, step: 'B1', title: 'Noise on the channel' },
  barrage: { level: 7, step: 'B1', title: 'Noise over the whole band' },
  partial: { level: 3, step: 'B1', title: 'Partial-band noise' },
  pulse: { level: 3, step: 'E1', title: 'Pulsed noise and the best duty' },
  multitone: { level: 4, step: 'D1', title: 'Many tones' },
  swept: { level: 7, step: 'E1', title: 'Swept and follower jamming' },
  follower: { level: 7, step: 'E1', title: 'The follower jammer' },
  sync: { level: 5, step: 'B1', title: 'Pulses on the sync' },
  fh: { level: 7, step: 'A1', title: 'Frequency hopping' },
  dsss: { level: 2, step: 'A1', title: 'Processing gain' },
  antenna: { level: 0, step: 'F2', title: 'Antennas and gain' },
};

export const lessonUrl = (l: Lesson): string => `?chapter=lab&level=${l.level}`;
