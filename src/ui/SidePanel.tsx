import type { ReactNode } from 'react';
import { BER_DENIED, BER_GOOD, DEFAULTS, DEFAULT_REACTION_US, type LinkQuality, processingGainDb, qualityFromBer as qualityOf } from '../engine/ew';
import { NumberField } from './NumberField';
import { type Hex, axialToOffset } from '../engine/hex';
import { getTile } from '../engine/map';
import { TERRAIN } from '../engine/terrain';
import type { JammerConfig, JammerMode, Net, Unit, Waveform } from '../engine/units';
import { type LinkView, type World, netById, unitAt, unitById } from '../engine/world';
import { JAM_COLOR, QUALITY_COLORS, SIDE_COLORS, toCss } from './colors';
import { ProfileChart } from './ProfileChart';
import type { DetectionReport } from '../engine/detect';
import type { NoiseEnv } from '../engine/rf';
import { MAX_TRANSMISSIONS, ORDER_DEADLINE_S, ORDER_PACKETS, PACKET_BITS } from '../engine/timeliness';

interface Props {
  world: World;
  linkViews: LinkView[]; // all nets
  hiddenNets: Set<string>;
  selectedHex?: Hex;
  selectedLinkId?: string;
  message?: string;
  onToggleNet: (netId: string) => void;
  onSelectLink: (linkId: string) => void;
  onSetJammer: (unitId: string, config: JammerConfig) => void;
  onSetWaveform: (netId: string, waveform: Waveform) => void;
  detection?: DetectionReport; // undefined when detection display is off
  esSide: EsSide;
  onSetEsSide: (side: EsSide) => void;
  onSetPfa: (side: 'blue' | 'red', pfa: number) => void;
  onSetLimiter: (side: 'blue' | 'red', on: boolean) => void;
  onSetNoiseEnv: (env: NoiseEnv) => void;
  onNewMap: () => void;
  onStartMission: (kind: 'find' | 'hide') => void;
}

const QUALITIES: LinkQuality[] = ['good', 'degraded', 'denied'];

const db = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} dB` : '—');
const dbm = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} dBm` : '—');
const ber = (v: number) => (v < 1e-12 ? '< 1e-12' : v.toExponential(1));
const pct = (v: number) => (v > 0 && v < 0.001 ? '< 0.1%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function QualityDot({ q }: { q: LinkQuality }) {
  return <span className="dot" style={{ background: toCss(QUALITY_COLORS[q]) }} />;
}

