// Level 12: Mesh networks under attack (docs/design-level-12.md). Part 1, units A to E: getting to know mesh
// networks, as level 0 teaches radio. Part 2, units F to K: attacking them, scored. Every number in the texts is
// checked in level12.test.ts.
import { createRng } from '../../rng';
import type { Pt } from '../geoloc';
import {
  type Adj, type FrameTimes, type MeshJammer, type SleepBudget, MESH_RADIO, backbone, brokenLinks, cutNodes, cutOff, denialRadii, dutySavingDb, helloDuty,
  claimedSpeedKmh, jammedAdj, linkLifetimeS, lifeDays, linkDropS, maxMoveKm, meshLinks, navCtsUs, parts, rttKm, silenced,
} from '../mesh';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level12Truth = shortCodeTruth;
const pick = <T,>(t: Truth, salt: number, list: T[]): T => list[Math.floor(createRng((t.seed ^ salt) >>> 0)() * list.length)];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const round1 = (v: number) => Math.round(v * 10) / 10;

// --- The example mesh (part 1's pictures) -------------------------------------------------------------------------

export interface MeshLayout {
  names: string[];
  nodes: Pt[];
  adj: Adj;
  gateway: number;
}

const layout = (list: [string, number, number][], gateway = 0): MeshLayout => {
  const nodes = list.map(([, xKm, yKm]) => ({ xKm, yKm }));
  return { names: list.map(([n]) => n), nodes, adj: meshLinks(MESH_RADIO, nodes), gateway };
};

// 14 radios on a 12 × 9 km map: a west group with the gateway G, an east group, two ways between them.
export const EXAMPLE_MESH = layout([
  ['G', 1, 4.5], ['W1', 2.6, 6.4], ['W2', 2.8, 2.6], ['W3', 4.2, 4.6], ['W4', 4.4, 7.0],
  ['B', 6.5, 4.2], ['N', 6.6, 7.6], ['E1', 8.6, 4.0], ['E2', 8.8, 6.4], ['E3', 9.2, 1.8],
  ['E4', 10.9, 5.2], ['E5', 10.8, 7.6], ['W5', 5.0, 1.4], ['E6', 11.2, 2.8],
]);
export const MESH_AREA = { xMax: 12, yMax: 9 };
export const ROUTE_TO = 11; // E5: A1's route runs from the gateway to it
export const EXAMPLE_BACKBONE = backbone(EXAMPLE_MESH.adj, 0);

// B2's exchange: RTS, CTS, DATA and ACK times (µs).
export const EXAMPLE_FRAMES: FrameTimes = { rtsUs: 50, ctsUs: 40, dataUs: 2000, ackUs: 40, sifsUs: 10 };
// E1's round trip: 750 m away, a 5.2 µs turnaround.
export const RTT_EXAMPLE = { roundUs: 10.2, turnUs: 5.2 };

// --- Part 2 ---------------------------------------------------------------------------------------------------------

export const LOSS_1KM_DB = 108.0; // the mesh's two-ray loss at 1 km, 2 m antennas; 40 dB more per tenfold distance
const jam = (p: Pt, powerW: number): MeshJammer => ({ ...p, powerW, heightM: MESH_RADIO.heightM });

// Unit F: carrier-sense denial. F1's numbers: 1 W against a 0.8 km link. F1's picture: the jammer by the east group.
export const F1_JAMMER = jam({ xKm: 9.5, yKm: 5.1 }, 1);
const F2_SETS = [{ w: 2, km: 1.0 }, { w: 0.5, km: 0.6 }, { w: 5, km: 1.2 }, { w: 0.2, km: 0.5 }];
export const csmaF2Set = (n: number) => at(F2_SETS, n);
export const f3Setup = (t: Truth) => ({ w: pick(t, 0xf31, [0.2, 0.5, 2, 5]), km: pick(t, 0xf32, [0.6, 0.8, 1.0, 1.2]) });

// Unit G: jamming only the HELLOs.
export const g2Setup = (t: Truth) => ({ helloMs: pick(t, 0x621, [1, 2, 5]), intervalS: pick(t, 0x622, [1, 2]), allowedLoss: pick(t, 0x623, [2, 3]) });

// Unit H: the backbone as target. H1's picture: 0.5 W between W3 and W4, the only two ways east.
export const H_JAM_W = 0.5;
export const H1_JAMMER = jam({ xKm: 4.4, yKm: 5.75 }, H_JAM_W);
export const GUARD_KM = 3; // the jammer may not come closer than this to the gateway

