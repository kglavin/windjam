// Association from signals (docs/design-deception.md D6). The collector's picture is built from what its sites
// intercepted: frequency, waveform, bearing and time. On one frequency, each site's bearings are clustered by
// direction; clusters from different sites whose lines cross consistently are one emitter and get a fix; a cluster no
// other site matches is an emitter with a wedge. A net is every emitter on one frequency; its hub is the emitter that
// sends the orders; its parent is the net on which the hub's station acknowledges. Nothing here reads the truth, so
// the picture can be wrong: two emitters on one bearing merge, a weak one is missed, a parent is guessed from a
// co-located fix.
import { type BearingLine, type Fix, bearingDeg, fixFromBearings } from '../detect';
import { hexDistanceKm } from '../rf';
import type { Hex } from '../hex';
import type { HexMap } from '../map';
import type { MissionEvent } from './types';

export interface Intercept {
  tick: number;
  sensorId: string;
  sensorPos: Hex;
  freqMHz: number;
  signature: string;
  bearingDeg: number;
  sigmaDeg: number;
  what: string; // the rhythm as heard: chatter, order, ack
}

export interface AssocEmitter {
  id: string; // A1, A2, ...
  freqMHz: number;
  signature: string;
  lines: BearingLine[]; // one per site cluster
  sites: string[];
  fix?: Fix; // no true miss: missKm is NaN
  intercepts: number;
  orders: number;
  acks: number;
  chatter: number;
  firstTick: number;
  lastTick: number;
  orderTicks: number[];
}

export interface AssocNet {
  id: string; // N1, N2, ...
  freqMHz: number;
  signature: string;
  emitterIds: string[];
  hubId?: string; // the emitter that sends orders
  orderTicks: number[];
  singleStation: boolean; // the orders and their acknowledgements come from one place: a tell
  parentNetId?: string; // the net the hub's station acknowledges on
}

export interface AssocPicture {
  emitters: AssocEmitter[];
  nets: AssocNet[];
}

const SITE_ERROR_DEG = 1;
const CLUSTER_DEG = 2; // bearings closer than this (or 2σ) from one site are one direction
const MATCH_SIGMAS = 3; // a line must pass within this many σ of the fix to belong to it
const SAME_PLACE_KM = 3.5; // fixes this close are one station (two fixes' errors at 30 km)
const MIN_OVERLAP = 0.2; // the share of ticks two sites must have heard a station in common

const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

interface Cluster {
  sensorId: string;
  sensorPos: Hex;
  bearingDeg: number;
  sigmaDeg: number;
  members: Intercept[];
  ticks: Set<number>; // when it was heard: a station chatters in the same hours from every site
}

// How much two clusters' hours overlap: the same station heard from two sites keeps the same hours.
function overlap(a: Cluster, b: Cluster): number {
  let both = 0;
  for (const t of a.ticks) if (b.ticks.has(t)) both++;
  return both / (a.ticks.size + b.ticks.size - both);
}

// One site's intercepts on one frequency, grouped by direction.
function clusterSite(list: Intercept[]): Cluster[] {
  const sorted = [...list].sort((a, b) => a.bearingDeg - b.bearingDeg);
  const groups: Intercept[][] = [];
  for (const it of sorted) {
    const g = groups.find((grp) => grp.some((x) => angleDiff(x.bearingDeg, it.bearingDeg) <= Math.max(CLUSTER_DEG, 2 * Math.max(x.sigmaDeg, it.sigmaDeg))));
    if (g) g.push(it);
    else groups.push([it]);
  }
  // Bearings near 0/360 split into two groups: merge the ends.
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    if (angleDiff(first[0].bearingDeg, last[last.length - 1].bearingDeg) <= CLUSTER_DEG) {
      groups[0] = [...last, ...first];
      groups.pop();
    }
  }
  return groups.map((members) => {
    let sin = 0;
    let cos = 0;
    let w = 0;
    for (const m of members) {
      const k = 1 / (m.sigmaDeg * m.sigmaDeg + 1e-6);
      const rad = (m.bearingDeg * Math.PI) / 180;
      sin += k * Math.sin(rad);
      cos += k * Math.cos(rad);
      w += k;
    }
    const mean = ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
    return { sensorId: members[0].sensorId, sensorPos: members[0].sensorPos, bearingDeg: mean, sigmaDeg: Math.sqrt(1 / w + SITE_ERROR_DEG ** 2), members, ticks: new Set(members.map((m) => m.tick)) };
  });
}

// How many σ a cluster's bearing misses a point by.
const missSigmas = (map: HexMap, c: Cluster, at: Hex): number => angleDiff(bearingDeg(map, c.sensorPos, at), c.bearingDeg) / c.sigmaDeg;

const lineOf = (c: Cluster): BearingLine => ({ sensorPos: c.sensorPos, bearingDeg: c.bearingDeg, sigmaDeg: c.sigmaDeg });
const fixHex = (f: Fix): Hex => ({ q: Math.round(f.q), r: Math.round(f.r) });

