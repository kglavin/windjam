// Analysis endpoints import from here. Hypotheses are stated positions and radios, never the truth.
import type { Hex } from './hex';
import { wattsToDbm } from './rf';
import type { Emission } from './detect';
import { RADIO_PRESETS, type Unit, type UnitKind } from './units';

export { analyzePath, hexDistanceKm } from './rf';
export { coverageMap, jsCoverageMap } from './coverage';
export type { CoverageCell, CoverageRx, CoverageTx, JsCell } from './coverage';
export { bearingSigmaDeg, bestLook, cepFromSigmas, emissions, fixFromBearings, sensorLook } from './detect';
export type { DetectOptions, Emission, Fix } from './detect';
export { linkBudget } from './budget';
export { orderDelivery } from './timeliness';

// An emitter or receiver someone believes is at pos. Missing radio fields come from RADIO_PRESETS[kind].
export interface Hypothesis {
  pos: Hex;
  kind: UnitKind;
  powerW?: number;
  antennaHeightM?: number;
  gainDbi?: number;
  freqMHz?: number;
}

// The scenario's command net frequency, so a hypothesis without one sits on a channel the game uses.
const HYPOTHESIS_FREQ_MHZ = 60;

// A stand-in radio at a stated position. Side is neutral: it belongs to nobody, so no side rules apply to it.
export function hypothesisUnit(h: Hypothesis, id = 'hypothesis'): Unit {
  const preset = RADIO_PRESETS[h.kind];
  return {
    id,
    name: id,
    side: 'neutral',
    kind: h.kind,
    pos: h.pos,
    radio: {
      powerW: h.powerW ?? preset.powerW,
      antennaHeightM: h.antennaHeightM ?? preset.antennaHeightM,
      gainDbi: h.gainDbi ?? preset.gainDbi,
      noiseFigureDb: preset.noiseFigureDb,
    },
  };
}

// A fixed-frequency emission. Waveform effects (hopping, spreading) are not modelled for hypotheses.
export function hypothesisEmission(h: Hypothesis): Emission {
  return {
    freqMHz: h.freqMHz ?? HYPOTHESIS_FREQ_MHZ,
    powerDbm: wattsToDbm(h.powerW ?? RADIO_PRESETS[h.kind].powerW),
    intercept: 1,
    label: 'hypothesis',
  };
}
