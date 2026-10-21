import { describe, expect, it } from 'vitest';
import { outcomeOf, parseScript, runScript, turnEnd } from './script';

// Every script in missions/ must run clean and meet its own expect/rejects directives.
const scripts = import.meta.glob('../../../missions/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(scripts).sort();

describe('mission scripts', () => {
  it('finds the scripts', () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(file.split('/').pop()!, () => {
      const text = scripts[file];
      const script = parseScript(text);
      const { state, parseErrors } = runScript(text);
      expect(parseErrors, parseErrors.join('\n')).toHaveLength(script.rejects ?? 0);
      if (script.expect) expect(outcomeOf(state)).toBe(script.expect);
      // Engine-side errors beyond the declared rejections point at a broken script.
      if (!script.rejects) expect(state.log.filter((e) => e.kind === 'error').map((e) => e.text)).toEqual([]);
    });
  }
});

describe('playing a script a turn at a time', () => {
  const cmds = ['status', 'sq1: df e 5', 'wait 5', 'picture', 'blue> sq2: df e 5', 'red> wait 3', 'picture'];
  it('a turn ends just after the next wait, prefixed or not; the last turn runs to the end', () => {
    expect(turnEnd(cmds, 0)).toBe(3);
    expect(turnEnd(cmds, 3)).toBe(6);
    expect(turnEnd(cmds, 6)).toBe(7);
    expect(turnEnd(cmds, 7)).toBe(7);
  });
  it('every bundled script plays through in turns to the same end as a straight run', () => {
    for (const file of files) {
      const script = parseScript(scripts[file]);
      let at = 0;
      let turns = 0;
      while (at < script.commands.length) {
        const end = turnEnd(script.commands, at);
        expect(end).toBeGreaterThan(at);
        at = end;
        turns++;
      }
      expect(turns).toBeGreaterThan(0);
    }
  });
});

describe('scenarios', () => {
  it('every scenario has one script that names it, and every scenario script names a scenario that exists', async () => {
    const { SCENARIOS } = await import('./scenarios');
    const byScenario = new Map<string, string[]>();
    for (const file of files) {
      const sc = parseScript(scripts[file]).scenario;
      if (sc) byScenario.set(sc, [...(byScenario.get(sc) ?? []), file]);
    }
    for (const s of SCENARIOS) expect(byScenario.get(s.id), s.id).toHaveLength(1);
    for (const id of byScenario.keys()) expect(SCENARIOS.some((s) => s.id === id), id).toBe(true);
    expect(SCENARIOS.length).toBe(18);
  });
});
