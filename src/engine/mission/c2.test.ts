import { describe, expect, it } from 'vitest';
import { axialToOffset, offsetToAxial } from '../hex';
import { allLinkBudgets, unitById } from '../world';
import { parseCommand } from './commands';
import { advance, createMission, emissionsAt, enableC2, inbox, issue, memberLink, receipts, reportNow, sendOrder, statusLines, unitStatusLines, visibleLog, visibleLogFor } from './mission';
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

describe('c2: reportNow', () => {
  // All three squads listen east for 20 minutes; return the first one that has heard something by T+10.
  const heardSquad = (): { s: MissionState; id: string } => {
    let s = start();
    for (const sq of ['sq1', 'sq2', 'sq3']) s = type(s, `${sq}: df e 20`);
    s = advance(s, 10);
    const id = ['b-sq1', 'b-sq2', 'b-sq3'].find((u) => {
      const o = s.orders[u];
      return o?.kind === 'df' && Object.keys(o.heard).length > 0;
    })!;
    return { s, id };
  };
  const heardOf = (s: MissionState, id: string) => {
    const o = s.orders[id];
    return o?.kind === 'df' ? Object.keys(o.heard).length : -1;
  };

  it('files what a DF task has heard so far, and the task continues', () => {
    const { s: before, id } = heardSquad();
    expect(id).toBeDefined();
    const emitters = heardOf(before, id);
    const s = reportNow(before, id);
    const text = visibleLogFor(s, id).filter((e) => e.kind === 'report').map((e) => e.text);
    expect(text.at(-1)).toMatch(new RegExp(`report so far. ${emitters} emitter.*Reported to HQ`));
    expect(s.tracks.some((t) => t.bearings.some((b) => b.sensorId === id))).toBe(true);
    const o = s.orders[id];
    expect(o?.kind === 'df' && o.endMin === 20).toBe(true);
    expect(heardOf(s, id)).toBe(0);
    expect(heardOf(before, id)).toBe(emitters); // the old state is untouched
    const done = advance(s, 10);
    expect(visibleLogFor(done, id).some((e) => /DF .* done/.test(e.text))).toBe(true);
  });

  it('is refused on a sortie', () => {
    let s = createMission(1234, 'hunt');
    s = type(s, 'uav: sortie 30,30 e 4');
    s = advance(s, 1);
    expect(s.orders['b-uav']?.kind).toBe('sortie');
    s = reportNow(s, 'b-uav');
    const last = visibleLogFor(s, 'b-uav').at(-1)!;
    expect(last).toMatchObject({ kind: 'error', text: 'Blue UAV: radio silent until it returns.' });
  });

  it('says so when there is nothing to report', () => {
    const s = reportNow(start(), 'b-sq1');
    expect(visibleLogFor(s, 'b-sq1').at(-1)!.text).toBe('Nothing to report.');
  });
});

describe('c2: auto units', () => {
  const c2 = (s: MissionState, agents: string[]): MissionState => ({ ...s, c2: { blue: { agents } } });

  it('an order to an auto squad starts its DF task when it arrives', () => {
    const s = advance(type(c2(start(), []), 'send sq1: df e 5'), 1);
    expect(s.orders['b-sq1']).toMatchObject({ kind: 'df', centreDeg: 90, startMin: 0, endMin: 5 });
    expect(s.c2).toEqual({ blue: { agents: [] } });
    const done = advance(s, 5);
    expect(visibleLogFor(done, 'b-sq1').some((e) => /DF .* done/.test(e.text))).toBe(true);
  });

  it('an order an auto unit executes is still acknowledged, and so are orders after it in the same minute', () => {
    // Executing inside the delivery loop once left the loop updating stale copies: acted on, then marked lost.
    let s = c2(start(), []);
    s = type(type(s, 'send sq1: df e 5'), 'send sq3: df e 5');
    s = advance(s, 4);
    expect(s.orders['b-sq1']?.kind).toBe('df');
    expect(s.orders['b-sq3']?.kind).toBe('df');
    expect(s.messages.map((m) => m.status)).toEqual(['on time', 'on time']);
  });

  it('an order to a squad with an agent only waits in its inbox', () => {
    const s = advance(type(c2(start(), ['sq1']), 'send sq1: df e 5'), 1);
    expect(s.orders['b-sq1']).toBeUndefined();
    expect(inbox(s, 'b-sq1', 0)).toHaveLength(1);
  });

  it('a side not in C2 mode never executes an order', () => {
    const s = advance(type(c2(start(), []), 'send sq1: df e 5', 'red'), 1);
    expect(s.orders['r-sq1']).toBeUndefined();
  });

  it('an unparseable order logs the error and starts nothing', () => {
    const s = advance(type(c2(start(), []), 'send sq1: dance wildly'), 1);
    expect(s.orders['b-sq1']).toBeUndefined();
    const e = visibleLog(s, 'blue').find((x) => /cannot execute order 1/.test(x.text))!;
    expect(e.kind).toBe('error');
    expect(e.text).toMatch(/^Blue Squad 1: cannot execute order 1: Unknown order "dance"/);
  });

  it('text that is not a unit order, such as a wait, does not run', () => {
    const s = advance(type(c2(start(), []), 'send sq1: wait 5'), 1);
    expect(s.minute).toBe(1);
    expect(visibleLog(s, 'blue').some((x) => /cannot execute order 1/.test(x.text))).toBe(true);
  });

  it('clone keeps c2 across turns', () => {
    expect(advance(c2(start(), ['sq1']), 3).c2).toEqual({ blue: { agents: ['sq1'] } });
  });
});

