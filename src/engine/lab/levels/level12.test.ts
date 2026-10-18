import { describe, expect, it } from 'vitest';
import { MESH_RADIO, cutNodes, denialRadii, dutySavingDb, floodSends, helloDuty, isDominatingConnected, lifeDays, mprFlood, navCtsUs, radiusKm, route, rttKm } from '../mesh';
import {
  type ApplyStep, type LessonStep, type QuestionsStep, type StepDef, EXAMPLE_BACKBONE, EXAMPLE_FRAMES, EXAMPLE_MESH, GUARD_KM, H1_JAMMER, I1_EXAMPLE, LEVEL_12, LEVELS, ROUTE_TO,
  RTT_EXAMPLE, SLEEP, TURN_US, fillText, guarded, h2Mesh, i2Range, i2Setup, level12Truth, level12Values, meshTry, quietMw,
} from '../levels';

const steps = (): StepDef[] => LEVEL_12.units.flatMap((u) => u.steps);
const step = (id: string) => steps().find((s) => s.id === id) as LessonStep;
const text = (id: string) => { const s = step(id); return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' '); };
const names = (p?: number[]) => p?.map((i) => EXAMPLE_MESH.names[i]);

describe('level 12 part 1', () => {
  it('is in LEVELS; units A to E are lessons with unscored checks', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(LEVEL_12.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']);
    const part1 = LEVEL_12.units.slice(0, 5).flatMap((u) => u.steps);
    expect(part1.every((s) => s.kind === 'lesson' && !!s.check)).toBe(true);
  });

  it('the example mesh: connected, two ways east, one cut node, heals round N', () => {
    const m = EXAMPLE_MESH;
    expect(m.nodes).toHaveLength(14);
    expect(names(route(m.adj, 0, ROUTE_TO))).toEqual(['G', 'W1', 'W4', 'N', 'E2', 'E5']);
    expect(names(route(m.adj, 0, ROUTE_TO, new Set([6])))).toEqual(['G', 'W1', 'W3', 'B', 'E1', 'E2', 'E5']);
    expect(names(cutNodes(m.adj))).toEqual(['W2']);
    expect(m.nodes.every((p) => p.xKm > 0 && p.xKm < 12 && p.yKm > 0 && p.yKm < 9)).toBe(true);
  });

  it('the backbone: 6 of 14, connected and dominating; a flood through it costs 7', () => {
    expect(EXAMPLE_BACKBONE).toHaveLength(6);
    expect(isDominatingConnected(EXAMPLE_MESH.adj, EXAMPLE_BACKBONE)).toBe(true);
    expect(floodSends(14, EXAMPLE_BACKBONE, 0)).toBe(7);
    expect(mprFlood(EXAMPLE_MESH.adj, 3).reached).toBe(14);
  });

  it('the checks', () => {
    expect(step('A1').check!.answer).toBe(3);
    expect(step('B1').check!.answer).toBe(20);
    expect(navCtsUs(EXAMPLE_FRAMES)).toBe(2060);
    expect(step('B2').check!.answer).toBe(2060);
    expect(step('C1').check!.answer).toBe(30);
    expect(step('C2').check!.answer).toBe(400);
    expect(step('D1').check!.answer).toBe(7);
    expect(rttKm(RTT_EXAMPLE.roundUs, RTT_EXAMPLE.turnUs) * 1000).toBeCloseTo(749.5, 1);
    expect(step('E1').check!.answer).toBe(749);
  });
});

