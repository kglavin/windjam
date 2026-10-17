import { BITS, CHIPS_PER_BIT, spreadingData } from './data';
import { TimeAxis, VW, WaveRow, axisY } from './wave';

// Bits, the code, and what is sent (bit x code) for 4 bits of the 7-chip example.
export function Spreading() {
  const d = spreadingData();
  const H = axisY(3) + 34;
  return (
    <section className="inst-panel">
      <svg className="inst-svg" viewBox={`0 0 ${VW} ${H}`} role="img" aria-label="Bits multiplied by the code give the chips sent">
        <TimeAxis rows={3} />
        <WaveRow label="Bits" values={BITS} durUs={CHIPS_PER_BIT} row={0} cls="c1" />
        <WaveRow label="Code" values={d.code} durUs={1} row={1} cls="c3" />
        <WaveRow label="Sent = bit × code" values={d.sent} durUs={1} row={2} cls="c2" />
      </svg>
    </section>
  );
}
