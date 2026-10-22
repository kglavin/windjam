// The assessment and its score (docs/design-deception.md D7, section 5). The intelligence cell says what it believes
// is there: a net at a frequency, its level, where its hub sits and what it answers to; radios per sector; where and
// when the blow falls. The engine scores that against the true order of battle. Pure: nothing here changes state.
import { type Hex, axialToOffset, offsetToAxial } from '../hex';
import type { HexMap } from '../map';
import { hexDistanceKm } from '../rf';
import type { Net, Unit } from '../units';
import type { Level, OrbatNode } from './orbat';

export const LEVELS: Level[] = ['division', 'brigade', 'battalion', 'company', 'artillery', 'recce'];

// A sector is a band of map rows (the collector's sites look east across every column).
export interface Sector {
  id: string;
  rowLo: number; // map row, inclusive
  rowHi: number; // exclusive
}

export interface AssessedNet {
  freqMHz: number;
  level: Level;
  col: number; // map grid, the hub
  row: number;
  underMHz?: number; // the parent net's frequency
  tick: number; // when it was said (the early bonus)
}

export interface Assessment {
  nets: AssessedNet[];
  strength: { sector: string; radios: number; tick: number }[];
  objective?: { sector: string; at: number; tick: number };
}

export const emptyAssessment = (): Assessment => ({ nets: [], strength: [] });

export const SCORE = {
  nodeKm: 3, // an assessed hub this close to the true one is placed
  strengthFactor: 1.5, // radios per sector within this factor of the truth count in full; within its square, half
  objectiveHours: 6, // the hour of the operation within this many hours
  earlyHours: 12, // an assessment made this long before the end earns the bonus
  earlyBonus: 1.2,
  nodeWeight: 0.6,
  strengthWeight: 0.2,
  objectiveWeight: 0.2,
  winAt: 50, // the collector's total to win; the deceiver's score is 100 minus it
} as const;

// What the score needs of the truth: the tree, the nets, the radios where they ended, the sectors, the objective.
export interface Truth {
  map: HexMap;
  orbat: OrbatNode[];
  nets: Net[];
  units: Unit[];
  sectors: Sector[];
  objective?: { sector: string; tick: number };
  limit: number; // the mission's last tick
}

export interface NodeScore {
  freqMHz: number;
  name: string;
  level: Level;
  notional: boolean;
  parentMHz?: number;
  pos: Hex;
  assessed?: AssessedNet;
  placed: boolean;
  levelRight: boolean;
  parentRight: boolean;
  early: boolean;
  points: number; // 0..1.2
}

export interface Score {
  nodes: NodeScore[]; // the real nets, each against its assessment
  falseNodes: AssessedNet[]; // assessed nets that are a ruse or nothing at all
  nodeScore: number; // 0..100
  strength: { sector: string; truth: number; assessed?: number; points: number }[];
  strengthScore: number;
  objective: { truth?: { sector: string; tick: number }; assessed?: Assessment['objective']; sectorRight: boolean; hourRight: boolean };
  objectiveScore: number;
  total: number; // the collector's, 0..100
}

export const sectorOf = (sectors: Sector[], row: number): Sector | undefined => sectors.find((x) => row >= x.rowLo && row < x.rowHi);
const sameFreq = (a: number, b: number) => Math.abs(a - b) < 0.05;
const hexOf = (a: { col: number; row: number }): Hex => offsetToAxial(a.col, a.row);

// Replace the assessment of the same net, sector or objective; the latest line stands.
export function assess(a: Assessment, line: { what: 'net'; net: Omit<AssessedNet, 'tick'> } | { what: 'strength'; sector: string; radios: number } | { what: 'objective'; sector: string; at: number }, tick: number): Assessment {
  if (line.what === 'net') return { ...a, nets: [...a.nets.filter((n) => !sameFreq(n.freqMHz, line.net.freqMHz)), { ...line.net, tick }].sort((x, y) => x.freqMHz - y.freqMHz) };
  if (line.what === 'strength') return { ...a, strength: [...a.strength.filter((x) => x.sector !== line.sector), { sector: line.sector, radios: line.radios, tick }] };
  return { ...a, objective: { sector: line.sector, at: line.at, tick } };
}

// The radios a sector really holds: every red radio that is not a notional transmitter.
export function trueStrength(t: Truth): Record<string, number> {
  const notional = new Set(t.orbat.filter((n) => n.notional).map((n) => n.id));
  const out: Record<string, number> = Object.fromEntries(t.sectors.map((x) => [x.id, 0]));
  for (const u of t.units) {
    if (u.side !== 'red' || u.radio.powerW <= 0 || notional.has(u.id)) continue;
    const sec = sectorOf(t.sectors, axialToOffset(u.pos).row);
    if (sec) out[sec.id]++;
  }
  return out;
}

