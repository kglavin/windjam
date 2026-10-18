import { useMemo } from 'react';
import type { Pt } from '../../engine/lab/geoloc';
import {
  type ApplyStep, type Truth, LEG_MAX_KM, UAV_HEIGHT_M, dfStepTry, legEnd, legPoints, level6Scene, siteSigmaDeg, siteSnrDb,
  siteTimingSigmaUs, tdoaHyperbola, txOf, xcorrEnemy,
} from '../../engine/lab/levels';
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
