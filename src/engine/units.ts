import type { Hex } from './hex';

export type Side = 'blue' | 'red' | 'neutral';

export type UnitKind = 'hq' | 'squad' | 'relay' | 'civil' | 'jammer' | 'drone';

export interface Radio {
  powerW: number;
  antennaHeightM: number; // above local ground
  gainDbi: number;
  noiseFigureDb: number;
}

// Jamming techniques from notes sections 4-6.
//  spot      all power parked on the target net's channel
//  barrage   power spread over the whole VHF band
//  partial   power spread over a fraction of the band around the target (partial-band noise)
//  multitone power split into several CW tones spread across the band
//  pulse     short high-peak bursts on the target channel at a duty cycle
//  swept     one tone swept across the band
//  follower  chases a hopping net's current channel
//  sync      protocol-aware: hits only packet headers so the receiver never locks on
export type JammerMode = 'off' | 'spot' | 'barrage' | 'partial' | 'multitone' | 'pulse' | 'swept' | 'follower' | 'sync';

export interface JammerConfig {
  mode: JammerMode;
  targetNetId?: string; // required for spot, partial, pulse, follower and sync
  reactionUs?: number; // follower: intercept + processing time, defaults to DEFAULT_REACTION_US
  bandFraction?: number; // partial: share of the VHF band covered, 0..1
  tones?: number; // multitone: number of tones
  dutyCycle?: number; // pulse: share of time transmitting, 0..1
}

export interface Unit {
  id: string;
  name: string;
  side: Side;
  kind: UnitKind;
  pos: Hex;
  radio: Radio;
  jammer?: JammerConfig; // present only on units that can jam
  // Drones are flown from a parent unit and must stay within its control range.
  parentId?: string;
  controlRangeKm?: number;
  // Drone performance. A squad-launched quadcopter is slow and short-legged; bigger classes can come later.
  drone?: { speedKmh: number; enduranceMin: number };
  // Directional antenna pointed at another unit (notes section 1 EP). Omni when absent.
  antenna?: { towardId: string; boresight: Hex };
  // Screening broadcast: this unit transmits dummy traffic with another net's signature.
  decoy?: { netId: string };
}

// Net topologies from the notes, section 1. 'retrans' is a relay's second channel: it carries hops, not links of its own.
export type NetTopology = 'hub' | 'mesh' | 'retrans';

// Fixed frequency, frequency hopping across the VHF band, or direct-sequence spreading (notes section 3).
// Slow hopping sends many bits per hop; fast hopping hops more than once per bit.
export type Waveform =
  | { kind: 'fixed' }
  | { kind: 'fh'; hopsPerSec: number }
  | { kind: 'dsss'; chipRateMcps: number }; // direct sequence: spread over chipRateMcps MHz

export interface Net {
  id: string;
  name: string;
  side: Side;
  topology: NetTopology;
  hubId?: string; // required for 'hub'
  // Cross-band retransmission: members may reach the hub through relayId, using retransNetId's frequency for the first hop.
  relay?: { relayId: string; retransNetId: string };
  memberIds: string[];
  freqMHz: number;
  bandwidthKHz: number;
  dataRateKbps: number;
  waveform: Waveform;
}

export interface Link {
  id: string;
  netId: string;
  aId: string;
  bId: string;
}

// Hub nets link the hub to each member. Mesh nets link every pair. Retrans nets add no links.
export function netLinks(net: Net): Link[] {
  const links: Link[] = [];
  const add = (a: string, b: string) =>
    links.push({ id: `${net.id}:${a}-${b}`, netId: net.id, aId: a, bId: b });
  if (net.topology === 'retrans') return links;
  if (net.topology === 'hub') {
    if (!net.hubId) throw new Error(`Hub net ${net.id} has no hubId`);
    for (const m of net.memberIds) if (m !== net.hubId) add(net.hubId, m);
  } else {
    for (let i = 0; i < net.memberIds.length; i++)
      for (let j = i + 1; j < net.memberIds.length; j++) add(net.memberIds[i], net.memberIds[j]);
  }
  return links;
}

// Radio presets. Game assumptions loosely based on VHF tactical radios.
export const RADIO_PRESETS: Record<UnitKind, Radio> = {
  hq: { powerW: 50, antennaHeightM: 10, gainDbi: 3, noiseFigureDb: 6 },
  squad: { powerW: 5, antennaHeightM: 2, gainDbi: 0, noiseFigureDb: 6 },
  relay: { powerW: 20, antennaHeightM: 15, gainDbi: 3, noiseFigureDb: 6 },
  civil: { powerW: 40, antennaHeightM: 30, gainDbi: 6, noiseFigureDb: 5 },
  jammer: { powerW: 200, antennaHeightM: 6, gainDbi: 3, noiseFigureDb: 6 },
  // Small UAV: the antenna height is its flying height above ground. It carries a receiver only.
  drone: { powerW: 0, antennaHeightM: 150, gainDbi: 0, noiseFigureDb: 8 },
};
