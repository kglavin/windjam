import { type MouseEvent, useState } from 'react';
import type { Pt } from '../../../engine/lab/geoloc';
import { EXAMPLE_BACKBONE, EXAMPLE_MESH, MESH_AREA, ROUTE_TO, type MeshLayout } from '../../../engine/lab/levels';
import { allFloodSends, floodSends, linkCount, mpr, mprFlood, route } from '../../../engine/lab/mesh';

// Level 12: a mesh on a km map (x east, y north): radios, links, the gateway, a route, a backbone, chosen relays,
// radios knocked out, and (part 2) a jammer with its rings, the links it breaks and the radios cut off.
const W = 480;
const PAD = 22;
const S = (W - 2 * PAD) / MESH_AREA.xMax;
const H = 2 * PAD + MESH_AREA.yMax * S;
const sx = (x: number) => PAD + x * S;
const sy = (y: number) => H - PAD - y * S;
const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

export function MeshMap({ mesh, title = 'Mesh map', path, gone = [], backbone = [], chosen = [], selected, jammer, rings = [], broken = [], cut = [], onNode, onPlace, notes = [] }: {
  mesh: MeshLayout;
  title?: string;
  path?: number[]; // a route, drawn thick
  gone?: number[]; // radios knocked out or silenced
  backbone?: number[];
  chosen?: number[]; // a radio's relays
  selected?: number;
  jammer?: Pt;
  rings?: { rKm: number; label: string }[]; // round the jammer
  broken?: [number, number][]; // links the jammer breaks
  cut?: number[]; // radios cut off from the gateway
  onNode?: (i: number) => void;
  onPlace?: (p: Pt) => void;
  notes?: string[];
}) {
  const goneSet = new Set(gone);
  const brokenSet = new Set(broken.map(([a, b]) => key(a, b)));
  const onPath = new Set((path ?? []).slice(1).map((v, i) => key(path![i], v)));
  const click = (e: MouseEvent<SVGRectElement>) => {
    if (!onPlace) return;
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    onPlace({ xKm: Math.round(((px - PAD) / S) * 10) / 10, yKm: Math.round(((H - PAD - py) / S) * 10) / 10 });
  };
  const links: [number, number][] = [];
  mesh.adj.forEach((n, a) => n.forEach((b) => a < b && links.push([a, b])));
  const nodeClass = (i: number) => [
    'mesh-node',
    i === mesh.gateway ? 'mesh-gateway' : '',
    backbone.includes(i) ? 'mesh-backbone' : '',
    chosen.includes(i) ? 'mesh-chosen' : '',
    i === selected ? 'mesh-selected' : '',
    goneSet.has(i) ? 'mesh-gone' : '',
    cut.includes(i) ? 'mesh-cut' : '',
  ].filter(Boolean).join(' ');
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-legend">
          <span className="c3"><i className="dot" />radio</span>
          <span className="c1"><i className="sw" />route</span>
          {backbone.length > 0 && <span className="c2"><i className="dot" />backbone</span>}
          {jammer && <span className="c6"><i className="dot" />jammer</span>}
        </span>
      </header>
      <svg className="inst-svg df-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <rect x={PAD} y={PAD} width={MESH_AREA.xMax * S} height={MESH_AREA.yMax * S} className="inst-frame" />
        {onPlace && <rect x={PAD} y={PAD} width={MESH_AREA.xMax * S} height={MESH_AREA.yMax * S} fill="transparent" className="df-click" onClick={click} />}
        {jammer && rings.map((r) => (
          <g key={r.label}>
            <circle cx={sx(jammer.xKm)} cy={sy(jammer.yKm)} r={r.rKm * S} className="mesh-ring" />
            <text x={sx(jammer.xKm) + r.rKm * S * 0.71 + 3} y={sy(jammer.yKm) - r.rKm * S * 0.71} className="inst-axis">{r.label}</text>
          </g>
        ))}
        {links.map(([a, b]) => {
          const k = key(a, b);
          const cls = brokenSet.has(k) ? 'mesh-link mesh-broken' : goneSet.has(a) || goneSet.has(b) ? 'mesh-link mesh-dead' : onPath.has(k) ? 'mesh-link mesh-path' : 'mesh-link';
          return <line key={k} x1={sx(mesh.nodes[a].xKm)} y1={sy(mesh.nodes[a].yKm)} x2={sx(mesh.nodes[b].xKm)} y2={sy(mesh.nodes[b].yKm)} className={cls} />;
        })}
        {mesh.nodes.map((p, i) => (
          <g key={mesh.names[i]} className={nodeClass(i)} onClick={onNode ? () => onNode(i) : undefined} style={onNode ? { cursor: 'pointer' } : undefined}>
            {i === mesh.gateway
              ? <rect x={sx(p.xKm) - 7} y={sy(p.yKm) - 7} width={14} height={14} />
              : <circle cx={sx(p.xKm)} cy={sy(p.yKm)} r={7} />}
            <text x={sx(p.xKm) + 9} y={sy(p.yKm) - 7}>{mesh.names[i]}</text>
          </g>
        ))}
        {jammer && <rect x={sx(jammer.xKm) - 6} y={sy(jammer.yKm) - 6} width={12} height={12} className="mesh-jammer" />}
        <text x={PAD} y={H - 5} className="inst-axis">{MESH_AREA.xMax} × {MESH_AREA.yMax} km; links reach about 2.7 km</text>
      </svg>
      {notes.length > 0 && <dl className="inst-meter">{notes.map((n) => <div key={n}><dd>{n}</dd></div>)}</dl>}
    </section>
  );
}

