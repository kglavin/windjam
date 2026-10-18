import type { MouseEvent } from 'react';
import type { Pt } from '../../../engine/lab/geoloc';

// Level 11: a street grid 2 km across (x east, y north, km), the radios on it, and the jammer with its beam.
const SIZE = 440;
const PAD = 20;
const SPAN = 2;
const S = (SIZE - 2 * PAD) / SPAN;
const sx = (x: number) => PAD + x * S;
const sy = (y: number) => SIZE - PAD - y * S;
const BLOCK = 0.12;
const PITCH = 0.16;

export interface TownRadio extends Pt {
  name: string;
  kind: 'enemy' | 'friendly' | 'civilian';
  jsDb?: number; // shown under the name when given
  ok?: boolean; // colours the J/S: true green (as wanted), false red
}

export function TownMap({ radios, jammer, beamDeg, halfBeamDeg = 30, onPlace, notes = [], title = 'Town map' }: {
  radios: TownRadio[];
  jammer?: Pt;
  beamDeg?: number;
  halfBeamDeg?: number;
  onPlace?: (p: Pt) => void;
  notes?: string[];
  title?: string;
}) {
  const blocks: { x: number; y: number }[] = [];
  for (let x = 0.02; x < SPAN - 0.05; x += PITCH) for (let y = 0.02; y < SPAN - 0.05; y += PITCH) blocks.push({ x, y });
  const click = (e: MouseEvent<SVGRectElement>) => {
    if (!onPlace) return;
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * SIZE;
    const py = ((e.clientY - r.top) / r.height) * SIZE;
    onPlace({ xKm: Math.round(((px - PAD) / S) * 100) / 100, yKm: Math.round(((SIZE - PAD - py) / S) * 100) / 100 });
  };
  const beam = jammer && beamDeg !== undefined
    ? [beamDeg - halfBeamDeg, beamDeg + halfBeamDeg].map((d) => ({ x: sx(jammer.xKm + 3 * Math.sin((d * Math.PI) / 180)), y: sy(jammer.yKm + 3 * Math.cos((d * Math.PI) / 180)) }))
    : undefined;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-legend">
          <span className="c6"><i className="dot" />enemy</span>
          <span className="c3"><i className="dot" />friendly</span>
          <span className="c5"><i className="dot" />civilian</span>
          <span className="c2"><i className="dot" />jammer</span>
        </span>
      </header>
      <svg className="inst-svg df-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={title}>
        <defs>
          <clipPath id="town-clip"><rect x={PAD} y={PAD} width={SPAN * S} height={SPAN * S} /></clipPath>
        </defs>
        {blocks.map((b) => <rect key={`${b.x}-${b.y}`} x={sx(b.x)} y={sy(b.y + BLOCK)} width={BLOCK * S} height={BLOCK * S} className="town-block" />)}
        {beam && jammer && <polygon clipPath="url(#town-clip)" points={`${sx(jammer.xKm)},${sy(jammer.yKm)} ${beam[0].x},${beam[0].y} ${beam[1].x},${beam[1].y}`} className="town-beam" />}
        {onPlace && <rect x={PAD} y={PAD} width={SPAN * S} height={SPAN * S} fill="transparent" className="df-click" onClick={click} />}
        {radios.map((r) => (
          <g key={r.name} className={`town-radio town-${r.kind}`}>
            <circle cx={sx(r.xKm)} cy={sy(r.yKm)} r={6} />
            <text x={sx(r.xKm) + 8} y={sy(r.yKm) - 4}>{r.name}</text>
            {r.jsDb !== undefined && <text x={sx(r.xKm) + 8} y={sy(r.yKm) + 10} className={r.ok ? 'town-ok' : 'town-bad'}>{`J/S ${r.jsDb.toFixed(1)} dB`}</text>}
          </g>
        ))}
        {jammer && <rect x={sx(jammer.xKm) - 6} y={sy(jammer.yKm) - 6} width={12} height={12} className="town-jammer" />}
        <text x={PAD} y={SIZE - 4} className="inst-axis">2 km across; blocks 120 m, streets 40 m</text>
      </svg>
      {notes.length > 0 && <dl className="inst-meter">{notes.map((n) => <div key={n}><dd>{n}</dd></div>)}</dl>}
    </section>
  );
}

// A1's picture: the enemy pair, friendly and civilian radios close by.
export const TOWN_EXAMPLE: TownRadio[] = [
  { xKm: 0.5, yKm: 1.5, name: 'enemy transmitter', kind: 'enemy' },
  { xKm: 1.3, yKm: 1.1, name: 'enemy receiver', kind: 'enemy' },
  { xKm: 1.5, yKm: 0.6, name: 'friendly patrol', kind: 'friendly' },
  { xKm: 0.8, yKm: 0.4, name: 'friendly HQ', kind: 'friendly' },
  { xKm: 1.1, yKm: 1.6, name: 'taxi radio', kind: 'civilian' },
];
