import { describe, expect, it } from 'vitest';
import { parseCommand, knownIdsOf } from './commands';
import { advance, interceptLines, issue } from './mission';
import { missionFromScript } from './script';
import { DECEPTION_RULES as DEC, type MissionEvent, type MissionState } from './types';

const start = () => missionFromScript({ commands: [], scenario: 'd01' }, 1234);
const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const p = parseCommand(line, 'blue', knownIdsOf(s.world));
    if (!p.ok) throw new Error(`${line}: ${p.error}`);
    s = issue(s, p.command, 'blue');
  }
  return s;
};
const captures = (s: MissionState, siteId: string) => s.events.filter((e): e is Extract<MissionEvent, { kind: 'capture' }> => e.kind === 'capture' && e.sensorId === siteId);

describe('collection (deception, step 2)', () => {
  it('watch hears only the band, tune only the frequency, sweep less of everything', () => {
    let s = start();
    s = run(s, ['s1: watch 40-44 24', 's2: tune 40 24', 's3: sweep 24']);
    s = advance(s, 24);
    expect(s.log.filter((e) => e.kind === 'error')).toEqual([]);
    const c1 = captures(s, 'b-s1');
    const c2 = captures(s, 'b-s2');
    const c3 = captures(s, 'b-s3');
    expect(c1.length).toBeGreaterThan(50);
    expect(c1.every((c) => c.freqMHz! >= 40 && c.freqMHz! <= 44)).toBe(true);
    expect(c2.length).toBeGreaterThan(0);
    expect(c2.every((c) => Math.abs(c.freqMHz! - 40) < 0.06)).toBe(true);
    expect(new Set(c3.map((c) => c.freqMHz)).size).toBeGreaterThan(new Set(c1.map((c) => c.freqMHz)).size);
    // A sweep catches a tenth of the looks a watch does, so its bearings are wider.
    const sigma = (list: typeof c1) => list.reduce((a, c) => a + c.sigmaDeg, 0) / list.length;
    expect(sigma(c3)).toBeGreaterThan(sigma(c1));
  });

  it('the operator budget: a band wider than 8 MHz is refused; a sweep is not', () => {
    let s = start();
    s = run(s, ['s1: watch 30-50 24']);
    expect(s.orders['b-s1']).toBeUndefined();
    expect(s.log.some((e) => e.kind === 'error' && /8 MHz/.test(e.text))).toBe(true);
    s = run(s, ['s1: sweep 24']);
    expect(s.orders['b-s1']?.kind).toBe('watch');
    expect(DEC.watchMHz).toBe(8);
  });

  it('the intercept log lists an hour by frequency, site, bearing and rhythm, without the emitter', () => {
    let s = start();
    s = run(s, ['s1: watch 40-48 10', 's2: watch 40-48 10']);
    s = advance(s, 8);
    const lines = interceptLines(s, 'blue', 6);
    expect(lines[0]).toMatch(/^T\+6: \d+ intercepts/);
    expect(lines.some((l) => /order/.test(l))).toBe(true);
    expect(lines.some((l) => /ack/.test(l))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/Red Division|r-div/);
    expect(lines.slice(1).every((l) => /MHz fixed\s+\d{3}° ± [\d.]+°/.test(l))).toBe(true);
    const typed = run(s, ['intercepts 6']);
    expect(typed.log.slice(-lines.length).map((e) => e.text)).toEqual(lines);
  });
});
