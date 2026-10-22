import { describe, expect, it } from 'vitest';
import { axialToOffset } from '../hex';
import { parseCommand, knownIdsOf } from './commands';
import { type Assessment, assess, emptyAssessment, scoreAssessment, trueStrength } from './deception';
import { advance, issue, revealLines, scoreOf } from './mission';
import { missionFromScript, runScript } from './script';
import type { MissionState } from './types';

const scripts = import.meta.glob('../../../missions/d01-*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const d01 = Object.values(scripts)[0];
const start = () => missionFromScript({ commands: [], scenario: 'd01' }, 1234);
const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const p = parseCommand(line, 'blue', knownIdsOf(s.world));
    if (!p.ok) throw new Error(`${line}: ${p.error}`);
    s = issue(s, p.command, 'blue');
  }
  return s;
};
const truthOf = (s: MissionState) => ({ map: s.world.map, orbat: s.orbat!, nets: s.world.nets, units: s.world.units, sectors: s.sectors!, objective: s.objective, limit: s.limitMin });
// The perfect assessment of a state: every real node at its hub, the right level and parent.
const perfect = (s: MissionState, tick: number): Assessment => {
  let a = emptyAssessment();
  const freqOf = (id: string) => s.world.nets.find((n) => n.id === s.orbat!.find((x) => x.id === id)!.netId)!.freqMHz;
  for (const node of s.orbat!.filter((n) => !n.notional)) {
    const { col, row } = axialToOffset(s.world.units.find((u) => u.id === node.id)!.pos);
    a = assess(a, { what: 'net', net: { freqMHz: freqOf(node.id), level: node.level, col, row, underMHz: node.parent ? freqOf(node.parent) : undefined } }, tick);
  }
  for (const [sector, radios] of Object.entries(trueStrength(truthOf(s)))) a = assess(a, { what: 'strength', sector, radios }, tick);
  return assess(a, { what: 'objective', sector: s.objective!.sector, at: s.objective!.tick }, tick);
};

