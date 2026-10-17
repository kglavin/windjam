import { useMemo } from 'react';
import { berTable } from '../../../engine/lab/levels';
import { berBpsk, undb } from '../../../engine/lab/theory';
import { Axes } from '../instruments/Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from '../instruments/plot';

const X0 = -4;
const X1 = 12;
const LOG_LO = Math.log10(1e-6);
const LOG_HI = Math.log10(0.5);

// BPSK bit error rate against Eb/J0 on a log axis, the table's points marked, and the table beside it.
// markDb draws a vertical line at one link's Eb/J0; marks draw labelled lines and points at fixed Eb/J0 values.
export function BerCurve({ markDb, marks = [] }: { markDb?: number; marks?: { db: number; label: string }[] }) {
  const fx = (v: number) => PAD.l + ((v - X0) / (X1 - X0)) * INNER_W;
  const fy = (b: number) => PAD.t + ((LOG_HI - Math.log10(Math.max(1e-6, Math.min(0.5, b)))) / (LOG_HI - LOG_LO)) * INNER_H;
  const rows = useMemo(berTable, []);
  const xs = useMemo(() => {
    const out: number[] = [];
    for (let v = X0; v <= X1 + 1e-9; v += 0.2) out.push(v);
    return out;
  }, []);
  const ys = xs.map((v) => berBpsk(undb(v)));
  return (
    <section className="inst-panel vis-curve">
      <header className="inst-head">
        <h3>Bit error rate against Eb/J0</h3>
      </header>
      <div className="vis-curve-body">
        <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Bit error rate against Eb/J0">
          <Axes
            xTicks={niceTicks(X0, X1, 8)}
            yTicks={[1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1]}
            fx={fx}
            fy={fy}
            xLabel="Eb/J0 (dB)"
            yLabel="BER"
            yFormat={(v) => v.toExponential(0)}
          />
          <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(ys[i]))} className="inst-line c1" />
          {markDb !== undefined && markDb >= X0 && markDb <= X1 && (
            <g>
              <line x1={fx(markDb)} x2={fx(markDb)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />
              <text x={fx(markDb) + 4} y={PAD.t + 10} className="inst-axis">this link: {Number(markDb.toFixed(1))} dB</text>
            </g>
          )}
          {marks
            .filter((m) => m.db >= X0 && m.db <= X1)
            .map((m, i) => (
              <g key={m.label}>
                <line x1={fx(m.db)} x2={fx(m.db)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />
                <circle cx={fx(m.db)} cy={fy(berBpsk(undb(m.db)))} r={4.5} className="inst-pred" />
                <text
                  x={fx(m.db) + (m.db > (X0 + X1) / 2 ? -4 : 4)}
                  y={PAD.t + 10 + i * 12}
                  textAnchor={m.db > (X0 + X1) / 2 ? 'end' : 'start'}
                  className="inst-axis"
                >
                  {m.label}
                </text>
              </g>
            ))}
          <g className="c2">
            {rows.map((r) => (
              <circle key={r.db} cx={fx(r.db)} cy={fy(r.ber)} r={3.5} className="inst-pt" />
            ))}
          </g>
        </svg>
        <table className="vis-table vis-ber-table">
          <thead>
            <tr>
              <th>Eb/J0 (dB)</th>
              <th>BER</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.db}>
                <td>{r.db}</td>
                <td>{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