// Part 1's pictures on the example mesh.
export function MeshDemo({ example }: { example: 'route' | 'flood' | 'mpr' | 'backbone' }) {
  const m = EXAMPLE_MESH;
  const n = m.nodes.length;
  const [gone, setGone] = useState<number[]>([]);
  const [sel, setSel] = useState(3);
  if (example === 'route') {
    const goneSet = new Set(gone);
    const path = route(m.adj, m.gateway, ROUTE_TO, goneSet);
    const toggle = (i: number) => {
      if (i === m.gateway || i === ROUTE_TO) return;
      setGone((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]));
    };
    const notes = [
      path ? `Route ${m.names[m.gateway]} to ${m.names[ROUTE_TO]}: ${path.map((i) => m.names[i]).join(' → ')}, ${path.length - 1} hops, ${path.length - 2} relays` : `No route left from ${m.names[m.gateway]} to ${m.names[ROUTE_TO]}`,
      gone.length ? `Knocked out: ${gone.map((i) => m.names[i]).join(', ')}. Click again to restore.` : 'Click a radio to knock it out.',
    ];
    return <MeshMap mesh={m} title="Example: a route and a repair" path={path} gone={gone} onNode={toggle} notes={notes} />;
  }
  if (example === 'flood') {
    return <MeshMap mesh={m} title="Example: one flood" selected={m.gateway} notes={[
      `${n} radios, ${linkCount(m.adj)} links. One route request from ${m.names[m.gateway]}: every radio sends it once, ${floodSends(n)} sends.`,
      `Every radio flooding once: ${allFloodSends(n)} sends.`,
    ]} />;
  }
  if (example === 'mpr') {
    const relays = mpr(m.adj, sel);
    const f = mprFlood(m.adj, sel);
    return <MeshMap mesh={m} title="Example: multipoint relays" selected={sel} chosen={relays} onNode={setSel} notes={[
      `${m.names[sel]}: ${m.adj[sel].length} neighbours, relays ${relays.map((i) => m.names[i]).join(', ') || 'none needed'}. Click a radio to choose it.`,
      `A flood from ${m.names[sel]} relayed only by relays: ${f.sends} sends, reaching ${f.reached} of ${n}; a plain flood: ${n}.`,
    ]} />;
  }
  const b = EXAMPLE_BACKBONE;
  return <MeshMap mesh={m} title="Example: a backbone" backbone={b} notes={[
    `Backbone: ${b.map((i) => m.names[i]).join(', ')}, ${b.length} of ${n} radios. Every other radio is next to one of them.`,
    `A flood from ${m.names[m.gateway]}, relayed only by the backbone: ${floodSends(n, b, m.gateway)} sends instead of ${n}.`,
  ]} />;
}
