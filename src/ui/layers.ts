// What the map draws. Each layer can be switched off so the others are easier to read.
export type TerrainMode = 'colour' | 'elevation' | 'off';

export interface Layers {
  terrain: TerrainMode;
  grid: boolean; // hex borders (still hidden when hexes are tiny on screen)
  links: boolean; // radio links between units
  jamming: boolean; // jammer-to-receiver lines and jammer halos
  detections: boolean; // ES detection rings
  df: boolean; // direction-finding bearings and position fixes
  units: boolean;
  coverage: boolean; // coverage tool heatmap
  legend: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  terrain: 'elevation', // grey elevation shading by default; terrain colour and off are in the Layers menu
  grid: true,
  links: true,
  jamming: true,
  detections: true,
  df: true,
  units: true,
  coverage: true,
  legend: true,
};

export const LAYER_TOGGLES: { key: Exclude<keyof Layers, 'terrain'>; label: string }[] = [
  { key: 'grid', label: 'Hex grid' },
  { key: 'links', label: 'Radio links' },
  { key: 'jamming', label: 'Jamming' },
  { key: 'detections', label: 'Detections' },
  { key: 'df', label: 'DF bearings and fixes' },
  { key: 'units', label: 'Units' },
  { key: 'coverage', label: 'Coverage heatmap' },
  { key: 'legend', label: 'Legend' },
];

export const TERRAIN_MODES: { id: TerrainMode; label: string }[] = [
  { id: 'colour', label: 'Colour' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'off', label: 'Off' },
];
