import { useMemo, useState } from 'react';
import { aliasOf } from '../engine/mission/commands';
import type { MissionEvent, MissionState } from '../engine/mission/types';
import { unitById } from '../engine/world';
import { SIDE_COLORS, toCss } from './colors';

interface Props {
  mission: MissionState;
  replayMinute?: number; // highlighted row
  onJump: (minute: number) => void; // click a minute to move the replay there
}

const COL_W = 96;
const ROW_H = 16;
const HEAD_H = 46;
const LEFT = 128; // room for the time axis and the player's fix labels left of its HQ lifeline

// Colours for what a unit was transmitting.
const EMIT_COLOURS: Record<string, string> = {
  chatter: '#9ca3af',
  decoy: '#f472b6',
  jamming: '#c084fc',
  'UAV link': '#22d3ee',
  telemetry: '#fb923c',
  'telemetry (forced)': '#fb923c',
  'DF report': '#22c55e',
  'report acknowledged': '#22c55e',
};
const emitColour = (what: string) => EMIT_COLOURS[what] ?? (/order/.test(what) ? '#fbbf24' : '#9ca3af');

const TASK_COLOURS = { df: 'rgba(96, 165, 250, 0.22)', sortie: 'rgba(34, 211, 238, 0.22)', move: 'rgba(148, 163, 184, 0.22)' } as const;

