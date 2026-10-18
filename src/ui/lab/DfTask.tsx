import { useMemo } from 'react';
import type { Pt } from '../../engine/lab/geoloc';
import {
  type ApplyStep, type Truth, LEG_MAX_KM, UAV_HEIGHT_M, dfStepTry, legEnd, legPoints, level6Scene, siteSigmaDeg, siteSnrDb,
  siteTimingSigmaUs, tdoaHyperbola, txOf, xcorrEnemy, FOLLOW_PROC_US, e3Ellipse, e3Geometry, e3ShareAt, level9Network, networkTry,
  ENEMY_GOAL_JS_DB, FRIEND_TOLERANCE_JS_DB, JAMMER, e3Layout, townTry, type TownLayout, GUARD_KM, H_JAM_W, guarded, h2Mesh, meshTry,
} from '../../engine/lab/levels';
import { MESH_RADIO, backbone, radiusKm } from '../../engine/lab/mesh';
import { MeshMap } from './instruments/MeshMap';
import type { Network } from '../../engine/lab/tactics';
import { followerDelayUs } from '../../engine/lab/fh';
import { distanceKm } from '../../engine/lab/geoloc';
import { type DfSite, DfView } from './instruments/DfView';
import { type TownRadio, TownMap } from './instruments/TownMap';
import type { StepState } from './levelState';

// Level 6's DF view in an apply step: the step's own sites, the sites (or UAV leg) the player placed, the latest
// bearings or hyperbolas and fix, and the transmitter once the step is done.
export function DfTask({ step, state, truth, onPlace, onRemove, onBeam, onJam }: {
  step: ApplyStep;
  state: StepState;
  truth: Truth;
  onPlace: (p: Pt) => void;
  onRemove: (placedIndex: number) => void;
  onBeam?: (deg: number) => void;
  onJam?: () => void;
}) {
  const method = step.dfMethod ?? 'bearings';
  if (method === 'town') return <TownTask state={state} truth={truth} onPlace={onPlace} onBeam={onBeam} onJam={onJam} />;
  if (method === 'mesh') return <MeshTask state={state} truth={truth} onPlace={onPlace} />;
  if (method === 'follower') return <FollowerTask state={state} truth={truth} onPlace={onPlace} onRemove={onRemove} />;
  if (method === 'network') return <NetworkTask state={state} truth={truth} onPlace={onPlace} />;
  return <DfLocate step={step} state={state} truth={truth} onPlace={onPlace} onRemove={onRemove} />;
}

// Level 9: a network on the map with each link green, or red where the jammer breaks it.
export function NetworkMap({ net, at, title = 'Map: the enemy network', onPlace, notes = [] }: {
  net: Network;
  at?: Pt;
  title?: string;
  onPlace?: (p: Pt) => void;
  notes?: string[];
}) {
  const res = at ? networkTry(net, at) : undefined;
  return (
    <DfView
      title={title}
      sites={at ? [{ ...at, label: 'pack' }] : []}
      marks={net.nodes.map((n) => ({ ...n, label: n.name }))}
      links={net.links.map((l, i) => ({ a: net.nodes[l.from], b: net.nodes[l.to], denied: !!res?.links[i].denied }))}
      onPlace={onPlace}
      notes={[...(res ? [`links into the hub broken: ${res.inbound} of 5; all links broken: ${res.links.filter((l) => l.denied).length} of ${res.links.length}`] : []), ...notes]}
    />
  );
}

function NetworkTask({ state, truth, onPlace }: { state: StepState; truth: Truth; onPlace: (p: Pt) => void }) {
  return <NetworkMap net={level9Network(truth)} at={state.df?.sites?.[0]} onPlace={onPlace} notes={state.df?.sites?.length ? [] : ['Click the map to place the pack.']} />;
}