describe('c2: EW net and commander status (WP-1.11)', () => {
  const c2 = (agents: string[], mission: 'duel' | 'uav' = 'duel') => {
    const s = createMission(1234, mission);
    for (const side of s.humans) enableC2(s, side, agents);
    return s;
  };

  it('enableC2 sets c2 and adds one EW net per side with no chatter', () => {
    const s = c2(['sq1']);
    expect(s.c2).toEqual({ blue: { agents: ['sq1'] }, red: { agents: ['sq1'] } });
    const net = s.world.nets.find((n) => n.id === 'blue-ew')!;
    expect(net).toMatchObject({ topology: 'hub', hubId: 'b-hq', memberIds: ['b-hq', 'b-ew'], freqMHz: 56, bandwidthKHz: 25, dataRateKbps: 16, waveform: { kind: 'fixed' } });
    expect(s.world.nets.find((n) => n.id === 'red-ew')!.freqMHz).toBe(50);
    expect(s.emcon['blue-ew']).toBe(0);
    enableC2(s, 'blue', ['sq1']);
    expect(s.world.nets.filter((n) => n.id === 'blue-ew')).toHaveLength(1);
    expect(memberLink(s, 'b-ew', allLinkBudgets(s.world))?.link.netId).toBe('blue-ew');
  });

  it('enableC2 refuses an unknown unit and a side with no console', () => {
    expect(() => enableC2(createMission(1234, 'duel'), 'blue', ['sq9'])).toThrow(/unknown blue unit sq9/);
    expect(() => enableC2(createMission(1234, 'find'), 'red', [])).toThrow(/red is not a console/);
  });

  it('a game without C2 has exactly the nets it had', () => {
    for (const mission of ['find', 'hide', 'duel', 'uav', 'hunt'] as const) {
      const plain = createMission(1234, mission);
      expect(plain.world.nets.some((n) => n.id.endsWith('-ew'))).toBe(false);
      const withC2 = createMission(1234, mission);
      for (const side of withC2.humans) enableC2(withC2, side, []);
      const ids = withC2.world.nets.map((n) => n.id);
      expect(ids.filter((id) => !id.endsWith('-ew'))).toEqual(plain.world.nets.map((n) => n.id));
    }
  });

  it('an order to ew is delivered on the EW net and an auto EW team starts jamming', () => {
    let s = type(c2([]), 'send ew: jam cmd');
    expect(s.bursts.find((b) => b.what === 'order 1')).toMatchObject({ unitId: 'b-hq', netId: 'blue-ew' });
    s = advance(s, 1);
    expect(s.messages[0]).toMatchObject({ status: 'on time', arriveMin: 0, ackMin: 0 });
    expect(s.bursts).toContainEqual({ minute: 0, unitId: 'b-ew', netId: 'blue-ew', what: 'ack order 1' });
    expect(unitById(s.world, 'b-ew')!.jammer).toMatchObject({ mode: 'spot', targetNetId: 'red-cmd' });
  });

  it('an auto EW team jams uavlink in mission 4', () => {
    const s = advance(type(c2([], 'uav'), 'send ew: jam uavlink'), 1);
    expect(unitById(s.world, 'b-ew')!.jammer).toMatchObject({ mode: 'spot', targetNetId: 'red-uav' });
  });

  it('the EW net has no chatter: it radiates only for orders and acknowledgements', () => {
    const quiet = advance(c2([]), 6);
    for (let m = 0; m < 6; m++) {
      expect(emissionsAt(quiet, unitById(quiet.world, 'b-ew')!, m)).toEqual([]);
      expect(emissionsAt(quiet, unitById(quiet.world, 'b-hq')!, m).filter((e) => e.em.freqMHz === 56)).toEqual([]);
    }
    const sent = advance(type(c2([]), 'send ew: jam off'), 1);
    expect(emissionsAt(sent, unitById(sent.world, 'b-hq')!, 0).filter((e) => e.em.freqMHz === 56).map((e) => e.what)).toEqual(['order 1']);
    expect(emissionsAt(sent, unitById(sent.world, 'b-ew')!, 0).map((e) => e.what)).toEqual(['ack order 1']);
  });

  it('the jammer’s emissions while jamming are the jam band, as without C2', () => {
    const jamming = (s: MissionState) => {
      const j = advance(type(s, 'ew: jam cmd'), 1);
      return emissionsAt(j, unitById(j.world, 'b-ew')!, 0).map((e) => [e.em, e.what]);
    };
    expect(jamming(c2([]))).toEqual(jamming(start()));
    expect(jamming(start())[0][1]).toBe('jamming');
  });

  it('the commander’s status lines appear only in C2 mode', () => {
    expect(statusLines(start(), 'blue').some((l) => /^Unit agents|^Orders:/.test(l))).toBe(false);
    const s = c2(['sq1']);
    const lines = statusLines(s, 'blue');
    expect(lines).toContain('Unit agents: sq1. Auto: relay, sq2, sq3, uav, ew.');
    expect(lines).toContain('Orders: 0 sent; acknowledged 0; pending 0; lost 0.');
    const oneSide = createMission(1234, 'duel');
    enableC2(oneSide, 'blue', []);
    expect(statusLines(oneSide, 'red').some((l) => /^Unit agents/.test(l))).toBe(false);
  });

  it('the orders line counts sent, acknowledged, pending and lost orders', () => {
    let s = moveFar(c2(['sq1', 'sq2', 'sq3']), 'b-sq3');
    s = type(s, 'send sq1: df e 5');
    s = type(s, 'send sq3: df e 5');
    s = advance(s, 1);
    s = type(s, 'send sq2: df e 5');
    const mid = statusLines(s, 'blue').find((l) => l.startsWith('Orders:'))!;
    expect(mid).toBe('Orders: 3 sent; acknowledged 1 (on time 1, late 0); pending 2 (n2 to sq3 since T+0, n3 to sq2 since T+1); lost 0.');
    s = advance(s, 4);
    const end = statusLines(s, 'blue').find((l) => l.startsWith('Orders:'))!;
    expect(end).toBe('Orders: 3 sent; acknowledged 2 (on time 2, late 0); pending 0; lost 1 (n2 to sq3).');
  });

  it('an order to a UAV on a sortie is refused', () => {
    let s = createMission(1234, 'hunt');
    s = type(s, 'uav: sortie 30,30 e 4');
    s = advance(s, 1);
    expect(s.orders['b-uav']?.kind).toBe('sortie');
    const before = s.messages.length;
    sendOrder(s, 'blue', 'b-uav', 'hold');
    expect(s.messages).toHaveLength(before);
    expect(visibleLog(s, 'blue').at(-1)).toMatchObject({ kind: 'error', text: 'Blue UAV is on a silent sortie and cannot be reached until it returns.' });
  });
});

