import { assocPictureOf, scoreOf } from '../engine/mission/mission';
import { type AssessedNet, SCORE } from '../engine/mission/deception';
import type { MissionState } from '../engine/mission/types';
import { axialToOffset } from '../engine/hex';

// The order of battle (docs/design-deception.md section 7): the collector's assessment as a tree, what association
// made of the intercepts beside it, and after the reveal the true tree with the score per node.
export function OrbatPanel({ mission: m }: { mission: MissionState }) {
  const a = m.assessment ?? { nets: [], strength: [] };
  const p = assocPictureOf(m, 'blue');
  const over = m.status !== 'running';
  const sc = over ? scoreOf(m) : undefined;
  const same = (x: number, y: number) => Math.abs(x - y) < 0.05;
  const assessedRows: { net: AssessedNet; depth: number }[] = [];
  const walk = (under: number | undefined, depth: number) => {
    for (const n of a.nets.filter((x) => (under === undefined ? x.underMHz === undefined || !a.nets.some((q) => same(q.freqMHz, x.underMHz!)) : x.underMHz !== undefined && same(x.underMHz, under)))) {
      assessedRows.push({ net: n, depth });
      if (depth < 6) walk(n.freqMHz, depth + 1);
    }
  };
  walk(undefined, 0);
  const sectors = m.sectors ?? [];
  const verdict = (n: NonNullable<typeof sc>['nodes'][number]) =>
    !n.assessed ? 'not assessed' : `${n.placed ? 'placed' : 'misplaced'}, level ${n.levelRight ? 'right' : 'wrong'}, parent ${n.parentRight ? 'right' : 'wrong'}${n.early ? ', early' : ''}`;

  return (
    <section className="orbat">
      <h2>Order of battle</h2>
      {sc && (
        <div className="row">
          <span className="k">Score</span>
          <span className="v">
            <b>{sc.total}/100</b> (nodes {sc.nodeScore}, strength {sc.strengthScore}, objective {sc.objectiveScore}); {100 - sc.total} for the deceiver
          </span>
        </div>
      )}
      <h3>Assessed</h3>
      {assessedRows.length === 0 && <p className="muted">Nothing assessed. assess net 40 division at 185,80, then assess net 42.6 brigade at 191,95 under 40.</p>}
      {assessedRows.map(({ net, depth }) => {
        const ns = sc?.nodes.find((n) => same(n.freqMHz, net.freqMHz));
        const falseNode = sc?.falseNodes.some((f) => same(f.freqMHz, net.freqMHz));
        return (
          <div key={net.freqMHz} className="row orbat-row" style={{ paddingLeft: depth * 12 }}>
            <span className="k">
              <b>{net.freqMHz} MHz</b> {net.level} at {net.col},{net.row}
            </span>
            <span className="v muted">{sc ? (falseNode ? 'a ruse or nothing' : ns ? verdict(ns) : '') : `T+${net.tick}`}</span>
          </div>
        );
      })}
      {sectors.map((sec) => {
        const x = a.strength.find((y) => y.sector === sec.id);
        const st = sc?.strength.find((y) => y.sector === sec.id);
        return (
          <div key={sec.id} className="row">
            <span className="k">
              strength {sec.id} <span className="muted">rows {sec.rowLo}-{sec.rowHi - 1}</span>
            </span>
            <span className="v">
              {x ? `${x.radios} radios` : 'not assessed'}
              {st && <span className="muted"> · truth {st.truth}: {st.points === 1 ? 'right' : st.points === 0.5 ? 'half right' : 'wrong'}</span>}
            </span>
          </div>
        );
      })}
      <div className="row">
        <span className="k">objective</span>
        <span className="v">
          {a.objective ? `${a.objective.sector} at T+${a.objective.at}` : 'not assessed'}
          {sc?.objective.truth && <span className="muted"> · truth {sc.objective.truth.sector} at T+{sc.objective.truth.tick}: sector {sc.objective.sectorRight ? 'right' : 'wrong'}, hour {sc.objective.hourRight ? 'right' : 'wrong'}</span>}
        </span>
      </div>

      <h3>Associated</h3>
      {p.nets.length === 0 && <p className="muted">No nets associated yet: task the sites and wait an hour.</p>}
      {p.nets.map((n) => {
        const hub = p.emitters.find((e) => e.id === n.hubId);
        const at = hub?.fix ? axialToOffset({ q: Math.round(hub.fix.q), r: Math.round(hub.fix.r) }) : undefined;
        const hours = [...new Set(n.orderTicks.map((t) => t % 24))].sort((x, y) => x - y);
        return (
          <div key={n.id} className="row orbat-row">
            <span className="k">
              <b>{n.id}</b> {n.freqMHz} MHz · {hub ? (at ? `${hub.id} near ${at.col},${at.row}` : `${hub.id}, no fix`) : 'no hub'} · {n.emitterIds.length} station{n.emitterIds.length === 1 ? '' : 's'}
            </span>
            <span className="v muted">
              {hours.length ? `orders ${hours.map((h) => String(h).padStart(2, '0')).join(' ')}` : ''}
              {n.parentNetId ? ` · under ${n.parentNetId}` : ''}
              {n.singleStation ? ' · one place' : ''}
            </span>
          </div>
        );
      })}

      {sc && (
        <>
          <h3>Truth</h3>
          <TrueTree mission={m} score={sc} verdict={verdict} />
        </>
      )}
      <p className="help">
        assess net &lt;MHz&gt; &lt;level&gt; at &lt;col&gt;,&lt;row&gt; [under &lt;MHz&gt;] · assess strength &lt;sector&gt; &lt;radios&gt; · assess objective &lt;sector&gt; at T+&lt;hour&gt;. A node counts when placed within {SCORE.nodeKm} km; strength within a factor of {SCORE.strengthFactor}; the hour within {SCORE.objectiveHours}.
      </p>
    </section>
  );
}