// Level 11: a town layout's radios, each with the J/S a jammer gives it, green where it is as wanted.
export function townRadios(l: TownLayout, js?: number[]): TownRadio[] {
  return [
    ...l.receivers.map((r, i): TownRadio => ({
      ...r,
      kind: !r.friendly ? 'enemy' : r.name.startsWith('friendly') ? 'friendly' : 'civilian',
      jsDb: js?.[i],
      ok: js ? (r.friendly ? js[i] <= (r.toleranceJsDb ?? 0) : js[i] >= ENEMY_GOAL_JS_DB) : undefined,
    })),
    ...[{ ...l.enemyTx, name: 'enemy transmitter', kind: 'enemy' as const }, { ...l.friendTx, name: 'friendly base', kind: 'friendly' as const }]
      .filter((p) => p.xKm >= 0 && p.xKm <= 2 && p.yKm >= 0 && p.yKm <= 2),
  ];
}

// Level 11 E3: click to place the jammer, set the beam, press Jam. Each Jam is a try; J/S shows for the latest.
function TownTask({ state, truth, onPlace, onBeam, onJam }: {
  state: StepState;
  truth: Truth;
  onPlace: (p: Pt) => void;
  onBeam?: (deg: number) => void;
  onJam?: () => void;
}) {
  const l = e3Layout(truth);
  const at = state.df?.sites?.[0];
  const beamDeg = state.df?.beamDeg ?? 0;
  const jammed = state.df?.jammed;
  const res = jammed ? townTry(l, jammed, jammed.beamDeg) : undefined;
  const notes = !at
    ? ['Click the map to place the jammer, set the beam, then press Jam.']
    : res
      ? [`Jam ${state.df?.tries}: enemy J/S ${res.js[0].toFixed(1)} dB (needs ${ENEMY_GOAL_JS_DB} or more); highest friendly or civilian J/S ${Math.max(...res.js.slice(1)).toFixed(1)} dB (must be ${FRIEND_TOLERANCE_JS_DB} or less)`]
      : [];
  return (
    <div>
      <div className="inst-head">
        <label>Beam <input type="range" min={0} max={355} step={5} value={beamDeg} onChange={(e) => onBeam?.(Number(e.target.value))} aria-label="Beam" /> {beamDeg}°</label>
        <button type="button" disabled={!at || !onJam} onClick={onJam}>Jam</button>
      </div>
      <TownMap title="Map: the enemy in town" radios={townRadios(l, res?.js)} jammer={at} beamDeg={at ? beamDeg : undefined} halfBeamDeg={JAMMER.halfBeamDeg} onPlace={onPlace} notes={notes} />
    </div>
  );
}

// Level 12 H2: the enemy mesh with its backbone; each placement shows the radios silenced and cut off from HQ.
function MeshTask({ state, truth, onPlace }: { state: StepState; truth: Truth; onPlace: (p: Pt) => void }) {
  const { mesh, goal } = h2Mesh(truth);
  const at = state.df?.sites?.[0];
  const r = at ? meshTry(mesh, at) : undefined;
  const rk = radiusKm(MESH_RADIO, H_JAM_W, MESH_RADIO.ccaDbm);
  const notes = r
    ? [`Placement ${state.df?.tries}: silenced ${r.silenced.length}, cut off from HQ ${r.cut.length} (goal ${goal}).`]
    : [`Click the map to place the ${H_JAM_W} W jammer, outside the ${GUARD_KM} km guard round HQ.`];
  return (
    <MeshMap mesh={mesh} title="Map: the enemy mesh" backbone={backbone(mesh.adj, mesh.gateway)} guard={GUARD_KM} jammer={at} gone={r?.silenced} broken={r?.broken} cut={r?.cut}
      rings={at ? [{ rKm: rk, label: `silenced ${rk.toFixed(2)} km` }] : []} onPlace={(p) => !guarded(mesh, p) && onPlace(p)} notes={notes} />
  );
}

// Level 7 E3: the enemy transmitter and receiver, the follower the player placed and the share of each dwell it
// covers; the ellipse of 20% once the step is done.
function FollowerTask({ state, truth, onPlace, onRemove }: {
  state: StepState;
  truth: Truth;
  onPlace: (p: Pt) => void;
  onRemove: (placedIndex: number) => void;
}) {
  const g = e3Geometry(truth);
  const at = state.df?.sites?.[0];
  const notes = at
    ? [`Follower delay ${followerDelayUs(g.tx, g.rx, at, FOLLOW_PROC_US).toFixed(0)} µs of a ${g.dwellUs} µs dwell: it covers ${(100 * e3ShareAt(truth, at)).toFixed(0)}% of each hop`]
    : ['Click the friendly side to place the follower.'];
  return (
    <DfView
      title="Map: the follower"
      sites={at ? [{ ...at, label: 'follower', placed: true }] : []}
      marks={[{ ...g.tx, label: 'transmitter' }, { ...g.rx, label: 'receiver' }]}
      zone
      onPlace={onPlace}
      onRemove={onRemove}
      outlines={state.done ? [e3Ellipse(truth) ?? []] : []}
      notes={notes}
    />
  );
}

