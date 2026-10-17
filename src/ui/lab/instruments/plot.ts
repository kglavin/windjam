// Shared helpers for the instrument SVG plots.
import type { MouseEvent } from 'react';

export const PW = 640;
export const PH = 220;
export const PAD = { l: 52, r: 12, t: 10, b: 30 };
export const INNER_W = PW - PAD.l - PAD.r;
export const INNER_H = PH - PAD.t - PAD.b;

// Round tick values covering [lo, hi], about `count` of them.
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

export const fmt = (v: number): string => {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e4 || a < 1e-2)) return v.toExponential(0).replace('e+', 'e');
  return String(Math.round(v * 1000) / 1000);
};

// Mouse position in plot (viewBox) coordinates.
export function plotX(e: MouseEvent<SVGElement>): number {
  const svg = e.currentTarget.ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
  const r = svg.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * PW;
}

// Points string for a polyline from parallel arrays, mapped by fx and fy.
export function poly(n: number, fx: (i: number) => number, fy: (i: number) => number): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`${fx(i).toFixed(1)},${fy(i).toFixed(1)}`);
  return parts.join(' ');
}
