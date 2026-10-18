// Level 8 (docs/design-level-8.md): a packet receiver that must acquire the code before it can despread. A packet is
// a preamble of P code periods, then B payload bits of n chips each. The receiver tests code phases one at a time,
// one code period per test (a sliding correlator), and locks on the first phase whose correlation passes a threshold
// set for a false-alarm probability per test. A false lock, or no lock within the preamble, loses the packet.
import { createRng } from '../rng';
import { gaussian } from '../detect';
import { wilson } from './measure';
import { berBpskJammed, qfunc, undb } from './theory';

export interface PacketLink {
  n: number; // chips per code period, per bit, and per search test
  preamblePeriods: number; // P
  payloadBits: number; // B
  chipSnrDb: number; // Ec/N0 at the receiver
  pfaCell: number; // false-alarm probability of one test on a wrong phase
}

// A broadband jammer on during part of the packet; jsDb is J/S over the chip band, so Ec/J0 = 1 ÷ J/S.
export interface SyncJammer {
  on: 'none' | 'preamble' | 'payload' | 'both';
  jsDb: number;
}

const jamsPreamble = (j: SyncJammer) => j.on === 'preamble' || j.on === 'both';
const jamsPayload = (j: SyncJammer) => j.on === 'payload' || j.on === 'both';

// The threshold on the normalised correlation (noise only: standard normal) for a false-alarm probability.
export function thresholdFor(pfa: number): number {
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (qfunc(mid) > pfa) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Ec/(N0 + J0) as a ratio.
function chipSnr(link: PacketLink, jsDb: number | undefined): number {
  const n0 = 1 / undb(link.chipSnrDb);
  const j0 = jsDb === undefined ? 0 : undb(jsDb);
  return 1 / (n0 + j0);
}

// The normalised correlation of the right phase over one code period has mean √(2·n·Ec/(N0+J0)), noise 1.
export const cellMean = (link: PacketLink, jsDb?: number): number => Math.sqrt(2 * link.n * chipSnr(link, jsDb));

// Detection probability of one test on the right phase.
export const detectProb = (link: PacketLink, jsDb?: number): number => qfunc(thresholdFor(link.pfaCell) - cellMean(link, jsDb));

// The probability that the search locks on the right phase within the preamble: the start phase is random, wrong
// phases false-alarm with pfaCell, and the right one is detected with detectProb each time it comes round.
export function acquireProb(link: PacketLink, j: SyncJammer = { on: 'none', jsDb: 0 }): number {
  const pd = detectProb(link, jamsPreamble(j) ? j.jsDb : undefined);
  const n = link.n;
  let total = 0;
  for (let k = 0; k < n; k++) {
    let searching = 1;
    let ok = 0;
    for (let t = 0; t < link.preamblePeriods; t++) {
      if (t % n === k) {
        ok += searching * pd;
        searching *= 1 - pd;
      } else {
        searching *= 1 - link.pfaCell;
      }
    }
    total += ok / n;
  }
  return total;
}

// The payload's bit error rate once locked.
export const payloadBer = (link: PacketLink, j: SyncJammer = { on: 'none', jsDb: 0 }): number =>
  berBpskJammed(link.n * undb(link.chipSnrDb), jamsPayload(j) ? link.n / undb(j.jsDb) : Infinity);

// Packet error rate: no lock, or a lock and at least one wrong payload bit.
export function packetErrorRate(link: PacketLink, j: SyncJammer = { on: 'none', jsDb: 0 }): number {
  return 1 - acquireProb(link, j) * (1 - payloadBer(link, j)) ** link.payloadBits;
}

// The mean number of tests to lock with no jammer and no false alarms: (n + 1) ÷ 2 at Pd = 1, more as Pd falls.
export const meanSearchTests = (link: PacketLink, jsDb?: number): number => {
  const pd = detectProb(link, jsDb);
  return (link.n - 1) / 2 + 1 + ((1 - pd) / pd) * link.n;
};

// Jammer energy per packet, in units of the signal's energy per chip: J/S × chips the jammer is on.
export function jammerEnergy(link: PacketLink, j: SyncJammer): number {
  const chips = (jamsPreamble(j) ? link.preamblePeriods * link.n : 0) + (jamsPayload(j) ? link.payloadBits * link.n : 0);
  return undb(j.jsDb) * chips;
}

export interface PacketRecord {
  locked: boolean; // locked on the right phase
  falseLock: boolean;
  testsUsed: number;
  bitErrors: number;
}

export interface PacketRunResult {
  packets: number;
  lost: number;
  per: number;
  perLo: number;
  perHi: number;
  bits: number;
  errors: number;
  ber: number;
  records: PacketRecord[]; // the first few, for the timeline
}

// Monte Carlo: packets until `maxLost` lost or `maxPackets` sent. A lost packet's bits are guessed: each wrong half
// the time.
export function runPackets(link: PacketLink, j: SyncJammer, seed: number, maxPackets = 4000, maxLost = 200, keep = 12): PacketRunResult {
  const rng = createRng(seed ^ 0x2c1b3c6d);
  const thr = thresholdFor(link.pfaCell);
  const mean = cellMean(link, jamsPreamble(j) ? j.jsDb : undefined);
  const q = payloadBer(link, j);
  let packets = 0;
  let lost = 0;
  let bits = 0;
  let errors = 0;
  const records: PacketRecord[] = [];
  while (packets < maxPackets && lost < maxLost) {
    const k = Math.floor(rng() * link.n);
    let locked = false;
    let falseLock = false;
    let t = 0;
    for (; t < link.preamblePeriods; t++) {
      const right = t % link.n === k;
      const z = (right ? mean : 0) + gaussian(rng);
      if (z > thr) {
        locked = right;
        falseLock = !right;
        t++;
        break;
      }
    }
    let e = 0;
    for (let b = 0; b < link.payloadBits; b++) if (rng() < (locked ? q : 0.5)) e++;
    packets++;
    bits += link.payloadBits;
    errors += e;
    if (!locked || e > 0) lost++;
    if (records.length < keep) records.push({ locked, falseLock, testsUsed: t, bitErrors: e });
  }
  const w = wilson(lost, packets);
  const wb = wilson(errors, bits);
  return { packets, lost, per: w.ber, perLo: w.lo, perHi: w.hi, bits, errors, ber: wb.ber, records };
}