function TrueTree({ mission: m, score: sc, verdict }: { mission: MissionState; score: ReturnType<typeof scoreOf>; verdict: (n: ReturnType<typeof scoreOf>['nodes'][number]) => string }) {
  const orbat = m.orbat ?? [];
  const rows: { id: string; name: string; freqMHz?: number; level: string; notional: boolean; depth: number; col: number; row: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const node of orbat.filter((n) => n.parent === parent)) {
      const net = m.world.nets.find((n) => n.id === node.netId);
      const unit = m.world.units.find((u) => u.id === node.id);
      const { col, row } = unit ? axialToOffset(unit.pos) : { col: node.col, row: node.row };
      rows.push({ id: node.id, name: node.name, freqMHz: net?.freqMHz, level: node.level, notional: node.notional, depth, col, row });
      if (depth < 8) walk(node.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return (
    <>
      {rows.map((r) => {
        const ns = r.freqMHz !== undefined ? sc.nodes.find((n) => Math.abs(n.freqMHz - r.freqMHz!) < 0.05) : undefined;
        const assessedRuse = r.notional && r.freqMHz !== undefined && sc.falseNodes.some((f) => Math.abs(f.freqMHz - r.freqMHz!) < 0.05);
        return (
          <div key={r.id} className="row orbat-row" style={{ paddingLeft: r.depth * 12 }}>
            <span className="k">
              {r.name.replace(/^Red /, '')} <span className="muted">{r.freqMHz} MHz {r.level} at {r.col},{r.row}</span>
            </span>
            <span className="v muted" style={{ color: r.notional ? (assessedRuse ? '#f59e0b' : undefined) : ns?.placed ? '#22c55e' : undefined }}>
              {r.notional ? (assessedRuse ? 'a ruse, assessed as real' : 'a ruse') : ns ? verdict(ns) : ''}
            </span>
          </div>
        );
      })}
    </>
  );
}
