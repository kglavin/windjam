import { INNER_H, INNER_W, PAD, PH, fmt } from './plot';

interface Props {
  xTicks: number[];
  yTicks: number[];
  fx: (v: number) => number;
  fy: (v: number) => number;
  xLabel: string;
  yLabel: string;
  yFormat?: (v: number) => string;
}

// Frame, grid, tick labels and axis titles shared by the plots.
export function Axes({ xTicks, yTicks, fx, fy, xLabel, yLabel, yFormat = fmt }: Props) {
  return (
    <g>
      <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={fx(t)} x2={fx(t)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-grid" />
          <text x={fx(t)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{fmt(t)}</text>
        </g>
      ))}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(t)} y2={fy(t)} className="inst-grid" />
          <text x={PAD.l - 4} y={fy(t) + 3} textAnchor="end" className="inst-axis">{yFormat(t)}</text>
        </g>
      ))}
      <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">{xLabel}</text>
      <text x={10} y={PAD.t + INNER_H / 2} textAnchor="middle" className="inst-axis" transform={`rotate(-90 10 ${PAD.t + INNER_H / 2})`}>{yLabel}</text>
    </g>
  );
}
