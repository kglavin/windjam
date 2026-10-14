// Test instruments at one node: what its antenna sees across the band and over time.
// Everything here uses the same propagation and jamming rules as the link budgets, but resolved in time:
// hops land on actual channels, pulses switch on and off, a swept tone moves, a follower arrives late.

import { DEFAULTS, HOP_BAND, RX_P1DB_DBM, SYNC_DUTY, berNoncoherentBfsk, followerDelayUs, hopChannels, jammerBand, jammerOnTime, signalBandwidthKHz, sumDbm } from './ew';
import { analyzePath, manMadeNoiseFigureDb, noiseFloorDbm, wattsToDbm } from './rf';
import { PACKET_BITS, TURNAROUND_S } from './timeliness';
import type { Net, Unit } from './units';
import { type World, netById, unitById } from './world';

export const SWEEPS_PER_SEC = 50; // swept jammer
export const PULSE_PERIOD_US = 1000; // pulse jammer repetition

export type SourceRole = 'own' | 'friendly' | 'enemy' | 'jammer';

// Where a source's energy sits in frequency, and how that moves with time.
export type Occupancy =
  | { kind: 'channel'; centreMHz: number; widthMHz: number }
  | { kind: 'band'; lowMHz: number; highMHz: number }
  | { kind: 'hop'; widthMHz: number; hopsPerSec: number; seed: number; channels: number }
  | { kind: 'follow'; widthMHz: number; hopsPerSec: number; seed: number; channels: number; delayUs: number }
  | { kind: 'tones'; freqsMHz: number[]; widthMHz: number }
  | { kind: 'sweep'; lowMHz: number; highMHz: number; widthMHz: number; sweepsPerSec: number };

export interface Gate {
  duty: number; // share of each period the source is on
  periodUs: number;
}

export interface ScopeSource {
  id: string;
  unitId: string;
  netId?: string;
  label: string;
  role: SourceRole;
  peakDbm: number; // total received power at the probe antenna while on
  occupancy: Occupancy;
  gate?: Gate; // undefined: always on
}

