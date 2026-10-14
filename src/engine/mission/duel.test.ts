import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { createMission, issue, jumpReplay, revealLines, viewOf, visibleLog } from './mission';
import { runScript } from './script';
import { MISSION_RULES as R, type MissionState, type PlayerSide } from './types';

// Lines carry their console: 'blue> sq1: df e 5' or 'red> send'.
const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const m = /^(blue|red)>\s*(.*)$/.exec(line)!;
    const as = m[1] as PlayerSide;
    const p = parseCommand(m[2], as);
    if (!p.ok) throw new Error(`${line}: ${p.error}`);
    s = issue(s, p.command, as);
  }
  return s;
};

describe('mission 3: duel', () => {
  const s = createMission(1234, 'duel');
  it('seats two humans, no playbook, with Red’s order schedule', () => {
    expect(s.humans).toEqual(['blue', 'red']);
    expect(s.playbook).toBeUndefined();
    expect(s.redOrders).toHaveLength(R.redOrderCount);
    expect(s.winner).toBeUndefined();
  });
  it('gives each console its own briefing', () => {
    const blue = visibleLog(s, 'blue').map((e) => e.text).join('\n');
    const red = visibleLog(s, 'red').map((e) => e.text).join('\n');
    expect(blue).toMatch(/Duel: Blue hunts/);
    expect(red).toMatch(/Duel: Blue hunts/);
    expect(blue).toMatch(/Type help\./);
    expect(red).toMatch(/electronic-protection/);
    expect(blue).not.toMatch(/electronic-protection/);
  });
  it('routes each console’s commands to its own side', () => {
    const after = run(s, ['blue> sq1: df e 5', 'red> emcon cmd 0', 'red> hq: power 10']);
    expect(after.orders['b-sq1']).toMatchObject({ kind: 'df' });
    expect(after.emcon['red-cmd']).toBe(0);
    const blue = visibleLog(after, 'blue').map((e) => e.text).join('\n');
    const red = visibleLog(after, 'red').map((e) => e.text).join('\n');
    expect(blue).toMatch(/Squad 1: DF/);
    expect(blue).not.toMatch(/emcon|power/i);
    expect(red).toMatch(/power/i);
    expect(red).not.toMatch(/Squad 1: DF/);
  });
  it('keeps send on the red console', () => {
    const after = run(s, ['blue> send', 'blue> hq: power 10']);
    const blue = visibleLog(after, 'blue').filter((e) => e.kind === 'error').map((e) => e.text);
    expect(blue).toContain('Only the red console sends orders.');
    expect(after.redOrders[0].sentMin).toBeUndefined();
    // Aliases resolve on the console's own side, so hq here is Blue HQ, not Red's.
    expect(visibleLog(after, 'blue').some((e) => e.text === 'Blue HQ: transmit power 10 W.')).toBe(true);
    expect(visibleLog(after, 'red').some((e) => /power/.test(e.text))).toBe(false);
  });
  it('advances the clock from either console and Red can send', () => {
    const after = run(s, ['red> send', 'blue> wait 3', 'red> wait 2']);
    expect(after.minute).toBe(5);
    expect(after.redOrders[0].sentMin).toBe(0);
    expect(after.history).toHaveLength(6);
  });
  it('shows each side only its own picture, and the umpire everything', () => {
    const after = run(s, ['blue> sq1: df e 5', 'blue> wait 5']);
    const blue = viewOf(after, 'blue');
    const red = viewOf(after, 'red');
    const ump = viewOf(after, 'blue', true);
    expect(blue.world.units.some((u) => u.side === 'red')).toBe(false);
    expect(red.world.units.some((u) => u.side === 'blue')).toBe(false);
    expect(ump.world.units.some((u) => u.side === 'red')).toBe(true);
    expect(ump.world.units.some((u) => u.side === 'blue')).toBe(true);
    expect(ump.dimUnitIds).toBeUndefined();
    expect(blue.trails.every((t) => t.unitId.startsWith('b-'))).toBe(true);
    expect(red.trails.every((t) => t.unitId.startsWith('r-'))).toBe(true);
  });
  it('resolves with a winner and reveals both sides', () => {
    const after = run(s, ['blue> wait 60']);
    expect(after.status).not.toBe('running');
    expect(['blue', 'red', 'draw']).toContain(after.winner);
    const lines = revealLines(after);
    expect(lines.some((l) => /Reveal: Blue on Red/.test(l))).toBe(true);
    expect(lines.some((l) => /Reveal: Blue .*: Red /.test(l))).toBe(true);
    expect(lines.some((l) => /plan/.test(l))).toBe(false);
  });
  it('runs a prefixed script', () => {
    const { state, parseErrors } = runScript(['mission duel', 'seed 1234', 'blue> sq1: df e 5', 'red> send', 'red> wait 5', 'blue> status'].join('\n'));
    expect(parseErrors).toEqual([]);
    expect(state.mission).toBe('duel');
    expect(state.minute).toBe(5);
    expect(state.redOrders[0].sentMin).toBe(0);
  });
  it('hides the other side’s listening sectors and plans in a replayed view', () => {
    const after = run(s, ['blue> sq1: df e 5', 'blue> uav: sortie 125,72 e 3', 'blue> wait 3', 'blue> reveal']);
    const at2 = jumpReplay(after, 2);
    const blue = viewOf(at2, 'blue');
    const red = viewOf(at2, 'red');
    const ump = viewOf(at2, 'blue', true);
    expect(blue.sectors.length).toBeGreaterThan(0);
    expect(red.sectors).toEqual([]);
    expect(red.plans).toEqual([]);
    expect(ump.sectors.length).toBe(blue.sectors.length);
    expect(ump.plans.length).toBe(blue.plans.length);
  });
});
