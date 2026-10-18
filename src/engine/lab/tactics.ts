// Level 9 (docs/design-level-9.md): what jamming costs and how to spend it. Platforms and their power budgets,
// look-through, sharing one jammer across several links, networks as targets, and the Egli path model.
import type { Pt } from './geoloc';
import { type Station, pathLossDb } from './scene';
import { berBpskJammed, berPulsedBpsk, undb } from './theory';

// --- Platforms: round figures, the lab's, not any real system's ------------------------------------------------

export interface Platform {
  id: 'soldier' | 'uav' | 'vehicle' | 'aircraft';
  name: string;
  rfW: number; // radio power out of the amplifier
  efficiency: number; // share of DC power the amplifier turns into radio power
  energyWh: number; // battery or fuel available to the jammer
  heightM: number; // antenna height
}

export const PLATFORMS: Platform[] = [
  { id: 'soldier', name: 'Soldier pack', rfW: 10, efficiency: 0.3, energyWh: 150, heightM: 2 },
  { id: 'uav', name: 'Small UAV', rfW: 20, efficiency: 0.35, energyWh: 100, heightM: 300 },
  { id: 'vehicle', name: 'Vehicle', rfW: 200, efficiency: 0.4, energyWh: 20_000, heightM: 4 },
  { id: 'aircraft', name: 'Aircraft', rfW: 1000, efficiency: 0.4, energyWh: 400_000, heightM: 6000 },
];
export const platform = (id: Platform['id']): Platform => PLATFORMS.find((p) => p.id === id)!;

// DC power the amplifier draws (W), and how long the energy lasts at a duty (hours).
export const dcPowerW = (rfW: number, efficiency: number): number => rfW / efficiency;
export const timeOnAirH = (energyWh: number, rfW: number, efficiency: number, duty = 1): number => energyWh / (dcPowerW(rfW, efficiency) * duty);

// J/S changes with the jammer's distance to the receiver: near the ground (two-ray) 40·log10, in free space 20·log10.
export const distanceGainDb = (fromKm: number, toKm: number, model: 'two-ray' | 'free-space'): number =>
  (model === 'two-ray' ? 40 : 20) * Math.log10(fromKm / toKm);

// --- The Egli model (VHF/UHF over irregular ground) ------------------------------------------------------------

// Path loss (dB) by Egli: 20·log10 f + 40·log10 d − 20·log10 hb + 76.3 − 10·log10 hm (hm ≤ 10 m), f in MHz, d in km.
export function egliLossDb(freqMHz: number, distanceKm: number, hbM: number, hmM: number): number {
  const mobile = hmM <= 10 ? 76.3 - 10 * Math.log10(hmM) : 85.9 - 20 * Math.log10(hmM);
  return 20 * Math.log10(freqMHz) + 40 * Math.log10(distanceKm) - 20 * Math.log10(hbM) + mobile;
}

// J/S at a receiver by Egli: jammer and transmitter share the frequency, so the f term cancels.
export function egliJsDb(o: { jamW: number; jamGainDbi: number; jamKm: number; jamHeightM: number; txW: number; txGainDbi: number; txKm: number; txHeightM: number; rxHeightM: number; freqMHz: number }): number {
  const dbw = (w: number) => 10 * Math.log10(w);
  const j = dbw(o.jamW) + o.jamGainDbi - egliLossDb(o.freqMHz, o.jamKm, o.jamHeightM, o.rxHeightM);
  const s = dbw(o.txW) + o.txGainDbi - egliLossDb(o.freqMHz, o.txKm, o.txHeightM, o.rxHeightM);
  return j - s;
}

// --- Look-through ------------------------------------------------------------------------------------------------

// A jammer that stops for `lookMs` every `periodMs` to listen loses that share of its time: its average J/S falls
// by 10·log10 of the share it stays on, and a link that moves is caught only at the next look.
export const lookThroughLossDb = (lookMs: number, periodMs: number): number => -10 * Math.log10(1 - lookMs / periodMs);
export const worstUnjammedMs = (periodMs: number): number => periodMs; // a move just after a look waits a whole period

// --- Sharing one jammer across links -----------------------------------------------------------------------------

export interface Target {
  name: string;
  gpDb: number; // the link's processing gain
  jsDb: number; // J/S at its receiver with all the jammer's power on it
  ebN0Db: number; // the link's own Eb/N0
}

export type ShareMode = 'power' | 'time';

// A target's BER when the jammer serves k targets: power sharing gives each J/k all the time; time sharing gives each
// the full J for 1/k of the time (level 3's pulses, whole bits). By level 3's best duty, 0.7 ÷ average Eb/J0, time
// sharing wins when a link's Eb/J0 under the full jammer is above about 0.7 (−1.5 dB), power sharing below.
export function sharedBer(t: Target, k: number, mode: ShareMode): number {
  const ebN0 = undb(t.ebN0Db);
  const ebJ0Full = undb(t.gpDb - t.jsDb);
  if (k <= 0) return berBpskJammed(ebN0, Infinity);
  return mode === 'power' ? berBpskJammed(ebN0, k * ebJ0Full) : berPulsedBpsk(ebN0, k * ebJ0Full, 1 / k);
}

// Which of the chosen targets reach a BER goal under a mode.
export function shareOutcome(targets: Target[], chosen: number[], mode: ShareMode, goalBer: number): { ber: number; denied: boolean }[] {
  return targets.map((t, i) => {
    const ber = chosen.includes(i) ? sharedBer(t, chosen.length, mode) : sharedBer(t, 0, mode);
    return { ber, denied: ber >= goalBer };
  });
}

// --- Networks as targets -----------------------------------------------------------------------------------------

export interface NetNode extends Pt {
  name: string;
}

export interface NetLink {
  from: number; // transmitting node
  to: number; // receiving node
}

export interface Network {
  nodes: NetNode[];
  links: NetLink[];
  txW: number;
  heightM: number;
  gpDb: number;
  ebN0Db: number;
  freqMHz: number;
}

const station = (p: Pt, heightM: number, powerW: number): Station => ({ xKm: p.xKm, yKm: p.yKm, heightM, powerW, gainDbi: 0 });

// J/S at each link's receiver (two-ray paths), and whether the link's BER reaches the goal.
export function networkDenial(net: Network, jam: Pt & { powerW: number; heightM: number }, goalBer: number): { jsDb: number; ber: number; denied: boolean }[] {
  const two = { model: 'two-ray' as const };
  return net.links.map((l) => {
    const tx = station(net.nodes[l.from], net.heightM, net.txW);
    const rx = station(net.nodes[l.to], net.heightM, 0);
    const j = station(jam, jam.heightM, jam.powerW);
    const s = 10 * Math.log10(net.txW) - pathLossDb(net.freqMHz, tx, rx, two).totalDb;
    const jj = 10 * Math.log10(jam.powerW) - pathLossDb(net.freqMHz, j, rx, two).totalDb;
    const jsDb = jj - s;
    const ber = berBpskJammed(undb(net.ebN0Db), undb(net.gpDb - jsDb));
    return { jsDb, ber, denied: ber >= goalBer };
  });
}