export function SidePanel(props: Props) {
  const { world, linkViews, hiddenNets, selectedHex, selectedLinkId, message } = props;
  const tile = selectedHex && getTile(world.map, selectedHex);
  const unit = selectedHex && unitAt(world, selectedHex);
  const unitLinks = unit ? linkViews.filter((l) => l.link.aId === unit.id || l.link.bId === unit.id) : [];
  const selected = linkViews.find((l) => l.link.id === selectedLinkId);

  return (
    <aside className="panel">
      <header>
        <h1>Windjam</h1>
        <div className="sub">
          Seed {world.seed} · Tick {world.tick}{' '}
          <button onClick={props.onNewMap}>New map</button> <button onClick={() => props.onStartMission('find')}>Mission 1: find the enemy</button>{' '}
          <button onClick={() => props.onStartMission('hide')}>Mission 2: stay hidden</button>
        </div>
        <p className="help">
          Link colour is BER: <QualityDot q="good" /> &lt; {BER_GOOD.toExponential(0)} <QualityDot q="degraded" /> degraded{' '}
          <QualityDot q="denied" /> ≥ {BER_DENIED.toExponential(0)} denied.{' '}
          <span style={{ color: toCss(JAM_COLOR) }}>Purple</span>: jammer reaching a receiver with J/S &gt; 0 dB.
        </p>
        {message && <p className="message">{message}</p>}
        <OrdersScore world={world} linkViews={linkViews} />
      </header>

      <section>
        <h2>Nets</h2>
        {world.nets.map((net) => {
          const waveform = <WaveformControl net={net} onChange={(w) => props.onSetWaveform(net.id, w)} />;
          if (net.topology === 'retrans') {
            const owner = world.nets.find((n) => n.relay?.retransNetId === net.id);
            const routed = linkViews.filter((v) => v.route === 'relay' && v.relay?.retransNetId === net.id).length;
            return (
              <div key={net.id} className="net-block">
                <div className="net">
                  <span />
                  <span className="swatch" style={{ background: toCss(SIDE_COLORS[net.side]) }} />
                  <span className="net-name">{net.name}</span>
                  <span className="net-meta">
                    {net.freqMHz} MHz · cross-band relay for {owner?.name ?? '—'} · {routed} link{routed === 1 ? '' : 's'} routed
                  </span>
                </div>
                {waveform}
              </div>
            );
          }
          const views = linkViews.filter((l) => l.link.netId === net.id);
          return (
            <div key={net.id} className="net-block">
              <label className="net">
                <input type="checkbox" checked={!hiddenNets.has(net.id)} onChange={() => props.onToggleNet(net.id)} />
                <span className="swatch" style={{ background: toCss(SIDE_COLORS[net.side]) }} />
                <span className="net-name">{net.name}</span>
                <span className="net-meta">
                  {net.freqMHz} MHz · {net.topology} ·{' '}
                  {QUALITIES.map((q) => (
                    <span key={q}>
                      <QualityDot q={q} />
                      {views.filter((v) => v.quality === q).length}{' '}
                    </span>
                  ))}
                  · orders on time {views.filter((v) => v.order.status === 'on time').length}/{views.length}
                </span>
              </label>
              {waveform}
            </div>
          );
        })}
      </section>

      <DetectionSection
        world={world}
        report={props.detection}
        side={props.esSide}
        onSide={props.onSetEsSide}
        onPfa={props.onSetPfa}
        onLimiter={props.onSetLimiter}
        onNoiseEnv={props.onSetNoiseEnv}
      />

      {tile && (
        <section>
          <h2>Hex</h2>
          <Row k="Terrain" v={TERRAIN[tile.terrain].label} />
          <Row k="Elevation" v={`${tile.elevationM} m`} />
          <Row k="Col, row" v={`${axialToOffset(tile.hex).col}, ${axialToOffset(tile.hex).row}`} />
        </section>
      )}

      {unit && (
        <section>
          <h2>
            <span className="swatch" style={{ background: toCss(SIDE_COLORS[unit.side]) }} /> {unit.name}
          </h2>
          <Row k="Power" v={`${unit.radio.powerW} W`} />
          <Row k="Antenna" v={`${unit.radio.antennaHeightM} m, ${unit.radio.gainDbi} dBi`} />
          <Row k="Noise figure" v={db(unit.radio.noiseFigureDb)} />
          {unit.jammer && <JammerControls world={world} unit={unit} onSetJammer={props.onSetJammer} />}
          {unitLinks.length > 0 && <h3>Links</h3>}
          {unitLinks.map((view) => {
            const { link } = view;
            const other = unitById(world, link.aId === unit.id ? link.bId : link.aId)!;
            return (
              <button
                key={link.id}
                className={`link-btn ${link.id === selectedLinkId ? 'active' : ''}`}
                onClick={() => props.onSelectLink(link.id)}
              >
                <QualityDot q={view.quality} /> {other.name}
                <span className="muted">
                  {view.route === 'relay' && ' · via relay'} · {netById(world, link.netId)!.name} · BER {ber(view.ber)}
                </span>
              </button>
            );
          })}
          {unit.kind === 'relay' && <RelayingList world={world} unitId={unit.id} linkViews={linkViews} />}
          {unit.side === 'neutral' && <p className="muted">Civilian emitter. No links yet; jamming it will cost points later.</p>}
        </section>
      )}

      {selected && <LinkDetail world={world} view={selected} />}
    </aside>
  );
}

