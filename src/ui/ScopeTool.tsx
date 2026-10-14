import { useEffect, useMemo, useRef, useState } from 'react';
import { BER_DENIED, BER_GOOD, HOP_BAND, RX_P1DB_DBM, sumDbm } from '../engine/ew';
import { createRng } from '../engine/rng';
import {
  type ScopeSource,
  type Segment,
  type SourceRole,
  type TraceSetup,
  averageSegments,
  bfskSymbol,
  instantSegments,
  listenedChannel,
  scopeSources,
  spectrumBins,
  traceSample,
} from '../engine/scope';
import { type LinkView, type World, netById, unitById } from '../engine/world';

export type ScopeView = 'spectrum' | 'waterfall' | 'trace' | 'constellation';

interface Props {
  world: World;
  linkViews: LinkView[];
  probeId?: string;
}

const VIEWS: { id: ScopeView; label: string }[] = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'trace', label: 'Time trace' },
  { id: 'constellation', label: 'Constellation' },
];

const ROLE_COLOURS: Record<SourceRole, string> = { own: '#22c55e', friendly: '#60a5fa', enemy: '#f87171', jammer: '#c084fc' };
const SPEEDS = [1, 0.1, 0.01, 0.001];
const WINDOWS_MS = [1, 10, 50, 200, 1000];

// One incoming direction the probe can listen to: a transmitter on one of the probe's nets.
interface Listen {
  key: string;
  label: string;
  setup: TraceSetup;
  ber: number; // budget's time-averaged BER, for comparison
}

function listenOptions(world: World, linkViews: LinkView[], probeId: string): Listen[] {
  const out: Listen[] = [];
  for (const v of linkViews) {
    if (v.link.aId !== probeId && v.link.bId !== probeId) continue;
    const d = v.link.bId === probeId ? v.budget.forward : v.budget.reverse;
    const net = netById(world, v.link.netId)!;
    out.push({
      key: `${v.link.id}:${d.fromId}`,
      label: `from ${unitById(world, d.fromId)!.name} on ${net.name}`,
      setup: { net, signalDbm: d.rxPowerDbm, noiseDbm: d.noiseFloorDbm },
      ber: d.ber,
    });
  }
  return out;
}

