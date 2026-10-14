import type { CoverageCell, JsCell } from '../engine/coverage';
import type { Net, Unit } from '../engine/units';
import { COVERAGE_BANDS, JS_BANDS, coverageColor, toCss } from './colors';
import { NumberField } from './NumberField';
import type { CoverageMode, CoverageState } from './tools';

interface Props {
  state: CoverageState;
  jammerId?: string; // resolved J/S jammer (the user choice, or a default)
  netId?: string; // resolved J/S net
  cells?: Record<string, CoverageCell | JsCell>;
  noiseFloorDbm: number;
  jammers: Unit[];
  nets: Net[];
  onChange: (s: CoverageState) => void;
}

const MODES: { id: CoverageMode; label: string }[] = [
  { id: 'signal', label: 'Signal' },
  { id: 'js', label: 'J/S' },
];

function jammerSummary(j: Unit, nets: Net[]): string {
  const cfg = j.jammer!;
  if (cfg.mode === 'off') return 'off';
  if (cfg.mode === 'barrage') return 'barrage';
  return `${cfg.mode} on ${nets.find((n) => n.id === cfg.targetNetId)?.name ?? '?'}`;
}

export function CoverageTool({ state, jammerId, netId, cells, noiseFloorDbm, jammers, nets, onChange }: Props) {
  const set = (patch: Partial<CoverageState>) => onChange({ ...state, ...patch });
  const values = cells ? Object.values(cells) : [];
  const jammer = jammers.find((j) => j.id === jammerId);
  const net = nets.find((n) => n.id === netId);
  const jsMode = state.mode === 'js';

  let summary = '';
  if (cells && !jsMode) {
    const covered = values.filter((c) => coverageColor(c.rxDbm, noiseFloorDbm) !== null).length;
    summary = `Above the noise floor (${noiseFloorDbm.toFixed(1)} dBm) in ${covered} of ${values.length} hexes within ${state.rangeKm} km (${Math.round((covered / values.length) * 100)}%).`;
  } else if (cells && jsMode) {
    const wins = values.filter((c) => 'avgJsDb' in c && c.avgJsDb >= 0).length;
    summary = `Jammer matches or beats the signal (average J/S ≥ 0 dB) in ${wins} of ${values.length} hexes within ${state.rangeKm} km (${Math.round((wins / values.length) * 100)}%).`;
  }

  return (
    <div className="coverage-dock">
      <div className="los-controls">
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.id} className={state.mode === m.id ? 'active' : ''} onClick={() => set({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="los-ends">
          <b>Transmitter</b>{' '}
          {state.origin ? (state.sourceName ?? 'custom') : <span className="muted">click a hex or unit</span>}
        </div>
        <NumberField label="Power (W)" value={state.powerW} min={0.1} max={2000} step={1} onChange={(v) => set({ powerW: v })} />
        <NumberField label="Tx antenna (m)" value={state.antennaHeightM} min={1} max={100} step={1} onChange={(v) => set({ antennaHeightM: v })} />
        <NumberField label="Tx gain (dBi)" value={state.gainDbi} min={-10} max={30} step={1} onChange={(v) => set({ gainDbi: v })} />
        {!jsMode && (
          <NumberField label="Frequency (MHz)" value={state.freqMHz} min={30} max={3000} step={1} onChange={(v) => set({ freqMHz: v })} />
        )}
        <NumberField label="Range (km)" value={state.rangeKm} min={1} max={150} step={5} onChange={(v) => set({ rangeKm: v })} />
        <NumberField label="Rx antenna (m)" value={state.rxAntennaM} min={1} max={100} step={1} onChange={(v) => set({ rxAntennaM: v })} />
        {jsMode && (
          <>
            <label className="field">
              <span>Jammer</span>
              <select value={jammerId ?? ''} onChange={(e) => set({ jammerId: e.target.value })}>
                {jammers.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} ({jammerSummary(j, nets)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Transmitter's net</span>
              <select value={netId ?? ''} onChange={(e) => set({ netId: e.target.value })}>
                {nets.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button onClick={() => set({ origin: undefined, sourceName: undefined })}>Clear</button>
      </div>
      <div className="coverage-scale">
        {(jsMode ? JS_BANDS : COVERAGE_BANDS).map((b) => (
          <span key={b.label} className="coverage-band">
            <span className="legend-swatch" style={{ background: toCss(b.color) }} /> {b.label}
          </span>
        ))}
        <span className="muted">
          {jsMode
            ? `Average J/S a receiver at each hex would see (J/S when hit, scaled by the share of time hit). Uncoloured: below -10 dB.${jammer?.jammer?.mode === 'off' ? ` ${jammer.name} is off: turn it on with the Select tool.` : ''}${net && net.waveform.kind === 'fh' ? ` ${net.name} hops ${net.waveform.hopsPerSec}/s.` : ''}`
            : `Uncoloured: below noise floor.`}{' '}
          {summary}
        </span>
      </div>
    </div>
  );
}