describe('level 12 part 2', () => {
  it('F1: the quiet zone against data jamming', () => {
    const d = denialRadii(MESH_RADIO, 1, 0.8);
    expect(d.silenceKm.toFixed(2)).toBe('1.50');
    expect(d.dataKm.toFixed(2)).toBe('0.50');
    expect(d.signalDbm.toFixed(1)).toBe('-74.1');
    expect(d.powerRatio.toFixed(0)).toBe('78');
    expect((30 - 108.0 - 40 * Math.log10(0.8) + 8 + 85).toFixed(1)).toBe('18.9');
    for (const n of ['−78.0', '7.0 dB', '1.50 km', '−74.1', '−66.1', '0.50 km', '18.9 dB', '78 times']) expect(text('F1')).toContain(n);
  });

  it('G1: the HELLO duty and saving', () => {
    expect(dutySavingDb(helloDuty(2, 1)).toFixed(1)).toBe('27.0');
    expect(step('G1').check!.answer).toBe(26);
  });

  it('H1: 0.5 W between W3 and W4 silences both and cuts off 10', () => {
    expect(radiusKm(MESH_RADIO, 0.5, -85).toFixed(2)).toBe('1.26');
    const r = meshTry(EXAMPLE_MESH, H1_JAMMER);
    expect(r.silenced.map((i) => EXAMPLE_MESH.names[i])).toEqual(['W3', 'W4']);
    expect(r.cut).toHaveLength(10);
    expect(EXAMPLE_BACKBONE.map((i) => EXAMPLE_MESH.names[i])).toEqual(expect.arrayContaining(['W3', 'W4']));
  });

  it('H2: every seed has a connected 14-radio mesh, a goal of at least 6, met outside the guard', () => {
    for (let s = 1; s <= 10; s++) {
      const { mesh, goal } = h2Mesh(level12Truth(s));
      expect(mesh.nodes).toHaveLength(14);
      expect(goal).toBeGreaterThanOrEqual(6);
      let ok = 0;
      for (let x = 0.25; x < 12; x += 0.25) for (let y = 0.25; y < 9; y += 0.25) {
        const p = { xKm: x, yKm: y };
        if (!guarded(mesh, p) && meshTry(mesh, p).cut.length >= goal) ok++;
      }
      expect(ok).toBeGreaterThanOrEqual(8);
      expect(guarded(mesh, { xKm: mesh.nodes[0].xKm + GUARD_KM - 0.1, yKm: mesh.nodes[0].yKm })).toBe(true);
    }
  });

  it('I1 and I2: a repeater adds 150 m per µs', () => {
    const round = Math.round(((2 * I1_EXAMPLE.km) / 0.299792458 + TURN_US) * 100) / 100;
    expect(round.toFixed(2)).toBe('13.21');
    expect(rttKm(round + 2, TURN_US).toFixed(3)).toBe('1.500');
    expect(step('I1').check!.answer).toBe(450);
    for (let s = 1; s <= 10; s++) {
      const t = level12Truth(s);
      expect(i2Range(t) - i2Setup(t).km).toBeCloseTo((0.299792458 * i2Setup(t).delayUs) / 2, 2);
    }
  });

  it('J1: denial of sleep', () => {
    expect(quietMw(SLEEP).toFixed(2)).toBe('0.52');
    expect(lifeDays(SLEEP, 0, false).toFixed(0)).toBe('1603');
    expect(lifeDays(SLEEP, 10, false).toFixed(1)).toBe('27.3');
    expect(lifeDays(SLEEP, 10, true).toFixed(0)).toBe('817');
    for (const n of ['1603 days', '30.52 mW', '27.3 days', '1.02 mW', '817 days']) expect(text('J1')).toContain(n);
    expect(step('J1').check!.answer).toBeCloseTo(10 * Math.log10(8), 0);
  });

  it('scores 100 with a pass mark of 60; every placeholder resolves', () => {
    const all = steps();
    const fields = all.flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : []));
    const locate = all.flatMap((s) => (s.kind === 'apply' && s.locate ? [s.locate.points] : []));
    const qs = (all.find((s) => s.id === 'K1') as QuestionsStep).questions.map((q) => q.points);
    expect([...fields, ...locate, ...qs].reduce((a, b) => a + b, 0)).toBe(100);
    expect((all.find((s) => s.id === 'H2') as ApplyStep).locate!.points).toBe(20);
    expect(LEVEL_12.passMark).toBe(60);
    for (let s = 1; s <= 6; s++) {
      for (const n of [0, 1, 3]) {
        const v = level12Values(level12Truth(s), n);
        const texts = all.flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
          ...(st.kind === 'apply' && st.locate ? [st.locate.task] : []),
        ]);
        for (const x of [...texts, LEVEL_12.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
