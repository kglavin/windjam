import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../engine/mission/types';

interface Props {
  log: LogEntry[];
  prompt: string;
  disabled?: boolean;
  onSubmit: (line: string) => void; // called once per line; a pasted block is split into lines
  showSide?: boolean; // one console for both sides: tag each line with its side
}

// Command console: the mission log above, a prompt below. Up and down arrows recall earlier commands.
export function Console({ log, prompt, disabled, onSubmit, showSide }: Props) {
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // Run every non-empty, non-comment line of a block (typed or pasted).
  const runBlock = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);
    for (const l of lines) onSubmit(l);
    return lines;
  };

  const submit = () => {
    const text = line.trim();
    if (!text) return;
    const lines = runBlock(text);
    if (lines.length === 0) {
      setLine('');
      return;
    }
    setHistory((h) => [text, ...h].slice(0, 50));
    setCursor(-1);
    setLine('');
  };

  const recall = (dir: 1 | -1) => {
    const next = Math.min(history.length - 1, Math.max(-1, cursor + dir));
    setCursor(next);
    setLine(next === -1 ? '' : history[next]);
  };

  return (
    <div className="console" onClick={() => inputRef.current?.focus()}>
      <div ref={scrollRef} className="console-log">
        {log.map((e, i) => (
          <div key={i} className={`console-line ${e.kind}`}>
            <span className="console-time">[T+{String(e.minute).padStart(2, '0')}]</span>{showSide && e.side && <span className={`console-side ${e.side}`}> {e.side}</span>} {e.text}
          </div>
        ))}
      </div>
      <div className="console-input">
        <span className="console-prompt">{prompt}</span>
        <input
          ref={inputRef}
          value={line}
          disabled={disabled}
          autoFocus
          spellCheck={false}
          placeholder={`${prompt.startsWith("duel") ? "blue> sq1: df e 5   ·   red> send" : prompt.startsWith("red") ? "send   ·   emcon cmd 0" : "sq1: df e 5"}   ·   wait 5   ·   help   ·   paste a mission script`}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!text.includes('\n')) return; // single line: normal paste
            e.preventDefault();
            const lines = runBlock(text);
            if (lines.length) setHistory((h) => [...lines.slice().reverse(), ...h].slice(0, 50));
          }}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              recall(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              recall(-1);
            }
          }}
        />
      </div>
    </div>
  );
}
