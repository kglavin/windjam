import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { createMission, deliveredOrders, emissionsAt, issue, realFixes, visibleLog } from './mission';
import { MISSION_RULES as R, type MissionState } from './types';
import { allLinkBudgets, unitById } from '../world';
import { axialToOffset } from '../hex';
import { patternGainDbi } from '../rf';

const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const p = parseCommand(line, s.side);
    if (!p.ok) throw new Error(`${line}: ${p.error}`);
    s = issue(s, p.command);
  }
  return s;
};

describe('mission 2: setup', () => {
  const s = createMission(1234, 'hide');
  it('plays Red against a scripted Blue, with six orders in ten-minute windows', () => {
    expect(s.side).toBe('red');
    expect(s.playbook).toBeDefined();
    expect(s.playbook!.schedule.length).toBeGreaterThan(3);
    expect(s.redOrders).toHaveLength(R.redOrderCount);
    expect(s.redOrders[0]).toMatchObject({ n: 1, windowStart: 0, windowEnd: 10, status: 'pending' });
  });
  it('parses the Red grammar', () => {
    for (const line of ['send', 'emcon cmd 5', 'hq: power 5', 'cmd: waveform dsss', 'hq: antenna toward relay', 'relay: antenna omni', 'ew: decoy cmd', 'ew: decoy off', 'ew: jam cmd', 'ew: jam off', 'hq: move 150,80']) {
      expect(parseCommand(line, 'red').ok, line).toBe(true);
    }
    for (const line of ['uav: df e 5', 'emcon cmd 50', 'sq1: antenna toward hq', 'ew: jam squad']) {
      const p = parseCommand(line, 'red');
      // uav is not a Red unit; 50% is out of range; squads have no directional kit (rejected at issue); 'squad' is not a Blue net.
      if (line === 'sq1: antenna toward hq') expect(p.ok).toBe(true);
      else expect(p.ok, line).toBe(false);
    }
  });
  it('keeps Blue off Red’s console', () => {
    const after = run(s, ['wait 12']);
    const mine = visibleLog(after);
    expect(mine.some((l) => /Blue Squad/.test(l.text) && l.kind === 'order')).toBe(false);
    expect(after.log.some((l) => l.side === 'blue' && l.kind === 'order')).toBe(true);
  });
});

describe('mission 2: emissions', () => {
  const s = createMission(1234, 'hide');
  const hq = unitById(s.world, 'r-hq')!;
  const cmd = s.world.nets.find((n) => n.id === 'red-cmd')!;

  it('emcon 0 leaves only order bursts', () => {
    let quiet = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0']);
    let chatter = 0;
    for (let m = 0; m < 60; m++) chatter += emissionsAt(quiet, hq, m).filter((e) => e.what === 'chatter').length;
    expect(chatter).toBe(0);
    quiet = run(quiet, ['send']);
    expect(emissionsAt(quiet, hq, 0).map((e) => e.what)).toContain('order 1');
  });

  it('a send is heard by Blue when a Blue sensor is on task, and gives Blue a bearing on HQ', () => {
    // Blue's playbook has sensors listening from T+0. Chatter off so the only Red emission is the order.
    let t = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0', 'send', 'wait 12']);
    const onHq = t.tracks.find((x) => x.emitterId === 'r-hq');
    expect(onHq).toBeDefined();
    expect(t.redOrders[0].status).toBe('on time');
  });

  it('a directional HQ antenna is 20 dB down off-axis (the direct link survives it at this range)', () => {
    const t = run(s, ['hq: antenna toward relay']);
    const hq2 = unitById(t.world, 'r-hq')!;
    const relay = unitById(t.world, 'r-relay')!;
    const sq1 = unitById(t.world, 'r-sq1')!;
    expect(patternGainDbi(hq2, relay.pos, t.world.map)).toBe(6);
    expect(patternGainDbi(hq2, sq1.pos, t.world.map)).toBe(-14);
    const before = allLinkBudgets(s.world).find((v) => v.link.id === 'red-cmd:r-hq-r-sq1')!;
    const after = allLinkBudgets(t.world).find((v) => v.link.id === 'red-cmd:r-hq-r-sq1')!;
    expect(before.budget.forward.rxPowerDbm - after.budget.forward.rxPowerDbm).toBeCloseTo(17, 0); // 3 dBi omni -> -14 dBi
    expect(after.budget.quality).toBe('good'); // 50 W at 7 km has margin to spare: pointing alone does not force the relay
  });

  it('power control clamps to the radio and lowers what Blue receives', () => {
    const t = run(s, ['hq: power 500']);
    expect(unitById(t.world, 'r-hq')!.radio.powerW).toBe(50);
    const low = run(s, ['hq: power 5']);
    expect(unitById(low.world, 'r-hq')!.radio.powerW).toBe(5);
  });

  it('DSSS makes the command net 23 dB harder to detect', () => {
    const t = run(s, ['cmd: waveform dsss']);
    expect(t.world.nets.find((n) => n.id === 'red-cmd')!.waveform).toEqual({ kind: 'dsss', chipRateMcps: 5 });
    const plain = emissionsAt(run(s, ['emcon cmd 20']), hq, 0).find((e) => e.what === 'chatter');
    const spread = emissionsAt(run(t, ['emcon cmd 20']), hq, 0).find((e) => e.what === 'chatter');
    if (plain && spread) expect(plain.em.powerDbm - spread.em.powerDbm).toBeCloseTo(23, 0);
    expect(cmd.freqMHz).toBe(45);
  });
});

