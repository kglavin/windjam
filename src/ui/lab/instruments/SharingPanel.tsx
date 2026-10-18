import { useState } from 'react';
import { berText } from '../../../engine/lab/levels';
import { type ShareMode, type Target, shareOutcome } from '../../../engine/lab/tactics';

export interface SharePlan {
  mode: ShareMode;
  chosen: number[];
}

// Level 9: one jammer over several links. Pick the links and power or time sharing; each link's BER and whether it
// reaches the goal follow. With onCommit, a Commit button fixes the plan (the scored step).
export function SharingPanel({ targets, goalBer, plan, onChange, onCommit, locked = false }: {
  targets: Target[];
  goalBer: number;
  plan: SharePlan;
  onChange: (p: SharePlan) => void;
  onCommit?: () => void;
  locked?: boolean;
}) {
  const out = shareOutcome(targets, plan.chosen, plan.mode, goalBer);
  const toggle = (i: number) => onChange({ ...plan, chosen: plan.chosen.includes(i) ? plan.chosen.filter((x) => x !== i) : [...plan.chosen, i].sort() });
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>One jammer, {targets.length} links</h3>
        <label><input type="radio" checked={plan.mode === 'power'} disabled={locked} onChange={() => onChange({ ...plan, mode: 'power' })} /> power sharing</label>
        <label><input type="radio" checked={plan.mode === 'time'} disabled={locked} onChange={() => onChange({ ...plan, mode: 'time' })} /> time sharing</label>
        {onCommit && <button type="button" disabled={locked || plan.chosen.length === 0} onClick={onCommit}>Commit plan</button>}
      </header>
      <table className="plat-table">
        <thead>
          <tr><th>Jam</th><th>Link</th><th>Eb/J0, whole jammer</th><th>BER</th><th>Goal {berText(goalBer)}</th></tr>
        </thead>
        <tbody>
          {targets.map((t, i) => (
            <tr key={t.name}>
              <td><input type="checkbox" aria-label={`Jam ${t.name}`} checked={plan.chosen.includes(i)} disabled={locked} onChange={() => toggle(i)} /></td>
              <td>{t.name}</td>
              <td>{(t.gpDb - t.jsDb).toFixed(0)} dB</td>
              <td>{berText(out[i].ber)}</td>
              <td className={out[i].denied ? 'share-ok' : 'share-no'}>{out[i].denied ? 'broken' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// The lesson's version: its own state, no commit.
export function SharingDemo({ targets, goalBer }: { targets: Target[]; goalBer: number }) {
  const [plan, setPlan] = useState<SharePlan>({ mode: 'power', chosen: targets.map((_, i) => i) });
  return <SharingPanel targets={targets} goalBer={goalBer} plan={plan} onChange={setPlan} />;
}
