import type { MissionState } from '../engine/mission/types';

export type ReplayMove = 'start' | 'back' | 'step' | 'next' | 'end';
export const REPLAY_SPEEDS: { label: string; msPerMinute: number }[] = [
  { label: 'slow (3 s/min)', msPerMinute: 3000 },
  { label: 'normal (1 s/min)', msPerMinute: 1000 },
  { label: 'fast (0.3 s/min)', msPerMinute: 300 },
];

interface Props {
  mission: MissionState;
  playing: boolean;
  speed: number; // index into REPLAY_SPEEDS
  onMove: (move: ReplayMove) => void;
  onJump: (minute: number) => void;
  onPlay: (on: boolean) => void;
  onSpeed: (index: number) => void;
  onReveal: () => void; // opens the replay when the mission is over but not yet revealed
}

// Transport controls for the debrief: play the mission back a minute at a time at a human pace, pause, step, scrub.
export function ReplayBar({ mission: m, playing, speed, onMove, onJump, onPlay, onSpeed, onReveal }: Props) {
  if (m.status === 'running') return null;
  const last = m.history.length - 1;
  if (!m.replay) {
    return (
      <div className="replay-bar">
        <button onClick={onReveal}>Reveal and replay</button>
        <span className="muted">Shows the truth for both sides and opens the replay at T+0.</span>
      </div>
    );
  }
  const at = m.replay.minute;
  const atEnd = at >= last;
  return (
    <div className="replay-bar">
      <button title="To T+0" onClick={() => onMove('start')} disabled={at === 0}>
        ⏮
      </button>
      <button title="Back one minute" onClick={() => onMove('back')} disabled={at === 0}>
        ◀
      </button>
      <button className={playing ? 'active' : ''} title={playing ? 'Pause' : 'Play'} onClick={() => onPlay(!playing)} disabled={atEnd && !playing}>
        {playing ? '⏸' : '▶'}
      </button>
      <button title="Forward one minute" onClick={() => onMove('step')} disabled={atEnd}>
        ▶|
      </button>
      <button title="Next event" onClick={() => onMove('next')} disabled={atEnd}>
        ⏭
      </button>
      <input type="range" min={0} max={last} value={at} onChange={(e) => onJump(Number(e.target.value))} />
      <span className="replay-clock">
        T+{at} / {last}
      </span>
      <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
        {REPLAY_SPEEDS.map((s, i) => (
          <option key={i} value={i}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="muted">Each minute's events are narrated in the console as it plays.</span>
    </div>
  );
}