const JAMMER_MODES: { id: JammerMode; label: string; targeted: boolean; help: string }[] = [
  { id: 'off', label: 'Off', targeted: false, help: 'Silent, and invisible to enemy ES.' },
  { id: 'spot', label: 'Spot', targeted: true, help: 'All power parked on the target net’s channel. A hopper lands there only 1 hop in 2320.' },
  { id: 'barrage', label: 'Barrage', targeted: false, help: 'Power spread over 30-88 MHz, about -33.7 dB per 25 kHz channel. Hits every net and hop, including your own.' },
  { id: 'partial', label: 'Partial-band', targeted: true, help: 'Noise over a share ρ of the band around the target: more power per channel than barrage, but a hopper only lands in it ρ of the time.' },
  { id: 'multitone', label: 'Multitone', targeted: false, help: 'Power split into q CW tones across the band. Each tone hits one channel at 1/q power.' },
  { id: 'pulse', label: 'Pulse', targeted: true, help: 'Short bursts at duty k with 1/k peak power on the target channel. High peaks overload front ends and wreck whole blocks of bits.' },
  { id: 'swept', label: 'Swept', targeted: false, help: 'One full-power tone swept across the band: brief hits on every channel in turn.' },
  { id: 'follower', label: 'Follower', targeted: true, help: 'Hears each hop and jumps onto it, but late: reaction time plus extra path delay. Fast hoppers outrun it.' },
  { id: 'sync', label: 'Sync (smart)', targeted: true, help: 'Protocol-aware: jams only packet headers (3% of air time). If the header is lost the whole packet is lost, for a fraction of the radiated energy.' },
];

function JammerControls({
  world,
  unit,
  onSetJammer,
}: {
  world: World;
  unit: Unit;
  onSetJammer: (unitId: string, config: JammerConfig) => void;
}) {
  const cfg = unit.jammer!;
  const target = cfg.targetNetId ?? world.nets.find((n) => n.side !== unit.side)?.id;
  const mode = JAMMER_MODES.find((m) => m.id === cfg.mode)!;
  const set = (m: JammerMode) => onSetJammer(unit.id, { ...cfg, mode: m, targetNetId: target });
  return (
    <div className="jammer">
      <h3>Jammer</h3>
      <div className="seg wrap">
        {JAMMER_MODES.map((m) => (
          <button key={m.id} className={cfg.mode === m.id ? 'active' : ''} onClick={() => set(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode.targeted && (
        <label className="row">
          <span className="k">Target net</span>
          <select value={cfg.targetNetId} onChange={(e) => onSetJammer(unit.id, { ...cfg, targetNetId: e.target.value })}>
            {world.nets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.waveform.kind === 'fh' ? `hopping ${n.waveform.hopsPerSec}/s` : n.waveform.kind === 'dsss' ? `DSSS ${n.waveform.chipRateMcps} Mcps` : `${n.freqMHz} MHz`})
              </option>
            ))}
          </select>
        </label>
      )}
      {cfg.mode === 'follower' && (
        <NumberField
          label="Reaction time (µs): intercept + processing"
          value={cfg.reactionUs ?? DEFAULT_REACTION_US}
          min={0}
          max={100000}
          step={50}
          onChange={(v) => onSetJammer(unit.id, { ...cfg, reactionUs: v })}
        />
      )}
      {cfg.mode === 'partial' && (
        <NumberField
          label="Band fraction ρ (0.01-1)"
          value={cfg.bandFraction ?? DEFAULTS.bandFraction}
          min={0.01}
          max={1}
          step={0.05}
          onChange={(v) => onSetJammer(unit.id, { ...cfg, bandFraction: v })}
        />
      )}
      {cfg.mode === 'multitone' && (
        <NumberField label="Tones q" value={cfg.tones ?? DEFAULTS.tones} min={1} max={2320} step={1} onChange={(v) => onSetJammer(unit.id, { ...cfg, tones: v })} />
      )}
      {cfg.mode === 'pulse' && (
        <NumberField
          label="Duty cycle k (0.001-1)"
          value={cfg.dutyCycle ?? DEFAULTS.dutyCycle}
          min={0.001}
          max={1}
          step={0.05}
          onChange={(v) => onSetJammer(unit.id, { ...cfg, dutyCycle: v })}
        />
      )}
      <p className="muted">{mode.help}</p>
    </div>
  );
}

