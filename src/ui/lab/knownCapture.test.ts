import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LEVEL_1, type Visual } from '../../engine/lab/levels';
import { autocorrelation, toDb, welchPsd } from '../../engine/lab/measure';
import { knownCapture } from './knownCapture';
import { VisualView } from './visuals/VisualView';

describe('known link captures', () => {
  it.each([
    ['example', LEVEL_1.links.example],
    ['practice', LEVEL_1.links.practice],
  ] as const)('%s: first null at the chip rate and first autocorrelation peak at one code period', (_n, link) => {
    const shot = knownCapture(link);
    const { freq, psd } = welchPsd(shot.rx, 1024);
    const db = toDb(psd);
    const mhz = Array.from(freq, (f) => f * (shot.sampleRateHz / 1e6));
    // deepest bin between 0.6 and 1.4 times the chip rate on the right side
    let best = -1;
    for (let i = 0; i < mhz.length; i++) {
      if (mhz[i] > 0.6 * link.chipRateMcps && mhz[i] < 1.4 * link.chipRateMcps && (best < 0 || db[i] < db[best])) best = i;
    }
    expect(mhz[best]).toBeGreaterThan(0.95 * link.chipRateMcps);
    expect(mhz[best]).toBeLessThan(1.05 * link.chipRateMcps);

    const n = 2 ** link.degree - 1;
    const periodSamples = Math.round((n / link.chipRateMcps) * (shot.sampleRateHz / 1e6));
    const ac = autocorrelation(shot.rx, periodSamples * 3, 0, shot.preambleSamples).mag;
    expect(ac[periodSamples]).toBeGreaterThan(0.8);
    expect(ac[Math.round(periodSamples / 2)]).toBeLessThan(0.5);
  });
});

describe('visuals render', () => {
  const kinds: Visual[] = [
    { kind: 'spreading' },
    { kind: 'spreadVsUnspread' },
    { kind: 'despread' },
    { kind: 'interceptCompare' },
    { kind: 'dbTable' },
    { kind: 'spectrum', link: 'example', annotate: true },
    { kind: 'autocorr', link: 'practice', annotate: true },
    { kind: 'none' },
  ];
  it.each(kinds)('%j', (visual) => {
    const html = renderToString(createElement(VisualView, { visual, links: LEVEL_1.links }));
    if (visual.kind !== 'none') expect(html.length).toBeGreaterThan(50);
    expect(html).not.toContain('NaN');
  });
});
