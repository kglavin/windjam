import {
  type JammerContribution,
  type LinkQuality,
  SYNC_THRESHOLD_DB,
  berNoncoherentBfsk,
  jammingAt,
  processingGainDb,
  qualityFromBer,
  signalBandwidthKHz,
  sumDbm,
} from './ew';
import type { HexMap } from './map';
import { type NoiseEnv, type PathAnalysis, analyzePath, manMadeNoiseFigureDb, noiseFloorDbm, patternGainDbi, wattsToDbm } from './rf';
import type { Net, Unit } from './units';

// Time shares of the three states a receiver can be in. They sum to 1.
export interface LinkStates {
  clear: number; // no jammer hitting
  jammed: number; // noise-like jamming on the channel: BER from Eb/(N0 + J0)
  lost: number; // packets lost outright: front end overloaded, or sync header jammed
}

export interface DirectionBudget {
  fromId: string;
  toId: string;
  txPowerDbm: number;
  rxPowerDbm: number;
  noiseFloorDbm: number; // in the signal bandwidth (wide for DSSS)
  processingGainDb: number; // DSSS despreading gain, 0 otherwise
  jammers: JammerContribution[];
  jammingDbm: number; // in-channel jamming while hit, -Infinity when unjammed
  jsDb: number; // in-channel jammer-to-signal ratio while hit, -Infinity when unjammed
  jamFraction: number; // share of time any jammer is hurting the link (jammed + lost)
  states: LinkStates;
  snrDb: number; // clear dwells, before despreading
  sinrDb: number; // jammed dwells, before despreading
  ebN0Db: number; // Eb/(N0 + J0) on jammed dwells, after despreading
  berClear: number;
  berJammed: number;
  ber: number; // time average over the three states
  quality: LinkQuality;
}

export interface LinkBudget {
  path: PathAnalysis;
  forward: DirectionBudget;
  reverse: DirectionBudget;
  ber: number; // worse of the two directions
  quality: LinkQuality;
  jammed: boolean; // any jammer is hurting either end some of the time
}

export interface JamContext {
  jammers: Unit[];
  nets: Net[];
  noiseEnv: NoiseEnv;
}

// Eb/N0 = SNR x (signal bandwidth / bit rate). For DSSS the bandwidth ratio is the processing gain.
const ebN0 = (snrDb: number, net: Net) => snrDb + 10 * Math.log10(signalBandwidthKHz(net) / net.dataRateKbps);

// Independent events: chance at least one happens.
const anyOf = (ps: number[]) => 1 - ps.reduce((q, p) => q * (1 - p), 1);

function directionBudget(map: HexMap, tx: Unit, rx: Unit, net: Net, lossDb: number, jam: JamContext): DirectionBudget {
  const txPowerDbm = wattsToDbm(tx.radio.powerW);
  const rxPowerDbm = txPowerDbm + patternGainDbi(tx, rx.pos, map) + patternGainDbi(rx, tx.pos, map) - lossDb;
  const floor = noiseFloorDbm(signalBandwidthKHz(net), rx.radio.noiseFigureDb, manMadeNoiseFigureDb(net.freqMHz, jam.noiseEnv));
  const jammers = jammingAt(map, tx, rx, net, jam.jammers, jam.nets);
  const snrDb = rxPowerDbm - floor;

  // Noise-like jammers add to the noise. Sync jammers only matter if they break header acquisition.
  const noisy = jammers.filter((j) => j.fraction > 0 && j.mode !== 'sync');
  const sync = jammers.filter((j) => j.fraction > 0 && j.mode === 'sync');
  const jammingDbm = sumDbm(noisy.map((j) => j.powerDbm));
  const sinrDb = rxPowerDbm - sumDbm([floor, jammingDbm]);
  const syncLoss = anyOf(
    sync.map((j) => (ebN0(rxPowerDbm - sumDbm([floor, j.powerDbm]), net) < SYNC_THRESHOLD_DB ? j.fraction : 0)),
  );
  const saturation = anyOf(jammers.map((j) => j.saturation));

  // Lost: overload or failed sync. Otherwise jammed when any noise-like jammer hits (pessimistic: all add).
  const lost = anyOf([saturation, syncLoss]);
  const hit = anyOf(noisy.map((j) => j.fraction));
  const states: LinkStates = { clear: (1 - lost) * (1 - hit), jammed: (1 - lost) * hit, lost };

  const berClear = berNoncoherentBfsk(ebN0(snrDb, net));
  const berJammed = berNoncoherentBfsk(ebN0(sinrDb, net));
  const ber = states.clear * berClear + states.jammed * berJammed + states.lost * 0.5;
  const allJammingDbm = sumDbm(jammers.filter((j) => j.fraction > 0).map((j) => j.powerDbm));
  return {
    fromId: tx.id,
    toId: rx.id,
    txPowerDbm,
    rxPowerDbm,
    noiseFloorDbm: floor,
    processingGainDb: processingGainDb(net),
    jammers,
    jammingDbm: allJammingDbm,
    jsDb: allJammingDbm - rxPowerDbm,
    jamFraction: states.jammed + states.lost,
    states,
    snrDb,
    sinrDb,
    ebN0Db: ebN0(sinrDb, net),
    berClear,
    berJammed,
    ber,
    quality: qualityFromBer(ber),
  };
}

export function linkBudget(map: HexMap, net: Net, a: Unit, b: Unit, jam: JamContext): LinkBudget {
  const path = analyzePath(map, a.pos, a.radio.antennaHeightM, b.pos, b.radio.antennaHeightM, net.freqMHz);
  const forward = directionBudget(map, a, b, net, path.totalLossDb, jam);
  const reverse = directionBudget(map, b, a, net, path.totalLossDb, jam);
  const ber = Math.max(forward.ber, reverse.ber);
  return {
    path,
    forward,
    reverse,
    ber,
    quality: qualityFromBer(ber),
    jammed: forward.jamFraction > 0 || reverse.jamFraction > 0,
  };
}