function DfLocate({ step, state, truth, onPlace, onRemove }: {
  step: ApplyStep;
  state: StepState;
  truth: Truth;
  onPlace: (p: Pt) => void;
  onRemove: (placedIndex: number) => void;
}) {
  const method = step.dfMethod ?? 'bearings';
  const scene = useMemo(() => level6Scene(truth), [truth]);
  const fixed = step.dfSites ?? [];
  const placed = state.df?.sites ?? [];
  const last = state.df?.last;
  // A leg's end is drawn where the UAV can reach.
  const shownPlaced = method === 'leg' && placed.length === 2 ? [placed[0], legEnd(placed[0], placed[1])] : placed;
  const placedLabel = (k: number) => (method === 'leg' ? (k === 0 ? 'start' : 'end') : `${method === 'tdoa' ? 'T' : 'S'}${fixed.length + k + 1}`);
  // σ stays hidden where the step asks for it (C3) until the step is done.
  const showSigma = !!step.locate || state.done;
  const sites: DfSite[] = [
    ...fixed,
    ...shownPlaced.map((p, k) => ({ ...p, label: placedLabel(k), placed: true })),
  ].map((s) => {
    const h = method === 'leg' ? UAV_HEIGHT_M : undefined;
    return {
      ...s,
      snrDb: siteSnrDb(scene, s, h),
      sigmaDeg: showSigma && method !== 'tdoa' ? siteSigmaDeg(scene, s, h) : undefined,
      timingUs: method === 'tdoa' && step.locate ? siteTimingSigmaUs(scene, s, truth.chipRateMcps) : undefined,
    };
  });
  const bearings = useMemo(
    () => (last ? last.bearings : fixed.length && method === 'bearings' ? dfStepTry(truth, step.id, fixed, 0).bearings : []),
    [last, fixed, truth, step.id, method],
  );
  // G4: the hyperbola of the measured time difference, once answered.
  const hyperbolas = last?.hyperbolas
    ?? (method === 'tdoa' && fixed.length === 2 && state.done ? [tdoaHyperbola(fixed[1], fixed[0], xcorrEnemy(truth).peakUs)] : []);
  const legNote = method === 'leg' && shownPlaced.length === 2
    ? [`Leg ${distanceKm(shownPlaced[0], shownPlaced[1]).toFixed(1)} km of ${LEG_MAX_KM}, ${legPoints(placed[0], placed[1]).length} bearings`]
    : [];
  const tryNote = last
    ? [
        `Try ${state.df!.tries}:`
          + (step.locate?.crossingDegAtLeast !== undefined && last.crossingDeg !== undefined ? ` crossing ${last.crossingDeg.toFixed(0)}°,` : '')
          + (last.cepKm !== undefined ? ` CEP ${last.cepKm.toFixed(2)} km` : ' no fix'),
      ]
    : [];
  return (
    <DfView
      sites={sites}
      bearings={bearings}
      wedges={(state.done || !!last) && method === 'bearings'}
      fix={last?.fix ? { xKm: last.fix.xKm, yKm: last.fix.yKm, ellipse: last.ellipse, cepKm: last.cepKm } : undefined}
      target={state.done ? txOf(truth) : undefined}
      zone={!!step.locate}
      onPlace={step.locate ? onPlace : undefined}
      onRemove={step.locate ? (i) => onRemove(i - fixed.length) : undefined}
      notes={[...legNote, ...tryNote]}
      path={method === 'leg' && shownPlaced.length === 2 ? shownPlaced : undefined}
      hyperbolas={hyperbolas}
    />
  );
}
