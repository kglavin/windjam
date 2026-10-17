import { useMemo } from 'react';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from './plot';

export interface CurvePoint {
  jsDb: number;
  ber: number;
  lo: number;
  hi: number;
  label?: string;
  kind?: string;
}

interface Props {
  points: CurvePoint[];
  theory: { label: string; f: (jsDb: number) => number }[];
  predictions?: { jsDb: number; ber: number }[];
  xRange?: [number, number];
}

const LOG_LO = Math.log10(1e-5);
const LOG_HI = Math.log10(0.5);
const COLOURS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

// BER against J/S: measured points with intervals, theory lines, prediction markers and the jammer goal.
export function CurvePlot({ points, theory, predictions = [], xRange = [-10, 30] }: Props) {
  const [x0, x1] = xRange;
  const fx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * INNER_W;
  const fy = (b: number) => PAD.t + ((LOG_HI - Math.log10(Math.max(1e-5, Math.min(0.5, b)))) / (LOG_HI - LOG_LO)) * INNER_H;
  const yTicks = [1e-5, 1e-4, 1e-3, 1e-2, 1e-1];
  const lines = useMemo(
    () =>
      theory.map((t) => {
        const xs: number[] = [];
        for (let v = x0; v <= x1 + 1e-9; v += 0.25) xs.push(v);
        const ys = xs.map((v) => t.f(v));
        return { label: t.label, xs, ys };
      }),
    [theory, x0, x1],
  );
  const kinds = useMemo(() => Array.from(new Set(points.map((p) => p.kind ?? 'measured'))), [points]);
  const kindClass = (k: string) => COLOURS[(theory.length + kinds.indexOf(k)) % COLOURS.length];

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>BER against J/S</h3>
        <span className="inst-legend">
          {lines.map((l, i) => (
            <span key={l.label}><i className={`sw ${COLOURS[i % COLOURS.length]}`} />{l.label} </span>
          ))}
          {kinds.map((k) => (
            <span key={k}><i className={`dot ${kindClass(k)}`} />{k} </span>
          ))}
          {predictions.length > 0 && <span><i className="dot hollow" />prediction</span>}
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="BER against J/S">
        <Axes
          xTicks={niceTicks(x0, x1, 8)}
          yTicks={yTicks}
          fx={fx}
          fy={fy}
          xLabel="J/S (dB)"
          yLabel="BER"
          yFormat={(v) => v.toExponential(0).replace('e-', 'e-')}
        />
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(0.1)} y2={fy(0.1)} className="inst-goal" />
        <text x={PAD.l + INNER_W - 4} y={fy(0.1) - 3} textAnchor="end" className="inst-axis">jammer goal</text>
        <clipPath id="curve-clip">
          <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} />
        </clipPath>
        <g clipPath="url(#curve-clip)">
          {lines.map((l, i) => (
            <polyline
              key={l.label}
              points={poly(l.xs.length, (k) => fx(l.xs[k]), (k) => fy(l.ys[k]))}
              className={`inst-line ${COLOURS[i % COLOURS.length]}`}
            />
          ))}
        </g>
        {points.map((p, i) => {
          const c = kindClass(p.kind ?? 'measured');
          return (
            <g key={i} className={c}>
              <line x1={fx(p.jsDb)} x2={fx(p.jsDb)} y1={fy(p.lo)} y2={fy(p.hi)} className="inst-bar-line" />
              <circle cx={fx(p.jsDb)} cy={fy(p.ber)} r={3.5} className="inst-pt">
                {p.label && <title>{p.label}</title>}
              </circle>
            </g>
          );
        })}
        {predictions.map((p, i) => (
          <circle key={i} cx={fx(p.jsDb)} cy={fy(p.ber)} r={4.5} className="inst-pred" />
        ))}
      </svg>
    </section>
  );
}
