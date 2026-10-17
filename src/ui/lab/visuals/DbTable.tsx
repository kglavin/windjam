const RATIOS = [2, 7, 10, 15, 31, 63, 100, 127];

export const ratioDb = (r: number): number => 10 * Math.log10(r);

// Ratio to dB for the code lengths and round numbers the level uses.
export function DbTable() {
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Ratio to dB: dB = 10 × log10(ratio)</h3>
      </header>
      <table className="vis-table">
        <thead>
          <tr>
            <th>Ratio (times)</th>
            <th>dB</th>
          </tr>
        </thead>
        <tbody>
          {RATIOS.map((r) => (
            <tr key={r}>
              <td>{r}</td>
              <td>{ratioDb(r).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
