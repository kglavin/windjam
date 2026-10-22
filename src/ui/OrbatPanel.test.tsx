import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseCommand, knownIdsOf } from '../engine/mission/commands';
import { advance, issue } from '../engine/mission/mission';
import { missionFromScript } from '../engine/mission/script';
import { OrbatPanel } from './OrbatPanel';

describe('OrbatPanel', () => {
  it('shows the assessed tree, the associated nets, and after the end the true tree with the score', () => {
    let s = missionFromScript({ commands: [], scenario: 'd01' }, 1234);
    for (const line of ['s1: watch 40-48 24', 's2: watch 40-48 24', 'assess net 40 division at 185,80', 'assess net 42.6 brigade at 191,95 under 40', 'assess objective centre at T+72']) {
      const p = parseCommand(line, 'blue', knownIdsOf(s.world));
      if (p.ok) s = issue(s, p.command, 'blue');
    }
    s = advance(s, 8);
    const live = renderToStaticMarkup(<OrbatPanel mission={s} />);
    expect(live).toContain('40 MHz</b> division at 185,80');
    expect(live).toContain('42.6 MHz</b> brigade at 191,95');
    expect(live).toMatch(/<b>N1<\/b> 40 MHz/);
    expect(live).not.toContain('Truth');
    expect(live).not.toContain('Score');
    s = advance(s, 64);
    const over = renderToStaticMarkup(<OrbatPanel mission={s} />);
    expect(over).toContain('Score');
    expect(over).toContain('Truth');
    expect(over).toContain('placed, level right, parent right, early');
    expect(over).toContain('Division HQ');
  });
});
