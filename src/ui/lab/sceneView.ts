// Screen <-> km mapping for the scene drawing. Pure, so it can be tested without a DOM.
export interface SceneView {
  scale: number; // px per km
  offX: number; // px of x = 0 km
  offY: number; // px of y = 0 km (screen y grows downward, km y grows upward)
}

export interface KmPoint {
  xKm: number;
  yKm: number;
}

const MIN_SPAN_KM = 1;

// Everything the drawing must keep in view: the stations (but not one a level hides) and, if given, the J/S circle around the receiver.
export function sceneFitPoints(
  scene: { tx: KmPoint; rx: KmPoint; jammer: KmPoint; intercept: KmPoint },
  circleRadiusKm = 0,
  hideJammer = false,
  hideIntercept = false,
): KmPoint[] {
  const pts: KmPoint[] = [scene.tx, scene.rx];
  if (!hideIntercept) pts.push(scene.intercept);
  if (!hideJammer) pts.push(scene.jammer);
  const r = circleRadiusKm;
  if (r > 0) {
    const { xKm, yKm } = scene.rx;
    pts.push({ xKm: xKm - r, yKm }, { xKm: xKm + r, yKm }, { xKm, yKm: yKm - r }, { xKm, yKm: yKm + r });
  }
  return pts;
}

// Fit the points inside the box with a margin on every side, centred.
export function fitView(points: KmPoint[], widthPx: number, heightPx: number, marginPx: number): SceneView {
  const xs = points.map((p) => p.xKm);
  const ys = points.map((p) => p.yKm);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, MIN_SPAN_KM);
  const spanY = Math.max(maxY - minY, MIN_SPAN_KM);
  const scale = Math.min((widthPx - 2 * marginPx) / spanX, (heightPx - 2 * marginPx) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, offX: widthPx / 2 - cx * scale, offY: heightPx / 2 + cy * scale };
}

export function toPx(v: SceneView, xKm: number, yKm: number): { x: number; y: number } {
  return { x: v.offX + xKm * v.scale, y: v.offY - yKm * v.scale };
}

export function toKm(v: SceneView, xPx: number, yPx: number): KmPoint {
  return { xKm: (xPx - v.offX) / v.scale, yKm: (v.offY - yPx) / v.scale };
}

// Nice scale-bar length (1, 2, 5 x 10^n km) that is at most maxPx wide.
export function scaleBarKm(v: SceneView, maxPx: number): number {
  const maxKm = maxPx / v.scale;
  const mag = 10 ** Math.floor(Math.log10(maxKm));
  for (const m of [5, 2, 1]) if (m * mag <= maxKm) return m * mag;
  return mag;
}
