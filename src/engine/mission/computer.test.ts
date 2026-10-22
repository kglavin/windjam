/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { advance, createMission, deliveredOrders } from './mission';
import { missionFromScript, parseScript, runScript } from './script';
import { scenarioById } from './scenarios';
import { computerTurn, defaultBehaviour } from './computer';
import type { MissionState } from './types';

const scripts = import.meta.glob('../../../missions/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const text = (name: string) => scripts[Object.keys(scripts).find((k) => k.endsWith(name))!];
const errors = (s: MissionState) => s.log.filter((e) => e.kind === 'error').map((e) => e.text);
const computerLines = (s: MissionState, side: 'blue' | 'red') => s.log.filter((e) => e.kind === 'info' && e.side === side && e.text.startsWith('> '));

describe('the computer player', () => {
  it('picks a behaviour per mission and side', () => {
    expect(defaultBehaviour('find', 'blue')).toBe('hunt');
    expect(defaultBehaviour('duel', 'red')).toBe('command');
    expect(defaultBehaviour('fox', 'blue')).toBe('fox');
    expect(defaultBehaviour('iads', 'blue')).toBe('iads-blue');
    expect(defaultBehaviour('iads', 'red')).toBe('iads-red');
    expect(defaultBehaviour('deception', 'blue')).toBe('analyst');
    expect(defaultBehaviour('deception', 'red')).toBe('deceiver');
  });

  it('deceiver and analyst: d02 runs clean with both sides played, the deceiver turns the ruse up and the analyst assesses the south; d04 goes to the deceiver', () => {
    const d02 = runScript(text('d02-the-ruse-in-the-north.txt')).state;
    expect(errors(d02)).toEqual([]);
    const red = computerLines(d02, 'red').map((e) => e.text);
    expect(red.some((l) => /^> n-div: loud 12/.test(l))).toBe(true);
    expect(red.some((l) => l === '> n-div: order')).toBe(true);
    expect(red.some((l) => /move/.test(l))).toBe(false); // no plan to move in d02
    const blue = computerLines(d02, 'blue').map((e) => e.text);
    expect(blue.filter((l) => /^> s\d: (sweep|watch)/.test(l)).length).toBeGreaterThan(6);
    expect(blue.some((l) => /^> assess net 4\d(\.\d)? \w+ at \d+,\d+/.test(l))).toBe(true);
    expect(blue.at(-1)).toMatch(/^> assess objective south at T\+(6[6-9]|7[0-2])$/);
    expect(d02.winner).toBe('blue');
    const d03 = runScript(text('d03-the-hq-that-moves.txt')).state;
    expect(errors(d03)).toEqual([]);
    expect(computerLines(d03, 'red').filter((e) => /^> n-div: move/.test(e.text)).length).toBeGreaterThanOrEqual(2);
    const d04 = runScript(text('d04-company-nets-bought.txt')).state;
    expect(errors(d04)).toEqual([]);
    expect(d04.winner).toBe('red');
  }, 60000);

  it('hunt: Blue fixes three Red emitters in mission 1 within the limit, with no rejected order, on three seeds', () => {
    let won = 0;
    for (const seed of [1234, 42, 7]) {
      const s = advance(createMission(seed, 'find', { computer: { blue: true } }), 60);
      expect(errors(s), `seed ${seed}`).toEqual([]);
      expect(computerLines(s, 'blue').length).toBeGreaterThan(5);
      if (s.status === 'won') won++;
    }
    expect(won).toBeGreaterThanOrEqual(2);
  });

  it('command: Red sends its orders in their windows against the scripted Blue, with no rejected order', () => {
    const s = advance(createMission(1234, 'hide', { computer: { red: true } }), 60);
    expect(errors(s)).toEqual([]);
    expect(computerLines(s, 'red').some((e) => e.text === '> send')).toBe(true);
    expect(deliveredOrders(s) + s.redOrders.filter((o) => o.status === 'late').length).toBeGreaterThanOrEqual(4);
  });

  it('fox: the hunter finds the plain fox and the shy fox on its own', () => {
    for (const id of ['s11', 's12']) {
      const sc = scenarioById(id)!;
      const s = advance(createMission(sc.seed, 'fox', { forces: sc.forces, humans: ['blue', 'red'], emcon: sc.emcon, computer: { blue: true } }), 60);
      expect(errors(s), id).toEqual([]);
      expect(s.status, id).toBe('won');
      // The plain fox is fixed from two places; the shy one may be found along a single bearing.
      expect(s.tracks[0]?.bearings.length ?? 0, id).toBeGreaterThanOrEqual(id === 's11' ? 2 : 1);
    }
  });

  it('iads-blue: denies six engagements against a passive Red', () => {
    const sc = scenarioById('s15')!;
    const s = advance(createMission(sc.seed, 'iads', { forces: sc.forces, humans: ['blue', 'red'], computer: { blue: true }, playToEnd: true }), 60);
    expect(errors(s)).toEqual([]);
    expect(s.iads!.engagements.filter((e) => !e.ok).length).toBeGreaterThanOrEqual(6);
    expect(computerLines(s, 'blue').some((e) => /jam/.test(e.text))).toBe(true);
  });

  it('iads-red: reacts to the scripted Blue jammer and keeps more engagements than a passive Red would', () => {
    const script = text('s16-cut-the-reports.txt');
    const passive = runScript(script).state;
    const parsed = parseScript(script);
    expect(missionFromScript(parsed, 1234, ['red']).computer?.red?.behaviour).toBe('iads-red');
    // Run the script with Red played by the engine: the runner skips Red's lines.
    const s = runScript(script, 1234, ['red']).state;
    expect(errors(s)).toEqual([]);
    expect(computerLines(s, 'red').some((e) => /dsss|antenna/.test(e.text))).toBe(true);
    const done = (x: MissionState) => x.iads!.engagements.filter((e) => e.ok).length;
    expect(done(s)).toBeGreaterThanOrEqual(done(passive));
  });

  it('a script can hand a side to the computer, and the runner skips that side\'s lines', () => {
    const s = runScript('computer blue\nmission duel\nseed 1234\nblue> sq1: df e 60\nred> send\nwait 10\nred> send\nwait 10').state;
    expect(s.computer?.blue?.behaviour).toBe('hunt');
    expect(s.log.some((e) => e.text.includes('for 60 min'))).toBe(false);
    expect(computerLines(s, 'blue').length).toBeGreaterThan(0);
    expect(computerTurn(s, 'red')).toEqual([]);
  });
});
