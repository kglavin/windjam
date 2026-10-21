import type { ReactNode } from 'react';
import { aliasOf } from '../engine/mission/commands';
import { LESSONS, type Lesson, bearingOrigin, fixBuildUp, minuteEvents, movingFix, movingMinutes, ordersAffecting } from '../engine/mission/inspect';
import type { MissionState, PlayerSide, Track } from '../engine/mission/types';
import { type LinkView, type World, netById, unitById } from '../engine/world';
import { LinkDetail } from './SidePanel';

// The replay inspector (docs/design-replay-inspector.md): with the replay paused, how the minute's picture came to
// be. Minute: cause and effect in that minute. Fix: a track's fix built up one bearing at a time (the map follows).
// Link: a link's budget at that minute and the orders that set the state it uses.
export type InspectTab = 'minute' | 'fix' | 'link';

export interface Inspection {
  tab: InspectTab;
  trackId?: string;
  k?: number; // Fix: how many bearings count (static), or which of the moving minutes (index)
  linkId?: string;
}

export interface InspectorProps {
  mission: MissionState;
  minute: number; // the replay minute shown
  side: PlayerSide; // whose picture
  umpire: boolean;
  world: World; // the truth at that minute (viewOf().truth)
  tracks: Track[]; // the picture at that minute
  linkViews: LinkView[]; // the links at that minute
  inspection: Inspection;
  onChange: (i: Inspection) => void;
  onLesson: (level: number) => void;
}

const name = (world: World, id: string) => unitById(world, id)?.name ?? id;

function LessonLinks({ keys, onLesson }: { keys: string[]; onLesson: (level: number) => void }) {
  const seen = new Set<string>();
  const ls: Lesson[] = [];
  for (const k of keys) {
    const l = LESSONS[k];
    if (l && !seen.has(`${l.level}${l.step}`)) {
      seen.add(`${l.level}${l.step}`);
      ls.push(l);
    }
  }
  if (!ls.length) return null;
  return (
    <p className="muted inspector-lessons">
      Lessons:{' '}
      {ls.map((l, i) => (
        <span key={`${l.level}${l.step}`}>
          {i > 0 && ' · '}
          <button type="button" className="text-btn" title="Opens the lab in a new tab" onClick={() => onLesson(l.level)}>level {l.level} {l.step}, {l.title} ↗</button>
        </span>
      ))}
    </p>
  );
}

function MinuteTab(p: InspectorProps) {
  const { mission: m, minute, world } = p;
  const v = minuteEvents(m, minute, p.umpire ? undefined : p.side);
  const open = (i: Inspection) => p.onChange({ ...p.inspection, ...i });
  const empty = !v.groups.length && !v.reports.length && !v.releases.length && !v.sends.length && !v.acks.length && !v.orders.length;
  return (
    <div>
      <p className="muted">{minute === 0 ? 'The start. Step forward to see the first minute.' : `What happened between T+${minute - 1} and T+${minute}, and the orders typed at T+${minute}.`}</p>
      {empty && minute > 0 && <p className="muted">Nothing was transmitted, heard or ordered. Step to the next event.</p>}
      {v.orders.length > 0 && (
        <div className="inspector-block">
          <h3>Orders typed</h3>
          {v.orders.map((e, i) => <div key={i} className="muted">{e.side ? `[${e.side}] ` : ''}{e.text}</div>)}
        </div>
      )}
      {v.groups.map((g) => (
        <div key={g.emitterId} className="inspector-block">
          <h3>{name(world, g.emitterId)}</h3>
          {g.emits.map((e, i) => <div key={`e${i}`}>transmitted: {e.what} ({e.signature})</div>)}
          {g.captures.map((c, i) => (
            <div key={`c${i}`} className="muted">
              heard by {name(world, c.sensorId)} at SNR {c.snrDb.toFixed(0)} dB: bearing {c.bearingDeg.toFixed(0)}° ± {c.sigmaDeg.toFixed(1)}° this minute
            </div>
          ))}
          {g.tracks.map((t, i) => (
            <div key={`t${i}`}>
              {t.side === 'blue' ? 'Blue' : 'Red'} picture: {t.first ? `new track ${t.trackId}` : t.cepKm !== undefined ? `${t.trackId} fixed, CEP ${t.cepKm.toFixed(2)} km` : `${t.trackId} updated`}{' '}
              <button type="button" className="text-btn" onClick={() => open({ tab: 'fix', trackId: t.trackId, k: undefined })}>how</button>
            </div>
          ))}
        </div>
      ))}
      {(v.reports.length > 0 || v.releases.length > 0) && (
        <div className="inspector-block">
          <h3>Reports</h3>
          {v.reports.map((r, i) => <div key={`r${i}`}>{name(world, r.unitId)}: {r.bearings} bearing{r.bearings === 1 ? '' : 's'}, {r.delivered ? 'reached HQ' : 'held: no link to HQ'} {linkButton(p, r.unitId)}</div>)}
          {v.releases.map((r, i) => <div key={`l${i}`}>{name(world, r.unitId)}: a held report reached HQ {linkButton(p, r.unitId)}</div>)}
        </div>
      )}
      {(v.sends.length > 0 || v.acks.length > 0) && (
        <div className="inspector-block">
          <h3>Orders over the net</h3>
          {v.sends.map((s, i) => <div key={`s${i}`}>order {s.orderN} from {name(world, s.fromId)} to {name(world, s.toId)}: {s.status} {linkButton(p, s.toId)}</div>)}
          {v.acks.map((a, i) => <div key={`a${i}`} className="muted">{name(world, a.unitId)} acknowledged order {a.orderN}</div>)}
        </div>
      )}
    </div>
  );
}

