import type { Hex } from '../engine/hex';

export type Tool = 'select' | 'los' | 'coverage' | 'scope';

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Left-click selects. Right-click moves the selected unit.' },
  { id: 'los', label: 'Line of sight', hint: 'Click two hexes to see the terrain profile between them. Esc to exit.' },
  {
    id: 'coverage',
    label: 'Coverage',
    hint: 'Click a hex or unit to place a transmitter. Colour shows received power, or J/S from a chosen jammer. Esc to exit.',
  },
  {
    id: 'scope',
    label: 'Scope',
    hint: 'Click a unit to probe its receiver: spectrum, waterfall, time trace and constellation. Esc to exit.',
  },
];

export interface LosState {
  a?: Hex;
  b?: Hex;
  antennaAM: number;
  antennaBM: number;
  freqMHz: number;
  alignMap: boolean; // rotate and zoom the map so A and B sit above the profile chart ends
}

export const DEFAULT_LOS: LosState = { antennaAM: 2, antennaBM: 2, freqMHz: 60, alignMap: true };

// 'signal': received power from the transmitter. 'js': what a jammer does to receivers listening to it.
export type CoverageMode = 'signal' | 'js';

export interface CoverageState {
  mode: CoverageMode;
  origin?: Hex;
  jammerId?: string; // J/S mode
  netId?: string; // J/S mode: the net the transmitter is on
  sourceName?: string; // unit the transmitter settings came from
  powerW: number;
  antennaHeightM: number;
  gainDbi: number;
  freqMHz: number;
  rxAntennaM: number;
  rxGainDbi: number;
  rangeKm: number; // only hexes this close to the transmitter are computed
}

// Defaults model a squad manpack talking to another squad.
export const DEFAULT_COVERAGE: CoverageState = {
  mode: 'signal',
  powerW: 5,
  antennaHeightM: 2,
  gainDbi: 0,
  freqMHz: 60,
  rxAntennaM: 2,
  rxGainDbi: 0,
  rangeKm: 25,
};
