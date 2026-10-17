/// <reference types="vite/client" />
import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVELS, flatSteps } from '../../engine/lab/levels';
import { VideoCard, posterSrc, videoSrc } from './VideoCard';

// React separates adjacent text nodes with comments; drop them so the text reads as the player sees it.
const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');

describe('VideoCard', () => {
  it('starts open on its title frame, not playing, loading only metadata', () => {
    const html = renderToString(createElement(VideoCard, { id: 'level1-C1', title: 'Example: reading the chip rate' }));
    expect(html).toContain('Explainer: Example: reading the chip rate');
    expect(html).toContain('>Hide</button>');
    expect(html).not.toMatch(/<video[^>]*hidden/);
    expect(html).not.toMatch(/<video[^>]*autoplay/i);
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('src="/videos/level1-C1.mp4"');
    expect(html).toContain('poster="/videos/level1-C1.jpg"');
  });

  it('every lesson video has its file and poster in public/', () => {
    const ids = LEVELS.flatMap((l) => flatSteps(l).map((f) => f.step)).flatMap((s) => (s.kind === 'lesson' && s.video ? [s.video] : []));
    const published = Object.keys(import.meta.glob('/public/videos/*.{mp4,jpg}'));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(published, id).toContain(`/public${videoSrc(id)}`);
      expect(published, id).toContain(`/public${posterSrc(id)}`);
    }
  });
});
