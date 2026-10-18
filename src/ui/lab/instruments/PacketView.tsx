import type { PacketLink, PacketRecord, SyncJammer } from '../../../engine/lab/sync';

// Level 8: one packet as a bar, preamble then payload, with the jammer's on-time over it; after a run, the first
// packets' searches: how many tests until lock, or why the packet was lost.
export function PacketView({ link, jammer, records, title = 'Packet timeline' }: {
  link: PacketLink;
  jammer?: SyncJammer;
  records?: PacketRecord[];
  title?: string;
}) {
  const pre = link.preamblePeriods * link.n;
  const pay = link.payloadBits * link.n;
  const W = 600;
  const x0 = 20;
  const sx = (chips: number) => x0 + (chips / (pre + pay)) * W;
  const on = jammer?.on ?? 'none';
  const jamFrom = on === 'payload' ? pre : 0;
  const jamTo = on === 'preamble' ? pre : pre + pay;
  const onChips = on === 'none' ? 0 : jamTo - jamFrom;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-legend">
          <span className="c2"><i />preamble</span>
          <span className="c1"><i />payload</span>
          {on !== 'none' && <span className="c6"><i />jammer on</span>}
        </span>
      </header>
      <svg className="inst-svg" viewBox="0 0 640 90" role="img" aria-label={title}>
        <rect x={sx(0)} y={20} width={sx(pre) - sx(0)} height={26} className="pk-pre" />
        <rect x={sx(pre)} y={20} width={sx(pre + pay) - sx(pre)} height={26} className="pk-pay" />
        {on !== 'none' && <rect x={sx(jamFrom)} y={12} width={sx(jamTo) - sx(jamFrom)} height={42} className="pk-jam" />}
        <text x={sx(0)} y={68} className="inst-axis">preamble {link.preamblePeriods} periods = {pre.toLocaleString()} chips</text>
        <text x={sx(pre + pay)} y={68} textAnchor="end" className="inst-axis">payload {link.payloadBits} bits = {pay.toLocaleString()} chips</text>
        {on !== 'none' && <text x={sx(jamFrom)} y={84} className="inst-axis">jammer on for {onChips.toLocaleString()} chips of each packet</text>}
      </svg>
      {records && records.length > 0 && (
        <ol className="pk-records">
          {records.map((r, i) => (
            <li key={i} className={r.locked && r.bitErrors === 0 ? 'ok' : 'bad'}>
              {r.locked
                ? `locked after ${r.testsUsed} tests${r.bitErrors ? `, ${r.bitErrors} payload bits wrong: lost` : ''}`
                : r.falseLock
                  ? `false lock after ${r.testsUsed} tests: lost`
                  : `no lock in ${r.testsUsed} tests: lost`}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
