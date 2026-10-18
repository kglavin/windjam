// Data for the level 9 videos (level9_a1.py to level9_e1.py): the platforms' budgets, the example sharing plans and
// the example network's links broken at several places, from the engine.
import { writeFileSync } from 'node:fs';
import { EXAMPLE_NET, EXAMPLE_TARGETS, SHARE_GOAL_BER, networkTry } from '../../src/engine/lab/levels';
import { PLATFORMS, dcPowerW, shareOutcome, timeOnAirH } from '../../src/engine/lab/tactics';

const hub = EXAMPLE_NET.nodes[0];
const spoke = EXAMPLE_NET.nodes[1];
// The pack walking from near outstation S1 to near the hub.
const walk = Array.from({ length: 41 }, (_, i) => {
  const f = i / 40;
  const at = { xKm: spoke.xKm + (hub.xKm - spoke.xKm) * f, yKm: spoke.yKm - 1.5 + (hub.yKm - spoke.yKm) * f };
  return { at: [at.xKm, at.yKm], denied: networkTry(EXAMPLE_NET, at).links.map((l) => l.denied) };
});
const plan = (mode: 'power' | 'time', chosen: number[]) => ({ mode, chosen, out: shareOutcome(EXAMPLE_TARGETS, chosen, mode, SHARE_GOAL_BER) });

writeFileSync(process.argv[2], JSON.stringify({
  platforms: PLATFORMS.map((p) => ({ ...p, dcW: dcPowerW(p.rfW, p.efficiency), hours: timeOnAirH(p.energyWh, p.rfW, p.efficiency) })),
  targets: EXAMPLE_TARGETS.map((t) => ({ name: t.name, ebJ0: t.gpDb - t.jsDb })),
  plans: [plan('power', [0, 1, 2]), plan('time', [0, 1, 2]), plan('time', [0, 1])],
  net: { nodes: EXAMPLE_NET.nodes, links: EXAMPLE_NET.links, walk },
}));
