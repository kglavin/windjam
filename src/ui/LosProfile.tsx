import { useEffect, useRef, useState } from 'react';
import type { Hex } from '../engine/hex';
import { getTile, type HexMap } from '../engine/map';
import { type PathAnalysis, fresnelRadiusM } from '../engine/rf';
import { TERRAIN, type TerrainType } from '../engine/terrain';
import { TERRAIN_COLORS, toCss } from './colors';

interface Props {
  map: HexMap;
  a: Hex;
  b: Hex;
  path: PathAnalysis;
  groundAM: number;
  groundBM: number;
  antennaAM: number;
  antennaBM: number;
  freqMHz: number;
  // Reports the page x of the chart's A and B ends, so the map can line up with them.
  onPlotSpan?: (span: { leftPageX: number; rightPageX: number }) => void;
}

// Fixed chart height in px; width follows the element.
const H = 200;
const PAD = { l: 48, r: 16, t: 12, b: 26 };

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

// Side view between two points: ground by terrain type, trees, earth bulge, the ray, and the first Fresnel zone.
export function LosProfile({ map, a, b, path, groundAM, groundBM, antennaAM, antennaBM, freqMHz, onPlotSpan }: Props) {
  // Drawn at the element's real pixel width and a fixed height, so it fills the dock without growing taller.
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0) setW(r.width);
      onPlotSpan?.({ leftPageX: r.left + PAD.l, rightPageX: r.left + r.width - PAD.r });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [onPlotSpan]);
  const D = path.distanceKm;
  const DM = D * 1000;
  const hA = groundAM + antennaAM;
  const hB = groundBM + antennaBM;
  const rayAt = (dKm: number) => hA + (hB - hA) * (dKm / D);

  // One point per hex on the line, endpoints included. Ground includes earth bulge; trees sit on top.
  const points: { d: number; ground: number; top: number; terrain: TerrainType }[] = [
    { d: 0, ground: groundAM, top: groundAM, terrain: getTile(map, a)!.terrain },
    ...path.profile.map((p) => {
      const terrain = getTile(map, p.hex)!.terrain;
      return { d: p.distanceKm, ground: p.obstacleTopM - TERRAIN[terrain].clutterHeightM, top: p.obstacleTopM, terrain };
    }),
    { d: D, ground: groundBM, top: groundBM, terrain: getTile(map, b)!.terrain },
  ];

  const fresnel = Array.from({ length: 41 }, (_, i) => {
    const d = (i / 40) * D;
    return { d, r: fresnelRadiusM(freqMHz, d * 1000, DM - d * 1000) };
  });
  const yMax = Math.max(hA, hB, ...points.map((p) => p.top), ...fresnel.map((f) => rayAt(f.d) + f.r)) * 1.08 + 10;
  const yMin = Math.max(0, Math.min(...points.map((p) => p.ground), ...fresnel.map((f) => rayAt(f.d) - f.r)) - 20);
  const x = (d: number) => PAD.l + (d / D) * (W - PAD.l - PAD.r);
  const y = (h: number) => H - PAD.b - ((h - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  // Each hex owns the span halfway to its neighbours, coloured by its terrain.
  const last = points.length - 1;
  const segments = points.map((p, i) => ({
    x0: i === 0 ? 0 : (points[i - 1].d + p.d) / 2,
    x1: i === last ? D : (p.d + points[i + 1].d) / 2,
    terrain: p.terrain,
  }));

  const groundPath = `M ${x(0)} ${y(yMin)} ` + points.map((p) => `L ${x(p.d)} ${y(p.ground)}`).join(' ') + ` L ${x(D)} ${y(yMin)} Z`;
  const treeTops = points.filter((p) => p.top > p.ground + 0.5);
  const fresnelUpper = fresnel.map((f) => `${x(f.d)},${y(rayAt(f.d) + f.r)}`);
  const fresnelLower = fresnel.map((f) => `${x(f.d)},${y(rayAt(f.d) - f.r)}`).reverse();
  const worst = path.worstObstacle;

  const xStep = niceStep(D, 8);
  const yStep = niceStep(yMax - yMin, 5);
  const xTicks = Array.from({ length: Math.floor(D / xStep) + 1 }, (_, i) => i * xStep);
  const yTicks = Array.from({ length: Math.floor((yMax - yMin) / yStep) + 1 }, (_, i) => Math.ceil(yMin / yStep) * yStep + i * yStep).filter(
    (v) => v <= yMax,
  );

  return (
    <svg ref={svgRef} className="los-profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line of sight terrain profile">
      <defs>
        <clipPath id="ground-clip">
          <path d={groundPath} />
        </clipPath>
      </defs>

      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="axis">
            {Math.round(v)} m
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - 8} textAnchor="middle" className="axis">
          {Number(v.toFixed(1))} km
        </text>
      ))}

      {/* Ground, coloured per hex. */}
      <g clipPath="url(#ground-clip)">
        {segments.map((s, i) => (
          <rect
            key={i}
            x={x(s.x0)}
            y={PAD.t}
            width={Math.max(0, x(s.x1) - x(s.x0)) + 0.5}
            height={H}
            fill={toCss(TERRAIN_COLORS[s.terrain])}
          />
        ))}
      </g>
      <path d={groundPath} fill="none" stroke="#111" strokeOpacity={0.5} />

      {/* Trees above ground. */}
      {treeTops.map((p, i) => (
        <line key={i} x1={x(p.d)} x2={x(p.d)} y1={y(p.ground)} y2={y(p.top)} stroke="#2f5d22" strokeWidth={6} strokeLinecap="round" />
      ))}

      {/* First Fresnel zone around the ray. */}
      <polygon points={[...fresnelUpper, ...fresnelLower].join(' ')} fill="#60a5fa" fillOpacity={0.12} stroke="#60a5fa" strokeOpacity={0.5} strokeDasharray="4 3" />

      {/* Direct ray. */}
      <line x1={x(0)} y1={y(hA)} x2={x(D)} y2={y(hB)} stroke={path.lineOfSight ? '#22c55e' : '#ef4444'} strokeWidth={2.5} />

      {/* Antenna masts and end labels. */}
      {[
        { d: 0, g: groundAM, h: hA, label: 'A', anchor: 'start' as const },
        { d: D, g: groundBM, h: hB, label: 'B', anchor: 'end' as const },
      ].map((e) => (
        <g key={e.label}>
          <line x1={x(e.d)} x2={x(e.d)} y1={y(e.g)} y2={y(e.h)} stroke="#e5e7eb" strokeWidth={3} />
          <circle cx={x(e.d)} cy={y(e.h)} r={9} fill="#22d3ee" stroke="#0f172a" strokeWidth={2} />
          <text x={x(e.d)} y={y(e.h) + 4} textAnchor="middle" className="end-label">
            {e.label}
          </text>
        </g>
      ))}

      {worst && worst.v > -0.78 && (
        <g>
          <circle cx={x(worst.distanceKm)} cy={y(worst.obstacleTopM)} r={7} fill="none" stroke="#facc15" strokeWidth={2.5} />
          <text x={x(worst.distanceKm)} y={y(worst.obstacleTopM) - 12} textAnchor="middle" className="worst-label">
            worst edge · v = {worst.v.toFixed(2)}
          </text>
        </g>
      )}
    </svg>
  );
}
