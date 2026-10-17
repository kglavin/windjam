import { blindCopies, blindFraction } from '../../../engine/lab/blinding';

const W = 640;
const H = 260;
const PERIOD = 30; // copies between pulses
const PULSE = 1; // copies per pulse
const RECOVERY = 10; // copies the receiver stays blind after a pulse
const PERIODS = 3;
const L = 40;
const R = 14;

// The jammer's envelope as tall short pulses, and the receiver's output, flat at zero while it is blind: during each
// pulse and for its recovery time after it.
export function Blinding() {
  const total = PERIOD * PERIODS;
  const x = (copy: number) => L + (copy / total) * (W - L - R);
  const blind = blindCopies(PERIOD, PULSE, RECOVERY);
  const isBlind = (k: number) => blind[k % PERIOD];
  const yJam = { base: 100, top: 20 };
  const yRx = 190;
  const steps = total * 6;
  const wiggle = (i: number) => 14 * Math.sin(i * 1.7) * Math.cos(i * 0.43 + 1);
  const rx = Array.from({ length: steps + 1 }, (_, i) => {
    const copy = (i / steps) * total;
    const amp = isBlind(Math.min(total - 1, Math.floor(copy))) ? 0 : wiggle(i);
    return `${x(copy).toFixed(1)},${(yRx - amp).toFixed(1)}`;
  }).join(' ');
  const frac = blindFraction(PERIOD, PULSE, RECOVERY);
  return (
    <section className="inst-panel">
      <svg className="inst-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Jammer pulses and the receiver's output, flat while the receiver is blind">
        <text x={L} y={12} className="vis-label">Jammer: one short, strong pulse every {PERIOD} copies</text>
        <line x1={L} x2={W - R} y1={yJam.base} y2={yJam.base} className="inst-grid" />
        {Array.from({ length: PERIODS }, (_, p) => (
          <rect key={p} x={x(p * PERIOD)} y={yJam.top} width={Math.max(x(PULSE) - x(0), 3)} height={yJam.base - yJam.top} className="vis-bar-jam" />
        ))}
        <text x={L} y={yRx - 38} className="vis-label">Receiver output</text>
        {Array.from({ length: PERIODS }, (_, p) => (
          <g key={p}>
            <rect x={x(p * PERIOD)} y={yRx - 26} width={x(PULSE + RECOVERY) - x(0)} height={52} className="vis-blind" />
            <text x={(x(p * PERIOD) + x(p * PERIOD + PULSE + RECOVERY)) / 2} y={yRx + 44} textAnchor="middle" className="vis-label">blind</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={yRx} y2={yRx} className="inst-grid" />
        <polyline points={rx} className="inst-line c2" />
        <text x={L} y={H - 4} className="vis-sum">
          Blind {PULSE + RECOVERY} of every {PERIOD} copies: {Math.round(frac * 100)}% of the time
        </text>
      </svg>
    </section>
  );
}
