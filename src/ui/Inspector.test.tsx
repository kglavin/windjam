/// <reference types="vite/client" />
import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { issue, viewOf } from '../engine/mission/mission';
import { runScript } from '../engine/mission/script';
import { allLinkBudgets } from '../engine/world';
import { Inspector, type InspectorProps } from './Inspector';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const scripts = import.meta.glob('../../missions/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const text = (name: string) => scripts[Object.keys(scripts).find((k) => k.endsWith(name))!];
const noop = () => {};

// Script 01 won and revealed, with the replay at its last minute.
function props(minute?: number): InspectorProps {
  const done = issue(runScript(text('01-two-squads-triangulate.txt')).state, { type: 'reveal' }, 'blue');
  const m = { ...done, replay: { minute: minute ?? done.history.length - 1 } };
  const view = viewOf(m, 'blue', true);
  return { mission: m, minute: m.replay.minute, side: 'blue', umpire: true, world: view.truth, tracks: view.tracks, linkViews: allLinkBudgets(view.truth), inspection: { tab: 'minute' }, onChange: noop, onLesson: noop };
}

describe('Inspector', () => {
  it('Minute: lists what was transmitted, heard and made of it in a minute with captures', () => {
    const p = props();
    const minute = p.mission.events.find((e) => e.kind === 'capture')!.minute + 1;
    const html = renderToString(createElement(Inspector, { ...p, minute, inspection: { tab: 'minute' } }));
    expect(html).toContain(`Minute T+${minute}`);
    expect(html).toContain('heard by');
    expect(html).toMatch(/bearing \d+° ± [\d.]+° this minute/);
  });

  it('Fix: one bearing is a wedge, two cross, all give the track\'s CEP; the sums are shown', () => {
    const p = props();
    const track = p.tracks.find((t) => t.fix && t.bearings.length >= 3)!;
    const one = renderToString(createElement(Inspector, { ...p, inspection: { tab: 'fix', trackId: track.id, k: 1 } }));
    expect(one).toContain('One bearing: a wedge');
    expect(one).toContain('1 ÷ √Σ(1 ÷ σ²)');
    const two = renderToString(createElement(Inspector, { ...p, inspection: { tab: 'fix', trackId: track.id, k: 2 } }));
    expect(two).toMatch(/Two bearings crossing at \d+°/);
    const all = renderToString(createElement(Inspector, { ...p, inspection: { tab: 'fix', trackId: track.id } }));
    expect(all).toContain(`CEP ${track.fix!.cepKm.toFixed(2)} km`);
    expect(all).toContain('actually');
    expect(all).toContain('level 6 E1');
  });

  it('Link: the budget ladder at the minute and the orders behind it, with lesson links', () => {
    const p = props();
    const html = renderToString(createElement(Inspector, { ...p, inspection: { tab: 'link' } }));
    expect(html).toContain('Orders behind this budget');
    expect(html).toContain('Total path loss');
    expect(html).toContain('BER, time-averaged');
    expect(html).toContain('level 0 F3');
  });
});