function LinkDetail({ world, view }: { world: World; view: LinkView }) {
  const { link, budget } = view;
  const net = netById(world, link.netId)!;
  const a = unitById(world, link.aId)!;
  const b = unitById(world, link.bId)!;
  const p = budget.path;
  return (
    <section>
      <h2>
        <QualityDot q={view.quality} /> {a.name} ↔ {b.name}
      </h2>
      {view.relay && <RouteSummary world={world} view={view} />}
      <OrderSummary view={view} />
      <h3>Direct path</h3>
      <ProfileChart
        path={p}
        groundAM={getTile(world.map, a.pos)!.elevationM}
        groundBM={getTile(world.map, b.pos)!.elevationM}
        antennaAM={a.radio.antennaHeightM}
        antennaBM={b.radio.antennaHeightM}
      />
      <p className="muted">Green/red line: direct ray (clear/blocked). Yellow ring: worst obstacle.</p>
      <h3>Path</h3>
      <Row k="Net" v={`${net.name}, ${net.freqMHz} MHz, ${net.waveform.kind === 'dsss' ? `${net.waveform.chipRateMcps} MHz spread` : `${net.bandwidthKHz} kHz`}, ${net.dataRateKbps} kbps`} />
      <Row k="Distance" v={`${p.distanceKm.toFixed(2)} km`} />
      <Row k="Line of sight" v={p.lineOfSight ? 'Yes' : 'No'} />
      <Row k="Effective heights" v={`${p.effectiveHeightAM.toFixed(0)} m / ${p.effectiveHeightBM.toFixed(0)} m`} />
      <Row k="Two-ray breakpoint" v={`${p.breakpointKm.toFixed(2)} km`} />
      <Row k={`Base loss (${p.model})`} v={db(p.baseLossDb)} />
      <Row k="Diffraction loss" v={db(p.diffractionLossDb)} />
      <Row k="Forest clutter loss" v={db(p.clutterLossDb)} />
      <Row k="Total path loss" v={<b>{db(p.totalLossDb)}</b>} />
      {[budget.forward, budget.reverse].map((d) => (
        <div key={d.fromId}>
          <h3>
            <QualityDot q={d.quality} /> {unitById(world, d.fromId)!.name} → {unitById(world, d.toId)!.name}
          </h3>
          <Row k="Signal (S)" v={dbm(d.rxPowerDbm)} />
          <Row k="Noise floor (N)" v={dbm(d.noiseFloorDbm)} />
          <Row k="Jamming (J) when hit" v={dbm(d.jammingDbm)} />
          {d.jammers.map((c) => (
            <div key={c.jammerId} className="jam-source">
              <Row
                k={`  from ${unitById(world, c.jammerId)!.name}`}
                v={`${dbm(c.powerDbm)} · hits ${pct(c.fraction)}${c.saturation > 0 ? ` · overload ${pct(c.saturation)}` : ''}`}
              />
              <div className="muted jam-note">
                {c.note}; path loss {c.pathLossDb.toFixed(0)} dB{c.lineOfSight ? '' : ' (NLOS)'}, peak at antenna {c.frontEndDbm.toFixed(0)} dBm
              </div>
            </div>
          ))}
          <Row k="J/S when hit" v={<b style={{ color: d.jsDb > 0 ? toCss(JAM_COLOR) : undefined }}>{db(d.jsDb)}</b>} />
          <Row k="Time clear / jammed / lost" v={`${pct(d.states.clear)} / ${pct(d.states.jammed)} / ${pct(d.states.lost)}`} />
          <Row k="SNR, clear" v={db(d.snrDb)} />
          <Row k="SINR, jammed" v={db(d.sinrDb)} />
          {d.processingGainDb > 0 && <Row k="DSSS processing gain" v={`+${d.processingGainDb.toFixed(1)} dB`} />}
          <Row k="Eb/(N0+J0), jammed" v={db(d.ebN0Db)} />
          <Row k="BER, time-averaged" v={<b>{ber(d.ber)}</b>} />
        </div>
      ))}
    </section>
  );
}

