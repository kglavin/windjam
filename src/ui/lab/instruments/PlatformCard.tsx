import { PLATFORMS, dcPowerW, timeOnAirH } from '../../../engine/lab/tactics';

const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : String(Number(v.toPrecision(3))));

// Level 9: what each platform can carry and generate, and how long it can jam with it.
export function PlatformCard() {
  return (
    <section className="inst-panel">
      <header className="inst-head"><h3>Jammer platforms (the lab's round figures)</h3></header>
      <table className="plat-table">
        <thead>
          <tr><th>Platform</th><th>RF power</th><th>Efficiency</th><th>DC power</th><th>Energy</th><th>Time on air</th><th>Height</th></tr>
        </thead>
        <tbody>
          {PLATFORMS.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{num(p.rfW)} W</td>
              <td>{Math.round(p.efficiency * 100)}%</td>
              <td>{num(dcPowerW(p.rfW, p.efficiency))} W</td>
              <td>{num(p.energyWh)} Wh</td>
              <td>{num(timeOnAirH(p.energyWh, p.rfW, p.efficiency))} h</td>
              <td>{num(p.heightM)} m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
