import { useMemo, useState } from 'react';
import { berlekampMassey, chipsToBits, extendRecurrence } from '../../../engine/lab/pn';

// Level 8: Berlekamp–Massey on the first k chips of a code, and the rebuilt register's prediction of the rest of
// the period against the real chips.
export function RebuildView({ code, title = 'Rebuild the code', start = 4 }: { code: Int8Array; title?: string; start?: number }) {
  const bits = useMemo(() => chipsToBits(code), [code]);
  const n = bits.length;
  const [k, setK] = useState(start);
  const bm = useMemo(() => berlekampMassey(bits.slice(0, k)), [bits, k]);
  const pred = useMemo(() => extendRecurrence(bits.slice(0, k), bm.coeffs, n - k), [bits, bm, k, n]);
  const right = pred.filter((b, i) => b === bits[k + i]).length;
  const taps = bm.coeffs.flatMap((c, i) => (c ? [i + 1] : [])).sort((a, b) => b - a);
  const shown = Math.min(n, 64);
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <label>
          Chips captured{' '}
          <input type="range" min={1} max={Math.min(n, 40)} value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="Chips captured" />
          {' '}{k}
        </label>
      </header>
      <div className="rb-rows">
        <div className="rb-row"><span className="rb-name">captured</span>{bits.slice(0, k).map((b, i) => <span key={i} className="rb-bit rb-cap">{b}</span>)}</div>
        <div className="rb-row">
          <span className="rb-name">predicted</span>
          {pred.slice(0, shown - k).map((b, i) => <span key={i} className={`rb-bit ${b === bits[k + i] ? 'rb-ok' : 'rb-bad'}`}>{b}</span>)}
          {n > shown && <span className="rb-more">…</span>}
        </div>
      </div>
      <dl className="inst-meter">
        <div><dt>Shortest register</dt><dd>{bm.length} stages</dd></div>
        <div><dt>Its taps</dt><dd>{taps.length ? taps.join(' and ') : '-'}</dd></div>
        <div><dt>Rest of the period predicted right</dt><dd>{right} of {n - k}</dd></div>
      </dl>
    </section>
  );
}
