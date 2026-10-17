import { useMemo } from 'react';
import { EXAMPLE } from '../../../engine/lab/levels';
import { toDb, welchPsd } from '../../../engine/lab/measure';
import { Spectrum } from '../instruments/Spectrum';
import { knownCapture } from '../knownCapture';

// The example link plus broadband noise, seen by a monitoring receiver with plenty of signal: J/S 0 dB and +10 dB
// on the same scale.
export function JammedSpectra() {
  const { a, b, yRange } = useMemo(() => {
    const a = knownCapture(EXAMPLE, 20, 0);
    const b = knownCapture(EXAMPLE, 20, 10);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of [a, b]) {
      for (const v of toDb(welchPsd(c.rx, 128).psd)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const top = Math.ceil(hi / 10) * 10 + 10;
    return { a, b, yRange: [Math.max(Math.floor(lo / 10) * 10, top - 90), top] as [number, number] };
  }, []);
  return (
    <div className="vis-pair">
      <Spectrum x={a.rx} sampleRateHz={a.sampleRateHz} title="J/S = 0 dB" yRange={yRange} />
      <Spectrum x={b.rx} sampleRateHz={b.sampleRateHz} title="J/S = +10 dB" yRange={yRange} />
    </div>
  );
}
