// Clean captures of the known (example and practice) links, for the level's worked examples and practice.
import { type Capture, capture } from '../../engine/lab/capture';
import type { LinkParams } from '../../engine/lab/dsss';
import type { JammerSpec } from '../../engine/lab/jammers';
import type { KnownLink } from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { undb } from '../../engine/lab/theory';

export const KNOWN_S = 4;
const N_BITS = 1500;
const SEED = 11;
export const KNOWN_CHIP_SNR_DB = 20;

export interface KnownShot extends Capture {
  sampleRateHz: number;
  preambleSamples: number;
}

const cache = new Map<string, KnownShot>();

// One code period per bit, 32 preamble periods, no carrier offset, chip SNR as given (Eb/N0 = chip SNR * Gp).
// jsDb adds a jammer at that J/S: broadband noise unless spec says otherwise.
export function knownCapture(k: KnownLink, chipSnrDb = KNOWN_CHIP_SNR_DB, jsDb?: number, spec: JammerSpec = { kind: 'bbn' }): KnownShot {
  const key = `${k.degree}:${k.chipRateMcps}:${chipSnrDb}:${jsDb ?? ''}:${JSON.stringify(spec)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const code = mSequence(k.degree);
  const link: LinkParams = {
    code,
    chipsPerBit: code.length,
    repetition: 1,
    preamblePeriods: 32,
    carrierCyclesPerChip: 0,
    ebN0: undb(chipSnrDb) * code.length,
  };
  const jam = jsDb === undefined ? undefined : { spec, js: undb(jsDb) };
  const c = capture({ link, s: KNOWN_S, nBits: N_BITS, seed: SEED, jammer: jam });
  const shot = { ...c, sampleRateHz: k.chipRateMcps * 1e6 * KNOWN_S, preambleSamples: c.frame.preambleChips * c.s };
  cache.set(key, shot);
  return shot;
}
