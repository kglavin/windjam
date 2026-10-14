import type { PathAnalysis } from '../engine/rf';

interface Props {
  path: PathAnalysis;
  groundAM: number;
  groundBM: number;
  antennaAM: number;
  antennaBM: number;
}

const W = 300;
const H = 130;
const PAD = { l: 34, r: 8, t: 8, b: 18 };

// Side view of the path: terrain (with trees and earth bulge) against the direct ray.
export function ProfileChart({ path, groundAM, groundBM, antennaAM, antennaBM }: Props) {
  const D = path.distanceKm;
  const hA = groundAM + antennaAM;
  const hB = groundBM + antennaBM;
  const terrain = [
    { d: 0, h: groundAM },
    ...path.profile.map((p) => ({ d: p.distanceKm, h: p.obstacleTopM })),
    { d: D, h: groundBM },
  ];
  const maxH = Math.max(hA, hB, ...terrain.map((t) => t.h)) * 1.1 + 10;
  const x = (d: number) => PAD.l + (d / D) * (W - PAD.l - PAD.r);
  const y = (h: number) => H - PAD.b - (h / maxH) * (H - PAD.t - PAD.b);

  const groundPoly = [
    `${x(0)},${y(0)}`,
    ...terrain.map((t) => `${x(t.d)},${y(t.h)}`),
    `${x(D)},${y(0)}`,
  ].join(' ');
  const worst = path.worstObstacle;

  return (
    <svg className="profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Path terrain profile">
      <polygon points={groundPoly} fill="#8a7550" opacity={0.85} />
      <line x1={x(0)} y1={y(hA)} x2={x(D)} y2={y(hB)} stroke={path.lineOfSight ? '#22c55e' : '#ef4444'} strokeWidth={2} />
      <line x1={x(0)} y1={y(groundAM)} x2={x(0)} y2={y(hA)} stroke="#e5e7eb" strokeWidth={2} />
      <line x1={x(D)} y1={y(groundBM)} x2={x(D)} y2={y(hB)} stroke="#e5e7eb" strokeWidth={2} />
      {worst && worst.v > -0.78 && (
        <circle cx={x(worst.distanceKm)} cy={y(worst.obstacleTopM)} r={4} fill="none" stroke="#facc15" strokeWidth={2} />
      )}
      <text x={2} y={y(maxH * 0.9) + 4} className="axis">{Math.round(maxH * 0.9)} m</text>
      <text x={2} y={y(0)} className="axis">0 m</text>
      <text x={x(0)} y={H - 4} className="axis">0</text>
      <text x={x(D)} y={H - 4} className="axis" textAnchor="end">{D.toFixed(1)} km</text>
    </svg>
  );
}
