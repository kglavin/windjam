import { describe, expect, it } from 'vitest';
import { axialToOffset, offsetToAxial } from '../hex';
import { allLinkBudgets, unitById } from '../world';
import { parseCommand } from './commands';
import { advance, createMission, inbox, issue, memberLink, receipts, sendOrder, unitStatusLines, visibleLog, visibleLogFor } from './mission';
import type { MissionState, PlayerSide } from './types';

const start = () => createMission(1234, 'duel');

// Put a unit 60 km (120 hexes) east of where it stands, on open ground.
const moveFar = (s: MissionState, id: string): MissionState => {
  const { col, row } = axialToOffset(unitById(s.world, id)!.pos);
  const pos = offsetToAxial(col + 120, row);
  return { ...s, world: { ...s.world, units: s.world.units.map((u) => (u.id === id ? { ...u, pos } : u)) } };
};

const type = (s: MissionState, line: string, as: PlayerSide = 'blue') => {
  const p = parseCommand(line, as);
  if (!p.ok) throw new Error(`${line}: ${p.error}`);
  return issue(s, p.command, as);
};

describe('c2: orders over the net', () => {
  it('a created mission has no messages', () => {
    expect(start().messages).toEqual([]);
  });

  it('sendOrder creates a pending message and HQ’s burst on the hub net', () => {
    const s = start();
    sendOrder(s, 'blue', 'b-sq1', 'df e 5');
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toMatchObject({ n: 1, side: 'blue', fromId: 'b-hq', toId: 'b-sq1', text: 'df e 5', sentMin: 0, status: 'pending' });
    expect(s.bursts).toContainEqual({ minute: 0, unitId: 'b-hq', netId: 'blue-cmd', what: 'order 1' });
    expect(visibleLog(s, 'blue').some((e) => e.text === 'HQ: order 1 to Blue Squad 1 sent.')).toBe(true);
  });

  it('refuses a unit on the other side, and a unit on no net', () => {
    const s = start();
    sendOrder(s, 'blue', 'r-sq1', 'x');
    sendOrder(s, 'blue', 'b-ew', 'x');
    expect(s.messages).toHaveLength(0);
    const errors = visibleLog(s, 'blue').filter((e) => e.kind === 'error').map((e) => e.text);
    expect(errors).toContain('Red Squad 1 is not yours to command.');
    expect(errors).toContain('Blue EW Team is on no net HQ can reach.');
  });

  it('refuses while HQ is moving', () => {
    let s = start();
    const { col, row } = axialToOffset(unitById(s.world, 'r-hq')!.pos);
    s = type(s, `hq: move ${col},${row + 4}`, 'red');
    s = type(s, 'send sq1: df e 5', 'red');
    expect(s.messages).toHaveLength(0);
    expect(visibleLog(s, 'red').at(-1)!.text).toMatch(/HQ is moving/);
  });

  it('delivers on time and is acknowledged, with the ack as a burst', () => {
    const s = advance(type(start(), 'send sq1: df e 5'), 1);
    expect(s.messages[0]).toMatchObject({ status: 'on time', arriveMin: 0, ackMin: 0 });
    expect(s.bursts).toContainEqual({ minute: 0, unitId: 'b-sq1', netId: 'blue-cmd', what: 'ack order 1' });
    const text = visibleLog(s, 'blue').map((e) => e.text);
    expect(text).toContain('Blue Squad 1: order 1 received: df e 5');
    expect(text).toContain('HQ: order 1 acknowledged by Blue Squad 1.');
    expect(visibleLog(s, 'red').some((e) => /order 1/.test(e.text))).toBe(false);
  });

  it('loses an order after 3 minutes, and it never arrives, when the unit is 60 km away', () => {
    let s = moveFar(start(), 'b-sq1');
    expect(memberLink(s, 'b-sq1', allLinkBudgets(s.world))!.order.status).toBe('lost');
    s = type(s, 'send sq1: df e 5');
    s = advance(s, 3);
    expect(s.messages[0].status).toBe('pending');
    s = advance(s, 1);
    expect(s.messages[0]).toMatchObject({ status: 'lost' });
    expect(s.messages[0].arriveMin).toBeUndefined();
    expect(s.messages[0].ackMin).toBeUndefined();
    expect(visibleLog(s, 'blue').some((e) => e.text === 'HQ: order 1 to Blue Squad 1: no acknowledgement, lost.')).toBe(true);
    expect(visibleLog(s, 'blue').some((e) => /received/.test(e.text))).toBe(false);
  });

  it('a received order whose acknowledgement is lost ends lost at HQ, with arriveMin set', () => {
    // A 1 kbps net makes a delivered order late (about 34 s against a 20 s window): it arrives one minute after sending.
    let s = start();
    s = { ...s, world: { ...s.world, nets: s.world.nets.map((n) => ({ ...n, dataRateKbps: 1 })) } };
    s = type(s, 'send sq1: df e 5');
    s = advance(s, 1);
    expect(s.messages[0]).toMatchObject({ status: 'pending', arriveMin: 1 });
    s = advance(moveFar(s, 'b-sq1'), 1); // the unit gets the order, but the link back is gone
    expect(s.messages[0]).toMatchObject({ status: 'pending', arriveMin: 1 });
    expect(s.messages[0].ackMin).toBeUndefined();
    expect(visibleLog(s, 'blue').some((e) => e.text === 'Blue Squad 1: order 1 received: df e 5')).toBe(true);
    s = advance(s, 3);
    expect(s.messages[0]).toMatchObject({ status: 'lost', arriveMin: 1 });
  });

  it('a late order is acknowledged late', () => {
    let s = start();
    s = { ...s, world: { ...s.world, nets: s.world.nets.map((n) => ({ ...n, dataRateKbps: 1 })) } };
    s = advance(type(s, 'send sq1: df e 5'), 2);
    expect(s.messages[0]).toMatchObject({ status: 'late', arriveMin: 1, ackMin: 1 });
  });

  it('inbox and receipts reflect delivery', () => {
    let s = type(start(), 'send sq1: df e 5');
    s = type(s, 'send sq2: df n 5');
    s = advance(s, 1);
    s = type(moveFar(s, 'b-sq2'), 'send sq2: df s 5');
    s = advance(s, 4);
    expect(inbox(s, 'b-sq1', 0).map((o) => o.n)).toEqual([1]);
    expect(inbox(s, 'b-sq1', 1)).toEqual([]);
    expect(inbox(s, 'b-sq2', 0).map((o) => o.n)).toEqual([2]);
    expect(inbox(s, 'b-sq3', 0)).toEqual([]);
    expect(receipts(s, 'blue').map((o) => [o.n, o.status])).toEqual([[1, 'on time'], [2, 'on time'], [3, 'lost']]);
    expect(receipts(s, 'red')).toEqual([]);
  });

  it('does not leak messages between turns', () => {
    const before = type(start(), 'send sq1: df e 5');
    advance(before, 1);
    expect(before.messages[0].status).toBe('pending');
  });
});

