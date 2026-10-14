import type { LinkQuality } from '../engine/ew';
import type { TerrainType } from '../engine/terrain';
import type { Side } from '../engine/units';

export const TERRAIN_COLORS: Record<TerrainType, number> = {
  water: 0x2b5d8a,
  plain: 0xa7b86b,
  forest: 0x4f7a3a,
  hill: 0xb39a64,
  mountain: 0x8a8580,
};

export const SIDE_COLORS: Record<Side, number> = {
  blue: 0x3b82f6,
  red: 0xef4444,
  neutral: 0xe5e7eb,
};

export const QUALITY_COLORS: Record<LinkQuality, number> = {
  good: 0x22c55e,
  degraded: 0xeab308,
  denied: 0xef4444,
};

export const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

// Blend toward white by t (0..1). Used to shade terrain by elevation.
export function lighten(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export const JAM_COLOR = 0xc084fc;
export const LOS_COLOR = 0x22d3ee;

// Received-power bands for the coverage heatmap, strongest first. The last band runs down to the noise floor.
export const COVERAGE_BANDS: { minDbm: number; color: number; label: string }[] = [
  { minDbm: -60, color: 0xdc2626, label: '≥ -60 dBm' },
  { minDbm: -70, color: 0xf97316, label: '-60 to -70' },
  { minDbm: -80, color: 0xfacc15, label: '-70 to -80' },
  { minDbm: -90, color: 0x4ade80, label: '-80 to -90' },
  { minDbm: -100, color: 0x22d3ee, label: '-90 to -100' },
  { minDbm: -Infinity, color: 0x8b5cf6, label: '-100 to noise floor' },
];

// Colour for a received power, or null when it is below the noise floor.
export function coverageColor(rxDbm: number, noiseFloorDbm: number): number | null {
  if (rxDbm < noiseFloorDbm) return null;
  return COVERAGE_BANDS.find((b) => rxDbm >= b.minDbm)!.color;
}

// Time-averaged J/S bands for the coverage tool's J/S mode. Below -10 dB the jammer barely matters.
export const JS_BANDS: { minDb: number; color: number; label: string }[] = [
  { minDb: 20, color: 0x7f1d1d, label: '≥ +20 dB' },
  { minDb: 10, color: 0xdc2626, label: '+10 to +20' },
  { minDb: 0, color: 0xf97316, label: '0 to +10' },
  { minDb: -10, color: 0xfacc15, label: '-10 to 0' },
];

export function jsColor(avgJsDb: number): number | null {
  return JS_BANDS.find((b) => avgJsDb >= b.minDb)?.color ?? null;
}
export const DF_COLOR = 0xf472b6;
