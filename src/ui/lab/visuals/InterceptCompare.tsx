import { LEVEL_1 } from '../../../engine/lab/levels';
import { Spectrum } from '../instruments/Spectrum';
import { knownCapture } from '../knownCapture';

// The example link seen from far away (flat noise) and from close by (the hump stands out).
export function InterceptCompare() {
  const far = knownCapture(LEVEL_1.links.example, -15);
  const close = knownCapture(LEVEL_1.links.example, 20);
  return (
    <div className="vis-pair">
      <Spectrum x={far.rx} sampleRateHz={far.sampleRateHz} title="Far: chip SNR −15 dB" />
      <Spectrum x={close.rx} sampleRateHz={close.sampleRateHz} title="Close: chip SNR +20 dB" />
    </div>
  );
}
