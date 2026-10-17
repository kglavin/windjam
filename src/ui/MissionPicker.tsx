import type { MissionKind } from '../engine/mission/types';

const MISSIONS: { kind: MissionKind; label: string }[] = [
  { kind: 'find', label: 'Mission 1: find the enemy' },
  { kind: 'hide', label: 'Mission 2: stay hidden' },
  { kind: 'duel', label: 'Mission 3: duel' },
  { kind: 'uav', label: 'Mission 4: track the UAV' },
  { kind: 'hunt', label: 'Mission 5: UAV hunt' },
];

export function MissionPicker({ onStart }: { onStart: (kind: MissionKind) => void }) {
  return (
    <aside className="panel mission-picker">
      <h2>Missions</h2>
      {MISSIONS.map((m) => (
        <button key={m.kind} onClick={() => onStart(m.kind)}>
          {m.label}
        </button>
      ))}
    </aside>
  );
}