// Sequence chart: one lifeline per unit, time down the page, with emissions, captures, reports and fixes on it.
export function SequenceChart({ mission: m, replayMinute, onJump }: Props) {
  const [showChatter, setShowChatter] = useState(false);
  const [showCaptures, setShowCaptures] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // Columns: the player's side first, then the opponent, HQ first within each.
  const units = useMemo(() => {
    const order = (k: string) => ({ hq: 0, relay: 1, squad: 2, drone: 3, jammer: 4 })[k] ?? 5;
    const mine = m.world.units.filter((u) => u.side === m.side).sort((a, b) => order(a.kind) - order(b.kind));
    const theirs = m.world.units.filter((u) => u.side !== m.side && u.side !== 'neutral').sort((a, b) => order(a.kind) - order(b.kind));
    return [...mine, ...theirs];
  }, [m.world.units, m.side]);
  const col = useMemo(() => new Map(units.map((u, i) => [u.id, i])), [units]);
  const x = (id: string) => LEFT + (col.get(id) ?? 0) * COL_W + COL_W / 2;
  const y = (minute: number) => HEAD_H + minute * ROW_H + ROW_H / 2;
  const minutes = Math.max(m.minute, 1);
  const width = LEFT + units.length * COL_W + 20;
  const height = HEAD_H + (minutes + 1) * ROW_H + 10;

  const events = useMemo(() => {
    const visible = (e: MissionEvent) => {
      if (e.kind === 'emit' && e.what === 'chatter' && !showChatter) return false;
      if (e.kind === 'capture' && (!showCaptures || (e.what === 'chatter' && !showChatter))) return false;
      return true;
    };
    return m.events.filter(visible);
  }, [m.events, showChatter, showCaptures]);

  // Task windows as runs of consecutive busy minutes per unit.
  const bars = useMemo(() => {
    const out: { unitId: string; from: number; to: number; task: 'df' | 'sortie' | 'move'; detail: string }[] = [];
    const byUnit = new Map<string, { minute: number; task: 'df' | 'sortie' | 'move'; detail: string }[]>();
    for (const e of m.events) if (e.kind === 'busy') (byUnit.get(e.unitId) ?? byUnit.set(e.unitId, []).get(e.unitId)!).push(e);
    for (const [unitId, list] of byUnit) {
      list.sort((a, b) => a.minute - b.minute);
      let run: (typeof out)[number] | null = null;
      for (const e of list) {
        if (run && run.task === e.task && run.detail === e.detail && e.minute === run.to + 1) run.to = e.minute;
        else {
          run = { unitId, from: e.minute, to: e.minute, task: e.task, detail: e.detail };
          out.push(run);
        }
      }
    }
    return out;
  }, [m.events]);

  const name = (id: string) => unitById(m.world, id)?.name.replace(/^(Blue|Red) /, '') ?? id;
  const tip = (e: MissionEvent): string => {
    switch (e.kind) {
      case 'emit':
        return `T+${e.minute} ${name(e.unitId)} transmits: ${e.what} (${e.signature})`;
      case 'capture':
        return `T+${e.minute} ${name(e.sensorId)} hears ${name(e.emitterId)}: ${e.what}, ${e.snrDb.toFixed(0)} dB`;
      case 'report':
        return `T+${e.minute} ${name(e.unitId)} reports ${e.bearings} bearing${e.bearings === 1 ? '' : 's'}: ${e.delivered ? 'delivered' : 'held, no link'}`;
      case 'release':
        return `T+${e.minute} ${name(e.unitId)}: held report delivered`;
      case 'track':
        return `T+${e.minute} ${e.side} HQ: ${e.trackId} ${e.first ? 'new track' : `fix CEP ${e.cepKm?.toFixed(2)} km`} on ${name(e.emitterId)}`;
      case 'send':
        return `T+${e.minute} order ${e.orderN} ${name(e.fromId)} → ${name(e.toId)}: ${e.status}`;
      case 'busy':
        return `T+${e.minute} ${name(e.unitId)}: ${e.task} ${e.detail}`;
    }
  };

  const hubOf = (side: string) => m.world.nets.find((n) => n.side === side && n.topology === 'hub')?.hubId;
  const over = m.status !== 'running';

  return (
    <div className="seq">
      <div className="seq-controls">
        <b>Timeline</b>
        <label className="check">
          <input type="checkbox" checked={showCaptures} onChange={(e) => setShowCaptures(e.target.checked)} /> captures (who heard whom)
        </label>
        <label className="check">
          <input type="checkbox" checked={showChatter} onChange={(e) => setShowChatter(e.target.checked)} /> chatter
        </label>
        <span className="muted">
          Dots: transmissions (amber orders, green reports, pink decoy, purple jamming, cyan UAV link, grey chatter). Arrows: emitter → sensor. Diamonds: fixes. Bars: tasks.
          {over ? ' Click a minute to move the replay there.' : ''}
        </span>
      </div>
      <div className="seq-scroll" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} className="seq-svg">
          {/* Minute rows */}
          {Array.from({ length: minutes + 1 }, (_, i) => (
            <g key={i} onClick={() => over && onJump(i)} style={{ cursor: over ? 'pointer' : 'default' }}>
              <rect x={0} y={y(i) - ROW_H / 2} width={width} height={ROW_H} fill={i === replayMinute ? 'rgba(165, 180, 252, 0.18)' : i % 5 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'} />
              {i % 5 === 0 && (
                <text x={LEFT - 6} y={y(i) + 4} textAnchor="end" className="seq-axis">
                  T+{i}
                </text>
              )}
            </g>
          ))}
          {/* Lifelines and headers */}
          {units.map((u) => (
            <g key={u.id}>
              <line x1={x(u.id)} y1={HEAD_H} x2={x(u.id)} y2={height - 10} stroke="#334155" strokeWidth={1} />
              <rect x={x(u.id) - COL_W / 2 + 4} y={6} width={COL_W - 8} height={30} rx={4} fill={toCss(SIDE_COLORS[u.side])} opacity={0.85} />
              <text x={x(u.id)} y={20} textAnchor="middle" className="seq-head">
                {aliasOf(u.id)}
              </text>
              <text x={x(u.id)} y={32} textAnchor="middle" className="seq-head-sub">
                {u.name.replace(/^(Blue|Red) /, '')}
              </text>
            </g>
          ))}
          {/* Task bars */}
          {bars.map((b, i) => (
            <rect
              key={i}
              x={x(b.unitId) - 10}
              y={y(b.from) - ROW_H / 2}
              width={20}
              height={(b.to - b.from + 1) * ROW_H}
              rx={3}
              fill={TASK_COLOURS[b.task]}
              stroke={TASK_COLOURS[b.task].replace('0.22', '0.6')}
              onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${name(b.unitId)}: ${b.task} ${b.detail}, T+${b.from}–T+${b.to}` })}
            />
          ))}
          {/* Captures: emitter -> sensor */}
          {events
            .filter((e): e is Extract<MissionEvent, { kind: 'capture' }> => e.kind === 'capture')
            .map((e, i) => {
              const sideColour = toCss(SIDE_COLORS[unitById(m.world, e.sensorId)?.side ?? 'neutral']);
              const x1 = x(e.emitterId);
              const x2 = x(e.sensorId);
              const yy = y(e.minute);
              const dir = Math.sign(x2 - x1) || 1;
              return (
                <g key={`c${i}`} onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: tip(e) })}>
                  <line x1={x1} y1={yy} x2={x2 - dir * 5} y2={yy} stroke={sideColour} strokeWidth={1} opacity={e.what === 'chatter' ? 0.3 : 0.6} />
                  <polygon points={`${x2 - dir * 5},${yy - 3} ${x2},${yy} ${x2 - dir * 5},${yy + 3}`} fill={sideColour} opacity={0.8} />
                </g>
              );
            })}
          {/* Reports: sensor -> its HQ */}
          {events
            .filter((e): e is Extract<MissionEvent, { kind: 'report' | 'release' }> => e.kind === 'report' || e.kind === 'release')
            .map((e, i) => {
              const hq = hubOf(e.side);
              if (!hq || hq === e.unitId) return null;
              const x1 = x(e.unitId);
              const x2 = x(hq);
              const yy = y(e.minute) + 4;
              const ok = e.kind === 'release' || e.delivered;
              const dir = Math.sign(x2 - x1) || 1;
              return (
                <g key={`r${i}`} onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: tip(e) })}>
                  <line x1={x1} y1={yy} x2={x2 - dir * 5} y2={yy} stroke={ok ? '#22c55e' : '#f59e0b'} strokeWidth={1.5} strokeDasharray={ok ? undefined : '3 3'} />
                  <polygon points={`${x2 - dir * 5},${yy - 3} ${x2},${yy} ${x2 - dir * 5},${yy + 3}`} fill={ok ? '#22c55e' : '#f59e0b'} />
                </g>
              );
            })}
          {/* Emissions */}
          {events
            .filter((e): e is Extract<MissionEvent, { kind: 'emit' }> => e.kind === 'emit')
            .map((e, i) => (
              <circle key={`e${i}`} cx={x(e.unitId)} cy={y(e.minute)} r={e.what === 'chatter' ? 2.5 : 4} fill={emitColour(e.what)} onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: tip(e) })} />
            ))}
          {/* Order sends */}
          {events
            .filter((e): e is Extract<MissionEvent, { kind: 'send' }> => e.kind === 'send')
            .map((e, i) => (
              <text key={`s${i}`} x={x(e.fromId) + 8} y={y(e.minute) + 4} className="seq-label" fill="#fbbf24" onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: tip(e) })}>
                order {e.orderN}
              </text>
            ))}
          {/* Fixes and new tracks on the HQ lifeline */}
          {events
            .filter((e): e is Extract<MissionEvent, { kind: 'track' }> => e.kind === 'track')
            .map((e, i) => {
              const hq = hubOf(e.side);
              if (!hq) return null;
              const cx = x(hq) + (e.side === m.side ? -14 : 14);
              const cy = y(e.minute);
              return (
                <g key={`t${i}`} onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: tip(e) })}>
                  <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} fill={e.first ? 'none' : '#f472b6'} stroke="#f472b6" strokeWidth={1.5} />
                  {!e.first && (
                    <text x={cx + (e.side === m.side ? -8 : 8)} y={cy + 4} textAnchor={e.side === m.side ? 'end' : 'start'} className="seq-label" fill="#f9a8d4">
                      {e.trackId} {e.cepKm?.toFixed(1)} km
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        {hover && (
          <div className="seq-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
            {hover.text}
          </div>
        )}
      </div>
    </div>
  );
}
