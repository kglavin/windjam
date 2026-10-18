import { useEffect, useMemo, useState } from 'react';
import { PRIMITIVE_TAPS, registerSteps } from '../../../engine/lab/pn';

// Level 8: a Fibonacci shift register stepping. Stages left to right (stage 1 first); the taps feed an adder whose
// sum goes in at stage 1; the last stage comes out as the next chip.
export function RegisterView({ degree, taps = PRIMITIVE_TAPS[degree], seed = 1 }: { degree: number; taps?: number[]; seed?: number }) {
  const period = 2 ** degree - 1;
  const steps = useMemo(() => registerSteps(degree, taps, seed, period + 1), [degree, taps, seed, period]);
  const [k, setK] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setK((x) => (x >= period ? x : x + 1)), 220);
    return () => clearInterval(id);
  }, [running, period]);
  useEffect(() => {
    if (k >= period) setRunning(false);
  }, [k, period]);
  const s = steps[Math.min(k, period)];
  const W = 640;
  const box = Math.min(56, (W - 160) / degree);
  const x0 = 60;
  const y0 = 70;
  const cx = (i: number) => x0 + i * box + box / 2;
  const out = steps.slice(0, k).map((x) => x.out);
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Shift register: {degree} stages, taps {taps.join(' and ')}</h3>
        <button type="button" onClick={() => setK((x) => Math.min(period, x + 1))} disabled={k >= period}>Step</button>
        <button type="button" onClick={() => setRunning((r) => !r)} disabled={k >= period}>{running ? 'Pause' : 'Run'}</button>
        <button type="button" onClick={() => { setRunning(false); setK(0); }}>Reset</button>
        <span className="inst-readout">step {k} of {period}{k === period ? ': back to the start' : ''}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${W} 200`} role="img" aria-label="Shift register">
        {s.stages.map((b, i) => (
          <g key={i}>
            <rect x={x0 + i * box} y={y0} width={box - 4} height={box - 4} className={`reg-stage ${taps.includes(i + 1) ? 'reg-tap' : ''}`} />
            <text x={cx(i) - 2} y={y0 + box / 2 + 4} textAnchor="middle" className="reg-bit">{b}</text>
            <text x={cx(i) - 2} y={y0 + box + 12} textAnchor="middle" className="inst-axis">{i + 1}</text>
          </g>
        ))}
        {taps.map((t) => (
          <line key={t} x1={cx(t - 1) - 2} y1={y0} x2={cx(t - 1) - 2} y2={y0 - 28} className="reg-wire" />
        ))}
        <line x1={x0 - 30} y1={y0 - 28} x2={cx(Math.max(...taps) - 1) - 2} y2={y0 - 28} className="reg-wire" />
        <circle cx={x0 - 30} cy={y0 - 28} r={11} className="reg-xor" />
        <text x={x0 - 30} y={y0 - 24} textAnchor="middle" className="reg-bit">+</text>
        <line x1={x0 - 30} y1={y0 - 17} x2={x0 - 30} y2={y0 + box / 2 - 2} className="reg-wire" />
        <line x1={x0 - 30} y1={y0 + box / 2 - 2} x2={x0} y2={y0 + box / 2 - 2} className="reg-wire" />
        <text x={x0 - 30} y={y0 - 44} textAnchor="middle" className="inst-axis">in: {s.feedback}</text>
        <line x1={x0 + degree * box - 4} y1={y0 + box / 2 - 2} x2={x0 + degree * box + 24} y2={y0 + box / 2 - 2} className="reg-wire" />
        <text x={x0 + degree * box + 30} y={y0 + box / 2 + 2} className="inst-axis">out</text>
        <text x={12} y={185} className="inst-axis">chips out: {out.join('')}</text>
      </svg>
    </section>
  );
}
