// Receiver front end for the Link lab: Rapp soft limiter and ADC clip (design section 4.2).
import { type IQ, iq } from './signal';

// Rapp AM/AM soft limiter on the complex envelope, phase preserved.
export function rapp(x: IQ, saturation: number, p = 2): IQ {
  const out = iq(x.re.length);
  for (let i = 0; i < x.re.length; i++) {
    const r = x.re[i];
    const m = x.im[i];
    const u = Math.hypot(r, m) / saturation;
    const g = (1 + u ** (2 * p)) ** (-1 / (2 * p));
    out.re[i] = r * g;
    out.im[i] = m * g;
  }
  return out;
}

// Saturation amplitude A at which an input of amplitude p1dbAmplitude is compressed by exactly 1 dB.
export function rappSaturationForP1db(p1dbAmplitude: number, p = 2): number {
  const u = (10 ** (p / 10) - 1) ** (1 / (2 * p));
  return p1dbAmplitude / u;
}

// Clips I and Q independently to +-fullScale, with the share of samples where either component clipped.
export function adcClip(x: IQ, fullScale: number): { out: IQ; clippedFraction: number } {
  const n = x.re.length;
  const out = iq(n);
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const r = x.re[i];
    const m = x.im[i];
    const cr = Math.abs(r) > fullScale;
    const cm = Math.abs(m) > fullScale;
    if (cr || cm) clipped++;
    out.re[i] = cr ? Math.sign(r) * fullScale : r;
    out.im[i] = cm ? Math.sign(m) * fullScale : m;
  }
  return { out, clippedFraction: n === 0 ? 0 : clipped / n };
}

// p1dbPower is the input power (signal power = 1) at which the limiter is 1 dB compressed.
export interface FrontEndConfig {
  p1dbPower: number;
  p?: number;
  adcFullScale: number;
}

// Rapp limiter then ADC clip. compressedFraction is the share of input samples with |x|^2 >= p1dbPower.
export function frontEnd(
  x: IQ,
  cfg: FrontEndConfig,
): { out: IQ; clippedFraction: number; compressedFraction: number } {
  const p = cfg.p ?? 2;
  let compressed = 0;
  for (let i = 0; i < x.re.length; i++) {
    if (x.re[i] * x.re[i] + x.im[i] * x.im[i] >= cfg.p1dbPower) compressed++;
  }
  const limited = rapp(x, rappSaturationForP1db(Math.sqrt(cfg.p1dbPower), p), p);
  const { out, clippedFraction } = adcClip(limited, cfg.adcFullScale);
  return { out, clippedFraction, compressedFraction: x.re.length === 0 ? 0 : compressed / x.re.length };
}
