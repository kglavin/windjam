import { describe, expect, it } from 'vitest';
import { parseScript, runScript } from './script';

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
      if (script.expect) expect(state.status).toBe(script.expect);
      // Engine-side errors beyond the declared rejections point at a broken script.
      if (!script.rejects) expect(state.log.filter((e) => e.kind === 'error').map((e) => e.text)).toEqual([]);
    });
  }
});
