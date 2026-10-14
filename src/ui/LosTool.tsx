import { axialToOffset, type Hex } from '../engine/hex';
import { getTile, type HexMap } from '../engine/map';
import { analyzePath, fresnelRadiusM } from '../engine/rf';
import { TERRAIN } from '../engine/terrain';
import { LosProfile } from './LosProfile';
import { NumberField } from './NumberField';
import type { LosState } from './tools';

interface Props {
  map: HexMap;
  los: LosState;
  onChange: (los: LosState) => void;
  onPlotSpan: (span: { leftPageX: number; rightPageX: number }) => void;
}

const hexLabel = (map: HexMap, h: Hex) => {
  const { col, row } = axialToOffset(h);
  const tile = getTile(map, h)!;
  return `${col}, ${row} · ${TERRAIN[tile.terrain].label} ${tile.elevationM} m`;
};

export function LosTool({ map, los, onChange, onPlotSpan }: Props) {
  const { a, b } = los;
  const path = a && b ? analyzePath(map, a, los.antennaAM, b, los.antennaBM, los.freqMHz) : undefined;
  const worst = path?.worstObstacle;
  const clearanceM = worst ? worst.rayM - worst.obstacleTopM : undefined;
  const fresnelM = worst && path ? fresnelRadiusM(los.freqMHz, worst.distanceKm * 1000, (path.distanceKm - worst.distanceKm) * 1000) : 0;

  return (
    <div className="los-dock">
      <div className="los-controls">
        <div className="los-ends">
          <div>
            <b>A</b> {a ? hexLabel(map, a) : <span className="muted">click a hex</span>}
          </div>
          <div>
            <b>B</b> {b ? hexLabel(map, b) : <span className="muted">{a ? 'click a second hex' : '—'}</span>}
          </div>
        </div>
        <NumberField label="Antenna A (m)" value={los.antennaAM} min={1} max={100} step={1} onChange={(v) => onChange({ ...los, antennaAM: v })} />
        <NumberField label="Antenna B (m)" value={los.antennaBM} min={1} max={100} step={1} onChange={(v) => onChange({ ...los, antennaBM: v })} />
        <NumberField label="Frequency (MHz)" value={los.freqMHz} min={30} max={3000} step={1} onChange={(v) => onChange({ ...los, freqMHz: v })} />
        <label className="check">
          <input type="checkbox" checked={los.alignMap} onChange={(e) => onChange({ ...los, alignMap: e.target.checked })} />
          Align map to profile
        </label>
        <button onClick={() => onChange({ ...los, a: undefined, b: undefined })}>Clear</button>
      </div>

      {path && a && b ? (
        <div className="los-body">
          <LosProfile
            map={map}
            a={a}
            b={b}
            path={path}
            groundAM={getTile(map, a)!.elevationM}
            groundBM={getTile(map, b)!.elevationM}
            antennaAM={los.antennaAM}
            antennaBM={los.antennaBM}
            freqMHz={los.freqMHz}
            onPlotSpan={onPlotSpan}
          />
          <div className="los-readout">
            <div className={`los-verdict ${path.lineOfSight ? 'ok' : 'blocked'}`}>{path.lineOfSight ? 'Line of sight' : 'Blocked'}</div>
            <div className="row"><span className="k">Distance</span><span className="v">{path.distanceKm.toFixed(2)} km</span></div>
            {worst && clearanceM !== undefined && (
              <>
                <div className="row">
                  <span className="k">Worst clearance</span>
                  <span className="v">{clearanceM.toFixed(0)} m at {worst.distanceKm.toFixed(1)} km</span>
                </div>
                <div className="row">
                  <span className="k">Fresnel zone cleared</span>
                  <span className="v">{fresnelM > 0 ? `${Math.round((clearanceM / fresnelM) * 100)}%` : '—'}</span>
                </div>
              </>
            )}
            <div className="row"><span className="k">Base loss ({path.model})</span><span className="v">{path.baseLossDb.toFixed(1)} dB</span></div>
            <div className="row"><span className="k">Diffraction loss</span><span className="v">{path.diffractionLossDb.toFixed(1)} dB</span></div>
            <div className="row"><span className="k">Forest clutter loss</span><span className="v">{path.clutterLossDb.toFixed(1)} dB</span></div>
            <div className="row"><span className="k">Total path loss</span><span className="v"><b>{path.totalLossDb.toFixed(1)} dB</b></span></div>
            <p className="muted">Dashed blue: first Fresnel zone. Keep 60% clear for near free-space loss.</p>
          </div>
        </div>
      ) : (
        <p className="muted los-empty">Pick two hexes on the map. Each end uses the antenna height above its hex.</p>
      )}
    </div>
  );
}