// The enemy mesh: 6 radios round the gateway in the west, 1 or 2 relays, 6 radios in the east; connected, with a relay
// that is a cut node.
function enemyMesh(rng: () => number): MeshLayout {
  for (;;) {
    const nodes: Pt[] = [{ xKm: round1(0.8 + 0.6 * rng()), yKm: round1(3.5 + 2 * rng()) }];
    const grow = (count: number, from: number[], xMin: number, xMax: number) => {
      for (let guard = 0; count > 0 && guard < 500; guard++) {
        const base = nodes[from[Math.floor(rng() * from.length)]];
        const a = 2 * Math.PI * rng();
        const d = 1.4 + 0.9 * rng();
        const p = { xKm: round1(base.xKm + d * Math.cos(a)), yKm: round1(base.yKm + d * Math.sin(a)) };
        if (p.xKm < Math.max(0.4, xMin) || p.xKm > Math.min(11.6, xMax) || p.yKm < 0.4 || p.yKm > 8.6) continue;
        if (nodes.some((q) => Math.hypot(q.xKm - p.xKm, q.yKm - p.yKm) < 1.1)) continue;
        nodes.push(p);
        from.push(nodes.length - 1);
        count--;
      }
    };
    grow(5, [0], 0, 4.6);
    const bridge = [nodes.reduce((b, p, i) => (p.xKm > nodes[b].xKm ? i : b), 0)];
    const nb = rng() < 0.5 ? 1 : 2;
    for (let k = 0; k < nb; k++) {
      const base = nodes[bridge[bridge.length - 1]];
      const a = (rng() - 0.5) * 0.8;
      const d = 1.9 + 0.5 * rng();
      nodes.push({ xKm: round1(base.xKm + d * Math.cos(a)), yKm: round1(base.yKm + d * Math.sin(a)) });
      bridge.push(nodes.length - 1);
    }
    grow(6, [nodes.length - 1], nodes[nodes.length - 1].xKm + 0.8, 12);
    if (nodes.length !== 14 || !nodes.every((p) => p.yKm > 0.2 && p.yKm < 8.8 && p.xKm < 11.8)) continue;
    const adj = meshLinks(MESH_RADIO, nodes);
    if (parts(adj).length !== 1 || !bridge.slice(1).some((b) => cutNodes(adj).includes(b))) continue;
    const names = nodes.map((_, i) => (i === 0 ? 'HQ' : `R${i}`));
    return { names, nodes, adj, gateway: 0 };
  }
}

export const guarded = (l: MeshLayout, p: Pt): boolean => Math.hypot(p.xKm - l.nodes[l.gateway].xKm, p.yKm - l.nodes[l.gateway].yKm) < GUARD_KM;
// One placement: the radios the jammer silences, the links it breaks and the radios cut off from the gateway.
export function meshTry(l: MeshLayout, p: Pt, powerW = H_JAM_W) {
  const j = jam(p, powerW);
  return {
    silenced: silenced(MESH_RADIO, l.nodes, j),
    broken: brokenLinks(MESH_RADIO, l.nodes, l.adj, j),
    cut: cutOff(jammedAdj(MESH_RADIO, l.nodes, l.adj, j, true), l.gateway),
  };
}

// The goal: the most radios cut off that at least 8 places on a 0.25 km grid (0.5 km²) reach.
function goalOf(l: MeshLayout): number {
  const counts: number[] = [];
  for (let x = 0.25; x < MESH_AREA.xMax; x += 0.25) {
    for (let y = 0.25; y < MESH_AREA.yMax; y += 0.25) {
      if (!guarded(l, { xKm: x, yKm: y })) counts.push(meshTry(l, { xKm: x, yKm: y }).cut.length);
    }
  }
  counts.sort((a, b) => b - a);
  return counts[7];
}

const meshes = new Map<number, { mesh: MeshLayout; goal: number }>();
export function h2Mesh(t: Truth): { mesh: MeshLayout; goal: number } {
  const hit = meshes.get(t.seed);
  if (hit) return hit;
  const mesh = enemyMesh(createRng((t.seed ^ 0x12e) >>> 0));
  const out = { mesh, goal: goalOf(mesh) };
  meshes.set(t.seed, out);
  return out;
}

// Unit I: a repeater delays the round trip. The victim's measured round trip is rounded to 0.01 µs as shown.
export const TURN_US = 5.2;
export const I1_EXAMPLE = { km: 1.2, delayUs: 2 };
export const i2Setup = (t: Truth) => {
  const km = pick(t, 0x121, [0.6, 1.5, 2.4]);
  const delayUs = pick(t, 0x122, [0.5, 1, 3]);
  const roundUs = Math.round(((2 * km) / 0.299792458 + TURN_US + delayUs) * 100) / 100;
  return { km, delayUs, roundUs };
};
export const i2Range = (t: Truth): number => rttKm(i2Setup(t).roundUs, TURN_US);

// I4: two position reports from one node; is the move possible for what it claims to be?
export const PLATFORM_TOP_MS = { 'soldier on foot': 2, vehicle: 20 } as const;
export type ClaimPlatform = keyof typeof PLATFORM_TOP_MS;
export function i4Setup(t: Truth) {
  const r = createRng((t.seed ^ 0x124) >>> 0);
  const platform = pick(t, 0x125, ['soldier on foot', 'vehicle'] as ClaimPlatform[]);
  const dtS = pick(t, 0x126, [30, 60, 120]);
  const top = maxMoveKm(PLATFORM_TOP_MS[platform], dtS);
  const km = top * pick(t, 0x127, [0.5, 1.6, 3, 6]); // within reach, or some way beyond it
  const a = { xKm: Math.round((2 + 6 * r()) * 100) / 100, yKm: Math.round((2 + 4 * r()) * 100) / 100 };
  const ang = 2 * Math.PI * r();
  const b = { xKm: Math.round((a.xKm + km * Math.cos(ang)) * 100) / 100, yKm: Math.round((a.yKm + km * Math.sin(ang)) * 100) / 100 };
  return { platform, dtS, a, b, topMs: PLATFORM_TOP_MS[platform] };
}
export const i4Speed = (t: Truth): number => { const c = i4Setup(t); return claimedSpeedKmh(c.a, c.b, c.dtS); };
export const i4Excess = (t: Truth): number => {
  const c = i4Setup(t);
  return Math.hypot(c.b.xKm - c.a.xKm, c.b.yKm - c.a.yKm) - maxMoveKm(c.topMs, c.dtS);
};

// Unit J: denial of sleep.
export const SLEEP: SleepBudget = { batteryWh: 20, sleepMw: 0.02, listenMw: 50, listenDuty: 0.01, wakeMj: 3, checkMj: 0.05 };
export const quietMw = (b: SleepBudget): number => b.sleepMw * (1 - b.listenDuty) + b.listenMw * b.listenDuty;
export const j2Hz = (t: Truth): number => pick(t, 0x12a, [2, 5, 10, 20]);

