import { BITS, CHIPS_PER_BIT, despreadData } from './data';
import { ROW_H, TimeAxis, VW, WaveRow, axisY, rowTop, tx } from './wave';

// The receiver: received chips (with noise), the code, received x code, and the sum of each bit's 7 chips.
export function Despread() {
  const d = despreadData();
  const boxTop = rowTop(3) + 6;
  const H = axisY(4) + 34;
  return (
    <section className="inst-panel">
      <svg className="inst-svg" viewBox={`0 0 ${VW} ${H}`} role="img" aria-label="Despreading: multiply by the code and add up each bit">
        <TimeAxis rows={4} />
        <WaveRow label="Received + noise" values={d.received} durUs={1} row={0} vmax={2.5} cls="c2" />
        <WaveRow label="Code" values={d.code} durUs={1} row={1} cls="c3" />
        <WaveRow label="Received × code" values={d.product} durUs={1} row={2} vmax={2.5} cls="c1" />
        <text x={4} y={boxTop + 22} className="vis-label">Sum of 7 chips</text>
        {BITS.map((_, i) => (
          <g key={i}>
            <rect
              x={tx(i * CHIPS_PER_BIT) + 3}
              y={boxTop}
              width={tx(CHIPS_PER_BIT) - tx(0) - 6}
              height={ROW_H - 18}
              rx={4}
              className="vis-box"
            />
            <text x={(tx(i * CHIPS_PER_BIT) + tx((i + 1) * CHIPS_PER_BIT)) / 2} y={boxTop + 24} textAnchor="middle" className="vis-sum">
              {d.sums[i] >= 0 ? '+' : '−'}{Math.abs(d.sums[i]).toFixed(1)}
            </text>
          </g>
        ))}
        <text x={(tx(0) + tx(28)) / 2} y={boxTop + ROW_H - 8} textAnchor="middle" className="inst-axis">
          the sum is the decision: positive means +1
        </text>
      </svg>
    </section>
  );
}