export function ScopeTool({ world, linkViews, probeId }: Props) {
  const [view, setView] = useState<ScopeView>('spectrum');
  const [listenKey, setListenKey] = useState<string>();
  const [span, setSpan] = useState<'band' | 'channel'>('band');
  const [mode, setMode] = useState<'live' | 'average' | 'maxhold'>('live');
  const [speed, setSpeed] = useState(0.01);
  const [windowMs, setWindowMs] = useState(50);
  const [running, setRunning] = useState(true);

  const probe = probeId ? unitById(world, probeId) : undefined;
  const sources = useMemo(() => (probeId ? scopeSources(world, probeId) : []), [world, probeId]);
  const listens = useMemo(() => (probeId ? listenOptions(world, linkViews, probeId) : []), [world, linkViews, probeId]);
  const listen = listens.find((l) => l.key === listenKey) ?? listens[0];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  // Simulation time (µs) advances with real time × speed; kept in a ref so frames don't re-render React.
  const sim = useRef({ tUs: 0, last: 0, maxHold: [] as number[], waterfall: [] as number[][] });

  // Reset accumulators when what we're looking at changes.
  useEffect(() => {
    sim.current.maxHold = [];
    sim.current.waterfall = [];
  }, [probeId, view, span, mode, listen?.key, world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !probe) return;
    let frame = 0;
    const draw = (now: number) => {
      const s = sim.current;
      if (running && s.last) s.tUs += (now - s.last) * 1000 * speed;
      s.last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#060b16';
      ctx.fillRect(0, 0, w, h);
      const ctxArgs: DrawArgs = { ctx, w, h, world, probeNf: probe.radio.noiseFigureDb, sources, listen, tUs: s.tUs, span, mode, windowMs, state: s };
      let stats = '';
      if (view === 'spectrum') stats = drawSpectrum(ctxArgs);
      else if (view === 'waterfall') stats = drawWaterfall(ctxArgs);
      else if (view === 'trace') stats = drawTrace(ctxArgs);
      else stats = drawConstellation(ctxArgs);
      if (timeRef.current) timeRef.current.textContent = `t = ${(s.tUs / 1000).toFixed(2)} ms`;
      if (statsRef.current) statsRef.current.textContent = stats;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [probe, sources, listen, view, span, mode, speed, windowMs, running, world]);

  if (!probe) {
    return (
      <div className="scope-dock">
        <p className="muted">Click a unit on the map to probe what its antenna receives.</p>
      </div>
    );
  }

  const frontEnd = sumDbm(sources.filter((s) => s.role === 'jammer').map((s) => s.peakDbm));
  return (
    <div className="scope-dock">
      <div className="scope-controls">
        <div className="scope-probe">
          <b>Probe:</b> {probe.name}
        </div>
        <label className="field">
          <span>Listen to</span>
          <select value={listen?.key ?? ''} onChange={(e) => setListenKey(e.target.value)} disabled={listens.length === 0}>
            {listens.length === 0 && <option value="">no incoming links</option>}
            {listens.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="seg wrap">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        {(view === 'spectrum' || view === 'waterfall') && (
          <div className="seg wrap">
            <button className={span === 'band' ? 'active' : ''} onClick={() => setSpan('band')}>
              30–88 MHz
            </button>
            <button className={span === 'channel' ? 'active' : ''} onClick={() => setSpan('channel')} disabled={!listen}>
              Listened channel ±1 MHz
            </button>
          </div>
        )}
        {view === 'spectrum' && (
          <div className="seg wrap">
            {(['live', 'average', 'maxhold'] as const).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {m === 'maxhold' ? 'Max hold' : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        )}
        {(view === 'trace' || view === 'constellation') && (
          <label className="field">
            <span>Window</span>
            <select value={windowMs} onChange={(e) => setWindowMs(Number(e.target.value))}>
              {WINDOWS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {ms} ms
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="scope-time">
          <button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Run'}</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Simulation speed">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}× real time
              </option>
            ))}
          </select>
          <span ref={timeRef} className="muted" />
        </div>
        <div className={`scope-frontend ${frontEnd > RX_P1DB_DBM ? 'overload' : ''}`}>
          Jamming at antenna: {Number.isFinite(frontEnd) ? `${frontEnd.toFixed(0)} dBm` : 'none'}
          {frontEnd > RX_P1DB_DBM && ' · FRONT END OVERLOADED'}
        </div>
      </div>
      <div className="scope-screen">
        <canvas ref={canvasRef} />
        <div className="scope-footer">
          <span ref={statsRef} />
          <span className="scope-key">
            {(['own', 'friendly', 'enemy', 'jammer'] as SourceRole[]).map((r) => (
              <span key={r}>
                <span className="dot" style={{ background: ROLE_COLOURS[r] }} /> {r}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  world: World;
  probeNf: number;
  sources: ScopeSource[];
  listen?: Listen;
  tUs: number;
  span: 'band' | 'channel';
  mode: 'live' | 'average' | 'maxhold';
  windowMs: number;
  state: { maxHold: number[]; waterfall: number[][] };
}

const PAD = { l: 46, r: 10, t: 10, b: 22 };

function spanRange(a: DrawArgs): { low: number; high: number } {
  if (a.span === 'channel' && a.listen) {
    const ch = listenedChannel(a.listen.setup.net, a.tUs);
    const c = (ch.lowMHz + ch.highMHz) / 2;
    const half = Math.max(1, (ch.highMHz - ch.lowMHz) * 0.75);
    return { low: c - half, high: c + half };
  }
  return { low: HOP_BAND.lowMHz, high: HOP_BAND.highMHz };
}

function axes(a: DrawArgs, xLabel: (x: number) => string, xTicks: number[], yMin: number, yMax: number, yUnit: string) {
  const { ctx, w, h } = a;
  const pw = w - PAD.l - PAD.r;
  const ph = h - PAD.t - PAD.b;
  ctx.strokeStyle = '#1f2937';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px system-ui, sans-serif';
  ctx.lineWidth = 1;
  const yStep = (yMax - yMin) / 5;
  for (let i = 0; i <= 5; i++) {
    const v = yMin + i * yStep;
    const y = PAD.t + ph - (i / 5) * ph;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + pw, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${v.toFixed(0)}${i === 5 ? ` ${yUnit}` : ''}`, PAD.l - 4, y + 3);
  }
  ctx.textAlign = 'center';
  for (const x of xTicks) ctx.fillText(xLabel(x), PAD.l + x * pw, h - 6);
  return { pw, ph, y: (v: number) => PAD.t + ph - ((v - yMin) / (yMax - yMin)) * ph };
}

// Spectrum analyser: power per frequency bin at the probe antenna.
function drawSpectrum(a: DrawArgs): string {
  const { ctx, w } = a;
  const { low, high } = spanRange(a);
  const bins = Math.max(50, Math.floor(w - PAD.l - PAD.r));
  const segs: Segment[] = a.sources.flatMap((s) => (a.mode === 'average' ? averageSegments(s) : instantSegments(s, a.tUs)));
  let dbm = spectrumBins(segs, low, high, bins, a.probeNf, a.world);
  if (a.mode === 'maxhold') {
    const held = a.state.maxHold.length === bins ? a.state.maxHold : dbm.slice();
    dbm = dbm.map((v, i) => Math.max(v, held[i]));
    a.state.maxHold = dbm;
  }
  const floor = Math.min(...dbm);
  const yMin = Math.floor((floor - 10) / 10) * 10;
  const yMax = Math.max(yMin + 40, Math.ceil((Math.max(...dbm) + 10) / 10) * 10);
  const binMHz = (high - low) / bins;
  const { pw, ph, y } = axes(a, (x) => `${(low + x * (high - low)).toFixed(high - low < 5 ? 2 : 0)}`, [0, 0.25, 0.5, 0.75, 1], yMin, yMax, 'dBm');

  // Trace, filled.
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t + ph);
  dbm.forEach((v, i) => ctx.lineTo(PAD.l + (i / (bins - 1)) * pw, y(v)));
  ctx.lineTo(PAD.l + pw, PAD.t + ph);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
  ctx.fill();
  ctx.beginPath();
  dbm.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, PAD.l + (i / (bins - 1)) * pw, y(v)));
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Where each source sits right now, coloured by role.
  const xOf = (f: number) => PAD.l + ((f - low) / (high - low)) * pw;
  for (const s of a.sources) {
    const segsNow = a.mode === 'average' ? averageSegments(s) : instantSegments(s, a.tUs);
    for (const seg of segsNow) {
      if (seg.highMHz < low || seg.lowMHz > high) continue;
      const x0 = Math.max(PAD.l, xOf(seg.lowMHz));
      const x1 = Math.min(PAD.l + pw, Math.max(xOf(seg.highMHz), x0 + 2));
      const perBin = seg.dbm + 10 * Math.log10(Math.min(1, binMHz / Math.max(seg.highMHz - seg.lowMHz, 1e-9)));
      ctx.fillStyle = ROLE_COLOURS[s.role];
      ctx.fillRect(x0, Math.max(PAD.t, y(perBin)) - 2, x1 - x0, 3);
    }
  }
  // Listened channel.
  if (a.listen) {
    const ch = listenedChannel(a.listen.setup.net, a.tUs);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(xOf(ch.lowMHz), PAD.t, Math.max(2, xOf(ch.highMHz) - xOf(ch.lowMHz)), ph);
    ctx.setLineDash([]);
  }
  return `${a.mode === 'average' ? 'Long-run average' : a.mode === 'maxhold' ? 'Max hold' : 'Live'} · ${(binMHz * 1000).toFixed(binMHz < 0.01 ? 1 : 0)} kHz bins · ${a.sources.length} sources · green box: listened channel`;
}

// Waterfall: live spectrum rows scrolling down; one row per frame.
function drawWaterfall(a: DrawArgs): string {
  const { ctx, w, h } = a;
  const { low, high } = spanRange(a);
  const pw = w - PAD.l - PAD.r;
  const ph = h - PAD.t - PAD.b;
  const bins = Math.max(50, Math.floor(pw / 2));
  const row = spectrumBins(a.sources.flatMap((s) => instantSegments(s, a.tUs)), low, high, bins, a.probeNf, a.world);
  const rows = a.state.waterfall;
  if (rows.length && rows[0].length !== bins) rows.length = 0;
  rows.unshift(row);
  const maxRows = Math.floor(ph / 2);
  if (rows.length > maxRows) rows.length = maxRows;
  const floor = Math.min(...row);
  const range = 60;
  const cw = pw / bins;
  rows.forEach((r, ri) => {
    r.forEach((v, i) => {
      ctx.fillStyle = heat((v - floor) / range);
      ctx.fillRect(PAD.l + i * cw, PAD.t + ri * 2, Math.ceil(cw), 2);
    });
  });
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const x of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(`${(low + x * (high - low)).toFixed(high - low < 5 ? 2 : 0)} MHz`, PAD.l + x * pw, h - 6);
  ctx.textAlign = 'right';
  ctx.fillText('now', PAD.l - 4, PAD.t + 8);
  ctx.fillText('older', PAD.l - 4, PAD.t + ph);
  return `Newest row on top, one per frame · colour: 0 to ${range} dB above the noise floor · slow the clock to see individual hops`;
}

// Oscilloscope: signal, noise and noise + jamming in the listened channel over the time window.
function drawTrace(a: DrawArgs): string {
  if (!a.listen) return 'No incoming link to listen to';
  const { ctx } = a;
  const pw = a.w - PAD.l - PAD.r;
  const n = Math.max(100, Math.floor(pw));
  const t0 = a.tUs - a.windowMs * 1000;
  const samples = Array.from({ length: n }, (_, i) => traceSample(a.listen!.setup, a.sources.filter((s) => s.role === 'jammer'), t0 + ((i + 0.5) / n) * a.windowMs * 1000));
  const S = a.listen.setup.signalDbm;
  const N = a.listen.setup.noiseDbm;
  const nj = samples.map((x) => sumDbm([N, x.jammingDbm]));
  const yMin = Math.floor((Math.min(N, S) - 15) / 10) * 10;
  const yMax = Math.ceil((Math.max(S, ...nj.filter(Number.isFinite)) + 10) / 10) * 10;
  const stripH = 10;
  const { ph, y } = axes({ ...a, h: a.h - stripH - 4 }, (x) => `${(-a.windowMs * (1 - x)).toFixed(a.windowMs < 10 ? 1 : 0)} ms`, [0, 0.25, 0.5, 0.75, 1], yMin, yMax, 'dBm');
  const xOf = (i: number) => PAD.l + (i / (n - 1)) * pw;

  // Hop boundaries for a hopping net.
  const net = a.listen.setup.net;
  if (net.waveform.kind === 'fh') {
    const dwell = 1e6 / net.waveform.hopsPerSec;
    if ((a.windowMs * 1000) / dwell < 200) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      for (let k = Math.ceil(t0 / dwell); k * dwell < a.tUs; k++) {
        const x = PAD.l + ((k * dwell - t0) / (a.windowMs * 1000)) * pw;
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, PAD.t + ph);
        ctx.stroke();
      }
    }
  }
  const line = (vals: number[], colour: string, width: number, dash: number[] = []) => {
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(i), y(Math.max(yMin, Math.min(yMax, v)))));
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line(nj, '#c084fc', 1.5);
  line(samples.map(() => N), '#6b7280', 1, [4, 3]);
  line(samples.map(() => S), '#22c55e', 2);

  // BER regime strip.
  const top = PAD.t + ph + PAD.b - 4;
  samples.forEach((x, i) => {
    ctx.fillStyle = x.ber < BER_GOOD ? '#22c55e' : x.ber < BER_DENIED ? '#eab308' : '#ef4444';
    ctx.fillRect(xOf(i), top, Math.ceil(pw / n) + 1, stripH);
  });
  const jammedShare = samples.filter((x) => Number.isFinite(x.jammingDbm) || x.overloaded).length / n;
  const meanBer = samples.reduce((s, x) => s + x.ber, 0) / n;
  return `Green: signal · grey dashed: noise · purple: noise + jamming in channel · strip: BER regime · jammed ${(jammedShare * 100).toFixed(0)}% of window · BER here ${meanBer.toExponential(1)} (budget ${a.listen.ber.toExponential(1)})`;
}

// Noncoherent BFSK: envelope of the filter for the sent tone (mark) against the other tone (space), one dot per bit.
function drawConstellation(a: DrawArgs): string {
  if (!a.listen) return 'No incoming link to listen to';
  const { ctx, w, h } = a;
  const net = a.listen.setup.net;
  const bitUs = 1000 / net.dataRateKbps;
  const count = Math.min(600, Math.max(50, Math.floor((a.windowMs * 1000) / bitUs)));
  const jam = a.sources.filter((s) => s.role === 'jammer');
  const firstBit = Math.floor(a.tUs / bitUs) - count;
  const pts: { mark: number; space: number; err: boolean }[] = [];
  for (let k = 0; k < count; k++) {
    const t = (firstBit + k) * bitUs;
    const sample = traceSample(a.listen.setup, jam, t);
    const rng = createRng(((firstBit + k) * 2654435761) >>> 0);
    const raw = sample.overloaded ? bfskSymbol(-20, rng) : bfskSymbol(sample.ebN0Db, rng);
    // Receiver AGC: scale each bit by its total received power (signal + noise + jamming in both filters),
    // so clean bits sit near (1, 0) and jammed bits spread toward the decision line.
    const a2 = 2 * 10 ** ((sample.overloaded ? -20 : sample.ebN0Db) / 10);
    const agc = 1 / Math.sqrt(a2 + 4);
    const s = { mark: raw.mark * agc, space: raw.space * agc };
    pts.push({ ...s, err: s.space > s.mark });
  }
  const max = 1.6; // after AGC
  const size = Math.min(w - PAD.l - PAD.r, h - PAD.t - PAD.b);
  const ox = PAD.l;
  const oy = PAD.t + size;
  const sc = size / max;
  ctx.strokeStyle = '#374151';
  ctx.strokeRect(ox, PAD.t, size, size);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + size, PAD.t);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#9ca3af';
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of pts) {
    ctx.fillStyle = p.err ? '#ef4444' : '#22c55e';
    ctx.fillRect(ox + Math.min(p.mark, max) * sc - 1.5, oy - Math.min(p.space, max) * sc - 1.5, 3, 3);
  }
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('mark filter (sent tone), after AGC →', ox + size / 2, h - 6);
  ctx.save();
  ctx.translate(12, PAD.t + size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('space filter →', 0, 0);
  ctx.restore();
  const tx = ox + size + 16;
  ctx.textAlign = 'left';
  ctx.fillText('Below the dashed line: decided right.', tx, PAD.t + 12);
  ctx.fillText('Above it: bit error (red).', tx, PAD.t + 26);
  ctx.fillText('Jamming adds noise to both filters,', tx, PAD.t + 48);
  ctx.fillText('pushing the cloud across the line.', tx, PAD.t + 62);
  const errs = pts.filter((p) => p.err).length;
  return `${count} bits · ${errs} errors (${((errs / count) * 100).toFixed(1)}%) · budget BER ${a.listen.ber.toExponential(1)}`;
}

// Dark blue -> cyan -> yellow -> red.
function heat(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const stops = [
    [6, 11, 22],
    [30, 64, 175],
    [34, 211, 238],
    [250, 204, 21],
    [239, 68, 68],
  ];
  const p = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
