import { type Hex, axialToOffset } from '../engine/hex';
import type { CoverageCell, JsCell } from '../engine/coverage';
import { getTile } from '../engine/map';
import { TERRAIN, accessLabel } from '../engine/terrain';
import { type World, unitAt } from '../engine/world';
import { SIDE_COLORS, TERRAIN_COLORS, toCss } from './colors';

interface Props {
  world: World;
  hover: { hex: Hex; x: number; y: number };
  hostWidth: number;
  coverage?: CoverageCell | JsCell; // received power, and J/S in J/S mode, when the coverage tool is active
  note?: string; // extra line, e.g. a reveal status
}

const OFFSET = 14;
const WIDTH = 210;

export function HexTooltip({ world, hover, hostWidth, coverage, note }: Props) {
  const tile = getTile(world.map, hover.hex);
  if (!tile) return null;
  const info = TERRAIN[tile.terrain];
  const unit = unitAt(world, hover.hex);
  const { col, row } = axialToOffset(tile.hex);
  // Flip to the left of the pointer near the right edge.
  const left = hover.x + OFFSET + WIDTH > hostWidth ? hover.x - OFFSET - WIDTH : hover.x + OFFSET;

  return (
    <div className="tooltip" style={{ left, top: hover.y + OFFSET, width: WIDTH }}>
      <div className="tooltip-title">
        <span className="legend-swatch" style={{ background: toCss(TERRAIN_COLORS[tile.terrain]) }} />
        {info.label}
      </div>
      <div className="row">
        <span className="k">Elevation</span>
        <span className="v">{tile.elevationM} m</span>
      </div>
      {info.clutterHeightM > 0 && (
        <div className="row">
          <span className="k">Tree height</span>
          <span className="v">{info.clutterHeightM} m</span>
        </div>
      )}
      {info.endpointLossDb > 0 && (
        <div className="row">
          <span className="k">Antenna loss here</span>
          <span className="v">+{info.endpointLossDb} dB</span>
        </div>
      )}
      <div className="row">
        <span className="k">Movement</span>
        <span className="v">{accessLabel(tile.terrain)}</span>
      </div>
      <div className="row">
        <span className="k">Col, row</span>
        <span className="v">
          {col}, {row}
        </span>
      </div>
      {coverage && (
        <div className="row">
          <span className="k">Received</span>
          <span className="v">
            {coverage.rxDbm.toFixed(1)} dBm{coverage.lineOfSight ? '' : ' (NLOS)'}
          </span>
        </div>
      )}
      {coverage && 'jsDb' in coverage && Number.isFinite(coverage.jammerDbm) && (
        <>
          <div className="row">
            <span className="k">J/S when hit</span>
            <span className="v">{coverage.jsDb.toFixed(1)} dB</span>
          </div>
          <div className="row">
            <span className="k">Time hit</span>
            <span className="v">{(coverage.fraction * 100).toFixed(coverage.fraction < 0.1 ? 2 : 0)}%</span>
          </div>
          <div className="row">
            <span className="k">Average J/S</span>
            <span className="v">{Number.isFinite(coverage.avgJsDb) ? `${coverage.avgJsDb.toFixed(1)} dB` : '—'}</span>
          </div>
        </>
      )}
      {unit && (
        <div className="row">
          <span className="k">Unit</span>
          <span className="v">
            <span className="swatch" style={{ background: toCss(SIDE_COLORS[unit.side]) }} /> {unit.name}
          </span>
        </div>
      )}
      {note && <div className="muted">{note}</div>}
    </div>
  );
}