// A button to the Link tab on the unit's link to its HQ, when the side's links at this minute include one.
function linkButton(p: InspectorProps, unitId: string): ReactNode {
  const v = p.linkViews.find((x) => (x.link.aId === unitId || x.link.bId === unitId) && (unitById(p.world, x.link.aId)?.kind === 'hq' || unitById(p.world, x.link.bId)?.kind === 'hq'));
  if (!v) return null;
  return <button type="button" className="text-btn" onClick={() => p.onChange({ ...p.inspection, tab: 'link', linkId: v.link.id })}>link</button>;
}

function FixTab(p: InspectorProps) {
  const { mission: m, world, tracks, inspection, onChange } = p;
  const track = tracks.find((t) => t.id === inspection.trackId) ?? tracks[0];
  if (!track) return <p className="muted">No tracks in this picture yet at this minute.</p>;
  const moving = !!track.moving;
  const minutes = moving ? movingMinutes(track) : [];
  const n = moving ? minutes.length : track.bearings.length;
  const k = Math.max(1, Math.min(inspection.k ?? n, n));
  const truth = m.world.units.find((u) => u.id === track.emitterId)?.pos;
  const truthAt = truth && (m.history[Math.min(p.minute, m.history.length - 1)]?.positions[track.emitterId] ?? truth);
  const b = moving ? movingFix(world.map, track, minutes[k - 1], truthAt) : fixBuildUp(world.map, track, k, truthAt);
  const pick = (id: string) => onChange({ ...inspection, trackId: id, k: undefined });
  const emitter = m.world.units.find((u) => u.id === track.emitterId);
  const decoy = emitter?.kind === 'jammer';
  return (
    <div>
      <div className="inspector-row">
        <label>
          Track{' '}
          <select value={track.id} onChange={(e) => pick(e.target.value)}>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.signature}</option>)}
          </select>
        </label>
        <label>
          {moving ? 'Minute' : 'Bearings'}{' '}
          <input type="range" min={1} max={n} value={k} onChange={(e) => onChange({ ...inspection, trackId: track.id, k: Number(e.target.value) })} aria-label={moving ? 'Minute' : 'Bearings'} />{' '}
          {moving ? `T+${minutes[k - 1]}` : `${k} of ${n}`}
        </label>
      </div>
      {emitter && <p className="muted">The truth: {track.id} is {emitter.name}{decoy ? ', the EW team transmitting a decoy, not the net it imitates' : ''}.</p>}
      <div className="inspector-block">
        <h3>{moving ? `Bearings at T+${minutes[k - 1]}` : `The first ${k} bearing${k === 1 ? '' : 's'}`}</h3>
        {b.used.map((x, i) => {
          const o = bearingOrigin(m, x);
          return (
            <div key={i} className="inspector-bearing">
              <div>
                <b>{aliasOf(x.sensorId)}</b> {x.bearingDeg.toFixed(1)}° ± {x.sigmaDeg.toFixed(1)}° · {x.measurements} measurement{x.measurements === 1 ? '' : 's'} over {o.captures.length} minute{o.captures.length === 1 ? '' : 's'} · reported T+{x.minute}
              </div>
              <div className="muted">
                {o.captures.map((c) => `T+${c.minute}: SNR ${c.snrDb.toFixed(0)} dB, ± ${c.sigmaDeg.toFixed(1)}°`).join('; ')}
              </div>
              <div className="muted">
                averaged: 1 ÷ √Σ(1 ÷ σ²) = {Number.isFinite(o.averagedDeg) ? `${o.averagedDeg.toFixed(2)}°` : '—'}; with the {o.siteErrorDeg}° site error: √({Number.isFinite(o.averagedDeg) ? o.averagedDeg.toFixed(2) : '—'}² + {o.siteErrorDeg}²) = {o.sigmaDeg.toFixed(2)}°
              </div>
            </div>
          );
        })}
      </div>
      <div className="inspector-block">
        <h3>The fix</h3>
        {b.used.length < 2 && <div className="muted">One bearing: a wedge ± 2σ, no fix. The emitter is somewhere along it.</div>}
        {b.used.length === 2 && b.crossingDeg !== undefined && (
          <div className="muted">Two bearings crossing at {b.crossingDeg.toFixed(0)}°. The ellipse is long along the lines' direction and short across them; the flatter the crossing, the longer it is.</div>
        )}
        {b.used.length >= 2 && !b.fix && <div className="muted">These bearings do not cross usefully: same site, or nearly parallel. No fix.</div>}
        {b.fix && (
          <div>
            <div>CEP {b.fix.cepKm.toFixed(2)} km · 1σ ellipse {(2 * b.fix.ellipse.aKm).toFixed(2)} × {(2 * b.fix.ellipse.bKm).toFixed(2)} km{Number.isFinite(b.fix.missKm) ? ` · actually ${b.fix.missKm.toFixed(2)} km off` : ''}</div>
            <div className="muted">Least squares: each line weighted by 1 ÷ (σ × range)². CEP ≈ 0.75 × √(a² + b²) of the 1σ ellipse. The map draws the 2σ ellipse.</div>
          </div>
        )}
      </div>
      <LessonLinks keys={['bearing', b.used.length === 2 ? 'two' : 'more', ...(moving ? ['moving'] : [])]} onLesson={p.onLesson} />
    </div>
  );
}