describe('c2: console grammar', () => {
  it('parses send <unit>: <text> for either side', () => {
    expect(parseCommand('send sq1: df e 5', 'blue')).toEqual({ ok: true, command: { type: 'order', toId: 'b-sq1', text: 'df e 5' } });
    expect(parseCommand('send sq2: Find the UAV', 'red')).toEqual({ ok: true, command: { type: 'order', toId: 'r-sq2', text: 'Find the UAV' } });
    expect(parseCommand('send nobody: x').ok).toBe(false);
    expect(parseCommand('send sq1:').ok).toBe(false);
  });

  it('keeps the bare send for mission 2', () => {
    expect(parseCommand('send', 'red')).toEqual({ ok: true, command: { type: 'send' } });
    const s = type(start(), 'send', 'red');
    expect(s.redOrders[0].sentMin).toBe(0);
    expect(s.messages).toEqual([]);
  });

  it('routes an order to the issuing side’s HQ', () => {
    const s = type(start(), 'send sq1: hold', 'red');
    expect(s.messages[0]).toMatchObject({ side: 'red', fromId: 'r-hq', toId: 'r-sq1' });
  });

  it('refuses the EW team', () => {
    const s = type(start(), 'send ew: jam cmd');
    expect(s.messages).toEqual([]);
    expect(visibleLog(s, 'blue').at(-1)!.text).toBe('Blue EW Team is on no net HQ can reach.');
  });
});

