// Level 12: Mesh networks under attack (docs/design-level-12.md). Part 1, units A to E: getting to know mesh
// networks, as level 0 teaches radio. Every number in the texts is checked in level12.test.ts.
import type { Pt } from '../geoloc';
import { type Adj, type FrameTimes, MESH_RADIO, backbone, meshLinks, navCtsUs, rttKm } from '../mesh';
import { type LevelDef, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level12Truth = shortCodeTruth;

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
          paragraphs: [
            'In a [[mesh|mesh]] there is no base station and no hub. Every radio sends its own messages and relays other radios\' messages. A message to a radio out of range goes from neighbour to neighbour: [[multi-hop|multi-hop]] forwarding.',
            'Each hop is short, so each radio needs little power. Each hop also adds delay, and every relay spends battery receiving and sending again.',
            'Neighbours send short HELLO messages every second or so. When a neighbour stops answering, the radio drops the link, warns the others with a route error, and a new path is found round the gap: the mesh is [[self-healing|self-healing]]. On the map, click a radio to knock it out and watch the route move.',
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
          paragraphs: [
            'The other way keeps routes ready all the time. In [[OLSR|olsr]] each radio sends [[HELLO|hello]] messages to learn its neighbours, and floods the links it has to everyone, so every radio can work out every route before it is needed.',
            'That costs sends whether or not anyone talks. If every one of N radios floods, the cost is N × N, not more: 20 radios, 400 sends a round.',
            'OLSR cuts it with [[multipoint relays|mpr]]: each radio picks the fewest neighbours that between them reach all its neighbours\' neighbours, and only those relay its floods. Click a radio on the map to see its relays.',
          ],
          check: {
            question: 'A mesh has 20 radios and each floods its links once. How many sends is that, without relays?',
            answer: 400,
            tol: { exact: true },
            wrong: '20 floods of 20 sends each.',
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
          paragraphs: [
            'Radio travels at 300 m each microsecond. Time a signal\'s flight and you have the distance: [[time of arrival|toa]]. That needs both radios\' clocks in step to a few nanoseconds.',
            'The [[round trip|rtt]] needs no common clock. A sends; B answers after a known turnaround; A times the whole exchange on its own clock. Distance = (round trip − turnaround) ÷ 2 × 300 m per µs.',
            'Direct sequence helps: a correlation peak is about one chip wide, so at 10 Mcps one chip is 30 m of round trip, 15 m of range, and the peak can be read finer than that. Several ranges to known radios give a position, as level 6\'s TDOA does with time differences.',
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
  ],
  debrief:
    'A mesh relays hop by hop and heals round a lost radio. Its radios share one channel by listening first or taking turns, find routes by flooding requests or by keeping tables, and can save sends with relays and a backbone. Part 2, still to come, attacks each of these.',
};
