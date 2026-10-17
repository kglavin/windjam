import type { Scene } from '../../engine/lab/scene';

// sceneBudget gives at the receiver: S -97.0 dBm, J -94.6 dBm, N -93.7 dBm, Eb/N0 14.8 dB, J/S +2.4 dB,
// Eb/J0 15.7 dB, Eb/(N0+J0) 12.2 dB, processing gain 18.1 dB (64).
// The intercept is 43.9 km from the transmitter (two-ray): chip SNR -15.0 dB, so the signal is invisible
// in its spectrum. Chip SNR reaches +5 dB when the intercept is within about 14 km of the transmitter.
export const DEFAULT_SCENE: Scene = {
  freqMHz: 50,
  tx: { xKm: 0, yKm: 0, heightM: 10, powerW: 5, gainDbi: 0 },
  rx: { xKm: 10, yKm: 0, heightM: 2, powerW: 0, gainDbi: 0 },
  jammer: { xKm: 14, yKm: 18, heightM: 10, powerW: 100, gainDbi: 0 },
  intercept: { xKm: 38, yKm: -22, heightM: 10, powerW: 0, gainDbi: 0 },
  interceptPaths: { fromTx: { model: 'two-ray' }, fromJammer: { model: 'two-ray' } },
  rxAntenna: 'omni',
  txPath: { model: 'two-ray' },
  jamPath: { model: 'two-ray' },
  noiseFigureDb: 6,
  noiseEnv: 'rural',
  chipRateMcps: 1,
  dataRateKbps: 15.625,
};
