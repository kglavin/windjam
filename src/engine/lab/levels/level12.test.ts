import { describe, expect, it } from 'vitest';
import { cutNodes, floodSends, isDominatingConnected, mprFlood, navCtsUs, route, rttKm } from '../mesh';
import { type LessonStep, type StepDef, EXAMPLE_BACKBONE, EXAMPLE_FRAMES, EXAMPLE_MESH, LEVEL_12, LEVELS, ROUTE_TO, RTT_EXAMPLE } from '../levels';

const steps = (): StepDef[] => LEVEL_12.units.flatMap((u) => u.steps);
const step = (id: string) => steps().find((s) => s.id === id) as LessonStep;
const names = (p?: number[]) => p?.map((i) => EXAMPLE_MESH.names[i]);

describe('level 12 part 1', () => {
  it('is in LEVELS; units A to E are lessons with unscored checks', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(LEVEL_12.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(steps().every((s) => s.kind === 'lesson' && !!s.check)).toBe(true);
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
