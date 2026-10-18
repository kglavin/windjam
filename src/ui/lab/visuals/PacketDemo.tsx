import { useMemo, useState } from 'react';
import { planSyncRun } from '../../../engine/lab/berRun';
import { EXAMPLE, FIRST_PRACTICE, type RunSummary, knownLinkInfo, level8Truth } from '../../../engine/lab/levels';
import { SYNC_EXAMPLE, type SyncJammer, jammerEnergy } from '../../../engine/lab/sync';
import { PacketView } from '../instruments/PacketView';
import { RunStats, useRun } from '../RunBox';

// Level 8 F1: the example packet link, one Run per jammer timing at the same J/S, with the energy each spends.
export function PacketDemo({ variants, jsDb }: { variants: { label: string; on: SyncJammer['on'] }[]; jsDb: number }) {
  const [sel, setSel] = useState(0);
  const [runs, setRuns] = useState<Record<number, RunSummary>>({});
  const plans = useMemo(
    () =>
      variants.map((v, i) =>
        planSyncRun({ link: 'example', js: 'fixed', jammer: { kind: 'bbn' } }, { linkFrom: () => SYNC_EXAMPLE, jammerFrom: () => ({ on: v.on, jsDb }) }, {
          truth: level8Truth(1), example: knownLinkInfo(EXAMPLE), practice: FIRST_PRACTICE, practiceJsDb: jsDb, scene: { jsDb, ebN0Db: 30 }, seed: 808 + i,
        }),
      ),
    [variants, jsDb],
  );
  return (
    <div className="vis-run-demo">
      <PacketView link={SYNC_EXAMPLE} jammer={{ on: variants[sel].on, jsDb }} records={runs[sel]?.records} title="Packet timeline: example link" />
      <p className="stage-note">J/S = {jsDb} dB while the jammer is on</p>
      {variants.map((v, i) => (
        <Meter key={v.label} title={`${v.label}: energy ${Math.round(jammerEnergy(SYNC_EXAMPLE, { on: v.on, jsDb })).toLocaleString()}`} plan={plans[i]}
          onSelect={() => setSel(i)} onResult={(s) => setRuns((r) => ({ ...r, [i]: s }))} active={i === sel} />
      ))}
    </div>
  );
}

function Meter({ title, plan, onSelect, onResult, active }: {
  title: string;
  plan: ReturnType<typeof planSyncRun>;
  onSelect: () => void;
  onResult: (s: RunSummary) => void;
  active: boolean;
}) {
  const [result, setResult] = useState<RunSummary>();
  const { running, progress, error, start } = useRun((s) => {
    setResult(s);
    onResult(s);
  });
  return (
    <section className={`inst-panel ${active ? 'vis-variant-active' : ''}`}>
      <header className="inst-head">
        <h3>{title}</h3>
        <button type="button" onClick={onSelect} disabled={active}>Show</button>
        <button type="button" disabled={running} onClick={() => { onSelect(); start(plan); }}>{running ? 'Running…' : 'Run'}</button>
      </header>
      <RunStats p={running ? progress : result} />
      {error && <p className="inst-error">{error}</p>}
    </section>
  );
}
