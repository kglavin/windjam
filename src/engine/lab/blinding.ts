// Theory for a receiver blinded by overload pulses, on a link that sends 3 copies per bit and votes. The pulses
// are aligned to copy boundaries, so the blind pattern is deterministic: it repeats every `period` copies.
// While blind a copy decides +1 whatever was sent. On random data a bit with at least two blind copies is then
// wrong half the time; with one blind copy the two clean ones outvote it unless one of them is wrong too.
import { berBpsk, berRepetitionMajority } from './theory';

// Which copies of one period are blind: the pulse copies and the recovery copies after them.
export function blindCopies(periodCopies: number, pulseCopies: number, recoveryCopies: number): boolean[] {
  return Array.from({ length: periodCopies }, (_, k) => k < pulseCopies + recoveryCopies);
}

// Share of time the receiver is blind.
export const blindFraction = (periodCopies: number, pulseCopies: number, recoveryCopies: number): number =>
  Math.min(1, (pulseCopies + recoveryCopies) / periodCopies);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// Exact share of bits with 0, 1, 2 and 3 blind copies, counted over lcm(period, 3) copies.
export function blindBitShares(periodCopies: number, pulseCopies: number, recoveryCopies: number): number[] {
  const blind = blindCopies(periodCopies, pulseCopies, recoveryCopies);
  const span = (periodCopies * 3) / gcd(periodCopies, 3);
  const counts = [0, 0, 0, 0];
  for (let b = 0; b < span / 3; b++) {
    let k = 0;
    for (let c = 0; c < 3; c++) if (blind[(3 * b + c) % periodCopies]) k++;
    counts[k]++;
  }
  return counts.map((c) => (3 * c) / span);
}

// BER of the blinded link: p is the copy BER of the clean link.
export function berBlinded(p: number, periodCopies: number, pulseCopies: number, recoveryCopies: number): number {
  const [s0, s1, s2, s3] = blindBitShares(periodCopies, pulseCopies, recoveryCopies);
  // One blind copy deciding +1: wrong bit when the data bit is +1 only if both clean copies are wrong, when -1 if at least one is. Average: p.
  return s0 * berRepetitionMajority(p, 3) + s1 * p + 0.5 * (s2 + s3);
}

// The last blind copy of a run is only partly blind when the last chip of the pulse itself did not overload the
// front end, with probability missProb: the recovery then ends a few chips early and that copy decides on the chips it
// still has, correctly. A run of recoveryCopies is then one copy shorter. Pulses well above the overload make this small.
export const berBlindedAt = (ebN0: number, periodCopies: number, pulseCopies: number, recoveryCopies: number, missProb = 0): number => {
  const p = berBpsk(ebN0);
  const full = berBlinded(p, periodCopies, pulseCopies, recoveryCopies);
  if (missProb === 0 || pulseCopies + recoveryCopies <= 1) return full;
  return (1 - missProb) * full + missProb * berBlinded(p, periodCopies, pulseCopies, recoveryCopies - 1);
};

// Chance that a chip of the pulse does not reach the overload: pulse noise has exponential power with mean peakPower.
export const overloadMissProb = (overloadPower: number, peakPower: number): number => 1 - Math.exp(-overloadPower / peakPower);
