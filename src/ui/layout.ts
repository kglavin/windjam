import { type Hex, hexRound } from '../engine/hex';
import type { HexMap } from '../engine/map';

// Pointy-top hex layout. `size` is the centre-to-corner radius in pixels.
export interface Layout {
  size: number;
  originX: number;
  originY: number;
}

const SQRT3 = Math.sqrt(3);

export function hexToPixel(layout: Layout, h: Hex): { x: number; y: number } {
  return {
    x: layout.originX + layout.size * (SQRT3 * h.q + (SQRT3 / 2) * h.r),
    y: layout.originY + layout.size * 1.5 * h.r,
  };
}

export function pixelToHex(layout: Layout, x: number, y: number): Hex {
  const px = (x - layout.originX) / layout.size;
  const py = (y - layout.originY) / layout.size;
  const q = (SQRT3 / 3) * px - py / 3;
  const r = (2 / 3) * py;
  return hexRound(q, r);
}

export function hexCorners(layout: Layout, h: Hex): number[] {
  const { x, y } = hexToPixel(layout, h);
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(x + layout.size * Math.cos(angle), y + layout.size * Math.sin(angle));
  }
  return pts;
}

// Largest hex size that fits the whole map in width x height, centred.
export function fitLayout(map: HexMap, width: number, height: number, padding = 12): Layout {
  // Map extent in units of `size`, for an odd-r rectangle.
  const mapW = SQRT3 * (map.cols + 0.5);
  const mapH = 1.5 * (map.rows - 1) + 2;
  const size = Math.max(4, Math.min((width - 2 * padding) / mapW, (height - 2 * padding) / mapH));
  // Hex (0,0) is the top-left hex; its centre sits half a hex in from the map's left and top edges.
  const originX = (width - mapW * size) / 2 + (SQRT3 / 2) * size;
  const originY = (height - mapH * size) / 2 + size;
  return { size, originX, originY };
}
