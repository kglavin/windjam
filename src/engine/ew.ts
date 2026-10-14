import type { HexMap } from './map';
import { analyzePath, hexDistanceKm, patternGainDbi, wattsToDbm } from './rf';
import type { JammerConfig, Net, Unit } from './units';

// Tactical VHF combat net radio band. Barrage jamming covers all of it, and hopping nets hop across all of it.
export const VHF_BAND_MHZ = { low: 30, high: 88 } as const;
export const HOP_BAND: Band = { lowMHz: VHF_BAND_MHZ.low, highMHz: VHF_BAND_MHZ.high };

// Follower jammer: time to detect a new hop and tune onto it (intercept + processing), before propagation.
export const DEFAULT_REACTION_US = 500;
export const DEFAULTS = { bandFraction: 0.1, tones: 10, dutyCycle: 0.1 } as const;

// Smart (sync) jammer: share of air time taken by packet headers and preambles.
export const SYNC_DUTY = 0.03;

// Receiver front end: total in-band power at the antenna that drives the LNA into compression (notes section 5).
export const RX_P1DB_DBM = -20;

const C_KM_PER_US = 0.299792458;

export interface Band {
  lowMHz: number;
  highMHz: number;
}

const width = (b: Band) => b.highMHz - b.lowMHz;
const overlapWidth = (a: Band, b: Band) => Math.max(0, Math.min(a.highMHz, b.highMHz) - Math.max(a.lowMHz, b.lowMHz));

export const isHopping = (net: Net): boolean => net.waveform.kind === 'fh';

// Bandwidth the signal actually occupies: the 25 kHz channel, or the spread bandwidth for DSSS.
export function signalBandwidthKHz(net: Net): number {
  return net.waveform.kind === 'dsss' ? net.waveform.chipRateMcps * 1000 : net.bandwidthKHz;
}

// DSSS processing gain: spread bandwidth over data rate (notes section 3). 1 (0 dB) for other waveforms.
export function processingGainDb(net: Net): number {
  return net.waveform.kind === 'dsss' ? 10 * Math.log10(signalBandwidthKHz(net) / net.dataRateKbps) : 0;
}

export function channelBand(net: Net): Band {
  const half = signalBandwidthKHz(net) / 2000;
  return { lowMHz: net.freqMHz - half, highMHz: net.freqMHz + half };
}

// Channels in the hop set: hop band width over channel width. 58 MHz / 25 kHz = 2320.
export const hopChannels = (net: Net): number => Math.round(width(HOP_BAND) / (net.bandwidthKHz / 1000));

// Dwell time on each hop, microseconds.
export const dwellUs = (net: Net): number => (net.waveform.kind === 'fh' ? 1e6 / net.waveform.hopsPerSec : Infinity);

// Fraction of jammer power that falls inside a channel, in dB.
// Barrage: 25 kHz of 58 MHz gives about -33.7 dB. This is the broadband noise dilution in notes section 5.
export function bandOverlapDb(jam: Band, channel: Band): number {
  const overlap = overlapWidth(jam, channel);
  if (overlap <= 0) return -Infinity;
  return 10 * Math.log10(overlap / width(jam));
}

