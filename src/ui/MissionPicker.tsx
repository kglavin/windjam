import type { MissionKind } from '../engine/mission/types';
import { ScriptLoader } from './ScriptBar';

const MISSIONS: { kind: MissionKind; label: string }[] = [
  { kind: 'find', label: 'Mission 1: find the enemy' },
  { kind: 'hide', label: 'Mission 2: stay hidden' },
  { kind: 'duel', label: 'Mission 3: duel' },
  { kind: 'uav', label: 'Mission 4: track the UAV' },
  { kind: 'hunt', label: 'Mission 5: UAV hunt' },
];

export function MissionPicker({ onStart, onLoadScript }: { onStart: (kind: MissionKind) => void; onLoadScript: (name: string, text: string) => void }) {
  return (
    <aside className="panel mission-picker">
      <h2>Missions</h2>
      {MISSIONS.map((m) => (
        <button key={m.kind} onClick={() => onStart(m.kind)}>
          {m.label}
        </button>
      ))}
      <h3>Or play a script</h3>
      <p className="muted">A mission script from missions/ starts its mission on its seed; step through it a line or a turn at a time.</p>
      <ScriptLoader onLoad={onLoadScript} />
    </aside>
  );
}
