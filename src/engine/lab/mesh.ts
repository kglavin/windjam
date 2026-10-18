// Level 12 (docs/design-level-12.md): mesh networks. Links from the two-ray budget, fewest-hop routes, the parts a
// mesh falls into and the nodes whose loss splits it, a backbone, flooding costs, the RTS/CTS sums, carrier-sense
// denial against data jamming, HELLO timing, TOA and RTT ranging, and battery life under fake frames.
import type { Pt } from './geoloc';
import { pathLossDb } from './scene';

const log10 = Math.log10;
const dbm = (w: number) => 10 * log10(w * 1000);

// --- The radio model ---------------------------------------------------------------------------------------------

export interface MeshRadio {
  freqMHz: number;
  powerW: number;
  heightM: number;
  sensDbm: number; // a link needs at least this received power
  ccaDbm: number; // CSMA: the channel counts as busy at or above this
  gpDb: number; // the links' processing gain
  needDb: number; // Eb/J0 the links need (with noise small)
}

export const MESH_RADIO: MeshRadio = { freqMHz: 300, powerW: 1, heightM: 2, sensDbm: -95, ccaDbm: -85, gpDb: 15, needDb: 7 };

const two = { model: 'two-ray' as const };
const st = (p: Pt, heightM: number) => ({ xKm: p.xKm, yKm: p.yKm, heightM, powerW: 0, gainDbi: 0 });

export const meshLossDb = (r: MeshRadio, a: Pt, b: Pt, bHeightM = r.heightM): number =>
  pathLossDb(r.freqMHz, st(a, r.heightM), st(b, bHeightM), two).totalDb;

// Received power (dBm) at b from a radio of powerW at a.
export const rxDbm = (r: MeshRadio, a: Pt, b: Pt, powerW = r.powerW, aHeightM = r.heightM): number =>
  dbm(powerW) - pathLossDb(r.freqMHz, st(a, aHeightM), st(b, r.heightM), two).totalDb;

// The distance (km) at which a radio of powerW is received at `levelDbm`: the inverse of rxDbm, by bisection.
export function radiusKm(r: MeshRadio, powerW: number, levelDbm: number, heightM = r.heightM): number {
  let lo = 0.001;
  let hi = 1000;
  const at = (d: number) => rxDbm(r, { xKm: 0, yKm: 0 }, { xKm: d, yKm: 0 }, powerW, heightM);
  for (let i = 0; i < 100; i++) {
    const mid = Math.sqrt(lo * hi);
    if (at(mid) >= levelDbm) lo = mid;
    else hi = mid;
  }
  return lo;
}

// --- Graphs ------------------------------------------------------------------------------------------------------

export type Adj = number[][]; // neighbours of each node

export function meshLinks(r: MeshRadio, nodes: Pt[]): Adj {
  return nodes.map((a, i) => nodes.flatMap((b, j) => (i !== j && rxDbm(r, a, b) >= r.sensDbm ? [j] : [])));
}

export const linkCount = (adj: Adj): number => adj.reduce((s, n) => s + n.length, 0) / 2;

// Fewest-hop route from s to t (node list), or undefined when there is none. `gone` nodes neither send nor relay.
export function route(adj: Adj, s: number, t: number, gone: Set<number> = new Set()): number[] | undefined {
  if (gone.has(s) || gone.has(t)) return undefined;
  const prev = new Array<number>(adj.length).fill(-1);
  const seen = new Set([s]);
  const q = [s];
  while (q.length) {
    const u = q.shift()!;
    if (u === t) break;
    for (const v of adj[u]) {
      if (seen.has(v) || gone.has(v)) continue;
      seen.add(v);
      prev[v] = u;
      q.push(v);
    }
  }
  if (!seen.has(t)) return undefined;
  const path = [t];
  while (path[0] !== s) path.unshift(prev[path[0]]);
  return path;
}

// The nodes reachable from s.
export function reach(adj: Adj, s: number, gone: Set<number> = new Set()): Set<number> {
  const seen = new Set<number>();
  if (gone.has(s)) return seen;
  seen.add(s);
  const q = [s];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj[u]) if (!seen.has(v) && !gone.has(v)) {
      seen.add(v);
      q.push(v);
    }
  }
  return seen;
}