// The band a jammer radiates into, or null when it is off or misconfigured.
export function jammerBand(jammer: Unit, nets: Net[]): Band | null {
  const cfg = jammer.jammer;
  if (!cfg || cfg.mode === 'off') return null;
  if (cfg.mode === 'barrage' || cfg.mode === 'multitone' || cfg.mode === 'swept') return { ...HOP_BAND };
  const target = nets.find((n) => n.id === cfg.targetNetId);
  if (!target) return null;
  if (cfg.mode === 'partial') {
    const w = width(HOP_BAND) * clamp01(cfg.bandFraction ?? DEFAULTS.bandFraction);
    const low = Math.min(Math.max(target.freqMHz - w / 2, HOP_BAND.lowMHz), HOP_BAND.highMHz - w);
    return { lowMHz: low, highMHz: low + w };
  }
  return channelBand(target);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Share of time the jammer is radiating at all, and its peak-to-average power ratio.
export function jammerOnTime(cfg: JammerConfig): { duty: number; peakDb: number } {
  if (cfg.mode === 'pulse') {
    const k = Math.min(1, Math.max(0.001, cfg.dutyCycle ?? DEFAULTS.dutyCycle));
    return { duty: k, peakDb: -10 * Math.log10(k) };
  }
  if (cfg.mode === 'sync') return { duty: SYNC_DUTY, peakDb: 0 };
  return { duty: cfg.mode === 'off' ? 0 : 1, peakDb: 0 };
}

// Follower race (notes section 6): the jammer only covers the part of each dwell left after it hears the hop,
// reacts, and its signal travels the extra distance tx -> jammer -> rx compared with tx -> rx.
export function followerDelayUs(map: HexMap, tx: Unit, jammer: Unit, rx: Unit, reactionUs: number): number {
  const extraKm = hexDistanceKm(map, tx.pos, jammer.pos) + hexDistanceKm(map, jammer.pos, rx.pos) - hexDistanceKm(map, tx.pos, rx.pos);
  return reactionUs + extraKm / C_KM_PER_US;
}

export interface JammerContribution {
  jammerId: string;
  mode: JammerConfig['mode'];
  pathLossDb: number;
  lineOfSight: boolean;
  bandOverlapDb: number; // in-channel power relative to the jammer's average power, while hitting
  powerDbm: number; // jamming power in the receiver channel while hitting
  fraction: number; // share of time (or hops, or packets) the jammer is hitting, 0..1
  // Front-end overload: total in-band jammer power at the antenna above RX_P1DB_DBM, for this share of time.
  saturation: number;
  frontEndDbm: number; // peak jammer power at the receiver antenna, before channel filtering
  note: string; // why the fraction is what it is
}

interface Pattern {
  overlapDb: number; // in-channel power share relative to average power (can exceed 0 dB for pulses)
  fraction: number;
  note: string;
}

// How a jammer's energy lands on one net's channel, by technique and waveform (notes sections 5 and 6).
function pattern(map: HexMap, tx: Unit, j: Unit, rx: Unit, net: Net, nets: Net[], band: Band): Pattern | null {
  const cfg = j.jammer!;
  const channel = channelBand(net);
  const hopping = isHopping(net);
  const n = hopping ? hopChannels(net) : 1;
  const targeted = cfg.targetNetId === net.id; // only the follower cares: it chases the net it targets

  switch (cfg.mode) {
    case 'barrage': {
      const overlapDb = bandOverlapDb(band, channel);
      return { overlapDb, fraction: overlapDb === -Infinity ? 0 : 1, note: 'barrage, power spread over the band' };
    }
    case 'swept': {
      // One tone at full power, crossing each channel for a share of the sweep.
      const share = Math.min(1, width(channel) / width(HOP_BAND));
      return { overlapDb: 0, fraction: share, note: `swept tone crosses this channel ${(share * 100).toFixed(2)}% of the time` };
    }
    case 'multitone': {
      const q = Math.max(1, Math.round(cfg.tones ?? DEFAULTS.tones));
      const toneDb = -10 * Math.log10(q);
      if (!hopping) return { overlapDb: toneDb, fraction: 1, note: `${q} tones; one sits in this channel` };
      return { overlapDb: toneDb, fraction: Math.min(1, q / n), note: `${q} tones hit ${q} of ${n} hop channels` };
    }
    case 'partial': {
      const overlapDb = bandOverlapDb(band, channel);
      if (!hopping) {
        return { overlapDb, fraction: overlapDb === -Infinity ? 0 : 1, note: `partial-band, ${(width(band)).toFixed(1)} MHz around the target` };
      }
      const rho = overlapWidth(band, HOP_BAND) / width(HOP_BAND);
      return {
        overlapDb: 10 * Math.log10(Math.min(1, width(channel) / width(band))),
        fraction: rho,
        note: `partial-band covers ρ = ${(rho * 100).toFixed(0)}% of hops`,
      };
    }
    case 'follower': {
      if (hopping && targeted) {
        const delay = followerDelayUs(map, tx, j, rx, cfg.reactionUs ?? DEFAULT_REACTION_US);
        const dwell = dwellUs(net);
        return { overlapDb: 0, fraction: Math.max(0, 1 - delay / dwell), note: `follower arrives ${delay.toFixed(0)} µs into a ${dwell.toFixed(0)} µs dwell` };
      }
      break; // not chasing this net: behaves like a parked spot jammer below
    }
    case 'spot':
    case 'pulse':
    case 'sync':
      break;
    default:
      return null;
  }

  // Parked on the target net's channel: spot, pulse, sync, and a follower on anything it isn't chasing.
  const target = nets.find((x) => x.id === cfg.targetNetId);
  if (!target) return null;
  const overlap = bandOverlapDb(band, channel);
  let overlapDb: number;
  let fraction: number;
  let note: string;
  if (!hopping) {
    overlapDb = overlap;
    fraction = overlap === -Infinity ? 0 : 1;
    note = 'on channel continuously';
  } else {
    // A hopping net lands inside the parked band for the share of the hop band it covers (1 of n for one channel).
    overlapDb = 10 * Math.log10(Math.min(1, width(channel) / width(band)));
    fraction = overlapWidth(band, HOP_BAND) / width(HOP_BAND);
    note = fraction * n <= 1.01 ? `parked on 1 channel; hits 1 of ${n} hops` : `parked on ${(width(band)).toFixed(2)} MHz; hits ${(fraction * 100).toFixed(1)}% of hops`;
  }
  if (cfg.mode === 'pulse') {
    const { duty, peakDb } = jammerOnTime(cfg);
    overlapDb += peakDb;
    fraction *= duty;
    note += `; pulses ${(duty * 100).toFixed(0)}% of the time at +${peakDb.toFixed(1)} dB peak`;
  }
  if (cfg.mode === 'sync') note = hopping ? `sync headers hop too; hits 1 of ${n}` : 'hits every packet header';
  return { overlapDb, fraction, note };
}

// Jamming each active jammer delivers into rx's channel on this net, for traffic sent by tx.
export function jammingAt(map: HexMap, tx: Unit, rx: Unit, net: Net, jammers: Unit[], nets: Net[]): JammerContribution[] {
  const out: JammerContribution[] = [];
  for (const j of jammers) {
    if (j.id === rx.id || j.id === tx.id) continue;
    const band = jammerBand(j, nets);
    const cfg = j.jammer;
    if (!band || !cfg) continue;
    const p = pattern(map, tx, j, rx, net, nets, band);
    const path = analyzePath(map, j.pos, j.radio.antennaHeightM, rx.pos, rx.radio.antennaHeightM, net.freqMHz);
    const { duty, peakDb } = jammerOnTime(cfg);
    const gains = patternGainDbi(j, rx.pos, map) + patternGainDbi(rx, j.pos, map);
    const frontEndDbm = wattsToDbm(j.radio.powerW) + peakDb + gains - path.totalLossDb;
    // Overload hits whatever the receiver is tuned to, so it applies even when the jammer misses this channel.
    const saturation = frontEndDbm > RX_P1DB_DBM ? duty : 0;
    // A follower that loses the race stays listed (fraction 0) so the player can see why.
    const lostFollower = cfg.mode === 'follower' && isHopping(net) && cfg.targetNetId === net.id;
    if (!p || p.overlapDb === -Infinity || (p.fraction <= 0 && !lostFollower)) {
      if (saturation === 0) continue;
    }
    out.push({
      jammerId: j.id,
      mode: cfg.mode,
      pathLossDb: path.totalLossDb,
      lineOfSight: path.lineOfSight,
      bandOverlapDb: p && p.overlapDb !== -Infinity ? p.overlapDb : -Infinity,
      powerDbm: p && p.overlapDb !== -Infinity ? wattsToDbm(j.radio.powerW) + p.overlapDb + gains - path.totalLossDb : -Infinity,
      fraction: p && p.overlapDb !== -Infinity ? p.fraction : 0,
      saturation,
      frontEndDbm,
      note: (p?.note ?? 'off this channel') + (saturation > 0 ? `; front end overloaded (${frontEndDbm.toFixed(0)} dBm)` : ''),
    });
  }
  return out;
}

// Power sum of dBm values. Returns -Infinity for an empty list.
export function sumDbm(values: number[]): number {
  const mw = values.reduce((s, v) => s + 10 ** (v / 10), 0);
  return mw > 0 ? 10 * Math.log10(mw) : -Infinity;
}

// Noncoherent binary FSK, the usual tactical VHF modulation (notes section 3).
// Interference is treated as extra Gaussian noise, so Eb/N0 becomes Eb/(N0 + J0).
export function berNoncoherentBfsk(ebN0Db: number): number {
  return 0.5 * Math.exp(-(10 ** (ebN0Db / 10)) / 2);
}

// Sync acquisition fails below this Eb/(N0+J0) on the header: the whole packet is lost (notes section 4).
export const SYNC_THRESHOLD_DB = 7;

// BER regimes from notes section 3.
export type LinkQuality = 'good' | 'degraded' | 'denied';

export const BER_GOOD = 1e-3; // communicator target
export const BER_DENIED = 1e-1; // jammer goal: breaks sync and payload

export const qualityFromBer = (ber: number): LinkQuality =>
  ber < BER_GOOD ? 'good' : ber < BER_DENIED ? 'degraded' : 'denied';
