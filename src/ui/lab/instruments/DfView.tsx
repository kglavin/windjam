import type { MouseEvent } from 'react';
import type { BearingLine, Fix, Pt } from '../../../engine/lab/geoloc';
import { DF_AREA, DF_ZONE_Y_MAX } from '../../../engine/lab/levels';

// Level 6's DF view (docs/design-level-6.md section 3): a north-up km map with the sites, their bearings and ± 2σ
// wedges, the fix with its 1σ ellipse and CEP circle, and the transmitter once it may be shown.

const SIZE = 440;
const PAD = { l: 34, r: 10, t: 10, b: 28 };
const INNER = SIZE - PAD.l - PAD.r; // square: x and y share the scale
const KM = INNER / (DF_AREA.xMax - DF_AREA.xMin);
const H = PAD.t + KM * (DF_AREA.yMax - DF_AREA.yMin) + PAD.b;
const sx = (x: number) => PAD.l + (x - DF_AREA.xMin) * KM;
const sy = (y: number) => PAD.t + (DF_AREA.yMax - y) * KM;
const REACH_KM = 40;

export interface DfSite extends Pt {
  label: string;
  snrDb?: number;
  sigmaDeg?: number;
  placed?: boolean; // placed by the player: a click on it removes it
  timingUs?: number; // TDOA: the site's arrival-time error (1σ), shown in place of σ
}

const end = (p: Pt, deg: number, km = REACH_KM) => {
  const r = (deg * Math.PI) / 180;
  return { x: sx(p.xKm + km * Math.sin(r)), y: sy(p.yKm + km * Math.cos(r)) };
};