// The groups a mesh falls into (each a list of nodes), leaving out `gone` nodes.
export function parts(adj: Adj, gone: Set<number> = new Set()): number[][] {
  const left = new Set(adj.map((_, i) => i).filter((i) => !gone.has(i)));
  const out: number[][] = [];
  while (left.size) {
    const s = left.values().next().value as number;
    const p = [...reach(adj, s, gone)].sort((a, b) => a - b);
    for (const v of p) left.delete(v);
    out.push(p);
  }
  return out;
}

// Cut nodes: nodes whose loss splits their group in two or more.
export function cutNodes(adj: Adj): number[] {
  const before = parts(adj).length;
  return adj.map((_, i) => i).filter((i) => parts(adj, new Set([i])).length > before);
}

// A backbone (connected dominating set): a connected group of nodes that every other node is next to. Grown from
// `root` by adding, each time, the neighbour of the group that covers the most nodes not yet covered, then trimmed of
// any member it can do without. Assumes a connected mesh of 3 or more nodes.
export function backbone(adj: Adj, root: number): number[] {
  const set = new Set([root]);
  const covered = new Set([root, ...adj[root]]);
  while (covered.size < adj.length) {
    let best = -1;
    let gain = 0;
    for (const c of covered) {
      if (set.has(c)) continue;
      const g = adj[c].filter((v) => !covered.has(v)).length;
      if (g > gain || (g === gain && g > 0 && c < best)) {
        best = c;
        gain = g;
      }
    }
    if (best < 0) break;
    set.add(best);
    for (const v of adj[best]) covered.add(v);
  }
  for (const m of [...set].sort((a, b) => adj[a].length - adj[b].length || a - b)) {
    const without = [...set].filter((v) => v !== m);
    if (without.length && isDominatingConnected(adj, without)) set.delete(m);
  }
  return [...set].sort((a, b) => a - b);
}

export function isDominatingConnected(adj: Adj, set: number[]): boolean {
  const s = new Set(set);
  const dominated = adj.every((n, i) => s.has(i) || n.some((v) => s.has(v)));
  const sub = adj.map((n, i) => (s.has(i) ? n.filter((v) => s.has(v)) : []));
  return dominated && set.length > 0 && reach(sub, set[0]).size === set.length;
}

// --- Floods ------------------------------------------------------------------------------------------------------

// One flood: every node sends the message once. With relays given, only the source and the relays send it.
export const floodSends = (n: number, relays?: number[], source?: number): number =>
  relays ? relays.length + (source !== undefined && !relays.includes(source) ? 1 : 0) : n;
// Every node flooding once (topology messages): about N².
export const allFloodSends = (n: number, relaysEach?: number): number => n * (relaysEach === undefined ? n : relaysEach + 1);

