import { useCallback, useState } from 'react';
import { LEVELS } from '../../engine/lab/levels';
import { Bench } from './Bench';
import { LevelView } from './LevelView';
import { type Progress, loadProgress, recordScore } from './progress';

// Levels 3 to 5 from design section 8: not built yet.
const COMING = [
  { id: 3, title: 'Where to put the power', blurb: 'Partial-band and pulsed noise: frequency against time.' },
  { id: 4, title: 'Tones', blurb: 'Single and multitone jammers against short and long codes.' },
  { id: 5, title: 'Saturation and timing', blurb: 'Front-end overload and pulses aligned to repetition groups.' },
];

const newSeed = () => 1 + Math.floor(Math.random() * 0x7ffffffe);

type View = { kind: 'list' } | { kind: 'bench' } | { kind: 'level'; id: number; seed: number };

export function LabChapter({ level }: { level?: number }) {
  const [view, setView] = useState<View>(() =>
    level !== undefined && LEVELS.some((l) => l.id === level) ? { kind: 'level', id: level, seed: newSeed() } : { kind: 'list' },
  );
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const onFinish = useCallback((id: number, score: number, passed: boolean) => setProgress(recordScore(id, score, passed)), []);

  if (view.kind === 'bench') return <Bench onBack={() => setView({ kind: 'list' })} />;
  if (view.kind === 'level') {
    const def = LEVELS.find((l) => l.id === view.id)!;
    return (
      <LevelView
        key={view.seed}
        level={def}
        seed={view.seed}
        onFinish={onFinish}
        onExit={() => setView({ kind: 'list' })}
        onReplay={() => setView({ kind: 'level', id: view.id, seed: newSeed() })}
      />
    );
  }

  return (
    <main className="lab-levels">
      <h1>Link lab</h1>
      <p className="home-sub">Observe, characterise and attack an emulated spread-spectrum link, one level at a time.</p>
      <div className="home-cards">
        {LEVELS.map((l) => {
          const p = progress[l.id];
          return (
            <section className="home-card" key={l.id}>
              <h2>Level {l.id}: {l.title}</h2>
              <p>{l.intro.split('. ')[0]}.</p>
              {p && <p>Best score {p.best} / 100{p.passed ? ', passed' : ''}</p>}
              <button type="button" onClick={() => setView({ kind: 'level', id: l.id, seed: newSeed() })}>
                {p ? 'Play again' : 'Start'}
              </button>
            </section>
          );
        })}
        {COMING.map((c) => (
          <section className="home-card level-coming" key={c.id}>
            <h2>Level {c.id}: {c.title}</h2>
            <p>{c.blurb}</p>
            <button type="button" disabled>coming</button>
          </section>
        ))}
      </div>
      <p>
        <button type="button" onClick={() => setView({ kind: 'bench' })}>Instrument bench</button>
      </p>
    </main>
  );
}