// Direct versus relayed route for a hub link, and which one is in use.
function RouteSummary({ world, view }: { world: World; view: LinkView }) {
  const relay = view.relay!;
  const relayName = unitById(world, relay.relayId)!.name;
  const retrans = netById(world, relay.retransNetId)!;
  const net = netById(world, view.link.netId)!;
  const member = unitById(world, view.link.bId)!;
  const hub = unitById(world, view.link.aId)!;
  const worstJs = (b: LinkView['budget']) => Math.max(b.forward.jsDb, b.reverse.jsDb);
  const hop = (label: string, b: LinkView['budget']) => (
    <Row
      k={`  ${label}`}
      v={
        <>
          <QualityDot q={b.quality} /> BER {ber(b.ber)}
          {Number.isFinite(worstJs(b)) && <span className="muted"> · J/S {db(worstJs(b))}</span>}
        </>
      }
    />
  );
  return (
    <div className="routes">
      <h3>Route</h3>
      <Row
        k={`${view.route === 'direct' ? '▶ ' : ''}Direct (${net.freqMHz} MHz)`}
        v={
          <>
            <QualityDot q={view.budget.quality} /> BER {ber(view.budget.ber)}
          </>
        }
      />
      <Row
        k={`${view.route === 'relay' ? '▶ ' : ''}Via ${relayName}`}
        v={
          <>
            <QualityDot q={qualityOf(relay.ber)} /> BER {ber(relay.ber)}
          </>
        }
      />
      {hop(`${member.name} → relay, ${retrans.freqMHz} MHz`, relay.memberHop)}
      {hop(`relay → ${hub.name}, ${net.freqMHz} MHz`, relay.hubHop)}
      <p className="muted">Relay is used only when direct is not good and the relay route has lower BER.</p>
    </div>
  );
}

function RelayingList({ world, unitId, linkViews }: { world: World; unitId: string; linkViews: LinkView[] }) {
  const routed = linkViews.filter((v) => v.route === 'relay' && v.relay?.relayId === unitId);
  const retrans = world.nets.find((n) => n.relay?.relayId === unitId);
  const retransNet = retrans && netById(world, retrans.relay!.retransNetId);
  return (
    <>
      <h3>Relaying</h3>
      {retransNet && <Row k="Cross-band" v={`${retransNet.freqMHz} MHz in, ${retrans!.freqMHz} MHz out`} />}
      {routed.length === 0 ? (
        <p className="muted">No links routed through this relay.</p>
      ) : (
        routed.map((v) => (
          <Row key={v.link.id} k={unitById(world, v.link.bId)!.name} v={<><QualityDot q={v.quality} /> BER {ber(v.ber)}</>} />
        ))
      )}
    </>
  );
}

const SLOW_HOPS = 100;
const FAST_HOPS = 32000;
const DEFAULT_CHIP_MCPS = 5;

