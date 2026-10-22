// The deception mission's forces (docs/design-deception.md D3, D4): an order of battle as a tree of nets, laid on the
// ground round a centre, real or notional, each net with a traffic profile. The generator is seeded, so a scenario
// repeats.
import { createRng } from '../rng';
import type { Net, Side, UnitKind } from '../units';
import type { UnitSpec } from '../scenario';

export type Level = 'division' | 'brigade' | 'battalion' | 'company' | 'artillery' | 'recce';

export interface OrbatNode {
  id: string; // the node's unit id (its hub radio)
  name: string;
  level: Level;
  parent?: string; // the node above it
  netId: string; // the net it commands
  notional: boolean; // a transmitter with nothing behind it
  col: number; // reference grid, km
  row: number;
}

// A net's traffic (D5): chatter duty by hour of day, a multiplier per day, the hours its hub sends an order, and
// an hour from which it is silent (the real force before it moves).
export interface Profile {
  duty: number[]; // 24 values, share of the hour the net chatters
  ramp: number[]; // one per day
  orderHours: number[]; // hours of the day the hub sends an order down the net
  silentFrom?: number; // tick from which the net sends nothing
  notional?: boolean; // one transmitter plays the whole net
  notionalMembers?: number; // how many stations beyond its real members it pretends to have
}

export interface Force {
  nodes: OrbatNode[];
  units: UnitSpec[];
  nets: Net[];
  profiles: Record<string, Profile>; // by net id
}

const KIND: Record<Level, UnitKind> = { division: 'hq', brigade: 'hq', battalion: 'relay', company: 'squad', artillery: 'relay', recce: 'squad' };
const SPREAD: Record<Level, number> = { division: 0, brigade: 8, battalion: 4, company: 1.5, artillery: 5, recce: 6 };
const r1 = (v: number) => Math.round(v * 10) / 10;

// Daily curves: a division talks round the clock with two peaks; the lower the level, the quieter the night.
const curve = (peak: number, night: number): number[] =>
  Array.from({ length: 24 }, (_, h) => {
    const morning = Math.exp(-((h - 8) ** 2) / 8);
    const evening = Math.exp(-((h - 19) ** 2) / 8);
    return r1(Math.min(0.95, night + peak * Math.max(morning, evening)) * 100) / 100;
  });
export const DUTY: Record<Level, number[]> = {
  division: curve(0.35, 0.1),
  brigade: curve(0.3, 0.06),
  battalion: curve(0.25, 0.04),
  company: curve(0.2, 0.02),
  artillery: curve(0.25, 0.03),
  recce: curve(0.15, 0.05),
};
// How many stations a net of each level would have: a notional net's transmitter plays the ones it lacks.
const STATIONS: Record<Level, number> = { division: 5, brigade: 3, battalion: 3, company: 2, artillery: 3, recce: 3 };
const ORDER_HOURS: Record<Level, number[]> = { division: [6, 18], brigade: [7, 19], battalion: [8, 20], company: [], artillery: [9, 21], recce: [5, 17] };

export interface ForceSpec {
  side: Side;
  prefix: string; // unit ids: `${prefix}-...`
  name: string; // "Red" in unit names
  centre: { col: number; row: number }; // reference grid
  notional?: boolean; // the whole force is a ruse: nets with one transmitter each
  companies?: boolean; // company nets exist (a notional force pays for them)
  ramp: number[]; // per day
  silentFrom?: number; // the real force goes quiet before it moves
  freqMHz: number; // the first net's frequency; nets step up from it
}

const NET_STEP_MHZ = 0.2;