// The numbers a player works F's sums with: J at 1 km, the dB to spare over the clear-channel threshold, the radius;
// the link's signal, what data jamming needs, the gap and the power ratio.
function fNumbers(w: number, km: number) {
  const jamDbm = 10 * Math.log10(w * 1000);
  const j1 = jamDbm - LOSS_1KM_DB;
  const d = denialRadii(MESH_RADIO, w, km);
  const s = 30 - LOSS_1KM_DB - 40 * Math.log10(km);
  return { jamDbm, j1, spare: j1 - MESH_RADIO.ccaDbm, d, s, need: s + MESH_RADIO.gpDb - MESH_RADIO.needDb, gap: s + MESH_RADIO.gpDb - MESH_RADIO.needDb - MESH_RADIO.ccaDbm };
}

export function level12Values(t: Truth, practiceN: number): Record<string, string> {
  const fill = (pre: string, w: number, km: number) => {
    const n = fNumbers(w, km);
    return {
      [`${pre}W`]: String(w), [`${pre}Km`]: String(km), [`${pre}Dbm`]: f1(n.jamDbm), [`${pre}J1`]: f1(n.j1), [`${pre}Spare`]: f1(n.spare),
      [`${pre}R`]: f2(n.d.silenceKm), [`${pre}S`]: f1(n.s), [`${pre}Need`]: f1(n.need), [`${pre}Gap`]: f1(n.gap), [`${pre}Ratio`]: n.d.powerRatio.toFixed(0),
    };
  };
  const p = csmaF2Set(practiceN);
  const f = f3Setup(t);
  const g = g2Setup(t);
  const h = h2Mesh(t);
  const i = i2Setup(t);
  const hz = j2Hz(t);
  const range = i2Range(t);
  return {
    ...fill('p', p.w, p.km),
    ...fill('f', f.w, f.km),
    gMs: String(g.helloMs),
    gS: String(g.intervalS),
    gLoss: String(g.allowedLoss),
    gDuty: (100 * helloDuty(g.helloMs, g.intervalS)).toFixed(2),
    gDb: f1(dutySavingDb(helloDuty(g.helloMs, g.intervalS))),
    gDrop: String(linkDropS(g.intervalS, g.allowedLoss)),
    hGoal: String(h.goal),
    hW: String(H_JAM_W),
    iKm: String(i.km),
    iRound: i.roundUs.toFixed(2),
    iTurn: String(TURN_US),
    iFlight: f2((i.roundUs - TURN_US) / 2),
    iRange: (range).toFixed(3),
    iErr: (range - i.km).toFixed(3),
    iDelay: String(i.delayUs),
    cPlat: i4Setup(t).platform,
    cDt: String(i4Setup(t).dtS),
    cA: `(${i4Setup(t).a.xKm.toFixed(2)}, ${i4Setup(t).a.yKm.toFixed(2)})`,
    cB: `(${i4Setup(t).b.xKm.toFixed(2)}, ${i4Setup(t).b.yKm.toFixed(2)})`,
    cKm: (Math.hypot(i4Setup(t).b.xKm - i4Setup(t).a.xKm, i4Setup(t).b.yKm - i4Setup(t).a.yKm)).toFixed(3),
    cKmh: f1(i4Speed(t)),
    cTop: String(i4Setup(t).topMs),
    cTopKmh: f1(i4Setup(t).topMs * 3.6),
    cMax: maxMoveKm(i4Setup(t).topMs, i4Setup(t).dtS).toFixed(3),
    cExcess: i4Excess(t).toFixed(3),
    cVerdict: i4Excess(t) > 0 ? 'impossible and the claim is false' : 'possible, and this check cannot reject it',
    jHz: String(hz),
    jQuiet: quietMw(SLEEP).toFixed(2),
    jNoMw: (quietMw(SLEEP) + hz * SLEEP.wakeMj).toFixed(2),
    jYesMw: (quietMw(SLEEP) + hz * SLEEP.checkMj).toFixed(2),
    jNo: f1(lifeDays(SLEEP, hz, false)),
    jYes: f1(lifeDays(SLEEP, hz, true)),
  };
}

