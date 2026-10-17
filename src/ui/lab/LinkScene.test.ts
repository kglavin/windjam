import { describe, expect, it } from 'vitest';
import { sceneBudget } from '../../engine/lab/scene';
import { DEFAULT_SCENE } from './defaultScene';
import { fitView, scaleBarKm, toKm, toPx } from './sceneView';

const W = 520;
const H = 300;
const M = 56;

describe('sceneView', () => {
  const sets = [
    [{ xKm: 0, yKm: 0 }, { xKm: 10, yKm: 0 }, { xKm: 14, yKm: 18 }],
    [{ xKm: -50, yKm: 20 }, { xKm: 60, yKm: -30 }, { xKm: 0, yKm: 0 }],
    [{ xKm: 1, yKm: 1 }, { xKm: 1, yKm: 1 }, { xKm: 1, yKm: 1 }],
  ];
  it('round trips km to px and back', () => {
    for (const pts of sets) {
      const v = fitView(pts, W, H, M);
      for (const p of pts) {
        const px = toPx(v, p.xKm, p.yKm);
        const back = toKm(v, px.x, px.y);
        expect(back.xKm).toBeCloseTo(p.xKm, 9);
        expect(back.yKm).toBeCloseTo(p.yKm, 9);
      }
    }
  });
  it('keeps every station inside the margins', () => {
    for (const pts of sets) {
      const v = fitView(pts, W, H, M);
      for (const p of pts) {
        const { x, y } = toPx(v, p.xKm, p.yKm);
        expect(x).toBeGreaterThanOrEqual(M - 1e-9);
        expect(x).toBeLessThanOrEqual(W - M + 1e-9);
        expect(y).toBeGreaterThanOrEqual(M - 1e-9);
        expect(y).toBeLessThanOrEqual(H - M + 1e-9);
      }
    }
  });
  it('puts larger y higher on screen', () => {
    const v = fitView(sets[0], W, H, M);
    expect(toPx(v, 0, 10).y).toBeLessThan(toPx(v, 0, 0).y);
  });
  it('picks a scale bar no wider than the limit', () => {
    const v = fitView(sets[0], W, H, M);
    const km = scaleBarKm(v, 120);
    expect(km * v.scale).toBeLessThanOrEqual(120 + 1e-9);
    expect([1, 2, 5].includes(km / 10 ** Math.floor(Math.log10(km)))).toBe(true);
  });
});

describe('DEFAULT_SCENE', () => {
  it('gives Eb/N0 between 6 and 20 dB', () => {
    const b = sceneBudget(DEFAULT_SCENE);
    expect(b.ebN0Db).toBeGreaterThan(6);
    expect(b.ebN0Db).toBeLessThan(20);
    expect(b.gpDb).toBeCloseTo(18.06, 1);
  });
});
