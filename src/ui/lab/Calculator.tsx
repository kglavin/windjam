import { useState } from 'react';
import { evaluate, formatResult } from './calc';

const KEEP = 10;

// A collapsible calculator docked at the bottom of the work area.
export function Calculator() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [results, setResults] = useState<number[]>([]); // newest first
  const [error, setError] = useState('');

  const run = () => {
    const r = evaluate(text, results[0]);
    if (r.ok) {
      setError('');
      setResults((all) => [r.value, ...all].slice(0, KEEP));
    } else {
      setError(r.error);
    }
  };

  return (
    <section className="calc" aria-label="Calculator">
      <button type="button" className="calc-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Calculator
      </button>
      {open && (
        <div className="calc-body">
          <input
            type="text"
            className="calc-input"
            aria-label="Calculation"
            value={text}
            placeholder="type a calculation, Enter to evaluate"
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run();
            }}
          />
          {error && <span className="calc-error">{error}</span>}
          {results.length > 0 && (
            <div className="calc-results">
              {results.map((v, i) => (
                <button key={i} type="button" className="calc-chip" onClick={() => setText((t) => t + formatResult(v))}>
                  {formatResult(v)}
                </button>
              ))}
            </div>
          )}
          <p className="calc-help">e.g. 31.5*2, 2000/63, 10*log10(63)</p>
        </div>
      )}
    </section>
  );
}
