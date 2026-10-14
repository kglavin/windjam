import { TERRAIN, type TerrainType, accessLabel } from '../engine/terrain';
import { TERRAIN_COLORS, toCss } from './colors';

// Elevation bands match generateMap in engine/map.ts.
const ROWS: { terrain: TerrainType; elevation: string; effect: string }[] = [
  { terrain: 'water', elevation: '0 m', effect: 'Flat, open path' },
  { terrain: 'plain', elevation: '20–150 m', effect: 'Open ground' },
  { terrain: 'forest', elevation: '20–150 m', effect: `${TERRAIN.forest.clutterHeightM} m trees block paths; +${TERRAIN.forest.endpointLossDb} dB if antenna inside` },
  { terrain: 'hill', elevation: '150–500 m', effect: 'High ground, longer reach' },
  { terrain: 'mountain', elevation: '500–1500 m', effect: 'Blocks line of sight' },
];

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Terrain</div>
      {ROWS.map(({ terrain, elevation, effect }) => (
        <div key={terrain} className="legend-row">
          <span className="legend-swatch" style={{ background: toCss(TERRAIN_COLORS[terrain]) }} />
          <span className="legend-name">{TERRAIN[terrain].label}</span>
          <span className="legend-elev">{elevation}</span>
          <span className="legend-effect">
            {effect}
            {TERRAIN[terrain].access !== 'all' && ` · ${accessLabel(terrain)}`}
          </span>
        </div>
      ))}
      <div className="legend-note">Lighter shade = higher elevation.</div>
    </div>
  );
}