// Build a division: the tree, its radios, its nets and their profiles.
export function generateForce(seed: number, spec: ForceSpec): Force {
  const rng = createRng((seed ^ 0xd17) >>> 0);
  const nodes: OrbatNode[] = [];
  const units: UnitSpec[] = [];
  const nets: Net[] = [];
  const profiles: Record<string, Profile> = {};
  const notional = !!spec.notional;
  let freq = spec.freqMHz;
  const jitter = (km: number) => (rng() - 0.5) * km;
  const around = (c: { col: number; row: number }, km: number, k: number, n: number) => {
    const a = ((k + 0.5 + rng() * 0.3) / n) * 2 * Math.PI;
    return { col: r1(c.col + km * Math.cos(a) + jitter(1)), row: r1(c.row + km * Math.sin(a) + jitter(1)) };
  };
  const add = (id: string, name: string, level: Level, at: { col: number; row: number }, parent?: string): OrbatNode => {
    const node: OrbatNode = { id, name, level, parent, netId: `${spec.side}-${id.slice(spec.prefix.length + 1)}`, notional, col: at.col, row: at.row };
    nodes.push(node);
    units.push({ id, name, side: spec.side, kind: KIND[level], col: at.col, row: at.row, highGround: level === 'battalion' || level === 'artillery' });
    return node;
  };
  const net = (node: OrbatNode, memberIds: string[]) => {
    nets.push({ id: node.netId, name: `${node.name} Net`, side: spec.side, topology: 'hub', hubId: node.id, memberIds: [node.id, ...memberIds], freqMHz: r1(freq), bandwidthKHz: 25, dataRateKbps: 16, waveform: { kind: 'fixed' } });
    profiles[node.netId] = { duty: DUTY[node.level], ramp: spec.ramp, orderHours: ORDER_HOURS[node.level], silentFrom: spec.silentFrom, ...(notional ? { notional: true, notionalMembers: Math.max(0, STATIONS[node.level] - memberIds.length) } : {}) };
    freq += NET_STEP_MHZ;
  };
  const p = spec.prefix;
  const div = add(`${p}-div`, `${spec.name} Division HQ`, 'division', spec.centre);
  const brigades: OrbatNode[] = [];
  for (let b = 1; b <= 3; b++) {
    const bde = add(`${p}-b${b}`, `${spec.name} ${b} Brigade`, 'brigade', around(spec.centre, SPREAD.brigade, b - 1, 3), div.id);
    brigades.push(bde);
    const bns: OrbatNode[] = [];
    for (let n = 1; n <= 3; n++) {
      const bn = add(`${p}-b${b}-${n}`, `${spec.name} ${b}/${n} Battalion`, 'battalion', around(bde, SPREAD.battalion, n - 1, 3), bde.id);
      bns.push(bn);
      if (spec.companies ?? !notional) {
        const coys: OrbatNode[] = [];
        for (let c = 1; c <= 3; c++) coys.push(add(`${p}-b${b}-${n}-${c}`, `${spec.name} ${b}/${n}/${c} Company`, 'company', around(bn, SPREAD.company, c - 1, 3), bn.id));
        net(bn, coys.map((x) => x.id));
        // A company net: its two platoon radios.
        for (const coy of coys) {
          const platoons = [1, 2].map((k) => {
            const at = around(coy, 0.6, k - 1, 2);
            const id = `${coy.id}p${k}`;
            units.push({ id, name: `${coy.name} Platoon ${k}`, side: spec.side, kind: 'squad', col: at.col, row: at.row });
            return id;
          });
          net(coy, platoons);
        }
      } else {
        net(bn, []);
      }
    }
    net(bde, bns.map((x) => x.id));
  }
  const arty = add(`${p}-arty`, `${spec.name} Artillery`, 'artillery', around(spec.centre, SPREAD.artillery, 1.5, 3), div.id);
  const recce = add(`${p}-recce`, `${spec.name} Reconnaissance`, 'recce', around(spec.centre, SPREAD.recce, 0.2, 3), div.id);
  if (!notional) {
    const batteries = [1, 2, 3].map((k) => {
      const at = around(arty, 1.2, k - 1, 3);
      const id = `${arty.id}-${k}`;
      units.push({ id, name: `${spec.name} Battery ${k}`, side: spec.side, kind: 'squad', col: at.col, row: at.row });
      return id;
    });
    net(arty, batteries);
    const patrols = [1, 2, 3].map((k) => {
      const at = around(recce, 3, k - 1, 3);
      const id = `${recce.id}-${k}`;
      units.push({ id, name: `${spec.name} Patrol ${k}`, side: spec.side, kind: 'squad', col: at.col, row: at.row });
      return id;
    });
    net(recce, patrols);
  } else {
    net(arty, []);
    net(recce, []);
  }
  net(div, [...brigades.map((b) => b.id), arty.id, recce.id]);
  return { nodes, units, nets, profiles };
}

// The chatter duty of a net at a tick (an hour): its curve at that hour of day times the day's ramp, zero once silent.
export function dutyAt(profile: Profile, tick: number): number {
  if (profile.silentFrom !== undefined && tick >= profile.silentFrom) return 0;
  const day = Math.min(profile.ramp.length - 1, Math.floor(tick / 24));
  return Math.min(0.95, profile.duty[tick % 24] * profile.ramp[day]);
}

// Does this net's hub send an order in this tick?
export const orderDue = (profile: Profile, tick: number): boolean =>
  (profile.silentFrom === undefined || tick < profile.silentFrom) && profile.orderHours.includes(tick % 24);

// The notional tells, for the reveal: what the ruse could not afford.
export function tells(force: Force): string[] {
  const out: string[] = [];
  if (force.nodes.every((n) => n.notional)) {
    out.push('every acknowledgement came from the same place as the order: one transmitter per net');
    if (!force.nodes.some((n) => n.level === 'company')) out.push('no company nets under the battalions');
    out.push('no net moved in three days');
  }
  return out;
}

