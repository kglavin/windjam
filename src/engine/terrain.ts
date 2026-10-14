import type { UnitKind } from './units';

export type TerrainType = 'water' | 'plain' | 'forest' | 'hill' | 'mountain';

// Who may occupy a hex: every unit, nobody, or only the listed kinds.
export type Access = 'all' | 'none' | readonly UnitKind[];

export interface TerrainInfo {
  label: string;
  // Height of clutter (trees) above ground that can block a radio path, metres.
  clutterHeightM: number;
  // Extra loss when an antenna sits inside this terrain, dB.
  endpointLossDb: number;
  access: Access;
}

// Game assumptions, tuned for VHF (30-88 MHz) combat net radio. Not measured data.
// Relays and EW teams can be sited on mountaintops; manoeuvre units cannot.
export const TERRAIN: Record<TerrainType, TerrainInfo> = {
  water: { label: 'Water', clutterHeightM: 0, endpointLossDb: 0, access: 'none' },
  plain: { label: 'Plain', clutterHeightM: 0, endpointLossDb: 0, access: 'all' },
  forest: { label: 'Forest', clutterHeightM: 20, endpointLossDb: 6, access: 'all' },
  hill: { label: 'Hill', clutterHeightM: 0, endpointLossDb: 0, access: 'all' },
  mountain: { label: 'Mountain', clutterHeightM: 0, endpointLossDb: 0, access: ['relay', 'jammer'] },
};

// Drones fly, so terrain never stops them.
export function canEnter(terrain: TerrainType, kind: UnitKind): boolean {
  if (kind === 'drone') return true;
  const access = TERRAIN[terrain].access;
  return access === 'all' || (access !== 'none' && access.includes(kind));
}

// Short description of who may enter, for the UI.
export function accessLabel(terrain: TerrainType): string {
  const access = TERRAIN[terrain].access;
  if (access === 'all') return 'Passable';
  if (access === 'none') return 'Impassable';
  return `${access.map((k) => (k === 'jammer' ? 'EW' : k[0].toUpperCase() + k.slice(1))).join(' & ')} only`;
}
