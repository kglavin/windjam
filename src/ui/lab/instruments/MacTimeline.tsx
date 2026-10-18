import { type ReactNode, useState } from 'react';
import { EXAMPLE_FRAMES, I1_EXAMPLE, RTT_EXAMPLE, TURN_US } from '../../../engine/lab/levels';
import { C_KM_PER_US, dutySavingDb, helloDuty, linkDropS, navCtsUs, navRtsUs, rttKm, tdmaFrameMs } from '../../../engine/lab/mesh';
import { PAD, PW } from './plot';

// Level 12: frames on a time line, one row per radio. B1: CSMA and TDMA; B2: the hidden terminal with and without
// RTS/CTS and the NAV; E1: a round trip for ranging.
const ROW = 34;
const LEFT = PAD.l + 40;
const INNER = PW - LEFT - PAD.r;

interface Bar {
  row: number;
  t0: number;
  t1: number;
  label: string;
  cls: string; // mac-send, mac-nav, mac-bad, mac-wait
}

function Lines({ rows, bars, tMax, unit, ticks, title, notes, controls }: {
  rows: string[];
  bars: Bar[];
  tMax: number;
  unit: string;
  ticks: number[];
  title: string;
  notes: string[];
  controls?: ReactNode;
}) {
  const h = rows.length * ROW + 40;
  const fx = (t: number) => LEFT + (t / tMax) * INNER;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        {controls}
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${h}`} role="img" aria-label={title}>
        {rows.map((r, i) => (
          <g key={r}>
            <line x1={LEFT} x2={LEFT + INNER} y1={14 + i * ROW + ROW / 2} y2={14 + i * ROW + ROW / 2} className="inst-grid" />
            <text x={LEFT - 6} y={14 + i * ROW + ROW / 2 + 4} textAnchor="end" className="inst-axis">{r}</text>
          </g>
        ))}
        {bars.map((b, k) => (
          <g key={k}>
            <rect x={fx(b.t0)} y={14 + b.row * ROW + 6} width={Math.max(fx(b.t1) - fx(b.t0), 2)} height={ROW - 12} className={b.cls} />
            {fx(b.t1) - fx(b.t0) > 26 && <text x={(fx(b.t0) + fx(b.t1)) / 2} y={14 + b.row * ROW + ROW / 2 + 4} textAnchor="middle" className="mac-label">{b.label}</text>}
          </g>
        ))}
        {ticks.map((t) => <text key={t} x={fx(t)} y={h - 8} textAnchor="middle" className="inst-axis">{t}</text>)}
        <text x={LEFT + INNER} y={h - 20} textAnchor="end" className="inst-axis">time ({unit})</text>
      </svg>
      <dl className="inst-meter">{notes.map((n) => <div key={n}><dd>{n}</dd></div>)}</dl>
    </section>
  );
}

export function MacTimeline({ example }: { example: 'access' | 'rts' | 'rtt' | 'hello' | 'repeater' }) {
  const [hs, setHs] = useState(false);
  if (example === 'hello') {
    // HELLOs of 2 ms every 1 s; the jammer hits each from 1 s; the link drops 2 missed HELLOs after the last heard (0 s).
    const drop = linkDropS(1, 2);
    const bars: Bar[] = [
      ...[0, 1, 2, 3, 4].map((t) => ({ row: 0, t0: t, t1: t + 0.002, label: 'HELLO', cls: 'mac-send' })),
      ...[1, 2, 3, 4].map((t) => ({ row: 1, t0: t - 0.01, t1: t + 0.012, label: 'jam', cls: 'mac-bad' })),
      { row: 2, t0: 0, t1: drop, label: 'link up', cls: 'mac-send' },
      { row: 2, t0: drop, t1: 4.6, label: 'link dropped', cls: 'mac-bad' },
    ];
    const duty = helloDuty(2, 1);
    return <Lines title="Jamming only the HELLOs" rows={['A: HELLOs', 'jammer', 'B: link to A']} bars={bars} tMax={4.6} unit="s" ticks={[0, 1, 2, 3, 4]}
      notes={[`HELLOs of 2 ms every 1 s: the jammer is on ${(100 * duty).toFixed(1)}% of the time, ${dutySavingDb(duty).toFixed(1)} dB less average power.`, `B drops the link after 2 missed HELLOs, ${linkDropS(1, 2)} s after the last one it heard.`]} />;
  }
  if (example === 'repeater') {
    const { km, delayUs } = I1_EXAMPLE;
    const fly = km / C_KM_PER_US;
    const bars: Bar[] = [
      { row: 0, t0: 0, t1: fly, label: 'flight', cls: 'mac-wait' },
      { row: 0, t0: fly, t1: fly + TURN_US, label: 'turnaround', cls: 'mac-nav' },
      { row: 0, t0: fly + TURN_US, t1: 2 * fly + TURN_US, label: 'flight', cls: 'mac-wait' },
      { row: 1, t0: 0, t1: fly, label: 'flight', cls: 'mac-wait' },
      { row: 1, t0: fly, t1: fly + delayUs, label: 'delay', cls: 'mac-bad' },
      { row: 1, t0: fly + delayUs, t1: fly + delayUs + TURN_US, label: 'turnaround', cls: 'mac-nav' },
      { row: 1, t0: fly + delayUs + TURN_US, t1: 2 * fly + delayUs + TURN_US, label: 'flight', cls: 'mac-wait' },
    ];
    const round = 2 * fly + TURN_US;
    return <Lines title="A repeater in the round trip" rows={['true', 'repeater']} bars={bars} tMax={16} unit="µs" ticks={[0, 4, 8, 12, 16]}
      notes={[`True: ${round.toFixed(2)} µs, range ${rttKm(round, TURN_US).toFixed(3)} km.`, `With ${delayUs} µs of delay: ${(round + delayUs).toFixed(2)} µs, range ${rttKm(round + delayUs, TURN_US).toFixed(3)} km, ${(rttKm(round + delayUs, TURN_US) - km).toFixed(3)} km too far.`]} />;
  }
  if (example === 'access') {
    // CSMA: A sends; C finds the channel busy, backs off and sends after. TDMA: 5 slots of 2 ms, one radio each.
    const slots = ['A', 'B', 'C', 'D', 'E'];
    const bars: Bar[] = [
      { row: 0, t0: 1, t1: 5, label: 'A sends', cls: 'mac-send' },
      { row: 1, t0: 2, t1: 2.3, label: 'listen', cls: 'mac-wait' },
      { row: 1, t0: 2.3, t1: 6.5, label: 'busy: back off', cls: 'mac-nav' },
      { row: 1, t0: 6.5, t1: 10, label: 'C sends', cls: 'mac-send' },
      ...[0, 1].flatMap((f) => slots.map((s, i) => ({ row: 2, t0: f * 10 + i * 2, t1: f * 10 + i * 2 + 1.8, label: s, cls: s === 'C' ? 'mac-send' : 'mac-wait' }))),
    ];
    return <Lines title="Sharing the channel" rows={['CSMA: A', 'CSMA: C', 'TDMA slots']} bars={bars} tMax={20} unit="ms" ticks={[0, 5, 10, 15, 20]}
      notes={[`TDMA: 5 slots of 2 ms, so C sends every ${tdmaFrameMs(5, 2)} ms and can sleep in between.`, 'CSMA: no clock, but C must listen, and waits a random time when the channel is busy.']} />;
  }
  if (example === 'rts') {
    const f = EXAMPLE_FRAMES;
    const toggle = <label><input type="checkbox" checked={hs} onChange={(e) => setHs(e.target.checked)} /> RTS/CTS</label>;
    if (!hs) {
      const bars: Bar[] = [
        { row: 0, t0: 0, t1: f.dataUs, label: 'DATA to B', cls: 'mac-send' },
        { row: 2, t0: 600, t1: 600 + f.dataUs, label: 'DATA to B', cls: 'mac-send' },
        { row: 1, t0: 600, t1: f.dataUs, label: 'collision', cls: 'mac-bad' },
      ];
      return <Lines title="The hidden terminal" controls={toggle} rows={['A', 'B', 'C (cannot hear A)']} bars={bars} tMax={3000} unit="µs" ticks={[0, 1000, 2000, 3000]}
        notes={['C listens, hears nothing from A, and sends. Both frames are lost at B. Tick RTS/CTS.']} />;
    }
    const tCts = f.rtsUs + f.sifsUs;
    const tData = tCts + f.ctsUs + f.sifsUs;
    const tAck = tData + f.dataUs + f.sifsUs;
    const bars: Bar[] = [
      { row: 0, t0: 0, t1: f.rtsUs, label: 'RTS', cls: 'mac-send' },
      { row: 1, t0: tCts, t1: tCts + f.ctsUs, label: 'CTS', cls: 'mac-send' },
      { row: 0, t0: tData, t1: tData + f.dataUs, label: 'DATA', cls: 'mac-send' },
      { row: 1, t0: tAck, t1: tAck + f.ackUs, label: 'ACK', cls: 'mac-send' },
      { row: 2, t0: tCts + f.ctsUs, t1: tCts + f.ctsUs + navCtsUs(f), label: `NAV ${navCtsUs(f)} µs`, cls: 'mac-nav' },
      { row: 3, t0: f.rtsUs, t1: f.rtsUs + navRtsUs(f), label: `NAV ${navRtsUs(f)} µs`, cls: 'mac-nav' },
    ];
    return <Lines title="RTS/CTS and the NAV" controls={toggle} rows={['A', 'B', 'C (hears B)', 'D (hears A)']} bars={bars} tMax={2400} unit="µs" ticks={[0, 600, 1200, 1800, 2400]}
      notes={[`RTS announces CTS + DATA + ACK + 3 SIFS = ${navRtsUs(f)} µs. CTS announces DATA + ACK + 2 SIFS = ${navCtsUs(f)} µs.`, 'C cannot hear A, but hears the CTS and keeps quiet until the ACK is over.']} />;
  }
  const { roundUs, turnUs } = RTT_EXAMPLE;
  const fly = (roundUs - turnUs) / 2;
  const bars: Bar[] = [
    { row: 0, t0: 0, t1: 0.4, label: 'send', cls: 'mac-send' },
    { row: 1, t0: fly, t1: fly + turnUs, label: `turnaround ${turnUs} µs`, cls: 'mac-wait' },
    { row: 1, t0: fly + turnUs, t1: fly + turnUs + 0.4, label: 'reply', cls: 'mac-send' },
    { row: 0, t0: roundUs, t1: roundUs + 0.4, label: 'heard', cls: 'mac-nav' },
  ];
  return <Lines title="A round trip" rows={['A', 'B']} bars={bars} tMax={12} unit="µs" ticks={[0, 2, 4, 6, 8, 10, 12]}
    notes={[`Round trip ${roundUs} µs − turnaround ${turnUs} µs = ${(roundUs - turnUs).toFixed(1)} µs of flight, ${fly.toFixed(1)} µs each way.`, `${fly.toFixed(1)} µs × ${(C_KM_PER_US * 1000).toFixed(0)} m per µs = ${(rttKm(roundUs, turnUs) * 1000).toFixed(0)} m.`]} />;
}