function LinkTab(p: InspectorProps) {
  const { mission: m, minute, world, linkViews, inspection, onChange } = p;
  const view = linkViews.find((v) => v.link.id === inspection.linkId) ?? linkViews[0];
  if (!view) return <p className="muted">No links to show for this side at this minute.</p>;
  const net = netById(world, view.link.netId)!;
  const a = unitById(world, view.link.aId)!;
  const b = unitById(world, view.link.bId)!;
  const jammerIds = [...new Set([...view.budget.forward.jammers, ...view.budget.reverse.jammers].map((j) => j.jammerId))];
  const names = [a.name, b.name, net.name, ...jammerIds.map((id) => name(world, id))];
  const orders = ordersAffecting(m, minute, names);
  const modes = world.units.filter((u) => jammerIds.includes(u.id)).map((u) => u.jammer?.mode ?? '').filter((x) => x && x !== 'off');
  const keys = ['budget', ...(view.budget.jammed ? ['js', ...modes] : []), net.waveform.kind === 'fh' ? 'fh' : net.waveform.kind === 'dsss' ? 'dsss' : '', a.antenna || b.antenna ? 'antenna' : '', 'timeliness'].filter(Boolean);
  return (
    <div>
      <div className="inspector-row">
        <label>
          Link{' '}
          <select value={view.link.id} onChange={(e) => onChange({ ...inspection, linkId: e.target.value })}>
            {linkViews.map((v) => <option key={v.link.id} value={v.link.id}>{name(world, v.link.aId)} ↔ {name(world, v.link.bId)} · {netById(world, v.link.netId)?.name}</option>)}
          </select>
        </label>
      </div>
      <div className="inspector-block">
        <h3>Orders behind this budget, newest first</h3>
        {orders.length === 0 && <div className="muted">None: the radios are as the mission started them.</div>}
        {orders.map((e, i) => <div key={i} className="muted">T+{e.minute}{e.side ? ` [${e.side}]` : ''}: {e.text}</div>)}
      </div>
      <LinkDetail world={world} view={view} compact />
      <LessonLinks keys={keys} onLesson={p.onLesson} />
    </div>
  );
}

export function Inspector(p: InspectorProps) {
  const tabs: { id: InspectTab; label: string }[] = [
    { id: 'minute', label: `Minute T+${p.minute}` },
    { id: 'fix', label: 'Fix' },
    { id: 'link', label: 'Link' },
  ];
  return (
    <div className="inspector">
      <div className="inspector-tabs">
        <span className="muted">Inspector</span>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={p.inspection.tab === t.id ? 'active' : ''} onClick={() => p.onChange({ ...p.inspection, tab: t.id })}>{t.label}</button>
        ))}
      </div>
      <div className="inspector-body">
        {p.inspection.tab === 'minute' && <MinuteTab {...p} />}
        {p.inspection.tab === 'fix' && <FixTab {...p} />}
        {p.inspection.tab === 'link' && <LinkTab {...p} />}
      </div>
    </div>
  );
}