// Fixed frequency or hopping, with the hop rate and what it means per bit.
function WaveformControl({ net, onChange }: { net: Net; onChange: (w: Waveform) => void }) {
  const w = net.waveform;
  const rate = w.kind === 'fh' ? w.hopsPerSec : SLOW_HOPS;
  const bitsPerHop = (net.dataRateKbps * 1000) / rate;
  const value = w.kind === 'fixed' ? 'fixed' : w.kind === 'dsss' ? 'dsss' : rate === SLOW_HOPS ? 'slow' : rate === FAST_HOPS ? 'fast' : 'custom';
  return (
    <div className="waveform">
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'fixed') onChange({ kind: 'fixed' });
          else if (v === 'slow') onChange({ kind: 'fh', hopsPerSec: SLOW_HOPS });
          else if (v === 'fast') onChange({ kind: 'fh', hopsPerSec: FAST_HOPS });
          else if (v === 'dsss') onChange({ kind: 'dsss', chipRateMcps: DEFAULT_CHIP_MCPS });
          else onChange({ kind: 'fh', hopsPerSec: rate });
        }}
      >
        <option value="fixed">Fixed frequency</option>
        <option value="slow">Slow hopping ({SLOW_HOPS}/s)</option>
        <option value="fast">Fast hopping ({FAST_HOPS.toLocaleString()}/s)</option>
        <option value="custom">Hopping, custom rate</option>
        <option value="dsss">Direct sequence (DSSS)</option>
      </select>
      {w.kind === 'fh' && (
        <>
          <input
            type="number"
            min={1}
            max={1000000}
            value={rate}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) onChange({ kind: 'fh', hopsPerSec: v });
            }}
          />
          <span className="muted">
            /s · {bitsPerHop >= 1 ? `${bitsPerHop.toFixed(0)} bits/hop` : `${(1 / bitsPerHop).toFixed(1)} hops/bit`} · dwell{' '}
            {(1e6 / rate).toFixed(0)} µs
          </span>
        </>
      )}
      {w.kind === 'dsss' && (
        <>
          <input
            type="number"
            min={0.1}
            max={20}
            step={0.5}
            value={w.chipRateMcps}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) onChange({ kind: 'dsss', chipRateMcps: v });
            }}
          />
          <span className="muted">Mcps · processing gain {processingGainDb(net).toFixed(1)} dB</span>
        </>
      )}
    </div>
  );
}

export type EsSide = 'blue' | 'red' | 'off';

const PFA_CHOICES = [1e-1, 1e-2, 1e-3, 1e-4, 1e-6, 1e-8];

