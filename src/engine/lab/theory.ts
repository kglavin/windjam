// Closed-form BER theory for the Link lab. All ratios are linear unless a name ends in Db.
// Spread bandwidth Wss = Rc, so broadband noise gives J0 = PJ/Rc and ebJ0 = gp / js.

// Linear ratio to dB.
export const db = (x: number): number => 10 * Math.log10(x);

// dB to linear ratio.
export const undb = (d: number): number => 10 ** (d / 10);

// Complementary error function, Numerical Recipes erfcc (fractional error < 1.2e-7).
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

// Gaussian tail Q(x) = 0.5 erfc(x / sqrt 2), valid for negative x too.
export const qfunc = (x: number): number => 0.5 * erfc(x / Math.SQRT2);

// Coherent BPSK in AWGN.
export const berBpsk = (ebN0: number): number => qfunc(Math.sqrt(2 * ebN0));

// Noise and jamming combined as Eb/(N0+J0).
const combine = (ebN0: number, ebJ0: number): number => 1 / (1 / ebN0 + 1 / ebJ0);

// BPSK with broadband Gaussian jamming added to the noise.
export const berBpskJammed = (ebN0: number, ebJ0: number): number => berBpsk(combine(ebN0, ebJ0));

// Eb/J0 from processing gain and average jammer-to-signal ratio.
export const ebJ0FromJs = (gp: number, js: number): number => gp / js;

// BPSK against pulsed noise of duty rho and fixed average J0, each pulse covering whole bits.
export function berPulsedBpsk(ebN0: number, ebJ0: number, rho: number): number {
  return (1 - rho) * berBpsk(ebN0) + rho * qfunc(Math.sqrt(2 * combine(ebN0, rho * ebJ0)));
}

// Duty rho in (0, 1] that maximises the pulsed BPSK BER, by log grid plus golden-section refinement.
export function worstRhoBpsk(ebN0: number, ebJ0: number): { rho: number; ber: number } {
  const f = (lr: number): number => berPulsedBpsk(ebN0, ebJ0, Math.exp(lr));
  const lo = Math.log(1e-12);
  const n = 600;
  const step = -lo / n;
  let bestI = 0;
  let bestV = -1;
  for (let i = 0; i <= n; i++) {
    const v = f(lo + i * step);
    if (v > bestV) {
      bestV = v;
      bestI = i;
    }
  }
  let a = lo + Math.max(0, bestI - 1) * step;
  let b = Math.min(0, lo + (bestI + 1) * step);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < 80; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  const lr = (a + b) / 2;
  let rho = Math.exp(lr);
  let ber = berPulsedBpsk(ebN0, ebJ0, rho);
  const atOne = berPulsedBpsk(ebN0, ebJ0, 1);
  if (atOne >= ber * (1 - 1e-9)) {
    rho = 1;
    ber = atOne;
  }
  return { rho, ber };
}

// Noncoherent BFSK in AWGN, linear Eb/N0.
export const berNoncoherentBfskLin = (ebN0: number): number => 0.5 * Math.exp(-ebN0 / 2);

// Frequency hopping noncoherent BFSK against partial-band noise of fraction rho.
export function berPartialBandBfsk(ebN0: number, ebJ0: number, rho: number): number {
  return (1 - rho) * berNoncoherentBfskLin(ebN0) + rho * 0.5 * Math.exp(-0.5 * combine(ebN0, rho * ebJ0));
}

// Worst-case partial-band fraction for BFSK with N0 neglected (closed form).
export function worstRhoBfsk(ebJ0: number): { rho: number; ber: number } {
  if (ebJ0 >= 2) return { rho: 2 / ebJ0, ber: Math.exp(-1) / ebJ0 };
  return { rho: 1, ber: 0.5 * Math.exp(-ebJ0 / 2) };
}

// Course notes formula (rho/2) exp(-rho Eb/(N0+J0)), shown for comparison only (design note section 2).
export function berPartialBandNotes(ebN0: number, ebJ0: number, rho: number): number {
  return (rho / 2) * Math.exp(-rho * combine(ebN0, ebJ0));
}

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

// CW tone against a long code, Gaussian approximation: broadband noise of power js sinc^2(fTc). A tone off the
// carrier turns through every phase within a bit, so a set phase counts only at fTc = 0: power 2 js cos^2(phi).
export function berToneLongCode(ebN0: number, gp: number, js: number, fTc = 0, phase?: number): number {
  const s2 = sinc(fTc) ** 2;
  const power = phase === undefined || fTc !== 0 ? js * s2 : 2 * js * Math.cos(phase) ** 2;
  return berBpskJammed(ebN0, power === 0 ? Infinity : gp / power);
}

// CW tone against a short code spanning one bit: exact bias per bit, averaged over phase when it varies between bits.
export function berToneShortCode(ebN0: number, js: number, code: ArrayLike<number>, fTc: number, phase?: number): number {
  if (!Number.isFinite(ebN0)) throw new Error('berToneShortCode needs a finite ebN0');
  const n = code.length;
  let re = 0;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const arg = 2 * Math.PI * fTc * (k + 0.5);
    re += code[k] * Math.cos(arg);
    im += code[k] * Math.sin(arg);
  }
  const amp = (Math.sqrt(js) * sinc(fTc)) / n;
  const a = Math.sqrt(2 * ebN0);
  const berAt = (phi: number): number => {
    // Re(e^{j phi} (re + j im)) = re cos phi - im sin phi
    const i = amp * (re * Math.cos(phi) - im * Math.sin(phi));
    return 0.5 * (qfunc(a * (1 + i)) + qfunc(a * (1 - i)));
  };
  const fn = fTc * n;
  if (phase !== undefined && Math.abs(fn - Math.round(fn)) < 1e-9) return berAt(phase);
  const m = 256;
  let sum = 0;
  for (let q = 0; q < m; q++) sum += berAt(((q + 0.5) * 2 * Math.PI) / m);
  return sum / m;
}

// BER after majority decoding of r (odd) independent copies, each with bit error p.
export function berRepetitionMajority(p: number, r: number): number {
  let sum = 0;
  let c = 1;
  for (let k = 0; k <= r; k++) {
    if (k > 0) c = (c * (r - k + 1)) / k;
    if (k >= (r + 1) / 2) sum += c * p ** k * (1 - p) ** (r - k);
  }
  return sum;
}

// J/S in dB where an increasing BER function crosses target, to 0.01 dB. Infinity if never, -Infinity if already above at loDb.
export function jsForBer(berOfJsDb: (jsDb: number) => number, target: number, loDb = -40, hiDb = 60): number {
  if (berOfJsDb(loDb) >= target) return -Infinity;
  if (berOfJsDb(hiDb) < target) return Infinity;
  let lo = loDb;
  let hi = hiDb;
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (berOfJsDb(mid) >= target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