export function scoreAssessment(a: Assessment, t: Truth): Score {
  const freqOfNode = (id?: string): number | undefined => {
    const node = id ? t.orbat.find((n) => n.id === id) : undefined;
    return node ? t.nets.find((n) => n.id === node.netId)?.freqMHz : undefined;
  };
  const nodes: NodeScore[] = [];
  for (const node of t.orbat) {
    if (node.notional) continue;
    const net = t.nets.find((n) => n.id === node.netId);
    const unit = t.units.find((u) => u.id === node.id);
    if (!net || !unit) continue;
    const assessed = a.nets.find((x) => sameFreq(x.freqMHz, net.freqMHz));
    const parentMHz = freqOfNode(node.parent);
    const placed = !!assessed && hexDistanceKm(t.map, hexOf(assessed), unit.pos) <= SCORE.nodeKm;
    const levelRight = !!assessed && assessed.level === node.level;
    const parentRight = !!assessed && (parentMHz === undefined ? assessed.underMHz === undefined : assessed.underMHz !== undefined && sameFreq(assessed.underMHz, parentMHz));
    const early = !!assessed && assessed.tick <= t.limit - SCORE.earlyHours;
    const points = ((placed ? 0.5 : 0) + (levelRight ? 0.25 : 0) + (parentRight ? 0.25 : 0)) * (early ? SCORE.earlyBonus : 1);
    nodes.push({ freqMHz: net.freqMHz, name: node.name, level: node.level, notional: false, parentMHz, pos: unit.pos, assessed, placed, levelRight, parentRight, early, points });
  }
  const realFreqs = nodes.map((n) => n.freqMHz);
  const falseNodes = a.nets.filter((x) => !realFreqs.some((f) => sameFreq(f, x.freqMHz)));
  const denominator = nodes.length + falseNodes.length;
  const nodeScore = denominator ? Math.min(100, (100 * nodes.reduce((acc, n) => acc + n.points, 0)) / denominator) : 0;

  const truth = trueStrength(t);
  const strength = t.sectors.map((sec) => {
    const assessed = a.strength.find((x) => x.sector === sec.id)?.radios;
    const tr = truth[sec.id];
    let points = 0;
    if (assessed !== undefined) {
      const ratio = tr === 0 && assessed === 0 ? 1 : tr === 0 || assessed === 0 ? Infinity : Math.max(tr, assessed) / Math.min(tr, assessed);
      points = ratio <= SCORE.strengthFactor ? 1 : ratio <= SCORE.strengthFactor ** 2 ? 0.5 : 0;
    }
    return { sector: sec.id, truth: tr, assessed, points };
  });
  const counted = strength.filter((x) => x.truth > 0 || x.assessed !== undefined);
  const strengthScore = counted.length ? (100 * counted.reduce((acc, x) => acc + x.points, 0)) / counted.length : 0;

  const sectorRight = !!t.objective && !!a.objective && a.objective.sector === t.objective.sector;
  const hourRight = !!t.objective && !!a.objective && Math.abs(a.objective.at - t.objective.tick) <= SCORE.objectiveHours;
  const objectiveScore = (sectorRight ? 50 : 0) + (hourRight ? 50 : 0);

  const total = Math.round(SCORE.nodeWeight * nodeScore + SCORE.strengthWeight * strengthScore + SCORE.objectiveWeight * objectiveScore);
  return { nodes, falseNodes, nodeScore: Math.round(nodeScore), strength, strengthScore: Math.round(strengthScore), objective: { truth: t.objective, assessed: a.objective, sectorRight, hourRight }, objectiveScore, total };
}

// The assessment as the console shows it: the tree by parent, then strength and objective.
export function assessmentLines(a: Assessment, sectors: Sector[]): string[] {
  if (a.nets.length === 0 && a.strength.length === 0 && !a.objective) return ['No assessment yet. assess net 40 division at 185,80 · assess net 42.6 brigade at 191,95 under 40 · assess strength centre 100 · assess objective centre at T+72'];
  const lines: string[] = [];
  const children = (under?: number): AssessedNet[] => a.nets.filter((n) => (under === undefined ? n.underMHz === undefined || !a.nets.some((p) => sameFreq(p.freqMHz, n.underMHz!)) : n.underMHz !== undefined && sameFreq(n.underMHz, under)));
  const walk = (under: number | undefined, depth: number) => {
    for (const n of children(under)) {
      lines.push(`${'  '.repeat(depth)}${n.freqMHz} MHz ${n.level} at ${n.col},${n.row}${n.underMHz !== undefined ? ` under ${n.underMHz}` : ''} (T+${n.tick})`);
      if (depth < 6) walk(n.freqMHz, depth + 1);
    }
  };
  walk(undefined, 0);
  for (const sec of sectors) {
    const x = a.strength.find((y) => y.sector === sec.id);
    lines.push(`strength ${sec.id} (rows ${sec.rowLo}-${sec.rowHi - 1}): ${x ? `${x.radios} radios (T+${x.tick})` : 'not assessed'}`);
  }
  lines.push(a.objective ? `objective: ${a.objective.sector} at T+${a.objective.at} (said T+${a.objective.tick})` : 'objective: not assessed');
  return lines;
}

// The score as the console shows it after the game.
export function scoreLines(sc: Score): string[] {
  const lines = [`Score ${sc.total}/100 for the collector (nodes ${sc.nodeScore}, strength ${sc.strengthScore}, objective ${sc.objectiveScore}); ${100 - sc.total} for the deceiver.`];
  const placed = sc.nodes.filter((n) => n.placed).length;
  const level = sc.nodes.filter((n) => n.levelRight).length;
  const parent = sc.nodes.filter((n) => n.parentRight).length;
  lines.push(`Nodes: ${sc.nodes.length} real nets; ${placed} placed within ${SCORE.nodeKm} km, ${level} at the right level, ${parent} with the right parent; ${sc.falseNodes.length} assessed that were a ruse or nothing.`);
  for (const x of sc.strength) lines.push(`Strength ${x.sector}: ${x.truth} radios; assessed ${x.assessed ?? 'nothing'}: ${x.points === 1 ? 'right' : x.points === 0.5 ? 'half right' : 'wrong'}.`);
  const o = sc.objective;
  lines.push(`Objective: ${o.truth ? `${o.truth.sector} at T+${o.truth.tick}` : 'none'}; assessed ${o.assessed ? `${o.assessed.sector} at T+${o.assessed.at}` : 'nothing'}: sector ${o.sectorRight ? 'right' : 'wrong'}, hour ${o.hourRight ? 'right' : 'wrong'}.`);
  return lines;
}
