// Numbers behind the lesson figures: the 7-chip example with 4 bits, and the same signal received with noise.
import { createRng } from '../../../engine/rng';
import { mSequence } from '../../../engine/lab/pn';
import { gaussian } from '../../../engine/lab/signal';

export const BITS = [1, -1, -1, 1];
export const CHIPS_PER_BIT = 7;
export const NOISE_SD = 0.6;
export const NOISE_SEED = 5;

export interface SpreadingData {
  bits: number[];
  code: number[]; // the code repeated for every bit, one value per chip
  sent: number[]; // bit x code
}

export function spreadingData(): SpreadingData {
  const one = Array.from(mSequence(3));
  const code = BITS.flatMap(() => one);
  const sent = code.map((c, k) => c * BITS[Math.floor(k / CHIPS_PER_BIT)]);
  return { bits: BITS, code, sent };
}

export interface DespreadData extends SpreadingData {
  received: number[]; // sent + Gaussian noise
  product: number[]; // received x code
  sums: number[]; // per bit, the sum of its 7 product values
}

export function despreadData(seed = NOISE_SEED): DespreadData {
  const d = spreadingData();
  const g = gaussian(createRng(seed));
  const received = d.sent.map((v) => v + NOISE_SD * g());
  const product = received.map((v, k) => v * d.code[k]);
  const sums = BITS.map((_, i) => product.slice(i * CHIPS_PER_BIT, (i + 1) * CHIPS_PER_BIT).reduce((a, b) => a + b, 0));
  return { ...d, received, product, sums };
}
