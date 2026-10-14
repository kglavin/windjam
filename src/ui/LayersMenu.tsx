import { useState } from 'react';
import { LAYER_TOGGLES, TERRAIN_MODES, type Layers } from './layers';

// Map layer switches, opened from the map's top-right controls.
export function LayersMenu({ layers, onChange }: { layers: Layers; onChange: (layers: Layers) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="layers-menu">
      <button className={open ? 'active' : ''} onClick={() => setOpen(!open)} title="Choose what the map shows">
        Layers ▾
      </button>
      {open && (
        <div className="layers-panel">
          <div className="layers-title">Terrain</div>
          <div className="seg">
            {TERRAIN_MODES.map((m) => (
              <button
                key={m.id}
                className={layers.terrain === m.id ? 'active' : ''}
                onClick={() => onChange({ ...layers, terrain: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="layers-title">Show</div>
          {LAYER_TOGGLES.map((t) => (
            <label key={t.key} className="check">
              <input type="checkbox" checked={layers[t.key]} onChange={(e) => onChange({ ...layers, [t.key]: e.target.checked })} />
              {t.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