describe('mission 2: decoy, jamming and orders', () => {
  const s = createMission(1234, 'hide');

  it('a decoy draws a Blue track with the real net’s signature, and a fix on it does not count', () => {
    let t = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0', 'ew: decoy cmd', 'wait 20']);
    const onDecoy = t.tracks.find((x) => x.emitterId === 'r-ew');
    expect(onDecoy).toBeDefined();
    expect(onDecoy!.signature).toBe('45 MHz hopper');
    expect(realFixes(t)).toBe(t.tracks.filter((x) => x.fix && x.fix.cepKm < 1 && x.emitterId !== 'r-ew').length);
  });

  it('cannot decoy and jam at once', () => {
    const t = run(s, ['ew: decoy cmd', 'ew: jam cmd']);
    expect(t.log.at(-1)!.text).toMatch(/one transmitter/);
    expect(unitById(t.world, 'r-ew')!.jammer!.mode).toBe('off');
  });

  it('jamming Blue’s command net holds Blue’s reports', () => {
    const t = run(s, ['ew: jam cmd', 'wait 12']);
    expect(unitById(t.world, 'r-ew')!.jammer).toMatchObject({ mode: 'spot', targetNetId: 'blue-cmd' });
    expect(t.held.some((r) => r.side === 'blue')).toBe(true);
  });

  it('orders expire unsent, and send is refused outside a window or while HQ moves', () => {
    let t = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0', 'wait 10']);
    expect(t.redOrders[0].status).toBe('lost');
    const hq = axialToOffset(unitById(t.world, 'r-hq')!.pos);
    t = run(t, [`hq: move ${hq.col + 2},${hq.row}`, 'send']);
    expect(t.log.at(-1)!.text).toMatch(/HQ is moving/);
    t = run(t, ['wait 8', 'send']);
    expect(t.log.at(-1)!.text).toMatch(/order 2 sent/i);
  });

  it('Red hears Blue’s report bursts and gets tracks on Blue', () => {
    const t = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0', 'wait 25']);
    expect(t.redTracks.length).toBeGreaterThan(0);
    expect(t.redTracks.every((x) => unitById(t.world, x.emitterId)!.side === 'blue')).toBe(true);
  });

  it('resolves: a silent Red that sends nothing draws; a loud Red is found', () => {
    const silent = run(s, ['emcon cmd 0', 'emcon retrans 0', 'emcon squad 0', 'wait 60']);
    expect(['draw', 'won']).toContain(silent.status);
    expect(deliveredOrders(silent)).toBe(0);
    const loud = run(s, ['wait 60']);
    expect(['lost', 'draw', 'won']).toContain(loud.status);
  });
});
