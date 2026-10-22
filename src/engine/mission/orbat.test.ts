import { describe, expect, it } from 'vitest';
import { DUTY, dutyAt, generateForce, orderDue } from './orbat';

const real = generateForce(1234, { side: 'red', prefix: 'r', name: 'Red', centre: { col: 44, row: 10 }, ramp: [0.7, 1, 1.4], silentFrom: 66, freqMHz: 40 });
const ruse = generateForce(1234, { side: 'red', prefix: 'n', name: 'Notional', centre: { col: 44, row: 40 }, notional: true, ramp: [1, 1, 1], freqMHz: 50 });

describe('the force generator', () => {
  it('a real division: 42 nets on a tree, 1 + 3 + 9 + 27 + 2 nodes, about 100 radios', () => {
    expect(real.nodes).toHaveLength(42);
    expect(real.nets).toHaveLength(42);
    expect(real.units.length).toBeGreaterThan(90);
    expect(real.nodes.filter((n) => n.level === 'company')).toHaveLength(27);
    for (const net of real.nets) expect(real.units.some((u) => u.id === net.hubId)).toBe(true);
    expect(new Set(real.nets.map((n) => n.freqMHz)).size).toBe(42);
    expect(Object.keys(real.profiles)).toHaveLength(42);
    const div = real.nodes.find((n) => n.level === 'division')!;
    for (const b of real.nodes.filter((n) => n.level === 'brigade')) {
      expect(b.parent).toBe(div.id);
      expect(Math.hypot(b.col - div.col, b.row - div.row)).toBeGreaterThan(6);
      expect(Math.hypot(b.col - div.col, b.row - div.row)).toBeLessThan(11);
    }
  });

  it('a notional division: the same tree above battalion, no companies, one transmitter a net', () => {
    expect(ruse.nodes.every((n) => n.notional)).toBe(true);
    expect(ruse.nodes.filter((n) => n.level === 'company')).toHaveLength(0);
    expect(ruse.nodes).toHaveLength(15);
    expect(ruse.units).toHaveLength(15);
    for (const net of ruse.nets) expect(net.memberIds.filter((id) => id !== net.hubId).length).toBeLessThanOrEqual(5);
    expect(Object.values(ruse.profiles).every((p) => p.notional)).toBe(true);
    const bn = ruse.nets.find((n) => n.hubId === 'n-b1-1')!;
    expect(ruse.profiles[bn.id].notionalMembers).toBe(3); // the companies it does not have
  });

  it('profiles: two peaks a day, quiet nights, a ramp, silence before the move, orders on the hour', () => {
    const d = DUTY.division;
    expect(d[8]).toBeGreaterThan(d[3]);
    expect(d[19]).toBeGreaterThan(d[14]);
    expect(d[3]).toBeLessThan(0.15);
    const p = real.profiles[real.nets[0].id];
    expect(dutyAt(p, 8 + 48)).toBeGreaterThan(dutyAt(p, 8));
    expect(dutyAt(p, 67)).toBe(0);
    const divNet = real.nets.find((n) => n.hubId === 'r-div')!;
    expect(orderDue(real.profiles[divNet.id], 6)).toBe(true);
    expect(orderDue(real.profiles[divNet.id], 7)).toBe(false);
    expect(orderDue(real.profiles[divNet.id], 66)).toBe(false);
  });
});