// Electronic Support: what one side's sensors pick up, with the false-alarm trade-off (notes section 2)
// and direction finding to a position fix (notes section 7).
function DetectionSection({
  world,
  report,
  side,
  onSide,
  onPfa,
  onLimiter,
  onNoiseEnv,
}: {
  world: World;
  report?: DetectionReport;
  side: EsSide;
  onSide: (side: EsSide) => void;
  onPfa: (side: 'blue' | 'red', pfa: number) => void;
  onLimiter: (side: 'blue' | 'red', on: boolean) => void;
  onNoiseEnv: (env: NoiseEnv) => void;
}) {
  const short = (id: string) => unitById(world, id)!.name.replace(/^(Blue|Red) /, '');
  return (
    <section>
      <h2>Detection (ES)</h2>
      <div className="seg">
        {(['off', 'blue', 'red'] as EsSide[]).map((s) => (
          <button key={s} className={side === s ? 'active' : ''} onClick={() => onSide(s)}>
            {s === 'off' ? 'Off' : `${s === 'blue' ? 'Blue' : 'Red'} sensors`}
          </button>
        ))}
      </div>
      <label className="row">
        <span className="k">Noise environment</span>
        <select value={world.noiseEnv} onChange={(e) => onNoiseEnv(e.target.value as NoiseEnv)}>
          <option value="rural">Rural (Gaussian)</option>
          <option value="urban">Urban (+9.6 dB, impulsive)</option>
        </select>
      </label>
      {report && side !== 'off' && (
        <>
          <label className="row">
            <span className="k">False-alarm probability</span>
            <select value={world.esPfa[side]} onChange={(e) => onPfa(side, Number(e.target.value))}>
              {PFA_CHOICES.map((p) => (
                <option key={p} value={p}>
                  {p.toExponential(0)}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <span className="k">Limiter (clips noise spikes, -2 dB)</span>
            <input type="checkbox" checked={world.esLimiter[side]} onChange={(e) => onLimiter(side, e.target.checked)} />
          </label>
          <Row
            k="Actual false-alarm rate"
            v={
              <span style={{ color: report.effectivePfa > report.pfa ? '#f87171' : undefined }}>
                {report.effectivePfa.toExponential(1)}
                {report.effectivePfa > report.pfa && ' (impulsive noise)'}
              </span>
            }
          />
          <Row k="False alarms per sweep" v={`${report.falseAlarmsPerSweep.toPrecision(2)} per sensor`} />
          <Row k="Sensors" v={report.sensorIds.map(short).join(', ') || 'none'} />
          <p className="muted">
            Energy detector per 25 kHz channel across 30–88 MHz. Hoppers are caught on about 63% of sweeps; DSSS spreads its power below the
            channel noise. Sensors with Pd ≥ 0.5 take a bearing; two bearings give a fix.
          </p>
          {report.emitters.length === 0 && <p className="muted">No enemy emitters transmitting.</p>}
          {report.emitters.map((e) => (
            <div key={e.emitterId} className="det-row">
              <div className="row">
                <span className="k">
                  <span className="dot" style={{ background: e.pd >= 0.9 ? '#ffffff' : e.pd >= 0.5 ? '#facc15' : e.pd >= 0.1 ? '#fb923c' : '#4b5563' }} />{' '}
                  {unitById(world, e.emitterId)!.name}
                </span>
                <span className="v">
                  Pd {e.pd >= 0.9995 ? '> 0.999' : e.pd.toFixed(3)}
                  <span className="muted">
                    {' '}
                    · {short(e.best!.sensorId)} {e.best!.snrDb.toFixed(0)} dB
                  </span>
                </span>
              </div>
              <div className="muted det-df">
                {e.fix
                  ? `Fix from ${e.bearings.length} bearings: CEP ${e.fix.cepKm.toFixed(2)} km, actually ${e.fix.missKm.toFixed(2)} km off`
                  : e.bearings.length === 1
                    ? `1 bearing (${e.bearings[0].bearingDeg.toFixed(0)}° ± ${e.bearings[0].sigmaDeg.toFixed(0)}°), no fix`
                    : 'Too weak for a bearing'}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

// Timeliness (notes section 1): how long one order takes over the route in use, and whether it is still useful.
function OrderSummary({ view }: { view: LinkView }) {
  const o = view.order;
  const colour = o.status === 'on time' ? '#22c55e' : o.status === 'late' ? '#eab308' : '#ef4444';
  return (
    <div className="orders">
      <h3>Orders (timeliness)</h3>
      <Row k="Status" v={<b style={{ color: colour }}>{o.status}</b>} />
      <Row k={`Time for a ${ORDER_PACKETS}-packet order`} v={`${o.latencyS.toFixed(1)} s (deadline ${ORDER_DEADLINE_S} s)`} />
      <Row k="Chance it gets through" v={pct(o.deliveryProbability)} />
      {o.hops.map((h, i) => (
        <Row
          key={i}
          k={`  ${o.hops.length > 1 ? `hop ${i + 1}: ` : ''}packet error rate`}
          v={`${pct(h.per)} · ${h.expectedTransmissions.toFixed(2)} tries/packet`}
        />
      ))}
      <p className="muted">
        {PACKET_BITS}-bit packets, resent up to {MAX_TRANSMISSIONS} times. Jamming does not change the order; it delays it past the decision window.
      </p>
    </div>
  );
}

// The headline outcome (notes section 1): share of each side's orders that arrive inside the decision window.
function OrdersScore({ world, linkViews }: { world: World; linkViews: LinkView[] }) {
  const sides: { side: 'blue' | 'red'; label: string }[] = [
    { side: 'blue', label: 'Blue' },
    { side: 'red', label: 'Red' },
  ];
  return (
    <div className="score">
      {sides.map(({ side, label }) => {
        const mine = linkViews.filter((v) => netById(world, v.link.netId)?.side === side);
        const onTime = mine.filter((v) => v.order.status === 'on time').length;
        return (
          <span key={side} className="score-item">
            <span className="swatch" style={{ background: toCss(SIDE_COLORS[side]) }} /> {label} orders on time{' '}
            <b>
              {onTime}/{mine.length}
            </b>
          </span>
        );
      })}
    </div>
  );
}