describe('orders on a second hub net', () => {
  // Mission 4: Red's UAV is on its own hub net, not the command net, so the order travels on red-uav.
  it('reaches a UAV on its own link and is acknowledged there', () => {
    let s = createMission(1234, 'uav');
    s = type(s, 'send uav: hold at waypoint 3', 'red');
    expect(s.messages).toHaveLength(1);
    expect(s.bursts.find((b) => b.what === 'order 1')).toMatchObject({ unitId: 'r-hq', netId: 'red-uav' });
    s = advance(s, 1);
    expect(s.messages[0].status).toBe('on time');
    expect(s.bursts.find((b) => b.what === 'ack order 1')).toMatchObject({ unitId: 'r-uav', netId: 'red-uav' });
    expect(memberLink(s, 'r-uav', allLinkBudgets(s.world))?.link.netId).toBe('red-uav');
  });
  it('logs a lost order as an event, not an error', () => {
    let s = moveFar(start(), 'b-sq1');
    s = type(s, 'send sq1: df e 5');
    s = advance(s, 4);
    const line = visibleLog(s, 'blue').find((e) => /no acknowledgement, lost/.test(e.text));
    expect(line?.kind).toBe('hq');
  });
});

describe('c2: events', () => {
  it('an on-time order records a send and an ack with the order number', () => {
    const s = advance(type(start(), 'send sq1: df e 5'), 1);
    expect(s.events).toContainEqual({ kind: 'send', minute: 0, orderN: 1, fromId: 'b-hq', toId: 'b-sq1', status: 'pending' });
    expect(s.events).toContainEqual({ kind: 'ack', minute: 0, unitId: 'b-sq1', side: 'blue', orderN: 1 });
  });

  it('an order lost on the way has a send and no ack', () => {
    const s = advance(type(moveFar(start(), 'b-sq1'), 'send sq1: df e 5'), 5);
    expect(s.events.some((e) => e.kind === 'send' && e.orderN === 1)).toBe(true);
    expect(s.events.some((e) => e.kind === 'ack')).toBe(false);
  });
});

describe('c2: unit view', () => {
  it('a squad’s log shows its own DF task line and not another squad’s', () => {
    let s = type(start(), 'sq1: df e 3');
    s = advance(type(s, 'sq2: df n 3'), 5);
    const mine = visibleLogFor(s, 'b-sq1');
    expect(mine.some((e) => /Blue Squad 1: DF .* done/.test(e.text))).toBe(true);
    expect(mine.some((e) => /Blue Squad 2/.test(e.text))).toBe(false);
    expect(mine.filter((e) => e.side).every((e) => e.unitId === 'b-sq1')).toBe(true);
    expect(mine.some((e) => !e.side)).toBe(true);
  });

  it('unitStatusLines shows the order text after an order arrives', () => {
    const s = advance(type(start(), 'send sq1: df e 5'), 1);
    const lines = unitStatusLines(s, 'b-sq1', 0);
    expect(lines[0]).toMatch(/Blue Squad 1 .* link to HQ: ok/);
    expect(lines).toContain('order 1 at T+0: df e 5');
    expect(unitStatusLines(s, 'b-sq1', 1)).not.toContain('order 1 at T+0: df e 5');
    expect(unitStatusLines(s, 'b-sq2', 0).some((l) => /^order /.test(l))).toBe(false);
  });

  it('capture lines never name a red unit', () => {
    let s = start();
    for (const sq of ['sq1', 'sq2', 'sq3']) s = type(s, `${sq}: df e 20`);
    s = advance(s, 20);
    expect(s.events.some((e) => e.kind === 'capture')).toBe(true);
    const red = s.world.units.filter((u) => u.side === 'red');
    const all = s.world.units.filter((u) => u.side === 'blue').flatMap((u) => unitStatusLines(s, u.id, 0));
    expect(all.some((l) => / heard /.test(l))).toBe(true);
    for (const l of all) for (const r of red) expect(l.includes(r.id) || l.includes(r.name), l).toBe(false);
  });
});
