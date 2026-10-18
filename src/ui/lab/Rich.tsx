import { Fragment, useEffect, useRef, useState } from 'react';
import { type GlossaryEntry, GLOSSARY, richParts, wikiUrl } from '../../engine/lab/glossary';
import { LEVELS, flatSteps } from '../../engine/lab/levels';

// Where a term is taught, as "Level 0, D2: From the air to 0 MHz".
export function taughtLabel(entry: GlossaryEntry): string | null {
  if (!entry.taught) return null;
  const level = LEVELS.find((l) => l.id === entry.taught!.level);
  const step = level && flatSteps(level).find((f) => f.step.id === entry.taught!.step)?.step;
  return step ? `Level ${level.id}, ${step.id}: ${step.title}` : null;
}

// A term in a lesson text. Click (or tap) opens a small card with the definition, where it is taught and a link;
// Escape or a click elsewhere closes it.
export function GlossaryTerm({ shown, entry }: { shown: string; entry: GlossaryEntry }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  const taught = taughtLabel(entry);
  return (
    <span className="gloss" ref={ref}>
      <button type="button" className="gloss-term" aria-expanded={open} onClick={() => setOpen(!open)}>
        {shown}
      </button>
      {open && (
        <span className="gloss-pop" role="dialog" aria-label={entry.term}>
          <strong className="gloss-name">{entry.term}</strong>
          <span className="gloss-short">{entry.short}</span>
          {taught && <span className="gloss-taught">Taught in {taught}</span>}
          <a className="gloss-link" href={wikiUrl(entry.wiki)} target="_blank" rel="noopener noreferrer">
            Read more on Wikipedia: {entry.wiki}
          </a>
        </span>
      )}
    </span>
  );
}

// A lesson text with its [[glossary]] marks as clickable terms.
export function Rich({ text }: { text: string }) {
  return (
    <>
      {richParts(text).map((p, i) =>
        typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <GlossaryTerm key={i} shown={p.shown} entry={p.entry} />,
      )}
    </>
  );
}

// Every term, A to Z.
export function GlossaryPage({ onBack }: { onBack: () => void }) {
  const entries = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
  return (
    <main className="lab-levels glossary-page">
      <p>
        <button type="button" onClick={onBack}>Back</button>
      </p>
      <h1>Glossary</h1>
      <p className="home-sub">The words the Link lab uses, in plain terms, with the lesson that teaches each one.</p>
      <dl className="glossary-list">
        {entries.map((e) => {
          const taught = taughtLabel(e);
          return (
            <div key={e.id} className="glossary-item">
              <dt>{e.term}</dt>
              <dd>
                {e.short}
                {taught && <span className="gloss-taught"> Taught in {taught}.</span>}{' '}
                <a href={wikiUrl(e.wiki)} target="_blank" rel="noopener noreferrer">Wikipedia: {e.wiki}</a>
              </dd>
            </div>
          );
        })}
      </dl>
    </main>
  );
}
