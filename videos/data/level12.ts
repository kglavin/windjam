// Data for the level 12 videos (level12_a1.py to level12_j1.py): the example mesh, its route and repair, a flood in
// rings, multipoint relays, the backbone, the RTS/CTS times, a round trip, the quiet zone, the split, and battery life.
import { writeFileSync } from 'node:fs';
import {
  EXAMPLE_BACKBONE, EXAMPLE_FRAMES, EXAMPLE_MESH, F1_JAMMER, H1_JAMMER, ROUTE_TO, RTT_EXAMPLE, SLEEP, meshTry, quietMw,
} from '../../src/engine/lab/levels';
import { MESH_RADIO, denialRadii, lifeDays, mpr, mprFlood, navCtsUs, navRtsUs, radiusKm, route, rttKm } from '../../src/engine/lab/mesh';

const m = EXAMPLE_MESH;
const links: [number, number][] = [];
m.adj.forEach((n, a) => n.forEach((b) => a < b && links.push([a, b])));
// Flood rings from the gateway: the hop count of each radio.
const hops = new Array<number>(m.nodes.length).fill(-1);
hops[m.gateway] = 0;
for (let q = [m.gateway]; q.length;) {
  const next: number[] = [];
  for (const u of q) for (const v of m.adj[u]) if (hops[v] < 0) { hops[v] = hops[u] + 1; next.push(v); }
  q = next;
}
const f1 = meshTry(m, F1_JAMMER, F1_JAMMER.powerW);
const h1 = meshTry(m, H1_JAMMER, H1_JAMMER.powerW);
const d = denialRadii(MESH_RADIO, 1, 0.8);
const mprOf = 3; // W3

writeFileSync(process.argv[2], JSON.stringify({
  names: m.names,
  nodes: m.nodes,
  links,
  gateway: m.gateway,
  route: route(m.adj, m.gateway, ROUTE_TO),
  repair: route(m.adj, m.gateway, ROUTE_TO, new Set([6])),
  knocked: 6,
  hops,
  mpr: { of: mprOf, relays: mpr(m.adj, mprOf), sends: mprFlood(m.adj, m.gateway).sends },
  backbone: EXAMPLE_BACKBONE,
  frames: { ...EXAMPLE_FRAMES, navRts: navRtsUs(EXAMPLE_FRAMES), navCts: navCtsUs(EXAMPLE_FRAMES) },
  rtt: { ...RTT_EXAMPLE, m: Math.round(rttKm(RTT_EXAMPLE.roundUs, RTT_EXAMPLE.turnUs) * 1000) },
  quiet: { jammer: F1_JAMMER, silenced: f1.silenced, broken: f1.broken, silenceKm: d.silenceKm.toFixed(2), dataKm: d.dataKm.toFixed(2), ratio: d.powerRatio.toFixed(0) },
  split: { jammer: H1_JAMMER, silenced: h1.silenced, cut: h1.cut, rKm: radiusKm(MESH_RADIO, H1_JAMMER.powerW, MESH_RADIO.ccaDbm) },
  sleep: { quietMw: quietMw(SLEEP).toFixed(2), quiet: lifeDays(SLEEP, 0, false).toFixed(0), attacked: lifeDays(SLEEP, 10, false).toFixed(1), withAp: lifeDays(SLEEP, 10, true).toFixed(0) },
}));