// OLSR multipoint relays of u: the fewest neighbours (greedy) that between them reach every 2-hop neighbour.
export function mpr(adj: Adj, u: number): number[] {
  const n1 = new Set(adj[u]);
  const n2 = new Set<number>();
  for (const v of n1) for (const w of adj[v]) if (w !== u && !n1.has(w)) n2.add(w);
  const chosen: number[] = [];
  while (n2.size) {
    let best = -1;
    let bestCover = 0;
    for (const v of n1) {
      if (chosen.includes(v)) continue;
      const c = adj[v].filter((w) => n2.has(w)).length;
      if (c > bestCover) {
        best = v;
        bestCover = c;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    for (const w of adj[best]) n2.delete(w);
  }
  return chosen.sort((a, b) => a - b);
}

// A flood from `source` relayed only by multipoint relays: a node resends when it first hears the message from a
// neighbour that chose it as a relay. Returns the number of sends and whether every node was reached.
export function mprFlood(adj: Adj, source: number): { sends: number; reached: number } {
  const relays = adj.map((_, u) => new Set(mpr(adj, u)));
  const got = new Set([source]);
  let sends = 0;
  let frontier = [source];
  while (frontier.length) {
    const next: number[] = [];
    for (const u of frontier) {
      sends++;
      for (const v of adj[u]) {
        const first = !got.has(v);
        got.add(v);
        if (first && relays[u].has(v)) next.push(v);
      }
    }
    frontier = next;
  }
  return { sends, reached: got.size };
}

// --- The MAC -----------------------------------------------------------------------------------------------------

export interface FrameTimes {
  rtsUs: number;
  ctsUs: number;
  dataUs: number;
  ackUs: number;
  sifsUs: number;
}

// The duration each frame announces: whoever hears it stays quiet that long (the NAV).
export const navRtsUs = (f: FrameTimes): number => f.ctsUs + f.dataUs + f.ackUs + 3 * f.sifsUs;
export const navCtsUs = (f: FrameTimes): number => f.dataUs + f.ackUs + 2 * f.sifsUs;

// Hidden terminals: pairs (a, c) that both reach b but not each other.
export function hiddenPairs(adj: Adj): { a: number; b: number; c: number }[] {
  const out: { a: number; b: number; c: number }[] = [];
  adj.forEach((n, b) => {
    for (const a of n) for (const c of n) if (a < c && !adj[a].includes(c)) out.push({ a, b, c });
  });
  return out;
}

// TDMA: with `slots` slots of `slotMs`, a radio sends once a frame.
export const tdmaFrameMs = (slots: number, slotMs: number): number => slots * slotMs;

// --- Jamming a mesh ----------------------------------------------------------------------------------------------

export interface MeshJammer extends Pt {
  powerW: number;
  heightM: number;
}

// Carrier-sense denial: the radios that hear the jammer at or above the clear-channel threshold and so never send.
export function silenced(r: MeshRadio, nodes: Pt[], j: MeshJammer): number[] {
  return nodes.flatMap((p, i) => (rxDbm(r, j, p, j.powerW, j.heightM) >= r.ccaDbm ? [i] : []));
}

// The J/S a link takes before its data fails: Gp − the Eb/J0 it needs.
export const toleratedJsDb = (r: MeshRadio): number => r.gpDb - r.needDb;

// J/S at b's receiver on the link a → b.
export const linkJsDb = (r: MeshRadio, a: Pt, b: Pt, j: MeshJammer): number => rxDbm(r, j, b, j.powerW, j.heightM) - rxDbm(r, a, b);

// Data jamming: the links the jammer breaks (either direction failing breaks the link, as routing needs both).
export function brokenLinks(r: MeshRadio, nodes: Pt[], adj: Adj, j: MeshJammer): [number, number][] {
  const out: [number, number][] = [];
  adj.forEach((n, a) => {
    for (const b of n) {
      if (a > b) continue;
      if (Math.max(linkJsDb(r, nodes[a], nodes[b], j), linkJsDb(r, nodes[b], nodes[a], j)) > toleratedJsDb(r)) out.push([a, b]);
    }
  });
  return out;
}

// The mesh after a jammer: links it breaks removed, and silenced radios (CSMA) unable to send, so their links gone too.
export function jammedAdj(r: MeshRadio, nodes: Pt[], adj: Adj, j: MeshJammer, csma: boolean): Adj {
  const broken = new Set(brokenLinks(r, nodes, adj, j).map(([a, b]) => `${a}-${b}`));
  const quiet = new Set(csma ? silenced(r, nodes, j) : []);
  return adj.map((n, a) => n.filter((b) => !broken.has(`${Math.min(a, b)}-${Math.max(a, b)}`) && !quiet.has(a) && !quiet.has(b)));
}

// The radios that can no longer reach the gateway.
export function cutOff(adj: Adj, gateway: number): number[] {
  const ok = reach(adj, gateway);
  return adj.map((_, i) => i).filter((i) => !ok.has(i));
}

// The silenced radius, and the radius within which a link of `linkKm` loses its data, for one jammer power.
export function denialRadii(r: MeshRadio, jamW: number, linkKm: number, jamHeightM = r.heightM) {
  const s = rxDbm(r, { xKm: 0, yKm: 0 }, { xKm: linkKm, yKm: 0 });
  const silenceKm = radiusKm(r, jamW, r.ccaDbm, jamHeightM);
  const dataKm = radiusKm(r, jamW, s + toleratedJsDb(r), jamHeightM);
  // How many times the power data jamming needs to reach as far as the silenced radius.
  const powerRatio = 10 ** ((s + toleratedJsDb(r) - r.ccaDbm) / 10);
  return { signalDbm: s, silenceKm, dataKm, powerRatio };
}

// --- The overhead ------------------------------------------------------------------------------------------------

// A jammer that hits only the HELLOs (each helloMs long, every intervalS) is on for that share of the time, and
// saves 10·log10(1 ÷ duty) dB of average power. Neighbours drop a link after `allowedLoss` missed HELLOs.
export const helloDuty = (helloMs: number, intervalS: number): number => helloMs / (intervalS * 1000);
export const dutySavingDb = (duty: number): number => 10 * log10(1 / duty);
export const linkDropS = (intervalS: number, allowedLoss: number): number => intervalS * allowedLoss;

// --- Ranging -----------------------------------------------------------------------------------------------------

export const C_KM_PER_US = 0.299792458;
// Time of arrival: the flight time times the speed of light (needs both clocks in step).
export const toaKm = (flightUs: number): number => C_KM_PER_US * flightUs;
// Round trip: (round trip − the far radio's turnaround) ÷ 2, times the speed of light.
export const rttKm = (roundUs: number, turnUs: number): number => (C_KM_PER_US * (roundUs - turnUs)) / 2;
// A repeater that delays the exchange by delayUs adds this much to an RTT range. It cannot take any away.
export const rttDelayErrorKm = (delayUs: number): number => (C_KM_PER_US * delayUs) / 2;
// One chip of timing at chipRateMcps, as RTT range (metres).
export const chipRangeM = (chipRateMcps: number): number => (C_KM_PER_US * 1000) / chipRateMcps / 2;
// A UWB pulse pulseNs wide, as RTT range (metres): the same sum with the pulse as the chip.
export const pulseRangeM = (pulseNs: number): number => chipRangeM(1000 / pulseNs);

// --- Movement ----------------------------------------------------------------------------------------------------

// The longest two radios on crossing tracks stay linked: they meet head on and part, closing at relMs, with link range
// rangeKm, so the link spans 2 × range of relative travel.
export const linkLifetimeS = (rangeKm: number, relMs: number): number => (2000 * rangeKm) / relMs;

// --- Checking a position claim -----------------------------------------------------------------------------------

// The speed (km/h) two position reports dtS apart imply.
export const claimedSpeedKmh = (a: Pt, b: Pt, dtS: number): number => (Math.hypot(b.xKm - a.xKm, b.yKm - a.yKm) / dtS) * 3600;
// The most a platform with top speed topMs can move in dtS (km).
export const maxMoveKm = (topMs: number, dtS: number): number => (topMs * dtS) / 1000;
// The radios that hear a node directly must all be within link range of the spot it claims.
export const neighboursFit = (claim: Pt, hearers: Pt[], rangeKm: number): boolean =>
  hearers.every((h) => Math.hypot(h.xKm - claim.xKm, h.yKm - claim.yKm) <= rangeKm);
// A round-trip range can only come out long, so it bounds the true distance from above: a claim farther than it is
// false.
export const claimFitsRange = (claimedKm: number, rangedKm: number): boolean => claimedKm <= rangedKm;

// --- Denial of sleep ---------------------------------------------------------------------------------------------

export interface SleepBudget {
  batteryWh: number;
  sleepMw: number; // asleep
  listenMw: number; // radio on, listening for its slots
  listenDuty: number; // share of the time listening
  wakeMj: number; // energy to wake, receive and process one frame fully
  checkMj: number; // energy to check one frame's authenticated preamble and drop it
}

// Battery life (days) with fakeHz fake frames each second, each costing wakeMj, or checkMj with an authenticated
// preamble.
export function lifeDays(b: SleepBudget, fakeHz: number, authenticated: boolean): number {
  const mw = b.sleepMw * (1 - b.listenDuty) + b.listenMw * b.listenDuty + fakeHz * (authenticated ? b.checkMj : b.wakeMj);
  return (b.batteryWh * 1000) / mw / 24;
}