describe('c2: same-turn delivery (WP-1.12)', () => {
  const c2 = (s: MissionState, agents: string[]): MissionState => ({ ...s, c2: { blue: { agents } } });

  it('an on-time order is in the inbox immediately after sendOrder, before any tick', () => {
    const s = type(c2(start(), ['sq1']), 'send sq1: df e 5');
    expect(s.messages[0]).toMatchObject({ status: 'pending', sentMin: 0, arriveMin: 0 });
    expect(inbox(s, 'b-sq1', 0).map((o) => o.n)).toEqual([1]);
    expect(unitStatusLines(s, 'b-sq1', 0).some((l) => /order 1 at T\+0: df e 5/.test(l))).toBe(true);
    expect(visibleLogFor(s, 'b-sq1').some((e) => /received/.test(e.text))).toBe(false);
  });

  it('a late order is not in the inbox until the tick sets its arrival', () => {
    let s = start();
    s = { ...s, world: { ...s.world, nets: s.world.nets.map((n) => ({ ...n, dataRateKbps: 1 })) } };
    s = type(c2(s, ['sq1']), 'send sq1: df e 5');
    expect(s.messages[0].arriveMin).toBeUndefined();
    expect(inbox(s, 'b-sq1', 0)).toEqual([]);
  });

  it('an auto unit still acts in the tick of the send minute', () => {
    let s = type(c2(start(), []), 'send sq1: df e 5');
    expect(s.orders['b-sq1']).toBeUndefined();
    s = advance(s, 1);
    expect(s.orders['b-sq1']).toMatchObject({ kind: 'df', startMin: 0 });
  });

  it('the received line and the acknowledgement happen once, in the tick, with several orders in a turn', () => {
    let s = type(c2(start(), ['sq1']), 'send sq1: df e 5');
    s = type(s, 'send sq1: df n 5');
    expect(s.messages.map((m) => m.ackMin)).toEqual([undefined, undefined]);
    s = advance(s, 5);
    expect(s.messages).toMatchObject([{ status: 'on time', arriveMin: 0, ackMin: 0 }, { status: 'on time', arriveMin: 0, ackMin: 0 }]);
    const text = visibleLog(s, 'blue').map((e) => e.text);
    for (const n of [1, 2]) {
      expect(text.filter((t) => t.startsWith(`Blue Squad 1: order ${n} received`))).toHaveLength(1);
      expect(text.filter((t) => t === `HQ: order ${n} acknowledged by Blue Squad 1.`)).toHaveLength(1);
    }
    expect(s.events.filter((e) => e.kind === 'ack')).toHaveLength(2);
    expect(s.bursts.filter((b) => b.what === 'ack order 1')).toHaveLength(1);
    expect(statusLines(s, 'blue').find((l) => l.startsWith('Orders:'))).toMatch(/^Orders: 2 sent; acknowledged 2 \(on time 2, late 0\)/);
    expect(inbox(s, 'b-sq1', 0).map((o) => o.n)).toEqual([1, 2]);
  });
});