describe('the assessment and its score (deception, step 4)', () => {
  it('the perfect assessment scores 100; nothing scores 0', () => {
    const s = start();
    const sc = scoreAssessment(perfect(s, 70), truthOf(s));
    expect(sc.nodeScore).toBe(100);
    expect(sc.strengthScore).toBe(100);
    expect(sc.objectiveScore).toBe(100);
    expect(sc.total).toBe(100);
    expect(sc.nodes.length).toBe(s.orbat!.filter((n) => !n.notional).length);
    expect(sc.falseNodes).toEqual([]);
    expect(scoreAssessment(emptyAssessment(), truthOf(s)).total).toBe(0);
  });

  it('a node 4 km off, at the wrong level or with the wrong parent loses its part; a net that does not exist counts against', () => {
    const s = start();
    const t = truthOf(s);
    const div = s.orbat!.find((n) => n.level === 'division')!;
    const { col, row } = axialToOffset(s.world.units.find((u) => u.id === div.id)!.pos);
    const one = (net: Parameters<typeof assess>[1]) => scoreAssessment(assess(emptyAssessment(), net, 70), t);
    const right = one({ what: 'net', net: { freqMHz: 40, level: 'division', col, row } });
    expect(right.nodes.find((n) => n.freqMHz === 40)!.points).toBe(1);
    const far = one({ what: 'net', net: { freqMHz: 40, level: 'division', col: col + 8, row } });
    expect(far.nodes.find((n) => n.freqMHz === 40)!.points).toBe(0.5);
    const level = one({ what: 'net', net: { freqMHz: 40, level: 'brigade', col, row, underMHz: 42.6 } });
    expect(level.nodes.find((n) => n.freqMHz === 40)!.points).toBe(0.5);
    const ghost = one({ what: 'net', net: { freqMHz: 60, level: 'brigade', col, row } });
    expect(ghost.falseNodes).toHaveLength(1);
    expect(ghost.nodeScore).toBe(0);
    // The early bonus: the same line 12 hours before the end is worth a fifth more.
    const early = scoreAssessment(assess(emptyAssessment(), { what: 'net', net: { freqMHz: 40, level: 'division', col, row } }, 60), t);
    expect(early.nodes.find((n) => n.freqMHz === 40)!.points).toBeCloseTo(1.2);
  });

  it('strength within a factor of 1.5 is right, within 2.25 half right; the objective needs the sector and the hour within 6', () => {
    const s = start();
    const t = truthOf(s);
    const truth = trueStrength(t);
    expect(truth.centre).toBeGreaterThan(50);
    expect(truth.north).toBe(0);
    const sc = (radios: number) => scoreAssessment(assess(emptyAssessment(), { what: 'strength', sector: 'centre', radios }, 70), t).strength.find((x) => x.sector === 'centre')!.points;
    expect(sc(Math.round(truth.centre * 1.4))).toBe(1);
    expect(sc(Math.round(truth.centre * 2))).toBe(0.5);
    expect(sc(Math.round(truth.centre * 4))).toBe(0);
    const ob = (sector: string, at: number) => scoreAssessment(assess(emptyAssessment(), { what: 'objective', sector, at }, 70), t).objectiveScore;
    expect(ob('centre', 72)).toBe(100);
    expect(ob('centre', 60)).toBe(50);
    expect(ob('north', 70)).toBe(50);
  });

  it('the console: assess lines replace each other, assessment shows the tree, the end scores and names the winner, the reveal shows the true tree', () => {
    let s = start();
    s = run(s, ['assess net 40 brigade at 100,100', 'assess net 40 division at 185,80', 'assess net 42.6 brigade at 191,95 under 40', 'assess strength centre 90', 'assess objective centre at T+72']);
    expect(s.assessment!.nets).toHaveLength(2);
    expect(s.assessment!.nets[0]).toMatchObject({ freqMHz: 40, level: 'division', col: 185, row: 80, tick: 0 });
    s = run(s, ['assessment']);
    expect(s.log.slice(-6).map((e) => e.text).join('\n')).toMatch(/40 MHz division at 185,80 \(T\+0\)\n  42.6 MHz brigade at 191,95 under 40/);
    expect(run(s, ['assess strength west 5']).log.at(-1)!.text).toMatch(/Unknown sector/);
    expect(parseCommand('assess net 40 division 185,80', 'blue').ok).toBe(false);
    expect(parseCommand('assess objective centre at 66', 'blue')).toMatchObject({ ok: true, command: { type: 'assess', what: 'objective', sector: 'centre', at: 66 } });
    s = advance(s, 72);
    expect(s.status).toBe('lost');
    expect(s.winner).toBe('red');
    expect(s.log.find((e) => e.kind === 'hq' && /Three days are up/.test(e.text))!.text).toMatch(/Score \d+\/100 for the collector .* The deceiver wins\./);
    const reveal = revealLines(s);
    expect(reveal[0]).toMatch(/^Reveal: Red Division HQ \(40 MHz, division\) at 185,80: assessed division at 185,80: placed, level right, parent right, early\.$/);
    expect(reveal.some((l) => /^Reveal:   Red 1 Brigade/.test(l))).toBe(true);
    expect(reveal.at(-1)).toMatch(/^Reveal: Score \d+\/100/);
    expect(run(s, ['assess net 41 battalion at 1,1']).log.at(-1)!.text).toMatch(/closed/);
    expect(run(s, ['assessment']).log.at(-1)!.text).toMatch(/^Objective: centre at T\+72; assessed centre at T\+72: sector right, hour right\.$/);
    // The perfect assessment wins.
    let w = start();
    w.assessment = perfect(w, 0);
    w = advance(w, 72);
    expect(w.status).toBe('won');
    expect(scoreOf(w).total).toBe(100);
  });

  it('d01: the scripted analyst places the division and its brigades from the picture and wins on strength and objective', () => {
    const { state: s } = runScript(d01, 1234);
    expect(s.status).toBe('won');
    expect(s.winner).toBe('blue');
    const sc = scoreOf(s);
    expect(sc.nodes.filter((n) => n.placed).length).toBeGreaterThanOrEqual(4);
    expect(sc.objectiveScore).toBe(100);
    expect(sc.strengthScore).toBe(100);
    expect(sc.total).toBeGreaterThanOrEqual(50);
    expect(sc.total).toBeLessThan(80);
  });
});