export function DfView({ title = 'DF view', sites, bearings = [], wedges = true, fix, target, zone, onPlace, onRemove, notes = [], path, hyperbolas = [], marks = [], outlines = [] }: {
  title?: string;
  sites: DfSite[];
  bearings?: BearingLine[];
  wedges?: boolean;
  fix?: { xKm: number; yKm: number; ellipse?: Fix['ellipse']; cepKm?: number };
  target?: Pt;
  zone?: boolean; // shade the friendly side where sites may go
  onPlace?: (p: Pt) => void;
  onRemove?: (index: number) => void;
  notes?: string[]; // readout lines under the map
  path?: Pt[]; // a UAV's leg
  hyperbolas?: Pt[][]; // TDOA curves
  marks?: (Pt & { label: string })[]; // level 7: the enemy transmitter and receiver
  outlines?: Pt[][]; // level 7: the follower's ellipse
}) {
  const click = (e: MouseEvent<SVGRectElement>) => {
    if (!onPlace) return;
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * SIZE;
    const py = ((e.clientY - r.top) / r.height) * H;
    onPlace({ xKm: Math.round((DF_AREA.xMin + (px - PAD.l) / KM) * 10) / 10, yKm: Math.round((DF_AREA.yMax - (py - PAD.t) / KM) * 10) / 10 });
  };
  const ticks: number[] = [];
  for (let v = -10; v <= 16; v += 2) ticks.push(v);
  const ell = fix?.ellipse;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-legend">
          <span className="c2"><i className="dot" />DF site</span>
          {fix && <span className="c3"><i className="sw" />fix, 1σ ellipse, CEP</span>}
          {target && <span className="c6"><i className="hollow" />transmitter</span>}
        </span>
      </header>
      <svg className="inst-svg df-svg" viewBox={`0 0 ${SIZE} ${H}`} role="img" aria-label={title}>
        <defs>
          <clipPath id="df-clip">
            <rect x={PAD.l} y={PAD.t} width={INNER} height={KM * (DF_AREA.yMax - DF_AREA.yMin)} />
          </clipPath>
        </defs>
        {zone && (
          <rect x={sx(DF_AREA.xMin)} y={sy(DF_ZONE_Y_MAX)} width={INNER} height={(DF_ZONE_Y_MAX - DF_AREA.yMin) * KM} className="df-zone" />
        )}
        {ticks.filter((v) => v >= DF_AREA.xMin && v <= DF_AREA.xMax).map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={sy(DF_AREA.yMax)} y2={sy(DF_AREA.yMin)} className="inst-grid" />
            {v % 4 === 0 && <text x={sx(v)} y={H - PAD.b + 12} textAnchor="middle" className="inst-axis">{v}</text>}
          </g>
        ))}
        {ticks.filter((v) => v >= DF_AREA.yMin && v <= DF_AREA.yMax).map((v) => (
          <g key={`y${v}`}>
            <line x1={sx(DF_AREA.xMin)} x2={sx(DF_AREA.xMax)} y1={sy(v)} y2={sy(v)} className="inst-grid" />
            {v % 4 === 0 && <text x={PAD.l - 4} y={sy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>}
          </g>
        ))}
        <line x1={sx(DF_AREA.xMin)} x2={sx(DF_AREA.xMax)} y1={sy(0)} y2={sy(0)} className="df-front" />
        <text x={sx(DF_AREA.xMax) - 4} y={sy(0) - 4} textAnchor="end" className="inst-axis">front line</text>
        <text x={PAD.l + INNER / 2} y={H - 4} textAnchor="middle" className="inst-axis">x east (km); y north (km)</text>
        <g clipPath="url(#df-clip)">
          {wedges && bearings.map((b, i) => {
            const lo = end(b, b.bearingDeg - 2 * b.sigmaDeg);
            const hi = end(b, b.bearingDeg + 2 * b.sigmaDeg);
            return <polygon key={`w${i}`} points={`${sx(b.xKm)},${sy(b.yKm)} ${lo.x},${lo.y} ${hi.x},${hi.y}`} className="df-wedge" />;
          })}
          {bearings.map((b, i) => {
            const e = end(b, b.bearingDeg);
            return <line key={`b${i}`} x1={sx(b.xKm)} y1={sy(b.yKm)} x2={e.x} y2={e.y} className="df-bearing" />;
          })}
          {hyperbolas.map((h, i) => (
            <polyline key={`h${i}`} points={h.map((p) => `${sx(p.xKm).toFixed(1)},${sy(p.yKm).toFixed(1)}`).join(' ')} className="df-hyperbola" />
          ))}
          {path && path.length > 1 && (
            <polyline points={path.map((p) => `${sx(p.xKm)},${sy(p.yKm)}`).join(' ')} className="df-path" />
          )}
          {fix && fix.cepKm !== undefined && <circle cx={sx(fix.xKm)} cy={sy(fix.yKm)} r={fix.cepKm * KM} className="df-cep" />}
          {fix && ell && (
            <ellipse
              cx={sx(fix.xKm)}
              cy={sy(fix.yKm)}
              rx={Math.max(1, ell.aKm * KM)}
              ry={Math.max(1, ell.bKm * KM)}
              transform={`rotate(${(-ell.angleRad * 180) / Math.PI} ${sx(fix.xKm)} ${sy(fix.yKm)})`}
              className="df-ellipse"
            />
          )}
          {fix && (
            <path d={`M${sx(fix.xKm) - 5},${sy(fix.yKm) - 5} l10,10 m0,-10 l-10,10`} className="df-fix" />
          )}
          {target && <circle cx={sx(target.xKm)} cy={sy(target.yKm)} r={6} className="df-target" />}
          {outlines.map((o, i) => (
            <polyline key={`o${i}`} points={o.map((p) => `${sx(p.xKm).toFixed(1)},${sy(p.yKm).toFixed(1)}`).join(' ')} className="df-outline" />
          ))}
          {marks.length > 1 && (
            <line x1={sx(marks[0].xKm)} y1={sy(marks[0].yKm)} x2={sx(marks[1].xKm)} y2={sy(marks[1].yKm)} className="df-link" />
          )}
          {marks.map((m) => (
            <g key={m.label} className="df-mark">
              <circle cx={sx(m.xKm)} cy={sy(m.yKm)} r={5} />
              <text x={sx(m.xKm) + 7} y={sy(m.yKm) - 6}>{m.label}</text>
            </g>
          ))}
        </g>
        {onPlace && <rect x={PAD.l} y={PAD.t} width={INNER} height={KM * (DF_AREA.yMax - DF_AREA.yMin)} fill="transparent" className="df-click" onClick={click} />}
        {sites.map((s, i) => (
          <g
            key={`s${i}`}
            className={s.placed && onRemove ? 'df-site df-removable' : 'df-site'}
            onClick={s.placed && onRemove ? () => onRemove(i) : undefined}
          >
            <circle cx={sx(s.xKm)} cy={sy(s.yKm)} r={5} />
            <text x={sx(s.xKm) + 7} y={sy(s.yKm) + 12}>{s.label}</text>
          </g>
        ))}
      </svg>
      {(sites.some((s) => s.snrDb !== undefined) || notes.length > 0) && (
        <dl className="inst-meter">
          {sites.filter((s) => s.snrDb !== undefined).map((s) => (
            <div key={`${s.label}-${s.xKm}-${s.yKm}`}>
              <dt>{s.label} at ({s.xKm}, {s.yKm})</dt>
              <dd>
                {s.snrDb!.toFixed(1)} dB{s.sigmaDeg !== undefined && <>, σ {s.sigmaDeg.toFixed(1)}°</>}
                {s.timingUs !== undefined && <>, timing σ {s.timingUs.toFixed(2)} µs</>}
              </dd>
            </div>
          ))}
          {notes.map((n) => (
            <div key={n}><dd>{n}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