// Deterministic hop sequence shared by a net's radios, and by any follower chasing them.
export function hopChannel(seed: number, hopIndex: number, channels: number): number {
  let x = (seed ^ Math.imul(hopIndex | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) % channels;
}

const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const channelCentre = (index: number, widthMHz: number) => HOP_BAND.lowMHz + (index + 0.5) * widthMHz;

function netOccupancy(net: Net): Occupancy {
  const w = net.waveform;
  if (w.kind === 'fh') {
    return { kind: 'hop', widthMHz: net.bandwidthKHz / 1000, hopsPerSec: w.hopsPerSec, seed: hashString(net.id), channels: hopChannels(net) };
  }
  const half = signalBandwidthKHz(net) / 2000;
  if (w.kind === 'dsss') return { kind: 'band', lowMHz: net.freqMHz - half, highMHz: net.freqMHz + half };
  return { kind: 'channel', centreMHz: net.freqMHz, widthMHz: half * 2 };
}

// The transmitter a follower is reacting to when it chases a net: its hub, else any member that isn't the probe.
function chasedTransmitter(world: World, net: Net, probe: Unit): Unit | undefined {
  const id = net.hubId && net.hubId !== probe.id ? net.hubId : net.memberIds.find((m) => m !== probe.id);
  return id ? unitById(world, id) : undefined;
}

// Everything transmitting that the probe's antenna receives, with received power and time/frequency shape.
export function scopeSources(world: World, probeId: string): ScopeSource[] {
  const probe = unitById(world, probeId);
  if (!probe) return [];
  const out: ScopeSource[] = [];
  const rxDbm = (u: Unit, freqMHz: number, extraDb = 0) => {
    const path = analyzePath(world.map, u.pos, u.radio.antennaHeightM, probe.pos, probe.radio.antennaHeightM, freqMHz);
    return wattsToDbm(u.radio.powerW) + extraDb + u.radio.gainDbi + probe.radio.gainDbi - path.totalLossDb;
  };

  for (const u of world.units) {
    if (u.id === probe.id) continue;
    const cfg = u.jammer;
    if (cfg) {
      const band = jammerBand(u, world.nets);
      if (!band || cfg.mode === 'off') continue;
      const target = netById(world, cfg.targetNetId ?? '');
      const { peakDb } = jammerOnTime(cfg);
      const centre = (band.lowMHz + band.highMHz) / 2;
      const widthMHz = band.highMHz - band.lowMHz;
      const chMHz = 0.025;
      let occupancy: Occupancy = widthMHz > chMHz * 1.01 ? { kind: 'band', ...band } : { kind: 'channel', centreMHz: centre, widthMHz };
      let gate: Gate | undefined;
      if (cfg.mode === 'multitone') {
        const q = Math.max(1, Math.round(cfg.tones ?? DEFAULTS.tones));
        const span = HOP_BAND.highMHz - HOP_BAND.lowMHz;
        occupancy = { kind: 'tones', freqsMHz: Array.from({ length: q }, (_, i) => HOP_BAND.lowMHz + ((i + 0.5) * span) / q), widthMHz: chMHz };
      } else if (cfg.mode === 'swept') {
        occupancy = { kind: 'sweep', ...band, widthMHz: chMHz, sweepsPerSec: SWEEPS_PER_SEC };
      } else if (cfg.mode === 'follower' && target?.waveform.kind === 'fh') {
        const tx = chasedTransmitter(world, target, probe);
        const delayUs = tx ? followerDelayUs(world.map, tx, u, probe, cfg.reactionUs ?? 500) : 0;
        const hop = netOccupancy(target) as Extract<Occupancy, { kind: 'hop' }>;
        occupancy = { ...hop, kind: 'follow', delayUs };
      } else if (cfg.mode === 'pulse') {
        gate = { duty: jammerOnTime(cfg).duty, periodUs: PULSE_PERIOD_US };
      } else if (cfg.mode === 'sync' && target) {
        gate = { duty: SYNC_DUTY, periodUs: (PACKET_BITS / (target.dataRateKbps * 1000) + TURNAROUND_S) * 1e6 };
      }
      out.push({ id: `${u.id}:jam`, unitId: u.id, label: `${u.name} (${cfg.mode})`, role: 'jammer', peakDbm: rxDbm(u, centre, peakDb), occupancy, gate });
      continue;
    }
    if (u.radio.powerW <= 0) continue;
    for (const net of world.nets.filter((n) => n.memberIds.includes(u.id))) {
      const role: SourceRole = net.memberIds.includes(probe.id) ? 'own' : u.side === probe.side ? 'friendly' : 'enemy';
      out.push({ id: `${u.id}:${net.id}`, unitId: u.id, netId: net.id, label: `${u.name} on ${net.name}`, role, peakDbm: rxDbm(u, net.freqMHz), occupancy: netOccupancy(net) });
    }
  }
  return out;
}

// A slice of spectrum occupied at one instant, with the power in it.
export interface Segment {
  lowMHz: number;
  highMHz: number;
  dbm: number;
}

const gateOn = (g: Gate | undefined, tUs: number) => !g || ((tUs % g.periodUs) + g.periodUs) % g.periodUs < g.duty * g.periodUs;

// Where a source is at time tUs (empty when gated off).
export function instantSegments(s: ScopeSource, tUs: number): Segment[] {
  if (!gateOn(s.gate, tUs)) return [];
  const o = s.occupancy;
  const at = (c: number, w: number, dbm = s.peakDbm): Segment => ({ lowMHz: c - w / 2, highMHz: c + w / 2, dbm });
  switch (o.kind) {
    case 'channel':
      return [at(o.centreMHz, o.widthMHz)];
    case 'band':
      return [{ lowMHz: o.lowMHz, highMHz: o.highMHz, dbm: s.peakDbm }];
    case 'hop':
      return [at(channelCentre(hopChannel(o.seed, Math.floor((tUs * o.hopsPerSec) / 1e6), o.channels), o.widthMHz), o.widthMHz)];
    case 'follow':
      // Transmits on the channel of the hop it heard delayUs ago.
      return [at(channelCentre(hopChannel(o.seed, Math.floor(((tUs - o.delayUs) * o.hopsPerSec) / 1e6), o.channels), o.widthMHz), o.widthMHz)];
    case 'tones': {
      const each = s.peakDbm - 10 * Math.log10(o.freqsMHz.length);
      return o.freqsMHz.map((f) => at(f, o.widthMHz, each));
    }
    case 'sweep': {
      const phase = ((tUs * o.sweepsPerSec) / 1e6) % 1;
      return [at(o.lowMHz + phase * (o.highMHz - o.lowMHz), o.widthMHz)];
    }
  }
}

// Long-run average: hops and sweeps spread over the band, gated sources scaled by duty.
export function averageSegments(s: ScopeSource): Segment[] {
  const dutyDb = s.gate ? 10 * Math.log10(s.gate.duty) : 0;
  const o = s.occupancy;
  if (o.kind === 'hop' || o.kind === 'follow' || o.kind === 'sweep') {
    return [{ lowMHz: HOP_BAND.lowMHz, highMHz: HOP_BAND.highMHz, dbm: s.peakDbm + dutyDb }];
  }
  return instantSegments({ ...s, gate: undefined }, 0).map((seg) => ({ ...seg, dbm: seg.dbm + dutyDb }));
}

// Power (dBm) per bin from segments plus receiver noise. Bins are equal slices of [lowMHz, highMHz].
export function spectrumBins(segments: Segment[], lowMHz: number, highMHz: number, bins: number, noiseFigureDb: number, world: World): number[] {
  const binMHz = (highMHz - lowMHz) / bins;
  const mw = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    const f = lowMHz + (i + 0.5) * binMHz;
    mw[i] = 10 ** (noiseFloorDbm(binMHz * 1000, noiseFigureDb, manMadeNoiseFigureDb(f, world.noiseEnv)) / 10);
  }
  for (const seg of segments) {
    const w = Math.max(seg.highMHz - seg.lowMHz, 1e-9);
    const p = 10 ** (seg.dbm / 10);
    const first = Math.max(0, Math.floor((seg.lowMHz - lowMHz) / binMHz));
    const last = Math.min(bins - 1, Math.floor((seg.highMHz - lowMHz) / binMHz));
    for (let i = first; i <= last; i++) {
      const lo = Math.max(seg.lowMHz, lowMHz + i * binMHz);
      const hi = Math.min(seg.highMHz, lowMHz + (i + 1) * binMHz);
      if (hi > lo) mw[i] += (p * (hi - lo)) / w;
    }
  }
  return Array.from(mw, (v) => 10 * Math.log10(v));
}

