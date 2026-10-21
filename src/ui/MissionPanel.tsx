import { aliasOf } from '../engine/mission/commands';
import { deliveredOrders, realFixes, routeToHq, viewOf } from '../engine/mission/mission';
import { HUNT_RULES as HR, MISSION_RULES as R, UAV_RULES as UR, type MissionState, type PlayerSide } from '../engine/mission/types';
import { axialToOffset } from '../engine/hex';
import { type LinkView, unitById } from '../engine/world';
import { SIDE_COLORS, dfColorOf, toCss } from './colors';

export type Seat = PlayerSide | 'umpire';

interface Props {
  mission: MissionState;
  view: ReturnType<typeof viewOf>;
  linkViews: LinkView[]; // the player's links, for the route column
  timeline: boolean; // sequence chart shown instead of the map
  seat: Seat; // whose picture the map and this panel show (a duel offers all three)
  onSeat: (seat: Seat) => void;
  oneConsole: boolean; // duel: both sides in one console, lines prefixed blue> or red>
  onOneConsole: (on: boolean) => void;
  server?: { url: string; turn: number; turnMin: number; waitingFor: PlayerSide[]; status: string }; // watching a game server
  onToggleTimeline: () => void;
  onNewMission: () => void;
  onExit: () => void;
  onInspectTrack?: (trackId: string) => void; // replay: open the inspector's Fix tab on a track
}

const short = (name: string) => name.replace(/^(Blue|Red) /, '');