export const LEVEL_12: LevelDef = {
  id: 12,
  title: 'Mesh networks under attack',
  intro:
    'A mesh has no hub: every radio relays for its neighbours, and traffic finds another path when one breaks. It is held together by a shared channel and short control messages, and those are its weak points. Part 1 shows how a mesh works, in short lessons with videos. Part 2 attacks it.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Every radio a router',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Multi-hop and self-healing',
          visual: { kind: 'mesh', example: 'route' },
          video: 'level12-A1',
          paragraphs: [
            'In a [[mesh|mesh]] there is no base station and no hub. Every radio sends its own messages and relays other radios\' messages. A message to a radio out of range goes from neighbour to neighbour: [[multi-hop|multi-hop]] forwarding.',
            'Each hop is short, so each radio needs little power. Each hop also adds delay, and every relay spends battery receiving and sending again.',
            'Neighbours send short HELLO messages every second or so. When a neighbour stops answering, the radio drops the link, warns the others with a route error, and a new path is found round the gap: the mesh is [[self-healing|self-healing]]. On the map, click a radio to knock it out and watch the route move.',
            'A mesh whose radios move is a [[MANET|manet]], a mobile ad hoc network: links appear and break as radios come into and out of range. Tactical radio networks are MANETs.',
          ],
          check: {
            question: 'A message crosses 4 links to reach its destination. How many radios relayed it on the way?',
            answer: 3,
            tol: { exact: true },
            wrong: 'The radios between the links: 4 links, 3 relays in the middle.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Sharing the channel',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Listen first, or take turns',
          visual: { kind: 'mac', example: 'access' },
          video: 'level12-B1',
          paragraphs: [
            'All the radios share one channel. If two near the same receiver send at once, both messages are lost. Two ways to share:',
            '[[CSMA|csma]], listen before you talk: a radio measures the channel and sends only if it is quiet, below a threshold. If it is busy, the radio waits a random time and listens again. No clock is needed, but every radio must keep listening, and under heavy load collisions grow.',
            '[[TDMA|tdma]], take turns: time is cut into repeating frames of slots, and each radio sends only in its own slot. No collisions, and a radio can sleep outside its slots, but every radio needs the same clock.',
          ],
          check: {
            question: 'A TDMA frame has 10 slots of 2 ms, and a radio has one slot. Every how many ms can it send?',
            unit: 'ms',
            answer: 20,
            tol: { exact: true },
            wrong: 'It waits a whole frame for its slot again: 10 × 2 ms.',
          },
        },
        {
          kind: 'lesson',
          id: 'B2',
          title: 'The hidden terminal',
          visual: { kind: 'mac', example: 'rts' },
          video: 'level12-B2',
          paragraphs: [
            'Listening first fails when two senders cannot hear each other. A and C are both in range of B but not of each other. A sends to B; C listens, hears nothing, and sends too. The two collide at B. A and C are [[hidden terminals|hidden-terminal]].',
            'The cure is a handshake, [[RTS/CTS|rts-cts]]. A sends a short request to send (RTS); B answers with a short clear to send (CTS). Each carries how long the rest of the exchange lasts. C cannot hear A, but it hears B\'s CTS, and keeps quiet that long. That wait is the [[NAV|nav]].',
            'The RTS announces the CTS, the data, the ACK and the 3 short gaps (SIFS) between them. The CTS announces the data, the ACK and 2 gaps. Toggle the handshake on the timeline to see the collision go away.',
          ],
          check: {
            question: 'DATA takes 2000 µs, ACK 40 µs, each SIFS gap 10 µs. How long a NAV does the CTS announce, in µs?',
            unit: 'µs',
            answer: navCtsUs(EXAMPLE_FRAMES),
            tol: { exact: true },
            wrong: 'The CTS covers DATA + ACK + 2 gaps: 2000 + 40 + 2 × 10.',
          },
        },
      ],
    },
    {
      id: 'C',
      title: 'Finding routes',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Routes on demand',
          visual: { kind: 'mesh', example: 'flood' },
          video: 'level12-C1',
          paragraphs: [
            'A radio that needs a route it does not have asks for one. In [[AODV|aodv]] it broadcasts a route request; every radio that hears it for the first time notes who it came from and sends it on once. The request floods the whole mesh: one send per radio.',
            'When it reaches the destination, the reply goes back along the noted path, and each radio on it now knows the next hop. If a link on the path breaks, the radio before it sends a route error back, and the source asks again. To save sends, a repair can first ask only a few hops out, widening the ring if that fails.',
            'Nothing is sent until a route is needed, but the first message waits for the flood and the reply.',
          ],
          check: {
            question: 'A mesh has 30 radios. How many sends does one route request flood cost?',
            answer: 30,
            tol: { exact: true },
            wrong: 'Each radio sends the request on once.',
          },
        },
        {
          kind: 'lesson',
          id: 'C2',
          title: 'Routes kept ready',
          visual: { kind: 'mesh', example: 'mpr' },
          video: 'level12-C2',
          paragraphs: [
            'The other way keeps routes ready all the time. In [[OLSR|olsr]] each radio sends [[HELLO|hello]] messages to learn its neighbours, and floods the links it has to everyone, so every radio can work out every route before it is needed.',
            'That costs sends whether or not anyone talks. If every one of N radios floods, the cost is N × N, not more: 20 radios, 400 sends a round.',
            'OLSR cuts it with [[multipoint relays|mpr]]: each radio picks the fewest neighbours that between them reach all its neighbours\' neighbours, and only those relay its floods. Click a radio on the map to see its relays.',
            'Movement sets the choice. The faster radios move, the sooner links break, so HELLOs must come more often and kept routes go stale sooner. Routes on demand (AODV) suit light traffic and much movement; kept tables (OLSR) suit heavy traffic and little movement. Two radios passing head on at a combined 20 m/s, with 2.7 km of range, stay linked at most 2 × 2.7 km ÷ 20 m/s = 270 s.',
          ],
          check: {
            question: 'Two radios with 2.7 km of range pass head on, closing at a combined 30 m/s. At most how many seconds do they stay linked?',
            unit: 's',
            answer: linkLifetimeS(2.7, 30),
            tol: { exact: true },
            wrong: 'They link 2.7 km before they meet and part 2.7 km after: 5.4 km ÷ 30 m/s.',
          },
        },
      ],
    },
    {
      id: 'D',
      title: 'Clusters and backbones',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'A backbone through the mesh',
          visual: { kind: 'mesh', example: 'backbone' },
          video: 'level12-D1',
          paragraphs: [
            'A large flat mesh wastes sends: every flood reaches every radio, and neighbours repeat each other. Structure helps.',
            'Clustering groups radios round a [[cluster head|cluster-head]] that schedules them and gathers their reports; gateway radios join neighbouring clusters. Ordinary members can sleep and wake only to report.',
            'A backbone goes further: a [[connected dominating set|cds]], a connected group of radios that every other radio is next to. Only backbone radios relay, so a flood costs one send per backbone radio plus the source. Backbone radios work hardest and drain first, so a load-balanced backbone hands the role round.',
          ],
          check: {
            question: 'A mesh of 30 radios has a backbone of 6. A radio outside the backbone floods a message. How many sends?',
            answer: 7,
            tol: { exact: true },
            wrong: 'The source sends once, then each of the 6 backbone radios once.',
          },
        },
      ],
    },
    {
      id: 'E',
      title: 'Ranging without GPS',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Time of arrival and round trip',
          visual: { kind: 'mac', example: 'rtt' },
          video: 'level12-E1',
          paragraphs: [
            'Radio travels at 300 m each microsecond. Time a signal\'s flight and you have the distance: [[time of arrival|toa]]. That needs both radios\' clocks in step to a few nanoseconds.',
            'The [[round trip|rtt]] needs no common clock. A sends; B answers after a known turnaround; A times the whole exchange on its own clock. Distance = (round trip − turnaround) ÷ 2 × 300 m per µs.',
            'Direct sequence helps: a correlation peak is about one chip wide, so at 10 Mcps one chip is 30 m of round trip, 15 m of range, and the peak can be read finer than that. Several ranges to known radios give a position, as level 6\'s TDOA does with time differences.',
            '[[Ultra-wideband|uwb]] radios go further: they send pulses about 1 ns long instead of a carrier. A 1 ns pulse is 0.3 m of round trip, 15 cm of range, so they range to well under a metre. (802.15.4a defines two separate radios: UWB pulses, and chirp spread spectrum, which is not UWB.)',
          ],
          check: {
            question: 'A round trip takes 10.2 µs, and B\'s turnaround is 5.2 µs. How far away is B, in metres?',
            unit: 'm',
            answer: Math.round(rttKm(RTT_EXAMPLE.roundUs, RTT_EXAMPLE.turnUs) * 1000),
            tol: { abs: 2 },
            wrong: '(10.2 − 5.2) ÷ 2 = 2.5 µs each way, × 300 m.',
          },
        },
      ],
    },
    {
      id: 'F',
      title: 'Part 2. Carrier-sense denial',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Example: a quiet zone',
          visual: { kind: 'meshJam', example: 'csma' },
          video: 'level12-F1',
          paragraphs: [
            'Part 2 attacks the mesh. Start with the channel. A CSMA radio sends only when the channel is quiet, below its clear-channel threshold, here −85 dBm. A jammer that keeps the channel above that threshold near a radio stops it sending at all. It does not need to beat the signal: no J/S is involved. This is [[carrier-sense denial|csma-denial]].',
            'Breaking the data is far harder. These links spread with 15 dB of processing gain and need Eb/J0 of 7 dB, so they stand J/S up to 8 dB. The jammer must beat each link\'s signal by that much.',
            'The mesh\'s loss is 108.0 dB at 1 km with 2 m antennas, and 40 dB more for each tenfold distance (12 dB per doubling, level 0 F1).',
          ],
          steps: [
            'A 1 W jammer is 30 dBm. At 1 km it arrives at 30 − 108.0 = −78.0 dBm: 7.0 dB above the −85 dBm threshold.',
            'Radios stay silent out to where that 7.0 dB is used up: 1 × 10^(7.0 ÷ 40) = 1.50 km.',
            'A 0.8 km link arrives at −78.0 + 3.9 = −74.1 dBm (closer than 1 km: 40 × log10(1 ÷ 0.8) = 3.9 dB more). Its data breaks only at J of −74.1 + 8 = −66.1 dBm: within 0.50 km of the jammer.',
            'To break that link\'s data out to 1.50 km the jammer needs −66.1 − (−85) = 18.9 dB more: 78 times the power.',
          ],
          rule: 'Against CSMA a jammer only has to reach the clear-channel threshold. It silences radios far beyond the range at which it could break their data.',
          check: {
            question: 'A 1 W jammer is 7.0 dB above the clear-channel threshold at 1 km. With 40 dB per tenfold distance, how far out (km) does it silence radios?',
            unit: 'km',
            answer: 1.5,
            tol: { abs: 0.02 },
            wrong: '1 × 10^(7.0 ÷ 40).',
          },
        },
        {
          kind: 'practice',
          id: 'F2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'meshJam', example: 'csma' },
          task: 'A {pW} W jammer. How far out does it silence CSMA radios (threshold −85 dBm), and how many times the power would it need to break the data of a {pKm} km link out to that radius?',
          hint: 'J at 1 km = jammer dBm − 108.0. Radius = 10^((J at 1 km + 85) ÷ 40) km. The link\'s signal = 30 − 108.0 − 40 × log10(link km); data needs J of signal + 8; ratio = 10^((that + 85) ÷ 10).',
          fields: [
            { id: 'r', label: 'Silenced radius', unit: 'km', truth: (_t, ctx) => denialRadii(MESH_RADIO, csmaF2Set(ctx.practiceN ?? 0).w, csmaF2Set(ctx.practiceN ?? 0).km).silenceKm, check: { rel: 0.03 }, points: 0 },
            { id: 'ratio', label: 'Power ratio', unit: 'times', truth: (_t, ctx) => denialRadii(MESH_RADIO, csmaF2Set(ctx.practiceN ?? 0).w, csmaF2Set(ctx.practiceN ?? 0).km).powerRatio, check: { rel: 0.05 }, points: 0 },
          ],
          worked: [
            '{pW} W = {pDbm} dBm. At 1 km: {pDbm} − 108.0 = {pJ1} dBm, {pSpare} dB above −85. Radius 10^({pSpare} ÷ 40) = {pR} km.',
            'The {pKm} km link: {pS} dBm. Data needs J of {pNeed} dBm, {pGap} dB above −85: {pRatio} times the power.',
          ],
        },
        {
          kind: 'apply',
          id: 'F3',
          title: 'The enemy: silence it cheaply',
          instruments: [],
          task: 'You have a {fW} W jammer against an enemy CSMA mesh (threshold −85 dBm; links stand J/S up to 8 dB). How far out does it silence the radios, and how many times the power would it need to break the data of a {fKm} km link out to that radius?',
          hint: 'J at 1 km = jammer dBm − 108.0. Radius = 10^((J at 1 km + 85) ÷ 40) km. Signal = 30 − 108.0 − 40 × log10(link km); ratio = 10^((signal + 8 + 85) ÷ 10).',
          fields: [
            { id: 'r', label: 'Silenced radius', unit: 'km', truth: (t) => denialRadii(MESH_RADIO, f3Setup(t).w, f3Setup(t).km).silenceKm, check: { rel: 0.03 }, points: 7 },
            { id: 'ratio', label: 'Power ratio', unit: 'times', truth: (t) => denialRadii(MESH_RADIO, f3Setup(t).w, f3Setup(t).km).powerRatio, check: { rel: 0.05 }, points: 8 },
          ],
          reveal: [
            '{fW} W = {fDbm} dBm. At 1 km: {fJ1} dBm, {fSpare} dB above −85. Radius 10^({fSpare} ÷ 40) = {fR} km.',
            'The {fKm} km link arrives at {fS} dBm; its data needs J of {fNeed} dBm, {fGap} dB more than silencing: {fRatio} times the power.',
          ],
        },
      ],
    },
    {
      id: 'G',
      title: 'The overhead as target',
      steps: [
        {
          kind: 'lesson',
          id: 'G1',
          title: 'Example: jam only the HELLOs',
          visual: { kind: 'mac', example: 'hello' },
          paragraphs: [
            'A mesh is held together by short control messages: HELLOs between neighbours, route requests, route errors. They carry no data, but every route depends on them. A jammer that hits only them works a tiny share of the time (level 3\'s pulsed jamming, level 8\'s attack on the preamble).',
            'HELLOs come at a steady rhythm. A radio drops a link after missing a set number in a row. Jam every HELLO on a link and the link is dropped though no data was ever touched. The route request that follows floods the mesh: jam that too and no new route forms.',
          ],
          steps: [
            'HELLOs last 2 ms and come every 1 s. Jamming only them is a duty of 2 ÷ 1000 = 0.2% of the time.',
            'Average power falls by 10 × log10(1 ÷ 0.002) = 27.0 dB against jamming all the time: the same battery lasts 500 times longer.',
            'The radios drop a link after 2 missed HELLOs: 2 s after the last HELLO got through.',
          ],
          rule: 'Jam the overhead, not the data: HELLOs and route requests are short and regular, so a jammer on them works a tiny share of the time and still drops the links.',
          check: {
            question: 'HELLOs last 5 ms every 2 s. How many dB of average power does jamming only them save?',
            unit: 'dB',
            answer: Number(dutySavingDb(helloDuty(5, 2)).toFixed(1)),
            tol: { abs: 0.2 },
            wrong: 'Duty = 5 ÷ 2000 = 0.0025; 10 × log10(1 ÷ 0.0025).',
          },
        },
        {
          kind: 'apply',
          id: 'G2',
          title: 'The enemy: its HELLOs',
          instruments: [],
          task: 'The enemy\'s HELLOs last {gMs} ms and come every {gS} s. Its radios drop a link after {gLoss} missed HELLOs. What share of the time (%) does a jammer on the HELLOs work, how many dB of average power does that save, and how many seconds after the last HELLO got through do the links drop?',
          hint: 'Duty = HELLO length ÷ interval. Saving = 10 × log10(1 ÷ duty). Links drop the missed-HELLO count × the interval after the last HELLO heard.',
          fields: [
            { id: 'duty', label: 'Share of the time', unit: '%', truth: (t) => 100 * helloDuty(g2Setup(t).helloMs, g2Setup(t).intervalS), check: { rel: 0.02 }, points: 3 },
            { id: 'db', label: 'Power saved', unit: 'dB', truth: (t) => dutySavingDb(helloDuty(g2Setup(t).helloMs, g2Setup(t).intervalS)), check: { abs: 0.2 }, points: 4 },
            { id: 'drop', label: 'Links drop, after the last HELLO', unit: 's', truth: (t) => linkDropS(g2Setup(t).intervalS, g2Setup(t).allowedLoss), check: { exact: true }, points: 3 },
          ],
          reveal: ['{gMs} ms ÷ {gS} s = {gDuty}% of the time: {gDb} dB less average power.', 'Links drop after {gLoss} × {gS} s = {gDrop} s.'],
        },
      ],
    },
    {
      id: 'H',
      title: 'The backbone as target',
      steps: [
        {
          kind: 'lesson',
          id: 'H1',
          title: 'Example: split the mesh',
          visual: { kind: 'meshJam', example: 'backbone' },
          video: 'level12-H1',
          paragraphs: [
            'A mesh heals round one lost radio, but only if another path exists. Where every path between two groups passes a few radios, those radios hold the mesh together: a cut node, or the backbone radios on the way.',
            'The backbone and the cut nodes are where one jammer does most. Silence them by carrier sense and every radio beyond is cut off from the gateway, though the jammer is nowhere near most of them.',
            'The defence is more paths and a load-balanced backbone: when the backbone role moves from radio to radio, no one place stays the weak point for long, and no radio drains first.',
          ],
          steps: [
            'The example mesh has two ways east, but both pass W3 or W4, 2.4 km apart.',
            'A 0.5 W jammer silences out to 1.26 km. Placed between W3 and W4 it silences both.',
            'All 10 radios east of them lose the gateway G: W3, W4 and the 8 beyond.',
          ],
          rule: 'Jam where the paths converge: a cut node or the backbone radios between two groups. One jammer there cuts off everything beyond.',
          check: {
            question: 'A mesh of 14 radios: one jammer silences two backbone radios and cuts off 8 more beyond them. How many radios can no longer reach the gateway?',
            answer: 10,
            tol: { exact: true },
            wrong: 'The 2 silenced and the 8 beyond them.',
          },
        },
        {
          kind: 'apply',
          id: 'H2',
          title: 'The enemy: cut it off from HQ',
          instruments: ['df'],
          dfMethod: 'mesh',
          task: 'The enemy mesh reports to HQ, which is guarded: your {hW} W jammer cannot come within 3 km of it. The backbone is marked. Place the jammer (click) to cut at least {hGoal} radios off from HQ.',
          hint: 'Look for where the paths east converge: the backbone radios between the two groups. Silence them.',
          fields: [],
          locate: { maxSites: 1, points: 20, task: 'Click the map to place the jammer; click again to move it. Each placement is a try: full points within 3, half after.' },
          reveal: ['Where every path between the groups passes a few radios, silencing them cuts off everything beyond.'],
        },
      ],
    },
    {
      id: 'I',
      title: 'Ranging under attack',
      steps: [
        {
          kind: 'lesson',
          id: 'I1',
          title: 'Example: a repeater adds distance',
          visual: { kind: 'mac', example: 'repeater' },
          paragraphs: [
            'Round-trip ranging (unit E) trusts the timing. An attacker who catches the ranging frame and sends it on late, a repeater, makes the exchange take longer, and the range comes out long.',
            'It cannot make the range shorter: it cannot answer before the frame reaches it, and a reply sent early fails the turnaround check. Protocols that bound distance this way are called [[distance bounding|distance-bounding]].',
            'Jamming the direct path does the same as a repeater: the receiver locks on a later copy off a wall (level 11), and the range comes out long.',
          ],
          steps: [
            'B is 1.2 km away. The true round trip is 2 × 1.2 km ÷ 0.3 km per µs + 5.2 µs turnaround = 13.21 µs.',
            'A repeater adds 2 µs: A measures 15.21 µs.',
            'Range = (15.21 − 5.2) ÷ 2 × 0.3 km = 1.500 km: 0.300 km too far, 150 m for each µs of delay.',
          ],
          rule: 'A delay of t µs adds 150 × t metres to a round-trip range. An attacker can add range, not take it away.',
          check: {
            question: 'A repeater delays a ranging exchange by 3 µs. How many metres too far does the range come out?',
            unit: 'm',
            answer: 450,
            tol: { abs: 2 },
            wrong: '150 m for each µs of delay.',
          },
        },
        {
          kind: 'apply',
          id: 'I2',
          title: 'The enemy: a spoofed range',
          instruments: [],
          task: 'An enemy radio ranges to a beacon {iKm} km away, through your repeater. It measures a round trip of {iRound} µs; the beacon\'s turnaround is {iTurn} µs. What range (km) does it compute, and how far wrong (km) is it?',
          hint: 'Range = (round trip − turnaround) ÷ 2 × 0.2998 km per µs. Error = that − the true distance.',
          fields: [
            { id: 'range', label: 'Range it computes', unit: 'km', truth: (t) => i2Range(t), check: { abs: 0.01 }, points: 5 },
            { id: 'err', label: 'Error', unit: 'km', truth: (t) => i2Range(t) - i2Setup(t).km, check: { abs: 0.01 }, points: 5 },
          ],
          reveal: ['({iRound} − {iTurn}) ÷ 2 = {iFlight} µs each way: {iRange} km.', 'Error: {iRange} − {iKm} = {iErr} km, from your {iDelay} µs delay.'],
        },
        {
          kind: 'lesson',
          id: 'I3',
          title: 'Checking a claimed position',
          visual: { kind: 'none' },
          paragraphs: [
            'Without GPS, a radio\'s position is what it reports, and a spoofed or captured radio can report anything: a false position draws fire or support to the wrong place. The mesh can check claims without trusted hardware in every radio.',
            'Neighbours: the radios that hear it directly must all be within radio range (here about 2.7 km) of where it says it is. A radio heard by three radios in the west cannot be 8 km east.',
            'Speed: successive reports cannot imply moving faster than the platform can. A soldier on foot manages about 2 m/s (7.2 km/h), a vehicle off road about 20 m/s (72 km/h).',
            'Range: a round-trip range only comes out long (unit I), so it is an upper bound. A claim farther away than a ranged distance is false. A claim closer than it may be a delay attack.',
          ],
          steps: [
            'A radio says it is a soldier on foot. Two reports, 60 s apart, are 0.50 km apart.',
            'That is 0.50 km ÷ 60 s × 3600 = 30.0 km/h.',
            'On foot it could move at most 2 m/s × 60 s = 0.120 km. It jumped 0.380 km further: the claim is false.',
          ],
          rule: 'Check a claimed position three ways: the radios that hear it must be in range of it, the moves must be possible at the platform\'s speed, and a ranged distance bounds it from above.',
          check: {
            question: 'Two reports 30 s apart are 1.5 km apart. What speed in km/h does that claim?',
            unit: 'km/h',
            answer: 180,
            tol: { abs: 0.5 },
            wrong: '1.5 km ÷ 30 s × 3600 s per hour.',
          },
        },
        {
          kind: 'apply',
          id: 'I4',
          title: 'The enemy: test a claim',
          instruments: [],
          task: 'A radio claims to be a {cPlat} (top speed {cTop} m/s). It reports {cA} and, {cDt} s later, {cB} (km, x east, y north). What speed does that claim, in km/h, and how many km farther did it move than it could have? Give a negative number if it stayed within reach.',
          hint: 'Distance = √(Δx² + Δy²). Speed = distance ÷ seconds × 3600. Most it could move = top speed × seconds ÷ 1000 km.',
          fields: [
            { id: 'speed', label: 'Claimed speed', unit: 'km/h', truth: (t) => i4Speed(t), check: { rel: 0.02 }, points: 5 },
            { id: 'excess', label: 'Beyond its reach', unit: 'km', truth: (t) => i4Excess(t), check: { abs: 0.01 }, points: 5 },
          ],
          reveal: ['Distance {cKm} km in {cDt} s: {cKmh} km/h, against a top speed of {cTopKmh} km/h.', 'At most {cTop} × {cDt} ÷ 1000 = {cMax} km. Beyond its reach: {cExcess} km, so the move is {cVerdict}.'],
        },
      ],
    },
    {
      id: 'J',
      title: 'What each defence defeats',
      steps: [
        {
          kind: 'lesson',
          id: 'J1',
          title: 'Hopping, spreading, authenticated preambles',
          visual: { kind: 'none' },
          video: 'level12-J1',
          paragraphs: [
            'Frequency hopping: a jammer on one frequency hits only the hops that land there, and carrier-sense denial must cover the whole hop band. Partial-band and follower jamming still work (level 7).',
            'Direct sequence: protects the data by its processing gain. It does not stop carrier-sense denial if the radio judges the channel by energy alone; a radio that judges it by finding its own code (a correlating clear-channel check) ignores the jammer. Short commercial codes give little: 802.15.4 sends 32 chips for 4 bits, a gain of 8, or 9 dB.',
            'An [[authenticated preamble|auth-preamble]]: each frame starts with a preamble only friendly radios can make. A radio checks it before waking its processor, so fake frames and replayed ones cost a quick check instead of a full wake. It stops spoofing and [[denial of sleep|denial-of-sleep]], not jamming: the check still needs the signal received and correlated.',
            'Denial of sleep: a radio that sleeps most of the time lasts years on a battery. Fake frames that each wake it drain the battery in days.',
          ],
          steps: [
            'A radio averages 0.52 mW when left alone: 20 Wh lasts 20,000 ÷ 0.52 ÷ 24 = 1603 days.',
            '10 fake frames a second, each costing 3 mJ to wake and process: 30 mW more, 30.52 mW in all, 27.3 days.',
            'With an authenticated preamble each costs a 0.05 mJ check: 0.5 mW more, 1.02 mW in all, 817 days.',
          ],
          rule: 'Hopping and spreading protect the data; neither stops a weak jammer silencing CSMA radios by energy. Authenticated preambles stop fake frames and denial of sleep, not jamming.',
          check: {
            question: '802.15.4 sends 32 chips for every 4 bits. What is its processing gain in dB?',
            unit: 'dB',
            answer: 9,
            tol: { abs: 0.1 },
            wrong: '32 ÷ 4 = 8 chips per bit: 10 × log10(8).',
          },
        },
        {
          kind: 'apply',
          id: 'J2',
          title: 'The enemy: drain its batteries',
          instruments: [],
          task: 'An enemy sensor averages {jQuiet} mW when left alone, on a 20 Wh battery. You send {jHz} fake frames a second. Each costs it 3 mJ to wake and process, or 0.05 mJ if it checks an authenticated preamble first. How many days does its battery last, without and with the authenticated preamble?',
          hint: 'Average mW = {jQuiet} + frames per second × mJ per frame. Days = 20,000 mWh ÷ mW ÷ 24.',
          fields: [
            { id: 'no', label: 'Days, without', unit: 'days', truth: (t) => lifeDays(SLEEP, j2Hz(t), false), check: { rel: 0.03 }, points: 8 },
            { id: 'yes', label: 'Days, with', unit: 'days', truth: (t) => lifeDays(SLEEP, j2Hz(t), true), check: { rel: 0.03 }, points: 7 },
          ],
          reveal: ['Without: {jQuiet} + {jHz} × 3 = {jNoMw} mW, {jNo} days.', 'With: {jQuiet} + {jHz} × 0.05 = {jYesMw} mW, {jYes} days.'],
        },
      ],
    },
    {
      id: 'K',
      title: 'Check',
      steps: [
        {
          kind: 'questions',
          id: 'K1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'An enemy mesh uses direct sequence with 15 dB of processing gain and CSMA that judges the channel by energy. What is the cheapest way to silence it?',
              options: ['Beat every link\'s signal by 8 dB', 'A weak jammer above the clear-channel threshold near the radios: they never send', 'Jam only the gateway\'s data'],
              correct: 1,
              explain: 'Carrier-sense denial needs no J/S, only the threshold: far less power than beating the processing gain.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'Where does one jammer split a mesh?',
              options: ['At the radio with the most traffic of its own', 'On a cut node or the backbone radios between two groups', 'Nowhere: a mesh always heals'],
              correct: 1,
              explain: 'A mesh heals only where another path exists. Where all paths converge, silencing those radios cuts off everything beyond.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'Which defence stops fake frames from draining a sensor\'s battery?',
              options: ['Frequency hopping', 'More transmit power', 'An authenticated preamble checked before the processor wakes'],
              correct: 2,
              explain: 'The cheap check drops the fake frame before the costly wake-up. Hopping and power do nothing against it.',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'A mesh relays hop by hop and heals round a lost radio, but it is held together by things a jammer can reach cheaply: a channel that CSMA radios must find quiet, HELLOs and route requests, and the few radios where the paths converge. A weak jammer on those does more than a strong one on the data. Ranging can be pushed long, never short, and fake frames drain batteries unless an authenticated preamble drops them first.',
};
