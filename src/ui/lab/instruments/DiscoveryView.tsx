import { useMemo, useState } from 'react';
import { CHIPS, codeOf, discoverCode } from '../../../engine/lab/cdma';
import { PIECE_STEPS } from '../../../engine/lab/levels';

// Level 10: a short code found blind. The slider sets how many code-length pieces are averaged; the estimate is
// compared with the true code chip by chip (up to an overall sign).
export function DiscoveryView({ code, snrDb, title = 'Find the code', start = 0 }: { code: number; snrDb: number; title?: string; start?: number }) {
  const [i, setI] = useState(start);
  const pieces = PIECE_STEPS[i];
  const truth = codeOf(code);
  const r = useMemo(() => discoverCode(truth, snrDb, pieces, 1), [truth, snrDb, pieces]);
  const flip = r.estimate.filter((c, k) => c === truth[k]).length < CHIPS / 2 ? -1 : 1;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <label>
          Pieces averaged{' '}
          <input type="range" min={0} max={PIECE_STEPS.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Pieces averaged" />
          {' '}{pieces}
        </label>
        <span className="inst-readout">{r.agree} of {CHIPS} chips found, at {snrDb} dB per chip</span>
      </header>
      <div className="rb-rows">
        <div className="rb-row"><span className="rb-name">estimate</span>{r.estimate.map((c, k) => (
          <span key={k} className={`rb-bit ${c * flip === truth[k] ? 'rb-ok' : 'rb-bad'}`}>{c * flip > 0 ? '+' : '−'}</span>
        ))}</div>
      </div>
    </section>
  );
}