export function MissionPanel({ mission: m, view, linkViews, timeline, seat, onSeat, oneConsole, onOneConsole, server, onToggleTimeline, onNewMission, onExit, onInspectTrack }: Props) {
  const tracks = view.tracks;
  const fixed = realFixes(m);
  const uavMission = m.mission === 'uav';
  const hunt = m.mission === 'hunt';
  const duel = m.humans.length > 1; // two consoles: mission 3 and 4
  const side: PlayerSide = seat === 'umpire' ? 'blue' : seat; // the picture shown
  const red = m.mission === 'hide' || (duel && seat === 'red');
  const uav = m.uav;
  const uavTrack = uav && m.tracks.find((t) => t.emitterId === uav.unitId);
  const uavFixed = uavTrack?.fixes?.filter((f) => f.fix.cepKm < UR.winCepKm).length ?? 0;
  const uavLost = uav?.telemetry.filter((t) => !t.delivered).length ?? 0;
  const current = m.redOrders.find((o) => o.status === 'pending' && o.windowStart <= m.minute && m.minute < o.windowEnd);
  const over = m.status !== 'running';
  const fox = m.mission === 'fox';
  const iads = m.mission === 'iads';
  const title = fox ? 'Fox hunt' : iads ? 'Air defence' : hunt ? 'UAV hunt' : uavMission ? 'Track the UAV' : duel ? 'Duel' : red ? 'Stay hidden' : 'Find the enemy';
  const result = duel
    ? m.status === 'ended'
      ? 'Mission ended for the debrief.'
      : m.winner === 'draw'
        ? uavMission
          ? 'Draw: Blue short of fixes, and Red lost reports or did not finish the route.'
          : 'Draw: Red hidden, but not commanding.'
        : uavMission
          ? m.winner === 'blue'
            ? 'Blue wins: the UAV was fixed.'
            : 'Red wins: route flown, reports delivered.'
          : hunt && m.found
            ? `${m.found.by === 'blue' ? 'Blue' : 'Red'} wins: its UAV heard the other from ${m.found.km.toFixed(1)} km at T+${m.found.minute}.`
            : `${m.winner === 'blue' ? 'Blue' : 'Red'} wins.`
    : m.status === 'won'
      ? red
        ? 'You stayed hidden.'
        : 'Mission complete.'
      : m.status === 'lost'
        ? red
          ? 'You were found.'
          : 'Time is up.'
        : m.status === 'draw'
          ? 'Hidden, but not commanding.'
          : 'Mission ended for the debrief.';
  return (
    <aside className="panel">
      <header>
        <h1>Windjam · {m.scenario ? `Scenario ${m.scenario}` : `Mission ${hunt ? 5 : uavMission ? 4 : duel ? 3 : red ? 2 : 1}`}</h1>
        <div className="sub">
          {title} · seed {m.seed} <button onClick={onNewMission}>New mission</button> <button onClick={onExit}>Sandbox</button>
        </div>
        {server && (
          <div className="sub">
            <b>Server</b> {server.url} · {server.status === 'running' ? `turn ${server.turn + 1}, ${server.turnMin} min each · waiting for ${server.waitingFor.length ? server.waitingFor.join(' and ') : 'the clock'}` : server.status}
          </div>
        )}
        {duel && (
          <div className="sub seg">
            {(['blue', 'red', 'umpire'] as Seat[]).map((x) => (
              <button key={x} className={seat === x ? 'active' : ''} onClick={() => onSeat(x)}>
                {x === 'umpire' ? 'Umpire' : x === 'blue' ? 'Blue view' : 'Red view'}
              </button>
            ))}
            <span className="muted">{seat === 'umpire' ? 'The truth: both sides on the map.' : `Only what ${seat === 'blue' ? 'Blue' : 'Red'} knows.`}</span>
          </div>
        )}
        {duel && (
          <div className="sub">
            <label>
              <input type="checkbox" checked={oneConsole} onChange={(e) => onOneConsole(e.target.checked)} /> One console
            </label>{' '}
            <span className="muted">{oneConsole ? 'Lines start with blue> or red>; paste a whole duel script.' : 'Two consoles, one per side.'}</span>
          </div>
        )}
        <div className="sub">
          <button className={timeline ? 'active' : ''} onClick={onToggleTimeline}>
            {timeline ? 'Map' : 'Timeline'}
          </button>{' '}
          <span className="muted">{timeline ? 'Back to the map.' : 'Sequence chart: who transmitted, who heard it, what HQ made of it.'}</span>
        </div>
      </header>

      <section>
        <h2>Objective</h2>
        {fox ? (
          <p className="help">A hunter on foot against a transmitter. Listen, read the bearing, walk along it, listen again. Found when within 1 km.</p>
        ) : iads ? (
          <p className="help">Every 5 minutes each Red radar reports a track to the fire control node, which orders a launcher. An engagement counts when both legs arrive on time. Blue denies them by finding and jamming the links.</p>
        ) : hunt ? (
          <p className="help">
            Each side has an HQ and a UAV. A UAV must report to its HQ every {HR.reportEveryMin} min; every report is a burst the other side can hear. HQ and the UAV listen all round;
            the UAV's bearings reach HQ with its next report. The first UAV to hear the other's report from within {HR.interceptKm} km finds it and wins. Draw at T+{HR.limitMin}.
          </p>
        ) : uavMission ? (
          <p className="help">
            Red's UAV flies a {UR.waypoints}-waypoint route and must report to Red HQ at least every {UR.reportEveryMin} min; each report is a {UR.burstSec} s burst. Blue wins with{' '}
            {UR.fixesToWin} position fixes under {UR.winCepKm} km (two sites hearing the same report). Red wins if the route is flown with at most {UR.maxGaps} report lost and Blue has fewer fixes.
            Otherwise a draw at T+{R.limitMin}.
          </p>
        ) : duel ? (
          <p className="help">
            Blue hunts, Red hides, both from their own console. Blue wins with {R.fixesToWin} fixes under {R.winCepKm} km on real Red emitters. Red wins if Blue has fewer at T+
            {R.limitMin} and Red delivered {R.redOrdersToWin} of {R.redOrderCount} orders on time. wait from either console advances the clock for both.
          </p>
        ) : red ? (
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
          <span className="k">{hunt ? `Found (a report heard from within ${HR.interceptKm} km)` : uavMission ? `Blue fixes on the UAV under ${UR.winCepKm} km` : duel ? `Blue fixes under ${R.winCepKm} km` : red ? 'Blue fixes on you (under 1 km)' : `Fixed under ${R.winCepKm} km`}</span>
          <span className="v">
            <b>
              {hunt ? (m.found ? `${m.found.by} at T+${m.found.minute}` : 'not yet') : uavMission ? `${uavFixed}/${UR.fixesToWin}` : `${fixed}/${R.fixesToWin}`}
            </b>
          </span>
        </div>
        {(red || duel) && !uavMission && !hunt && (
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
            {result}{' '}
            {m.replay
              ? `Replay at T+${view.minute}: play, step and scrub with the bar under the map, or next, step, back and exit in the console.`
              : m.history.length > 1 && m.log.some((l) => l.kind === 'replay')
                ? 'Reveal and replay (bar under the map) opens the replay again.'
                : 'Reveal and replay (bar under the map) shows the truth and plays back how the picture built up.'}
          </p>
        )}
      </section>

      {(red || duel) && !uavMission && !hunt && (
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
          <p className="muted">{duel ? 'From the red console, ' : ''}send transmits the current order: a one-minute burst from HQ (and the relay if routed through it), then the squad's acknowledgement.</p>
        </section>
      )}

      {hunt &&
        (['blue', 'red'] as PlayerSide[])
          .filter((x) => seat === 'umpire' || over || x === seat)
          .map((x) => {
            const st = x === 'blue' ? m.blueUav : m.uav;
            const unit = st && unitById(m.world, st.unitId);
            const enemy = x === 'blue' ? m.uav : m.blueUav;
            const t = enemy && (x === 'blue' ? m.tracks : m.redTracks).find((tr) => tr.emitterId === enemy.unitId);
            if (!st || !unit) return null;
            const { col, row } = axialToOffset(unit.pos);
            return (
              <section key={x}>
                <h2>{unit.name}</h2>
                <div className="row">
                  <span className="k">Flight</span>
                  <span className="v">
                    {st.launchedMin === undefined ? 'on the ground' : `airborne since T+${st.launchedMin} · at ${col},${row} · ${Math.max(0, st.route.length - st.nextWp)} waypoints to go${st.holding ? ' · holding' : ''}`}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Reports received / lost</span>
                  <span className="v">
                    {st.telemetry.filter((r) => r.delivered).length} / {st.telemetry.filter((r) => !r.delivered).length}
                    {st.launchedMin !== undefined ? ` · next forced T+${(st.lastBurstMin ?? st.launchedMin) + st.reportEveryMin}` : ''}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Enemy UAV</span>
                  <span className="v">{t ? `${t.id} · ${t.bearings.length} bearings${t.fix ? ` · fix CEP ${t.fix.cepKm.toFixed(1)} km` : ''}` : 'not heard yet'}</span>
                </div>
              </section>
            );
          })}

      {uavMission && uav && (
        <section>
          <h2>Red UAV</h2>
          {(seat !== 'blue' || over) && (
            <>
              <div className="row">
                <span className="k">Route</span>
                <span className="v">
                  {uav.doneMin !== undefined ? `complete at T+${uav.doneMin}` : uav.launchedMin === undefined ? 'on the ground (uav: launch)' : `airborne since T+${uav.launchedMin} · waypoint ${uav.nextWp}/${uav.route.length}${uav.holding ? ' · holding' : ''}`}
                </span>
              </div>
              <div className="row">
                <span className="k">Reports received / lost</span>
                <span className="v" style={{ color: uavLost > UR.maxGaps ? '#ef4444' : undefined }}>
                  {uav.telemetry.length - uavLost} / {uavLost} ({UR.maxGaps} may be lost)
                </span>
              </div>
              {uav.launchedMin !== undefined && uav.doneMin === undefined && (
                <div className="row">
                  <span className="k">Next forced report</span>
                  <span className="v">T+{(uav.lastBurstMin ?? uav.launchedMin) + UR.reportEveryMin}</span>
                </div>
              )}
            </>
          )}
          {(seat !== 'red' || over) && (
            <div className="row">
              <span className="k">Blue's position fixes</span>
              <span className="v">
                {uavTrack ? `${uavTrack.fixes?.length ?? 0} (${uavFixed} under ${UR.winCepKm} km) from ${uavTrack.bearings.length} bearings` : 'UAV not heard yet'}
              </span>
            </div>
          )}
          <p className="muted">
            {seat === 'red'
              ? 'uav: burst reports now and resets the 3-minute clock; uav: hold waits at the next waypoint; uav: power and uavlink: waveform shape the burst; uav: antenna toward hq points it home.'
              : 'A fix needs two sites to hear the same burst. Short DF tasks report sooner; ew: jam uavlink makes Red lose reports.'}
          </p>
        </section>
      )}

      <section>
        <h2>Map symbols</h2>
        <div className="symbols">
          <span><span className="sym sym-wedge" /> pink wedge: one bearing, emitter somewhere along it</span>
          <span><span className="sym sym-ellipse" /> pink ellipse and ×: HQ's fix and its error</span>
          {duel && <span><span className="sym sym-ellipse-red" /> amber wedge or ellipse: Red's picture of Blue (Umpire and Red view)</span>}
          <span><span className="sym sym-jam" /> purple line: a jammer to a receiver it is hitting (purple halo: jammer on)</span>
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
          <p className="muted">{side === 'red' ? 'No intercepts of Blue yet. Your units listen all round; Blue is heard when it transmits.' : 'Nothing heard yet. Try: sq1: df e 5, then wait 5.'}</p>
        )}
        {tracks.map((t) => {
          const good = t.fix && t.fix.cepKm < R.winCepKm;
          const first = t.bearings[0];
          const last = t.bearings[t.bearings.length - 1];
          return (
            <div key={t.id} className={`track-row${onInspectTrack ? ' clickable' : ''}`} onClick={onInspectTrack ? () => onInspectTrack(t.id) : undefined} title={onInspectTrack ? 'Open in the inspector' : undefined}>
              <div className="row">
                <span className="k">
                  <span className="dot" style={{ background: toCss(dfColorOf(t.id)), opacity: t.fix ? 1 : 0.5 }} /> <b>{t.id}</b> · {t.signature}
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
          .filter((u) => u.side === side)
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
                  <span className="swatch" style={{ background: toCss(SIDE_COLORS[side]) }} /> <b>{aliasOf(u.id)}</b> {short(u.name)} · {col},{row}
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
          {side === 'red'
            ? 'Your squads and relay listen all round and report intercepts over your net. HQ moves at 10 km/h and cannot send while moving.'
            : `Only squads and the UAV can DF. On a linked DF the UAV must stay within 5 km of ${unitById(m.world, 'b-sq2')?.name ?? 'its squad'}; on a silent sortie it flies out, listens, and brings the report back.`}{' '}
          Reports travel over the command net; if a unit's link to HQ is lost, its report waits.
        </p>
      </section>
    </aside>
  );
}
