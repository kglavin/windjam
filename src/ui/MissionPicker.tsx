import { useState } from 'react';
import type { MissionKind, PlayerSide } from '../engine/mission/types';
import { ScriptLoader } from './ScriptBar';
import { SCENARIOS } from '../engine/mission/scenarios';
import { BUNDLED_SCRIPTS } from './scripts';
import { parseScript } from '../engine/mission/script';

const MISSIONS: { kind: MissionKind; label: string }[] = [
  { kind: 'find', label: 'Mission 1: find the enemy' },
  { kind: 'hide', label: 'Mission 2: stay hidden' },
  { kind: 'duel', label: 'Mission 3: duel' },
  { kind: 'uav', label: 'Mission 4: track the UAV' },
  { kind: 'hunt', label: 'Mission 5: UAV hunt' },
];

// The script that plays each scenario: the bundled script whose directive names it.
const scriptFor = (id: string) => BUNDLED_SCRIPTS.find((s) => parseScript(s.text).scenario === id);

export function MissionPicker({ onStart, onLoadScript, onPlayScript }: {
  onStart: (kind: MissionKind, computer: PlayerSide[]) => void;
  onLoadScript: (name: string, text: string, computer: PlayerSide[]) => void;
  onPlayScript: (name: string, text: string, computer: PlayerSide[]) => void;
}) {
  // Sides the engine plays (docs/design-computer-player.md), for the missions and the scenarios alike.
  const [computer, setComputer] = useState<PlayerSide[]>([]);
  const toggle = (side: PlayerSide) => setComputer((c) => (c.includes(side) ? c.filter((x) => x !== side) : [...c, side]));
  return (
    <aside className="panel mission-picker">
      <h2>Missions</h2>
      <div className="computer-pick">
        <span className="muted">Computer plays:</span>
        {(['blue', 'red'] as PlayerSide[]).map((side) => (
          <label key={side}><input type="checkbox" checked={computer.includes(side)} onChange={() => toggle(side)} /> {side === 'blue' ? 'Blue' : 'Red'}</label>
        ))}
      </div>
      {MISSIONS.map((m) => (
        <button key={m.kind} onClick={() => onStart(m.kind, computer)}>
          {m.label}
        </button>
      ))}
      <h3>Scenarios</h3>
      <p className="muted">Each plays itself to the end and opens the replay. Pause it and use the inspector to see what it was built to show.</p>
      <div className="scenario-list">
        {SCENARIOS.map((sc) => {
          const script = scriptFor(sc.id);
          return (
            <div key={sc.id} className="scenario-row">
              <div>
                <b>{sc.id}</b> · {sc.title} <span className="muted">· {sc.blurb}</span>
                <div className="muted">Watch: {sc.watch}</div>
              </div>
              <div className="scenario-buttons">
                <button type="button" disabled={!script} onClick={() => script && onPlayScript(script.name, script.text, computer)}>Play</button>
                <button type="button" disabled={!script} onClick={() => script && onLoadScript(script.name, script.text, computer)} title="Load it and step through">Step</button>
              </div>
            </div>
          );
        })}
      </div>
      <h3>Or play a script</h3>
      <p className="muted">A mission script from missions/ starts its mission on its seed; step through it a line or a turn at a time.</p>
      <ScriptLoader onLoad={(name, text) => onLoadScript(name, text, computer)} />
    </aside>
  );
}
