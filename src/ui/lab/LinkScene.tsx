import { useRef, useState } from 'react';
import { BEAM_GAIN_DBI, BEAM_HALF_WIDTH_DEG } from '../../engine/rf';
import {
  type Obstacle,
  type PathSetup,
  type Scene,
  type Station,
  jammerDistanceForJs,
  pathLossDb,
  rxGainDbi,
  sceneBudget,
} from '../../engine/lab/scene';
import { NumberField } from '../NumberField';
import { type SceneView, fitView, sceneFitPoints, scaleBarKm, toKm, toPx } from './sceneView';

export type SceneField =
  | 'positions'
  | 'intercept'
  | 'freq'
  | 'txPower'
  | 'jamPower'
  | 'heights'
  | 'gains'
  | 'rxAntenna'
  | 'paths'
  | 'obstacles'
  | 'noise'
  | 'rates';

const ALL_FIELDS: SceneField[] = [
  'positions', 'intercept', 'freq', 'txPower', 'jamPower', 'heights', 'gains', 'rxAntenna', 'paths', 'obstacles', 'noise', 'rates',
];

const W = 520;
const H = 300;
const MARGIN = 56;
const POS_LIMIT_KM = 200;

type StationKey = 'tx' | 'rx' | 'jammer' | 'intercept';
const STATIONS: { key: StationKey; name: string; color: string }[] = [
  { key: 'tx', name: 'Transmitter', color: '#60a5fa' },
  { key: 'rx', name: 'Receiver', color: '#22c55e' },
  { key: 'jammer', name: 'Jammer', color: '#ef4444' },
];
const INTERCEPT = { key: 'intercept' as StationKey, name: 'Intercept', color: '#f59e0b' };

const round1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-');

// Radius of the target J/S circle, drawn only when it is a real distance (not clamped at the limits).
function circleRadius(scene: Scene, targetJsDb?: number): number {
  if (targetJsDb === undefined) return 0;
  const r = jammerDistanceForJs(scene, targetJsDb);
  return r > 0.1 && r < 1000 ? r : 0;
}

function fitScene(scene: Scene, circleKm: number, hideJammer: boolean): SceneView {
  return fitView(sceneFitPoints(scene, circleKm, hideJammer), W, H, MARGIN);
}

