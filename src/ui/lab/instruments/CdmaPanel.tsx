import { useState } from 'react';
import { type User, CHIPS, berCdma, ruleSinr, sinr } from '../../../engine/lab/cdma';
import { berText } from '../../../engine/lab/levels';

const db = (x: number) => (10 * Math.log10(x)).toFixed(1);

// Level 10: users sharing a band. Each user's despread SINR and exact BER; with cancellation, strongest first.
export function CdmaPanel({ users, sic, title }: { users: User[]; sic: boolean; title: string }) {
  const order = [...users.keys()].sort((a, b) => users[b].powerDb - users[a].powerDb);
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-readout">rule for {users.length} equal users: SINR ≈ {CHIPS} ÷ {users.length - 1} = {users.length > 1 ? ruleSinr(users.length).toFixed(1) : '-'}</span>
      </header>
      <table className="plat-table">
        <thead>
          <tr><th>User</th><th>Gold code</th><th>dB per chip</th><th>Offset (chips)</th><th>SINR (dB)</th><th>BER</th></tr>
        </thead>
        <tbody>
          {users.map((u, k) => {
            const removed = sic ? order.slice(0, order.indexOf(k)) : [];
            return (
              <tr key={k}>
                <td>{k + 1}</td>
                <td>{u.code}</td>
                <td>{u.powerDb}</td>
                <td>{u.offset ?? 0}</td>
                <td>{db(sinr(users, k, removed))}</td>
                <td>{berText(berCdma(users, k, removed))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// The lessons' versions: many equal users with a slider, or a near and a far user with cancellation on or off.
export function CdmaDemo({ example, many, nearFar }: { example: 'many' | 'nearfar'; many: (k: number) => User[]; nearFar: User[] }) {
  const [k, setK] = useState(6);
  const [sic, setSic] = useState(false);
  if (example === 'many') {
    return (
      <div>
        <label className="stage-field">
          <span>Users</span>
          <input type="range" min={2} max={10} value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="Users" /> {k}
        </label>
        <CdmaPanel users={many(k)} sic={false} title={`${k} equal users, Gp 31`} />
      </div>
    );
  }
  return (
    <div>
      <label className="stage-field">
        <input type="checkbox" checked={sic} onChange={(e) => setSic(e.target.checked)} /> cancel the strongest user first
      </label>
      <CdmaPanel users={nearFar} sic={sic} title={sic ? 'Near and far: strongest cancelled first' : 'Near and far: each despread directly'} />
    </div>
  );
}
