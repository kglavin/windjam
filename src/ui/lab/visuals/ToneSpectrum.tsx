import { EXAMPLE } from '../../../engine/lab/levels';
import { Spectrum } from '../instruments/Spectrum';
import { knownCapture } from '../knownCapture';

export const TONE_SPECTRUM_KHZ = 100;
export const TONE_SPECTRUM_JS_DB = 10;

// The example link plus a tone at +100 kHz and J/S 10 dB, seen by a monitoring receiver with plenty of signal.
export function ToneSpectrum() {
  const fTc = TONE_SPECTRUM_KHZ / (EXAMPLE.chipRateMcps * 1000);
  const shot = knownCapture(EXAMPLE, 20, TONE_SPECTRUM_JS_DB, { kind: 'tone', fTc, phase: 0 });
  return (
    <Spectrum
      x={shot.rx}
      sampleRateHz={shot.sampleRateHz}
      title={`Spectrum: example link plus a tone at +${TONE_SPECTRUM_KHZ} kHz, J/S = ${TONE_SPECTRUM_JS_DB} dB`}
      annotations={[{ xMHz: TONE_SPECTRUM_KHZ / 1000, label: 'tone' }]}
    />
  );
}
