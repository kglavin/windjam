const W = 640;
const H = 250;
const TOP = 28;
const BOTTOM = 40;
const BAR_W = 56;

const signed = (v: number) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace(/\.0$/, '')} dB`);

// Signal and jammer levels in dB, before and after despreading. Before: signal 0 dB, jammer +J/S. After: the
// signal gains Gp, the jammer stays. The gap after is Eb/J0 = Gp − J/S; its value is written only when showValue.
export function DespreadBars({ gpDb, jsDb, showValue = true }: { gpDb: number; jsDb: number; showValue?: boolean }) {
  const lo = Math.min(0, jsDb);
  const hi = Math.max(gpDb, jsDb, 0);
  const y = (db: number) => TOP + ((hi - db) / (hi - lo + 4)) * (H - TOP - BOTTOM);
  const base = y(lo);
  const groups = [
    { title: 'Before despreading', x: 40, sig: 0, jam: jsDb },
    { title: 'After despreading', x: 340, sig: gpDb, jam: jsDb },
  ];
  const bar = (x: number, db: number, cls: string, label: string) => (
    <g>
      <rect x={x} y={Math.min(y(db), base)} width={BAR_W} height={Math.max(Math.abs(base - y(db)), 1)} className={cls} />
      <text x={x + BAR_W / 2} y={Math.min(y(db), base) - 5} textAnchor="middle" className="vis-label">{signed(db)}</text>
      <text x={x + BAR_W / 2} y={H - BOTTOM + 14} textAnchor="middle" className="vis-label">{label}</text>
    </g>
  );
  const after = groups[1];
  const gapX = after.x + 2 * BAR_W + 56;
  const eb = gpDb - jsDb;
  return (
    <section className="inst-panel">
      <svg className="inst-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signal and jammer levels before and after despreading">
        <line x1={20} x2={W - 20} y1={base} y2={base} className="inst-grid" />
        {groups.map((g) => (
          <g key={g.title}>
            <text x={g.x + BAR_W + 20} y={16} textAnchor="middle" className="vis-label">{g.title}</text>
            {bar(g.x, g.sig, 'vis-bar-sig', 'signal')}
            {bar(g.x + BAR_W + 40, g.jam, 'vis-bar-jam', 'jammer')}
          </g>
        ))}
        <line x1={gapX} x2={gapX} y1={y(after.sig)} y2={y(after.jam)} className="vis-gap" />
        <line x1={gapX - 5} x2={gapX + 5} y1={y(after.sig)} y2={y(after.sig)} className="vis-gap" />
        <line x1={gapX - 5} x2={gapX + 5} y1={y(after.jam)} y2={y(after.jam)} className="vis-gap" />
        <text x={gapX + 10} y={(y(after.sig) + y(after.jam)) / 2 - 2} className="vis-gap-label">Eb/J0 = Gp − J/S</text>
        {showValue && <text x={gapX + 10} y={(y(after.sig) + y(after.jam)) / 2 + 16} className="vis-label">= {gpDb.toFixed(1)} − {Number(jsDb.toFixed(1))} = {eb.toFixed(1)} dB</text>}
      </svg>
    </section>
  );
}