// The channel a net's receiver is tuned to at time tUs.
export function listenedChannel(net: Net, tUs: number): { lowMHz: number; highMHz: number } {
  const o = netOccupancy(net);
  const [seg] = instantSegments({ id: '', unitId: '', label: '', role: 'own', peakDbm: 0, occupancy: o }, tUs);
  return seg;
}

export interface TraceSample {
  tUs: number;
  jammingDbm: number; // in the listened channel, -Infinity when clear
  overloaded: boolean; // front end compressed by total jammer power at the antenna
  sinrDb: number;
  ebN0Db: number;
  ber: number;
}

export interface TraceSetup {
  net: Net;
  signalDbm: number; // from the link budget
  noiseDbm: number; // in the signal bandwidth, from the link budget
}

// Signal, noise and jamming in the listened channel at time tUs.
export function traceSample(setup: TraceSetup, jammers: ScopeSource[], tUs: number): TraceSample {
  const ch = listenedChannel(setup.net, tUs);
  const inChannel: number[] = [];
  const frontEnd: number[] = [];
  for (const j of jammers) {
    for (const seg of instantSegments(j, tUs)) {
      frontEnd.push(seg.dbm);
      const overlap = Math.min(seg.highMHz, ch.highMHz) - Math.max(seg.lowMHz, ch.lowMHz);
      if (overlap > 0) inChannel.push(seg.dbm + 10 * Math.log10(overlap / Math.max(seg.highMHz - seg.lowMHz, 1e-9)));
    }
  }
  const jammingDbm = sumDbm(inChannel);
  const overloaded = sumDbm(frontEnd) > RX_P1DB_DBM;
  const sinrDb = setup.signalDbm - sumDbm([setup.noiseDbm, jammingDbm]);
  const ebN0Db = sinrDb + 10 * Math.log10(signalBandwidthKHz(setup.net) / setup.net.dataRateKbps);
  return { tUs, jammingDbm, overloaded, sinrDb, ebN0Db, ber: overloaded ? 0.5 : berNoncoherentBfsk(ebN0Db) };
}

// Noncoherent BFSK detector outputs for one bit: envelope of the filter for the sent tone (mark) and the other (space).
// Noise has unit variance per quadrature component, so the mark amplitude is sqrt(2 Eb/N0) and Pe = 0.5 exp(-Eb/2N0).
export function bfskSymbol(ebN0Db: number, rng: () => number): { mark: number; space: number } {
  const a = Math.sqrt(2 * 10 ** (ebN0Db / 10));
  const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
  return { mark: Math.hypot(a + g(), g()), space: Math.hypot(g(), g()) };
}

