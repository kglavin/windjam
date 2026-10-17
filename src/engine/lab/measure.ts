// Measurement tools for the Link lab instruments: FFT, spectra, autocorrelation, BER intervals, histograms.
import type { IQ } from './signal';

// In place iterative radix-2 FFT of (re, im). The inverse divides by n. Throws unless the length is a power of 2.
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (im.length !== n) throw new Error('fft: length mismatch');
  if (n < 1 || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of 2');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (sign * 2 * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k);
      const wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const j = i + half;
        const tr = re[j] * wr - im[j] * wi;
        const ti = re[j] * wi + im[j] * wr;
        re[j] = re[i] - tr;
        im[j] = im[i] - ti;
        re[i] += tr;
        im[i] += ti;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

// Smallest power of 2 that is at least n (1 for n <= 1).
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Welch PSD with a Hann window, fft-shifted so freq runs from -0.5 to just under 0.5 cycles per sample.
// Normalised so that the sum of psd equals the mean power of x. A short x is zero-padded to one segment.
export function welchPsd(x: IQ, nfft: number, overlap = 0.5): { freq: Float64Array; psd: Float64Array } {
  const len = x.re.length;
  const win = new Float64Array(nfft);
  let wss = 0;
  for (let i = 0; i < nfft; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft);
    wss += win[i] * win[i];
  }
  const step = Math.max(1, Math.round(nfft * (1 - overlap)));
  const acc = new Float64Array(nfft);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  let segs = 0;
  for (let start = 0; segs === 0 || start + nfft <= len; start += step) {
    for (let i = 0; i < nfft; i++) {
      const k = start + i;
      re[i] = k < len ? x.re[k] * win[i] : 0;
      im[i] = k < len ? x.im[k] * win[i] : 0;
    }
    fft(re, im);
    for (let i = 0; i < nfft; i++) acc[i] += re[i] * re[i] + im[i] * im[i];
    segs++;
  }
  const scale = 1 / (segs * nfft * wss);
  const freq = new Float64Array(nfft);
  const psd = new Float64Array(nfft);
  for (let i = 0; i < nfft; i++) {
    freq[i] = (i - nfft / 2) / nfft;
    psd[i] = acc[(i + nfft / 2) % nfft] * scale;
  }
  return { freq, psd };
}

// 10 log10 of each value, with values below floor raised to floor.
export function toDb(values: Float64Array, floor = 1e-30): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = 10 * Math.log10(Math.max(values[i], floor));
  return out;
}

// R(tau) = sum of x[n + tau] conj(x[n]) over [from, to), tau = 0..maxLag, via FFT, divided by R(0).
// Biased estimator: no 1/(len - tau) correction, so a triangle shows for a rectangular pulse.
export function autocorrelation(
  x: IQ,
  maxLag: number,
  from = 0,
  to = x.re.length,
): { re: Float64Array; im: Float64Array; mag: Float64Array } {
  const len = to - from;
  const n = nextPow2(2 * len);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < len; i++) {
    re[i] = x.re[from + i];
    im[i] = x.im[from + i];
  }
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft(re, im, true);
  const r0 = re[0];
  const norm = r0 > 0 ? 1 / r0 : 0;
  const outRe = new Float64Array(maxLag + 1);
  const outIm = new Float64Array(maxLag + 1);
  const mag = new Float64Array(maxLag + 1);
  for (let t = 0; t <= maxLag; t++) {
    if (t >= len) continue;
    outRe[t] = re[t] * norm;
    outIm[t] = im[t] * norm;
    mag[t] = Math.hypot(outRe[t], outIm[t]);
  }
  return { re: outRe, im: outIm, mag };
}

// Mean over non-overlapping windows of |R_w(tau)|^2, each R_w normalised by its own R(0), tau = 0..maxLag.
// Under random data the mean of R at the code period is near 0 but its square is not,
// so this peaks at a short code's period where the plain autocorrelation does not.
export function fluctuation(x: IQ, windowLen: number, maxLag: number, from = 0, to = x.re.length): Float64Array {
  const out = new Float64Array(maxLag + 1);
  const count = Math.floor((to - from) / windowLen);
  if (count < 1) return out;
  for (let w = 0; w < count; w++) {
    const a = from + w * windowLen;
    const { mag } = autocorrelation(x, maxLag, a, a + windowLen);
    for (let t = 0; t <= maxLag; t++) out[t] += mag[t] * mag[t];
  }
  for (let t = 0; t <= maxLag; t++) out[t] /= count;
  return out;
}

// Wilson score interval for errors out of n trials. n = 0 gives { ber: NaN, lo: 0, hi: 1 }.
export function wilson(errors: number, n: number, z = 1.96): { ber: number; lo: number; hi: number } {
  if (n === 0) return { ber: NaN, lo: 0, hi: 1 };
  const p = errors / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { ber: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

// Histogram with `bins` equal bins over [lo, hi). Values outside are clamped into the end bins.
export function histogram(
  values: ArrayLike<number>,
  bins: number,
  lo: number,
  hi: number,
): { edges: Float64Array; counts: Uint32Array } {
  const edges = new Float64Array(bins + 1);
  for (let i = 0; i <= bins; i++) edges[i] = lo + ((hi - lo) * i) / bins;
  const counts = new Uint32Array(bins);
  for (let i = 0; i < values.length; i++) {
    const b = Math.floor(((values[i] - lo) / (hi - lo)) * bins);
    counts[Math.min(bins - 1, Math.max(0, b))]++;
  }
  return { edges, counts };
}
