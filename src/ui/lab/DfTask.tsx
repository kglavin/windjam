import { useMemo } from 'react';
import type { Pt } from '../../engine/lab/geoloc';
import {
  type ApplyStep, type Truth, LEG_MAX_KM, UAV_HEIGHT_M, dfStepTry, legEnd, legPoints, level6Scene, siteSigmaDeg, siteSnrDb,
  siteTimingSigmaUs, tdoaHyperbola, txOf, xcorrEnemy, FOLLOW_PROC_US, e3Ellipse, e3Geometry, e3ShareAt,
} from '../../engine/lab/levels';
import { followerDelayUs } from '../../engine/lab/fh';
import { distanceKm } from '../../engine/lab/geoloc';
import { type DfSite, DfView } from './instruments/DfView';
import type { StepState } from './levelState';

// Level 6's DF view in an apply step: the step's own sites, the sites (or UAV leg) the player placed, the latest
// bearings or hyperbolas and fix, and the transmitter once the step is done.
export function DfTask({ step, state, truth, onPlace, onRemove }: {
  step: ApplyStep;
  state: StepState;
  truth: Truth;
  onPlace: (p: Pt) => void;
  onRemove: (placedIndex: number) => void;
}) {
  const method = step.dfMethod ?? 'bearings';
  if (method === 'follower') return <FollowerTask state={state} truth={truth} onPlace={onPlace} onRemove={onRemove} />;
  return <DfLocate step={step} state={state} truth={truth} onPlace={onPlace} onRemove={onRemove} />;
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
