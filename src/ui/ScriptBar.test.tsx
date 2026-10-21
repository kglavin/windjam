/// <reference types="vite/client" />
import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScriptBar } from './ScriptBar';
import { BUNDLED_SCRIPTS } from './scripts';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const noop = () => {};

describe('ScriptBar', () => {
  it('bundles every script in missions/ and lists them to load', () => {
    expect(BUNDLED_SCRIPTS.length).toBeGreaterThanOrEqual(10);
    expect(BUNDLED_SCRIPTS[0].name).toBe('01-two-squads-triangulate.txt');
    expect(BUNDLED_SCRIPTS.every((s) => s.text.length > 0)).toBe(true);
    const html = renderToString(createElement(ScriptBar, { onLoad: noop, onRunTo: noop, onUnload: noop }));
    for (const s of BUNDLED_SCRIPTS) expect(html).toContain(`>${s.name}</option>`);
    expect(html).toContain('Open file');
  });

  it('shows where a loaded script is and the next line; the buttons go once it is done', () => {
    const script = { name: 'x.txt', commands: ['status', 'sq1: df e 5', 'wait 5'], cursor: 1 };
    const html = renderToString(createElement(ScriptBar, { script, onLoad: noop, onRunTo: noop, onUnload: noop }));
    expect(html).toContain('line 2 of 3');
    expect(html).toContain('sq1: df e 5</code>');
    expect(html).toMatch(/<button[^>]*>Step<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Step/);
    const done = renderToString(createElement(ScriptBar, { script: { ...script, cursor: 3 }, onLoad: noop, onRunTo: noop, onUnload: noop }));
    expect(done).toContain('all 3 lines run');
    expect(done).toMatch(/<button[^>]*disabled[^>]*>Run all/);
  });
});
