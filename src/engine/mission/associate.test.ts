import { describe, expect, it } from 'vitest';
import { bearingDeg } from '../detect';
import { type Hex, offsetToAxial } from '../hex';
import { hexDistanceKm } from '../rf';
import { createRng } from '../rng';
import { createScenario, refToHex } from '../scenario';
import { type Intercept, associate } from './associate';
import { parseCommand, knownIdsOf } from './commands';
import { advance, assocPictureOf, issue } from './mission';
import { missionFromScript } from './script';

const map = createScenario(1234).map;
const sites: Record<string, Hex> = { s1: refToHex(14, -8), s2: refToHex(14, 10), s3: refToHex(14, 28) };

// Intercepts of an emitter at `at` from every site over `ticks`, with what it sent each tick and 1° of noise.
function heard(at: Hex, freqMHz: number, ticks: number[], what: (t: number) => string, rng: () => number, sigma = 1): Intercept[] {
  const out: Intercept[] = [];
  for (const t of ticks) for (const [sensorId, sensorPos] of Object.entries(sites)) out.push({ tick: t, sensorId, sensorPos, freqMHz, signature: `${freqMHz} MHz fixed`, bearingDeg: bearingDeg(map, sensorPos, at) + sigma * (rng() - 0.5) * 2, sigmaDeg: sigma, what: what(t) });
  return out;
}
const rng = createRng(7);
const hours = Array.from({ length: 24 }, (_, i) => i);
const divHub = refToHex(44, 10);
const bdeHub = refToHex(50, 4);
const bdeMember = refToHex(38, 14);

describe('association from signals', () => {
  it('two stations on one frequency at different places become two emitters with fixes near the truth', () => {
    const log = [...heard(divHub, 40, hours, (t) => (t === 6 ? 'order' : 'chatter'), rng), ...heard(bdeHub, 40, hours, (t) => (t === 6 ? 'ack' : 'chatter'), rng)];
    const p = associate(map, log);
    expect(p.nets).toHaveLength(1);
    expect(p.emitters).toHaveLength(2);
    for (const e of p.emitters) {
      expect(e.fix).toBeDefined();
      const d = Math.min(hexDistanceKm(map, { q: Math.round(e.fix!.q), r: Math.round(e.fix!.r) }, divHub), hexDistanceKm(map, { q: Math.round(e.fix!.q), r: Math.round(e.fix!.r) }, bdeHub));
      expect(d).toBeLessThan(2);
    }
    // The hub is the emitter that sends the orders, and it sits at the division.
    const hub = p.emitters.find((e) => e.id === p.nets[0].hubId)!;
    expect(hexDistanceKm(map, { q: Math.round(hub.fix!.q), r: Math.round(hub.fix!.r) }, divHub)).toBeLessThan(2);
    expect(p.nets[0].singleStation).toBe(false);
  });

  it('a hub that acknowledges on another net puts its net under that one; a notional net is a tell', () => {
    const log = [
      ...heard(divHub, 40, hours, (t) => (t === 6 ? 'order' : 'chatter'), rng),
      ...heard(bdeHub, 40, hours, (t) => (t === 6 ? 'ack' : 'chatter'), rng),
      ...heard(bdeHub, 41, hours, (t) => (t === 7 ? 'order' : 'chatter'), rng),
      ...heard(bdeMember, 41, hours, (t) => (t === 7 ? 'ack' : 'chatter'), rng),
      // The ruse: one transmitter plays a hub and its three stations.
      ...heard(refToHex(44, 40), 50, hours, (t) => (t === 6 ? 'order' : 'chatter'), rng),
      ...heard(refToHex(44, 40), 50, [6, 6, 6], () => 'ack (station 2)', rng),
    ];
    const p = associate(map, log);
    const n40 = p.nets.find((n) => n.freqMHz === 40)!;
    const n41 = p.nets.find((n) => n.freqMHz === 41)!;
    const n50 = p.nets.find((n) => n.freqMHz === 50)!;
    expect(n41.parentNetId).toBe(n40.id);
    expect(n40.parentNetId).toBeUndefined();
    expect(n50.singleStation).toBe(true);
    expect(n41.singleStation).toBe(false);
  });

  it('a station heard by one site only is an emitter with a wedge and no fix', () => {
    const only = heard(divHub, 42, hours, () => 'chatter', rng).filter((i) => i.sensorId === 's2');
    const p = associate(map, only);
    expect(p.emitters).toHaveLength(1);
    expect(p.emitters[0].fix).toBeUndefined();
    expect(p.nets[0].hubId).toBeUndefined();
  });

  it('d01: three sites watching for a day associate most of the division and find its tree', () => {
    let s = missionFromScript({ commands: [], scenario: 'd01' }, 1234);
    for (const line of ['s1: watch 40-48 24', 's2: watch 40-48 24', 's3: watch 40-48 24']) {
      const p = parseCommand(line, 'blue', knownIdsOf(s.world));
      if (p.ok) s = issue(s, p.command, 'blue');
    }
    s = advance(s, 24);
    const p = assocPictureOf(s, 'blue');
    const trueNets = s.world.nets.filter((n) => n.side === 'red' && n.freqMHz >= 40 && n.freqMHz <= 48);
    expect(p.nets.length).toBeGreaterThanOrEqual(trueNets.length * 0.8);
    // Hubs: an associated hub's fix is within 2 km of the true hub of the net on that frequency, most of the time.
    let right = 0;
    let withHub = 0;
    for (const n of p.nets) {
      const hub = p.emitters.find((e) => e.id === n.hubId);
      const truth = trueNets.find((t) => t.freqMHz === n.freqMHz);
      if (!hub?.fix || !truth?.hubId) continue;
      withHub++;
      const at = s.world.units.find((u) => u.id === truth.hubId)!.pos;
      if (hexDistanceKm(s.world.map, { q: Math.round(hub.fix.q), r: Math.round(hub.fix.r) }, at) <= 2) right++;
    }
    expect(withHub).toBeGreaterThan(10);
    // A baseline for the association, not a target: companies sit 1.5 km from their battalion, 3° apart at 30 km.
    expect(right / withHub).toBeGreaterThan(0.5);
    // The division's net is the root: nothing it answers on.
    const divNet = p.nets.find((n) => n.freqMHz === 40)!;
    expect(divNet.parentNetId).toBeUndefined();
    // Parents: the associated parent is the true parent (by frequency) more often than not. A baseline, as above.
    let parents = 0;
    let rightParent = 0;
    for (const n of p.nets) {
      if (!n.parentNetId) continue;
      parents++;
      const truth = trueNets.find((t) => t.freqMHz === n.freqMHz);
      const trueParent = truth?.hubId ? s.world.nets.find((t) => t.side === 'red' && t.hubId !== truth.hubId && t.memberIds.includes(truth.hubId!)) : undefined;
      if (trueParent && p.nets.find((x) => x.id === n.parentNetId)?.freqMHz === trueParent.freqMHz) rightParent++;
    }
    expect(parents).toBeGreaterThan(10);
    expect(rightParent / parents).toBeGreaterThan(0.5);
    // Nothing in the picture names a true emitter.
    expect(s.world.units.some((u) => p.emitters.some((e) => e.id === u.id))).toBe(false);
    expect(offsetToAxial(1, 1)).toBeDefined();
  });
});
