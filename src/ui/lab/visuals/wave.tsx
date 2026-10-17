// Shared drawing for the lesson waveforms: rows of step waveforms on one time axis in µs.
export const VW = 640;
export const GUTTER = 118; // row labels and +1 / -1 marks
export const RIGHT = 12;
export const T_US = 28;
export const tx = (us: number): number => GUTTER + (us / T_US) * (VW - GUTTER - RIGHT);

export const ROW_H = 58;
export const ROW_GAP = 10;
export const rowTop = (i: number): number => 8 + i * (ROW_H + ROW_GAP);
export const axisY = (rows: number): number => rowTop(rows) - ROW_GAP + 4;

// One labelled row: `values` are held for `durUs` each (1 µs chips or 7 µs bits).
export function WaveRow({ label, values, durUs, row, vmax = 1, cls }: {
  label: string;
  values: number[];
  durUs: number;
  row: number;
  vmax?: number;
  cls: string;
}) {
  const top = rowTop(row);
  const mid = top + ROW_H / 2;
  const y = (v: number) => mid - (Math.max(-vmax, Math.min(vmax, v)) / vmax) * (ROW_H / 2 - 4);
  const pts: string[] = [];
  values.forEach((v, i) => {
    pts.push(`${tx(i * durUs).toFixed(1)},${y(v).toFixed(1)}`, `${tx((i + 1) * durUs).toFixed(1)},${y(v).toFixed(1)}`);
  });
  return (
    <g>
      <text x={4} y={mid + 4} className="vis-label">{label}</text>
      <line x1={GUTTER} x2={tx(T_US)} y1={mid} y2={mid} className="inst-grid" />
      <text x={GUTTER - 6} y={y(1) + 3} textAnchor="end" className="inst-axis">+1</text>
      <text x={GUTTER - 6} y={y(-1) + 3} textAnchor="end" className="inst-axis">−1</text>
      <polyline points={pts.join(' ')} className={`inst-line ${cls}`} />
    </g>
  );
}

// Faint vertical lines at the bit boundaries and the time axis along the bottom.
export function TimeAxis({ rows, bitUs = 7 }: { rows: number; bitUs?: number }) {
  const bottom = axisY(rows);
  const top = rowTop(0) - 4;
  const bounds = Array.from({ length: Math.floor(T_US / bitUs) + 1 }, (_, i) => i * bitUs);
  return (
    <g>
      {bounds.map((u) => (
        <g key={u}>
          <line x1={tx(u)} x2={tx(u)} y1={top} y2={bottom} className="inst-grid" />
          <text x={tx(u)} y={bottom + 12} textAnchor="middle" className="inst-axis">{u}</text>
        </g>
      ))}
      <text x={(GUTTER + tx(T_US)) / 2} y={bottom + 25} textAnchor="middle" className="inst-axis">Time (µs)</text>
    </g>
  );
}
