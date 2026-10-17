const W = 640;
const H = 250;
const BOX = 44;
const GAP = 8;

// Four bits, each sent as three copies. A copy marked wrong is a flipped decision. The vote takes the value at
// least two copies agree on, so one wrong copy does no harm, and two wrong copies lose the bit.
const BITS: { sent: 1 | -1; wrong: [boolean, boolean, boolean] }[] = [
  { sent: 1, wrong: [false, false, false] },
  { sent: -1, wrong: [false, true, false] },
  { sent: 1, wrong: [true, true, false] },
  { sent: -1, wrong: [false, false, false] },
];

const sym = (v: number) => (v > 0 ? '+1' : '−1');

export function MajorityVote() {
  const groupW = 3 * BOX + 2 * GAP;
  const x0 = (W - (4 * groupW + 3 * 36)) / 2;
  return (
    <section className="inst-panel">
      <svg className="inst-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Four bits sent as three copies each, the vote on each">
        {BITS.map((b, i) => {
          const x = x0 + i * (groupW + 36);
          const decided = b.wrong.map((w) => (w ? -b.sent : b.sent));
          const vote = decided.reduce((a, v) => a + v, 0) > 0 ? 1 : -1;
          const lost = vote !== b.sent;
          return (
            <g key={i}>
              <text x={x + groupW / 2} y={20} textAnchor="middle" className="vis-label">bit {i + 1}: sent {sym(b.sent)}</text>
              {decided.map((v, c) => (
                <g key={c}>
                  <rect x={x + c * (BOX + GAP)} y={34} width={BOX} height={BOX} className={b.wrong[c] ? 'vis-bar-jam' : 'vis-box'} />
                  <text x={x + c * (BOX + GAP) + BOX / 2} y={34 + BOX / 2 + 5} textAnchor="middle" className="vis-sum">{sym(v)}</text>
                  <text x={x + c * (BOX + GAP) + BOX / 2} y={34 + BOX + 14} textAnchor="middle" className="vis-label">{b.wrong[c] ? 'wrong' : 'right'}</text>
                </g>
              ))}
              <text x={x + groupW / 2} y={140} textAnchor="middle" className="vis-label">vote</text>
              <rect x={x + groupW / 2 - BOX / 2} y={148} width={BOX} height={BOX} className={lost ? 'vis-bar-jam' : 'vis-bar-sig'} />
              <text x={x + groupW / 2} y={148 + BOX / 2 + 5} textAnchor="middle" className="vis-sum">{sym(vote)}</text>
              <text x={x + groupW / 2} y={148 + BOX + 16} textAnchor="middle" className="vis-label">
                {lost ? 'bit lost: 2 copies wrong' : b.wrong.some(Boolean) ? 'bit saved: 1 copy wrong' : 'bit right'}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