// Emitters on one frequency: clusters from different sites that cross consistently become one; the rest stand alone.
function emittersOnFrequency(map: HexMap, bySite: Map<string, Cluster[]>): Cluster[][] {
  const sites = [...bySite.keys()].sort((a, b) => bySite.get(b)!.length - bySite.get(a)!.length);
  const used = new Set<Cluster>();
  const out: Cluster[][] = [];
  const base = sites[0];
  for (const b of bySite.get(base) ?? []) {
    // Candidates from a second site: the lines must cross, and the hours heard must overlap. Then each further site
    // adds the cluster that fits the crossing and overlaps best. The combination with the most overlap wins.
    let best: { set: Cluster[]; score: number } | undefined;
    for (const s2 of sites.slice(1)) {
      for (const c of bySite.get(s2) ?? []) {
        if (used.has(c)) continue;
        const ov = overlap(b, c);
        if (ov < MIN_OVERLAP) continue;
        const f2 = fixFromBearings(map, [lineOf(b), lineOf(c)]);
        if (!f2) continue;
        const at = fixHex(f2);
        const set = [b, c];
        let score = ov;
        for (const s3 of sites.slice(1)) {
          if (s3 === s2) continue;
          const cands = (bySite.get(s3) ?? []).filter((x) => !used.has(x) && missSigmas(map, x, at) <= MATCH_SIGMAS && overlap(b, x) >= MIN_OVERLAP);
          const pick = cands.map((x) => ({ x, ov: overlap(b, x) })).sort((p, q) => q.ov - p.ov)[0];
          if (pick) {
            set.push(pick.x);
            score += pick.ov;
          }
        }
        if (!best || score > best.score) best = { set, score };
      }
    }
    if (best) {
      for (const c of best.set) used.add(c);
      out.push(best.set);
    } else {
      used.add(b);
      out.push([b]);
    }
  }
  for (const s of sites.slice(1)) for (const c of bySite.get(s) ?? []) if (!used.has(c)) {
    used.add(c);
    out.push([c]);
  }
  return out;
}

export function associate(map: HexMap, intercepts: Intercept[]): AssocPicture {
  const emitters: AssocEmitter[] = [];
  const nets: AssocNet[] = [];
  const byFreq = new Map<string, Intercept[]>();
  for (const it of intercepts) {
    const key = `${it.freqMHz}|${it.signature}`;
    byFreq.set(key, [...(byFreq.get(key) ?? []), it]);
  }
  const keys = [...byFreq.keys()].sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]));
  for (const key of keys) {
    const list = byFreq.get(key)!;
    const bySite = new Map<string, Cluster[]>();
    for (const sensorId of new Set(list.map((x) => x.sensorId))) bySite.set(sensorId, clusterSite(list.filter((x) => x.sensorId === sensorId)));
    const groups = emittersOnFrequency(map, bySite);
    const netEmitters: AssocEmitter[] = [];
    for (const set of groups) {
      const members = set.flatMap((c) => c.members);
      const ticks = members.map((m) => m.tick);
      const e: AssocEmitter = {
        id: `A${emitters.length + 1}`,
        freqMHz: list[0].freqMHz,
        signature: list[0].signature,
        lines: set.map(lineOf),
        sites: set.map((c) => c.sensorId),
        fix: set.length >= 2 ? fixFromBearings(map, set.map(lineOf)) : undefined,
        intercepts: members.length,
        orders: members.filter((m) => m.what === 'order').length,
        acks: members.filter((m) => m.what.startsWith('ack')).length,
        chatter: members.filter((m) => m.what === 'chatter').length,
        firstTick: Math.min(...ticks),
        lastTick: Math.max(...ticks),
        orderTicks: [...new Set(members.filter((m) => m.what === 'order').map((m) => m.tick))].sort((a, b) => a - b),
      };
      emitters.push(e);
      netEmitters.push(e);
    }
    const hub = netEmitters.filter((e) => e.orders > 0).sort((a, b) => b.orders - a.orders)[0];
    const ackers = netEmitters.filter((e) => e.acks > 0 && e !== hub);
    nets.push({
      id: `N${nets.length + 1}`,
      freqMHz: list[0].freqMHz,
      signature: list[0].signature,
      emitterIds: netEmitters.map((e) => e.id),
      hubId: hub?.id,
      orderTicks: hub?.orderTicks ?? [],
      singleStation: !!hub && hub.acks > 0 && ackers.length === 0,
    });
  }
  // The tree: a hub whose station also acknowledges on another net belongs under that net. Orders flow down, so the
  // parent's orders come earlier in the day than the child's: that rules out loops and most co-located neighbours.
  const orderHour = (n: AssocNet): number => Math.min(...n.orderTicks.map((t) => t % 24));
  for (const net of nets) {
    const hub = net.hubId ? emitters.find((e) => e.id === net.hubId) : undefined;
    if (!hub?.fix || net.orderTicks.length === 0) continue;
    const here = fixHex(hub.fix);
    const parents = nets
      .filter((n) => n !== net && n.orderTicks.length > 0 && orderHour(n) < orderHour(net))
      .map((n) => ({ n, acker: emitters.find((e) => n.emitterIds.includes(e.id) && e.id !== n.hubId && e.acks > 0 && e.fix && hexDistanceKm(map, fixHex(e.fix), here) <= SAME_PLACE_KM) }))
      .filter((x) => x.acker);
    if (parents.length) net.parentNetId = parents.sort((a, b) => hexDistanceKm(map, fixHex(a.acker!.fix!), here) - hexDistanceKm(map, fixHex(b.acker!.fix!), here))[0].n.id;
  }
  return { emitters, nets };
}

// The intercepts a side's sensors made, from the event record, with the site where it stood.
export function interceptsOf(events: MissionEvent[], sensorIds: Set<string>, posOf: (sensorId: string) => Hex | undefined): Intercept[] {
  const out: Intercept[] = [];
  for (const e of events) {
    if (e.kind !== 'capture' || !sensorIds.has(e.sensorId) || e.freqMHz === undefined) continue;
    const pos = posOf(e.sensorId);
    if (!pos) continue;
    out.push({ tick: e.minute, sensorId: e.sensorId, sensorPos: pos, freqMHz: e.freqMHz, signature: e.signature ?? `${e.freqMHz} MHz`, bearingDeg: e.bearingDeg, sigmaDeg: e.sigmaDeg, what: e.what });
  }
  return out;
}
