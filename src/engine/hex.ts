// Axial hex coordinates, pointy-top. Reference: redblobgames.com/grids/hexagons
export interface Hex {
  q: number;
  r: number;
}

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const hexNeighbors = (h: Hex): Hex[] => HEX_DIRECTIONS.map((d) => hexAdd(h, d));

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

// Hexes crossed by the straight line from a to b, endpoints included.
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  // Small nudge keeps the line off hex edges so rounding is consistent.
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}

// Rectangular maps use "odd-r" offset coordinates (odd rows shoved right).
export const offsetToAxial = (col: number, row: number): Hex => ({
  q: col - (row - (row & 1)) / 2,
  r: row,
});

export const axialToOffset = (h: Hex): { col: number; row: number } => ({
  col: h.q + (h.r - (h.r & 1)) / 2,
  row: h.r,
});