export function LinkScene({ scene, onChange, editable, targetJsDb, hidden, hiddenRows }: {
  scene: Scene;
  onChange: (s: Scene) => void;
  editable?: SceneField[];
  targetJsDb?: number;
  hidden?: 'jammer'[]; // stations a level does not show: not drawn, no lines, no controls, no J/S circle
  hiddenRows?: string[]; // budget ladder rows to hide, by label
}) {
  const noJammer = !!hidden?.includes('jammer');
  if (noJammer) targetJsDb = undefined;
  const hiddenSet = new Set(hiddenRows ?? []);
  const can = (f: SceneField) => (editable ?? ALL_FIELDS).includes(f);
  const svgRef = useRef<SVGSVGElement>(null);
  // Fit frozen for the duration of a drag, so the stations do not move under the pointer.
  const [frozen, setFrozen] = useState<SceneView | null>(null);
  const [dragging, setDragging] = useState<StationKey | null>(null);
  const targetR = targetJsDb === undefined ? 0 : jammerDistanceForJs(scene, targetJsDb);
  const view = frozen ?? fitScene(scene, circleRadius(scene, targetJsDb), noJammer);
  const budget = sceneBudget(scene);

  const setStation = (key: StationKey, patch: Partial<Station>) =>
    onChange({ ...scene, [key]: { ...scene[key], ...patch } });
  const setPath = (key: 'txPath' | 'jamPath', patch: Partial<PathSetup>) =>
    onChange({ ...scene, [key]: { ...scene[key], ...patch } });
  const setObstacle = (key: 'txPath' | 'jamPath', ob: Obstacle | undefined) => {
    const next: PathSetup = { model: scene[key].model };
    if (ob) next.obstacle = ob;
    onChange({ ...scene, [key]: next });
  };

  const pointerKm = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const cx = Math.min(Math.max(px, MARGIN / 2), W - MARGIN / 2);
    const cy = Math.min(Math.max(py, MARGIN / 2), H - MARGIN / 2);
    return toKm(view, cx, cy);
  };

  const onDown = (key: StationKey) => (e: React.PointerEvent) => {
    if (!can(key === 'intercept' ? 'intercept' : 'positions')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setFrozen(fitScene(scene, circleRadius(scene, targetJsDb), noJammer));
    setDragging(key);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const p = pointerKm(e);
    setStation(dragging, { xKm: round1(p.xKm), yKm: round1(p.yKm) });
  };
  const onUp = () => {
    setDragging(null);
    setFrozen(null);
  };

  const pos = (s: Station) => toPx(view, s.xKm, s.yKm);
  const rxP = pos(scene.rx);
  const txP = pos(scene.tx);
  const icP = pos(scene.intercept);
  const jamP = pos(scene.jammer);
  const bar = scaleBarKm(view, 120);
  // Labels go on the side away from the centroid of the drawn stations, so they stay clear of the lines between them.
  const shown = noJammer ? [txP, rxP, icP] : [txP, rxP, icP, jamP];
  const cen = { x: shown.reduce((a, p) => a + p.x, 0) / shown.length, y: shown.reduce((a, p) => a + p.y, 0) / shown.length };
  const labelSide = (p: { x: number; y: number }) => (p.y >= cen.y ? 1 : -1); // +1 below the station
  const awayNormal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * ((a.x + b.x) / 2 - cen.x) + ny * ((a.y + b.y) / 2 - cen.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { nx, ny };
  };

  const pathLine = (a: Station, b: Station, setup: PathSetup, dashed: boolean, color: string) => {
    const pl = pathLossDb(scene.freqMHz, a, b, setup);
    const pa = pos(a);
    const pb = pos(b);
    const { nx, ny } = awayNormal(pa, pb);
    const mx = (pa.x + pb.x) / 2 + nx * 9;
    const my = (pa.y + pb.y) / 2 + ny * 9 + 3;
    const ob = setup.obstacle;
    const ox = ob ? pa.x + (pb.x - pa.x) * ob.atFraction : 0;
    const oy = ob ? pa.y + (pb.y - pa.y) * ob.atFraction : 0;
    return (
      <g>
        <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '6 4' : undefined} />
        <text x={mx} y={my} className="axis" textAnchor="middle" fill={color}>
          {pl.distanceKm.toFixed(1)} km, {pl.totalDb.toFixed(1)} dB
        </text>
        {ob && (
          <g>
            <polygon points={`${ox},${oy - 9} ${ox - 7},${oy + 5} ${ox + 7},${oy + 5}`} fill="#facc15" stroke="#854d0e" />
            <text x={ox + 10} y={oy + 14} className="axis" fill="#facc15">
              {ob.heightM} m, {pl.diffractionDb.toFixed(1)} dB
            </text>
          </g>
        )}
      </g>
    );
  };

  // Directional wedge at the receiver, toward the transmitter (screen y is flipped).
  const wedge = () => {
    const ang = Math.atan2(txP.y - rxP.y, txP.x - rxP.x);
    const r = Math.max(48, Math.hypot(txP.x - rxP.x, txP.y - rxP.y) * 0.6);
    const half = (BEAM_HALF_WIDTH_DEG * Math.PI) / 180;
    const p1 = { x: rxP.x + r * Math.cos(ang - half), y: rxP.y + r * Math.sin(ang - half) };
    const p2 = { x: rxP.x + r * Math.cos(ang + half), y: rxP.y + r * Math.sin(ang + half) };
    return <path d={`M${rxP.x},${rxP.y} L${p1.x},${p1.y} A${r},${r} 0 0 1 ${p2.x},${p2.y} Z`} fill="#22c55e" opacity={0.18} />;
  };

  const inBeam = rxGainDbi(scene, scene.jammer) === BEAM_GAIN_DBI && scene.rxAntenna === 'directional';

  const labelOf = (k: StationKey) => {
    const s = scene[k];
    const extra = k === 'jammer' && scene.rxAntenna === 'directional' ? (inBeam ? ' (in beam)' : ' (sidelobe)') : '';
    return { top: [...STATIONS, INTERCEPT].find((x) => x.key === k)!.name + extra, sub: `${s.heightM} m` };
  };

  const rows = budget.ladder;
  const idx = (label: string) => rows.findIndex((r) => r.label === label);
  const visible = (r: (typeof rows)[number]) => !hiddenSet.has(r.label);
  // Without a jammer the signal path runs on through the noise floor to the SNR.
  const sigRows = [
    ...rows.slice(0, idx('Signal S') + 1),
    ...(noJammer ? rows.slice(idx('Noise floor N'), idx('SNR') + 1) : []),
  ].filter(visible);
  const jamRows = noJammer ? [] : rows.slice(idx('Jammer power'), idx('Jamming J') + 1).filter(visible);
  const noiseRows = noJammer ? [] : rows.slice(idx('Noise floor N'), idx('Processing gain') + 1).filter(visible);
  const ratioRows = (noJammer ? rows.slice(idx('Processing gain')) : rows.slice(idx('Eb/N0'))).filter(visible);
  const keyRows = new Set(['Signal S', 'Jamming J', 'Noise floor N']);
  const ladderRow = (r: (typeof rows)[number], cls = '') => (
    <tr key={r.label} className={`${keyRows.has(r.label) ? 'key' : ''} ${cls}`}>
      <td>{r.label}</td>
      <td className="num">{fmt(r.db)} {r.unit}</td>
    </tr>
  );

  const icRows = budget.interceptLadder.filter((r) => !hiddenSet.has(r.label) && !(noJammer && /^J(amming|\/S)/.test(r.label)));
  const icKey = new Set(['Signal S at intercept', 'Jamming J at intercept', 'Noise floor N']);
  const icRatio = new Set(['Chip SNR', 'J/S at intercept']);

  const stationInputs = (k: StationKey, name: string) => (
    <div className="scene-row" key={k}>
      <span className="scene-tag">{name}</span>
      <NumberField label="x km" value={scene[k].xKm} min={-POS_LIMIT_KM} max={POS_LIMIT_KM} step={0.1} onChange={(v) => setStation(k, { xKm: v })} />
      <NumberField label="y km" value={scene[k].yKm} min={-POS_LIMIT_KM} max={POS_LIMIT_KM} step={0.1} onChange={(v) => setStation(k, { yKm: v })} />
    </div>
  );

  const pathControls = (key: 'txPath' | 'jamPath', name: string) => {
    const setup = scene[key];
    return (
      <div className="scene-row" key={key}>
        <span className="scene-tag">{name}</span>
        {can('paths') && (
          <label className="field">
            <span>model</span>
            <select value={setup.model} onChange={(e) => setPath(key, { model: e.target.value as PathSetup['model'] })}>
              <option value="free-space">free space</option>
              <option value="two-ray">two-ray</option>
            </select>
          </label>
        )}
        {can('obstacles') && (
          <>
            <label className="field">
              <span>obstacle</span>
              <input
                type="checkbox"
                checked={!!setup.obstacle}
                onChange={(e) => setObstacle(key, e.target.checked ? { atFraction: 0.5, heightM: 30 } : undefined)}
              />
            </label>
            {setup.obstacle && (
              <>
                <NumberField label="at (0.05-0.95)" value={setup.obstacle.atFraction} min={0.05} max={0.95} step={0.05}
                  onChange={(v) => setObstacle(key, { ...setup.obstacle!, atFraction: v })} />
                <NumberField label="height m" value={setup.obstacle.heightM} min={0} max={1000} step={1}
                  onChange={(v) => setObstacle(key, { ...setup.obstacle!, heightM: v })} />
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="link-scene">
      <div className="scene-main">
        <svg ref={svgRef} className="scene-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Link scene"
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {targetJsDb !== undefined && (() => {
            // J/S label on the circle at the point facing away from the other stations.
            const ang = Math.hypot(rxP.x - cen.x, rxP.y - cen.y) > 4 ? Math.atan2(rxP.y - cen.y, rxP.x - cen.x) : -Math.PI / 2;
            const rr = targetR * view.scale + 8;
            const lx = Math.min(Math.max(rxP.x + rr * Math.cos(ang), 40), W - 40);
            const ly = Math.min(Math.max(rxP.y + rr * Math.sin(ang), 12), H - 20);
            return (
              <g>
                <circle cx={rxP.x} cy={rxP.y} r={targetR * view.scale} fill="none" stroke="#ef4444" strokeDasharray="2 4" opacity={0.5} />
                <text x={lx} y={ly} className="axis" textAnchor="middle" fill="#ef4444">J/S = {targetJsDb} dB</text>
              </g>
            );
          })()}
          {scene.rxAntenna === 'directional' && wedge()}
          {pathLine(scene.tx, scene.rx, scene.txPath, false, '#60a5fa')}
          {!noJammer && pathLine(scene.jammer, scene.rx, scene.jamPath, true, '#ef4444')}
          <line x1={txP.x} y1={txP.y} x2={icP.x} y2={icP.y} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />
          {(() => {
            const { nx, ny } = awayNormal(txP, icP);
            return (
              <text x={(txP.x + icP.x) / 2 + nx * 9} y={(txP.y + icP.y) / 2 + ny * 9 + 3} className="axis" textAnchor="middle" fill="#f59e0b">
                {budget.intercept.txDistanceKm.toFixed(1)} km, chip SNR {fmt(budget.intercept.chipSnrDb)} dB
              </text>
            );
          })()}
          {!noJammer && (
            <line x1={jamP.x} y1={jamP.y} x2={icP.x} y2={icP.y} stroke="#f59e0b" strokeWidth={1} strokeDasharray="1 4" strokeLinecap="round" opacity={0.35} />
          )}
          {[...STATIONS, INTERCEPT].filter(({ key }) => !(noJammer && key === 'jammer')).map(({ key, color }) => {
            const p = pos(scene[key]);
            const side = labelSide(p);
            const lx = Math.min(Math.max(p.x, 45), W - 45);
            const topY = side > 0 ? p.y + 22 : p.y - 26;
            const subY = side > 0 ? p.y + 33 : p.y - 15;
            const l = labelOf(key);
            return (
              <g key={key} className={can(key === 'intercept' ? 'intercept' : 'positions') ? 'scene-station draggable' : 'scene-station'}
                onPointerDown={onDown(key)}>
                <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                {key === 'tx' && <polygon points={`${p.x},${p.y - 10} ${p.x - 8},${p.y + 7} ${p.x + 8},${p.y + 7}`} fill={color} />}
                {key === 'rx' && <rect x={p.x - 7} y={p.y - 7} width={14} height={14} fill={color} />}
                {key === 'jammer' && <circle cx={p.x} cy={p.y} r={8} fill={color} />}
                {key === 'intercept' && <polygon points={`${p.x},${p.y - 9} ${p.x + 9},${p.y} ${p.x},${p.y + 9} ${p.x - 9},${p.y}`} fill={color} />}
                <text x={lx} y={topY} className="axis" textAnchor="middle" fill={color}>{l.top}</text>
                <text x={lx} y={subY} className="axis" textAnchor="middle">{l.sub}</text>
              </g>
            );
          })}
          <line x1={10} y1={H - 12} x2={10 + bar * view.scale} y2={H - 12} stroke="#9ca3af" strokeWidth={2} />
          <text x={10} y={H - 16} className="axis">{bar} km</text>
        </svg>

        <div className="scene-ladder">
          <table>
            <tbody>
              <tr className="head"><th colSpan={2}>Signal path</th></tr>
              {sigRows.map((r) => ladderRow(r))}
              {jamRows.length > 0 && <tr className="head"><th colSpan={2}>Jammer path</th></tr>}
              {jamRows.map((r) => ladderRow(r))}
              {noiseRows.length > 0 && <tr className="head"><th colSpan={2}>Noise</th></tr>}
              {noiseRows.map((r) => ladderRow(r))}
              {ratioRows.length > 0 && <tr className="head"><th colSpan={2}>Ratios</th></tr>}
              {ratioRows.map((r) => ladderRow(r, 'ratio'))}
              <tr className="head"><th colSpan={2}>At the intercept</th></tr>
              {icRows.map((r) => (
                <tr key={r.label} className={`${icKey.has(r.label) ? 'key' : ''} ${icRatio.has(r.label) ? 'ratio' : ''}`}>
                  <td>{r.label}</td>
                  <td className="num">{fmt(r.db)} {r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="scene-controls">
        {can('positions') && (
          <div className="scene-group">
            <h4>Positions</h4>
            {STATIONS.filter((s) => !(noJammer && s.key === 'jammer')).map((s) => stationInputs(s.key, s.name))}
          </div>
        )}
        {can('intercept') && (
          <div className="scene-group">
            <h4>Intercept station</h4>
            <div className="scene-row">
              <NumberField label="x km" value={scene.intercept.xKm} min={-POS_LIMIT_KM} max={POS_LIMIT_KM} step={0.1} onChange={(v) => setStation('intercept', { xKm: v })} />
              <NumberField label="y km" value={scene.intercept.yKm} min={-POS_LIMIT_KM} max={POS_LIMIT_KM} step={0.1} onChange={(v) => setStation('intercept', { yKm: v })} />
              <NumberField label="height m" value={scene.intercept.heightM} min={1} max={100} step={1} onChange={(v) => setStation('intercept', { heightM: v })} />
              <NumberField label="dBi" value={scene.intercept.gainDbi} min={-10} max={30} step={0.5} onChange={(v) => setStation('intercept', { gainDbi: v })} />
            </div>
          </div>
        )}
        {can('freq') && (
          <div className="scene-group">
            <NumberField label="Frequency MHz" value={scene.freqMHz} min={30} max={3000} step={1} onChange={(v) => onChange({ ...scene, freqMHz: v })} />
          </div>
        )}
        {(can('txPower') || can('jamPower') || can('gains')) && (
          <div className="scene-group">
            <h4>Power and gain</h4>
            <div className="scene-row">
              <span className="scene-tag">Tx</span>
              {can('txPower') && <NumberField label="W" value={scene.tx.powerW} min={0.1} max={1000} step={0.1} onChange={(v) => setStation('tx', { powerW: v })} />}
              {can('gains') && <NumberField label="dBi" value={scene.tx.gainDbi} min={-10} max={30} step={0.5} onChange={(v) => setStation('tx', { gainDbi: v })} />}
            </div>
            {!noJammer && <div className="scene-row">
              <span className="scene-tag">Jammer</span>
              {can('jamPower') && <NumberField label="W" value={scene.jammer.powerW} min={0.1} max={1000} step={0.1} onChange={(v) => setStation('jammer', { powerW: v })} />}
              {can('gains') && <NumberField label="dBi" value={scene.jammer.gainDbi} min={-10} max={30} step={0.5} onChange={(v) => setStation('jammer', { gainDbi: v })} />}
            </div>}
            {can('gains') && scene.rxAntenna === 'omni' && (
              <div className="scene-row">
                <span className="scene-tag">Rx</span>
                <NumberField label="dBi" value={scene.rx.gainDbi} min={-10} max={30} step={0.5} onChange={(v) => setStation('rx', { gainDbi: v })} />
              </div>
            )}
          </div>
        )}
        {can('heights') && (
          <div className="scene-group">
            <h4>Antenna heights</h4>
            <div className="scene-row">
              {STATIONS.filter((s) => !(noJammer && s.key === 'jammer')).map((s) => (
                <NumberField key={s.key} label={`${s.name} m`} value={scene[s.key].heightM} min={1} max={100} step={1}
                  onChange={(v) => setStation(s.key, { heightM: v })} />
              ))}
            </div>
          </div>
        )}
        {can('rxAntenna') && (
          <div className="scene-group">
            <label className="field">
              <span>Receiver antenna</span>
              <select value={scene.rxAntenna} onChange={(e) => onChange({ ...scene, rxAntenna: e.target.value as Scene['rxAntenna'] })}>
                <option value="omni">omni</option>
                <option value="directional">directional</option>
              </select>
            </label>
          </div>
        )}
        {(can('paths') || can('obstacles')) && (
          <div className="scene-group">
            <h4>Paths</h4>
            {pathControls('txPath', 'Tx to Rx')}
            {!noJammer && pathControls('jamPath', 'Jammer to Rx')}
          </div>
        )}
        {can('noise') && (
          <div className="scene-group">
            <h4>Receiver noise</h4>
            <div className="scene-row">
              <NumberField label="Noise figure dB" value={scene.noiseFigureDb} min={2} max={15} step={0.5} onChange={(v) => onChange({ ...scene, noiseFigureDb: v })} />
              <label className="field">
                <span>Environment</span>
                <select value={scene.noiseEnv} onChange={(e) => onChange({ ...scene, noiseEnv: e.target.value as Scene['noiseEnv'] })}>
                  <option value="rural">rural</option>
                  <option value="urban">urban</option>
                </select>
              </label>
            </div>
          </div>
        )}
        {can('rates') && (
          <div className="scene-group">
            <h4>Rates</h4>
            <div className="scene-row">
              <NumberField label="Chip rate Mcps" value={scene.chipRateMcps} min={0.01} max={100} step={0.1} onChange={(v) => onChange({ ...scene, chipRateMcps: v })} />
              <NumberField label="Data rate kbps" value={scene.dataRateKbps} min={0.1} max={10000} step={0.125} onChange={(v) => onChange({ ...scene, dataRateKbps: v })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
