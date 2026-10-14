import { aliasOf } from '../engine/mission/commands';
import { deliveredOrders, realFixes, routeToHq, viewOf } from '../engine/mission/mission';
import { MISSION_RULES as R, type MissionState } from '../engine/mission/types';
import { axialToOffset } from '../engine/hex';
import { type LinkView, unitById } from '../engine/world';
import { DF_COLOR, SIDE_COLORS, toCss } from './colors';

interface Props {
  mission: MissionState;
  view: ReturnType<typeof viewOf>;
  linkViews: LinkView[]; // the player's links, for the route column
  onNewMission: () => void;
  onExit: () => void;
}

const short = (name: string) => name.replace(/^(Blue|Red) /, '');

export function MissionPanel({ mission: m, view, linkViews, onNewMission, onExit }: Props) {
  const tracks = view.tracks;
  const fixed = realFixes(m);
  const red = m.mission === 'hide';
  const current = m.redOrders.find((o) => o.status === 'pending' && o.windowStart <= m.minute && m.minute < o.windowEnd);
  const over = m.status !== 'running';
  return (
    <aside className="panel">
      <header>
        <h1>Windjam · Mission {red ? 2 : 1}</h1>
        <div className="sub">
          {red ? 'Stay hidden' : 'Find the enemy'} · seed {m.seed} <button onClick={onNewMission}>New mission</button> <button onClick={onExit}>Sandbox</button>
        </div>
      </header>

      <section>
        <h2>Objective</h2>
        {red ? (
          <p className="help">
            Blue is hunting you with a plan you can't see. It wins with {R.fixesToWin} fixes under {R.winCepKm} km on your real emitters. You win if it has fewer at T+
            {R.limitMin} and you delivered {R.redOrdersToWin} of your {R.redOrderCount} orders on time. Every transmission is a bearing for Blue.
          </p>
        ) : (
          <p className="help">
            Red is hidden. Take bearings with your squads and the UAV, report them to HQ over the radio net, and fix {R.fixesToWin} Red emitters to CEP under{' '}
            {R.winCepKm} km within {R.limitMin} minutes.
          </p>
        )}
        <div className="row">
          <span className="k">Clock</span>
          <span className="v">
            <b>T+{view.minute}</b> of {m.limitMin} min{m.replay && ' · replay'}
          </span>
        </div>
        <div className="row">
          <span className="k">{red ? 'Blue fixes on you (under 1 km)' : `Fixed under ${R.winCepKm} km`}</span>
          <span className="v">
            <b>
              {fixed}/{R.fixesToWin}
            </b>
          </span>
        </div>
        {red && (
          <div className="row">
            <span className="k">Orders on time</span>
            <span className="v">
              <b>
                {deliveredOrders(m)}/{R.redOrderCount}
              </b>{' '}
              ({R.redOrdersToWin} to win)
            </span>
          </div>
        )}
        <div className="mission-bar">
          <div className="mission-bar-fill" style={{ width: `${Math.min(100, (m.minute / m.limitMin) * 100)}%` }} />
        </div>
        {over && (
          <p className={`mission-result ${m.status}`}>
            {m.status === 'won' ? (red ? 'You stayed hidden.' : 'Mission complete.') : m.status === 'lost' ? (red ? 'You were found.' : 'Time is up.') : m.status === 'draw' ? 'Hidden, but not commanding.' : 'Mission ended for the debrief.'}{' '}
            {m.replay
              ? `Replay at T+${view.minute}: next, step, back or exit in the console.`
              : m.history.length > 1 && m.log.some((l) => l.kind === 'replay')
                ? 'Type reveal to open the replay again.'
                : 'Type reveal in the console to see the truth and step through how the picture built up.'}
          </p>
        )}
      </section>

      {red && (
        <section>
          <h2>Orders to pass</h2>
          {m.redOrders.map((o) => (
            <div key={o.n} className="row">
              <span className="k">
                {o.n === current?.n ? '▶ ' : ''}Order {o.n} to {short(unitById(m.world, o.toId)?.name ?? o.toId)} · T+{o.windowStart}-{o.windowEnd}
              </span>
              <span className="v" style={{ color: o.status === 'on time' ? '#22c55e' : o.status === 'late' ? '#eab308' : o.status === 'lost' ? '#ef4444' : undefined }}>
                {o.status === 'pending' ? (o.n === current?.n ? 'due now: type send' : 'later') : o.status}
              </span>
            </div>
          ))}
          <p className="muted">send transmits the current order: a one-minute burst from HQ (and the relay if routed through it), then the squad's acknowledgement.</p>
        </section>
      )}

      <section>
        <h2>Map symbols</h2>
        <div className="symbols">
          <span><span className="sym sym-wedge" /> pink wedge: one bearing, emitter somewhere along it</span>
          <span><span className="sym sym-ellipse" /> pink ellipse and ×: HQ's fix and its error</span>
          <span><span className="sym sym-sector" /> blue dashed sector: a unit listening now</span>
          <span><span className="sym sym-plan" /> cyan dashed line: the UAV's remaining plan</span>
          <span><span className="sym sym-trail" /> solid fading line with dots: where a unit has been (cyan UAV, blue ground)</span>
          <span><span className="sym sym-grey" /> grey unit: enemy never found (after reveal)</span>
          <span><span className="sym sym-red" /> solid enemy unit: revealed</span>
        </div>
      </section>

      <section>
        <h2>Tracks</h2>
        {tracks.length === 0 && (
          <p className="muted">{red ? 'No intercepts of Blue yet. Your units listen all round; Blue is heard when it transmits.' : 'Nothing heard yet. Try: sq1: df e 5, then wait 5.'}</p>
        )}
        {tracks.map((t) => {
          const good = t.fix && t.fix.cepKm < R.winCepKm;
          const first = t.bearings[0];
          const last = t.bearings[t.bearings.length - 1];
          return (
            <div key={t.id} className="track-row">
              <div className="row">
                <span className="k">
                  <span className="dot" style={{ background: toCss(DF_COLOR), opacity: t.fix ? 1 : 0.5 }} /> <b>{t.id}</b> · {t.signature}
                </span>
                <span className="v" style={{ color: good ? '#22c55e' : undefined }}>
                  {t.fix ? `CEP ${t.fix.cepKm.toFixed(2)} km` : 'no fix'}
                </span>
              </div>
              <div className="muted det-df">
                {t.bearings.length} bearing{t.bearings.length === 1 ? '' : 's'}:{' '}
                {t.bearings.length <= 4
                  ? t.bearings.map((b) => `${aliasOf(b.sensorId)} ${Math.round(b.bearingDeg)}°±${b.sigmaDeg.toFixed(1)}° @T+${b.minute}`).join(', ')
                  : `from ${[...new Set(t.bearings.map((b) => aliasOf(b.sensorId)))].join(', ')} · T+${first.minute}–T+${last.minute}`}
                {over && t.fix && ` · actually ${t.fix.missKm.toFixed(2)} km off`}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2>Units</h2>
        {m.world.units
          .filter((u) => u.side === m.side)
          .map((u) => {
            const { col, row } = axialToOffset(u.pos);
            const o = m.orders[u.id];
            const route = routeToHq(m, u.id, linkViews);
            const held = m.held.filter((r) => r.unitId === u.id).length;
            const noNet = route.via === 'not on the command net';
            const ep = [
              u.radio.powerW > 0 && u.kind !== 'drone' && u.kind !== 'jammer' ? `${u.radio.powerW} W` : '',
              u.antenna ? `→ ${short(unitById(m.world, u.antenna.towardId)?.name ?? '?')}` : '',
              u.decoy ? 'decoy' : '',
              u.jammer && u.jammer.mode !== 'off' ? 'jamming' : '',
            ].filter(Boolean);
            return (
              <div key={u.id} className="row unit-row">
                <span className="k">
                  <span className="swatch" style={{ background: toCss(SIDE_COLORS[m.side]) }} /> <b>{aliasOf(u.id)}</b> {short(u.name)} · {col},{row}
                </span>
                <span className="v muted">
                  {!o ? 'idle' : o.kind === 'df' ? `DF until T+${o.endMin}` : o.kind === 'move' ? `moving (${o.path.length})` : `sortie: ${o.phase === 'df' ? `DF until T+${o.dfEndMin}` : o.phase} · silent`} ·{' '}
                  <span style={{ color: route.ok || noNet ? undefined : '#f87171' }}>{noNet ? 'no radio net' : route.ok ? 'link ok' : 'link LOST'}</span>
                  {held ? ` · ${held} held` : ''}
                  {ep.map((x) => ` · ${x}`).join('')}
                </span>
              </div>
            );
          })}
        <p className="muted">
          {red
            ? 'Your squads and relay listen all round and report intercepts over your net. HQ moves at 10 km/h and cannot send while moving.'
            : `Only squads and the UAV can DF. On a linked DF the UAV must stay within 5 km of ${unitById(m.world, 'b-sq2')?.name ?? 'its squad'}; on a silent sortie it flies out, listens, and brings the report back.`}{' '}
          Reports travel over the command net; if a unit's link to HQ is lost, its report waits.
        </p>
      </section>
    </aside>
  );
}
