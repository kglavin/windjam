import { useRef } from 'react';
import { turnEnd } from '../engine/mission/script';
import { BUNDLED_SCRIPTS } from './scripts';

// A loaded mission script, played from the bar above the consoles: a line, a turn (through the next wait) or all
// of it at a press. The lines run through the console exactly as if typed.
export interface LoadedScript {
  name: string;
  commands: string[]; // console lines, directives removed (parseScript)
  cursor: number; // the next line to run
}

// Pick a bundled script from missions/, or open a .txt file from disk.
export function ScriptLoader({ onLoad, disabled }: { onLoad: (name: string, text: string) => void; disabled?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <span className="script-loader">
      <select
        value=""
        disabled={disabled}
        aria-label="Load a script"
        onChange={(e) => {
          const s = BUNDLED_SCRIPTS.find((b) => b.name === e.target.value);
          if (s) onLoad(s.name, s.text);
        }}
      >
        <option value="">Load a script…</option>
        {BUNDLED_SCRIPTS.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>
      <button type="button" disabled={disabled} onClick={() => file.current?.click()}>Open file…</button>
      <input
        ref={file}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onLoad(f.name, await f.text());
          e.target.value = '';
        }}
      />
    </span>
  );
}

export function ScriptBar({ script, onLoad, onRunTo, onUnload, disabled }: {
  script?: LoadedScript;
  onLoad: (name: string, text: string) => void;
  onRunTo: (end: number) => void; // run the lines from the cursor up to end (exclusive)
  onUnload: () => void;
  disabled?: boolean; // watching a server: scripts cannot be loaded
}) {
  if (!script) {
    return (
      <div className="script-bar">
        <span className="muted">Script:</span> <ScriptLoader onLoad={onLoad} disabled={disabled} />
        {disabled && <span className="muted">Not while watching a server.</span>}
      </div>
    );
  }
  const n = script.commands.length;
  const done = script.cursor >= n;
  const next = done ? undefined : script.commands[script.cursor];
  return (
    <div className="script-bar">
      <span className="script-name">{script.name}</span>
      <span className="muted">{done ? `all ${n} lines run` : `line ${script.cursor + 1} of ${n}`}</span>
      {next && <code className="script-next">{next}</code>}
      <button type="button" disabled={done} onClick={() => onRunTo(script.cursor + 1)}>Step</button>
      <button type="button" disabled={done} onClick={() => onRunTo(turnEnd(script.commands, script.cursor))}>Turn</button>
      <button type="button" disabled={done} onClick={() => onRunTo(n)}>Run all</button>
      <button type="button" onClick={onUnload}>Unload</button>
    </div>
  );
}
