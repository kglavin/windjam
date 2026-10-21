import { useEffect, useMemo, useState } from 'react';
import { type Hex, hexEquals } from './engine/hex';
import { createScenario } from './engine/scenario';
import { type Command, type LinkView, type World, allLinkBudgets, step, unitAt, unitById } from './engine/world';
import type { JammerConfig, Waveform } from './engine/units';
import { LosTool } from './ui/LosTool';
import { MapView } from './ui/MapView';
import { type EsSide, SidePanel } from './ui/SidePanel';
import { detectEmitters } from './engine/detect';
import { DEFAULT_LAYERS, type Layers } from './ui/layers';
import { Toolbar } from './ui/Toolbar';
import { DEFAULT_COVERAGE, DEFAULT_LOS, type CoverageState, type LosState, type Tool } from './ui/tools';
import { CoverageTool } from './ui/CoverageTool';
import { ScopeTool } from './ui/ScopeTool';
import { type CoverageCell, type JsCell, coverageMap, jsCoverageMap } from './engine/coverage';
import { coverageColor, jsColor } from './ui/colors';
import { manMadeNoiseFigureDb, noiseFloorDbm } from './engine/rf';
import { type MissionKind, type MissionState, type PlayerSide } from './engine/mission/types';
import { createMission, issue as issueMission, jumpReplay, viewOf, visibleLog } from './engine/mission/mission';
import { SequenceChart } from './ui/SequenceChart';
import { knownIdsOf, parseCommand } from './engine/mission/commands';
import { Console } from './ui/Console';
import { type LoadedScript, ScriptBar } from './ui/ScriptBar';
import { type Inspection, Inspector } from './ui/Inspector';
import { fixBuildUp, lessonUrl, movingFix, movingMinutes } from './engine/mission/inspect';
import { missionFromScript, parseScript } from './engine/mission/script';
import { MissionPicker } from './ui/MissionPicker';
import { MissionPanel } from './ui/MissionPanel';
import { REPLAY_SPEEDS, ReplayBar, type ReplayMove } from './ui/ReplayBar';

const DEFAULT_SEED = 1234;

export function App({ chapter, onChapter }: { chapter: 'sandbox' | 'missions'; onChapter: (c: 'sandbox' | 'missions') => void }) {
  const [sandbox, setSandbox] = useState<World>(() => createScenario(DEFAULT_SEED));
  // Mission mode runs its own world (with Red hidden) on top of the same engine.
  const [mission, setMission] = useState<MissionState>();
  const missionActive = chapter === 'missions' && !!mission;
  // Whose picture the map and panel show. In a duel the umpire seat sees everything; the consoles are always per side.
  const [seat, setSeat] = useState<PlayerSide | 'umpire'>('blue');
  // Duel: one console for both sides, lines prefixed blue> or red>, so a whole script can be pasted at once.
  const [oneConsole, setOneConsole] = useState(false);
  // Watching a game server (?server=http://localhost:8787): the state lives there, this page renders it once a
  // second and relays console lines. Once the mission is over the copy here is frozen so the replay works locally.
  const [server] = useState(() => new URLSearchParams(window.location.search).get('server') ?? undefined);
  const [serverKey] = useState(() => new URLSearchParams(window.location.search).get('key') ?? ''); // the umpire key /full needs
  const [serverInfo, setServerInfo] = useState<{ turn: number; turnMin: number; waitingFor: PlayerSide[]; status: string }>();
  useEffect(() => {
    if (!server) return;
    let stop = false;
    let mapSeed = -1;
    let entered = false; // switch to the Missions chapter once, so the Chapters button still works while watching
    let map: ReturnType<typeof createScenario>['map'] | undefined;
    const poll = async () => {
      try {
        const r = await fetch(`${server}/full?key=${encodeURIComponent(serverKey)}`);
        if (r.status === 403) {
          setServerInfo({ turn: 0, turnMin: 0, waitingFor: [], status: 'needs the umpire key: add &key=... from the server banner' });
          return;
        }
        const j = await r.json();
        if (stop) return;
        if (j.state.seed !== mapSeed) {
          map = createScenario(j.state.seed).map; // the server leaves the map out; the seed gives it
          mapSeed = j.state.seed;
        }
        setServerInfo({ turn: j.turn, turnMin: j.turnMin, waitingFor: j.waitingFor, status: j.status });
        setMission((prev) => (prev && prev.status !== 'running' && prev.seed === j.state.seed && j.status !== 'running' ? prev : { ...j.state, world: { ...j.state.world, map } }));
        if (!entered) onChapter('missions');
        entered = true;
      } catch {
        setServerInfo((prev) => (prev ? { ...prev, status: 'unreachable' } : { turn: 0, turnMin: 0, waitingFor: [], status: 'unreachable' }));
      }
    };
    setSeat('umpire');
    poll();
    const id = setInterval(poll, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [server, serverKey]);
  // Replay transport: auto-step the debrief one minute per interval so a person can watch it unfold.
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  useEffect(() => {
    if (!replayPlaying) return;
    const id = setInterval(() => {
      setMission((prev) => {
        if (!prev?.replay || prev.replay.minute >= prev.history.length - 1) {
          setReplayPlaying(false);
          return prev;
        }
        return issueMission(prev, { type: 'replay', move: 'step' });
      });
    }, REPLAY_SPEEDS[replaySpeed].msPerMinute);
    return () => clearInterval(id);
  }, [replayPlaying, replaySpeed]);
  const replayMove = (move: ReplayMove) => {
    setReplayPlaying(false);
    setMission((prev) => {
      if (!prev?.replay) return prev;
      if (move === 'start') return jumpReplay(prev, 0);
      if (move === 'end') return jumpReplay(prev, prev.history.length - 1);
      return issueMission(prev, { type: 'replay', move });
    });
  };
  const seatSide: PlayerSide = seat === 'umpire' ? 'blue' : seat;
  const view = useMemo(() => (missionActive ? viewOf(mission, seatSide, seat === 'umpire') : undefined), [missionActive, mission, seatSide, seat]);
  // Ground truth for link budgets: in a replay, Blue stands where it stood at that minute.
  const truth = view ? view.truth : sandbox;
  // What the map and tools see: Red is hidden while a mission is running.
  const world = view ? view.world : sandbox; // Red hidden while a mission runs
  const setWorld = setSandbox;
  const [selectedHex, setSelectedHex] = useState<Hex>();
  const [selectedUnitId, setSelectedUnitId] = useState<string>();
  const [selectedLinkId, setSelectedLinkId] = useState<string>();
  const [hiddenNets, setHiddenNets] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>();
  const [tool, setTool] = useState<Tool>('select');
  const [los, setLos] = useState<LosState>(DEFAULT_LOS);
  // Page x of the LOS chart ends, reported by the chart, used to line the map up with it.
  const [plotSpan, setPlotSpan] = useState<{ leftPageX: number; rightPageX: number }>();
  const [cov, setCov] = useState<CoverageState>(DEFAULT_COVERAGE);
  const [flash, setFlash] = useState<{ hex: Hex; reason: string }>();

  // A rejected move flashes on the map, then clears.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const allViews: LinkView[] = useMemo(() => allLinkBudgets(truth), [truth]);
  // In a running mission only Blue's links are shown; Red's would give its positions away.
  const dimUnitIds = view?.dimUnitIds;
  const linkViews = useMemo(() => {
    if (!missionActive) return allViews;
    const sideOf = (netId: string) => truth.nets.find((n) => n.id === netId)?.side;
    if (mission.status === 'running' && !mission.replay && seat !== 'umpire') return allViews.filter((v) => sideOf(v.link.netId) === seatSide);
    // Reveal: Red links only where Blue found both ends.
    return allViews.filter((v) => sideOf(v.link.netId) === seatSide || (!dimUnitIds?.has(v.link.aId) && !dimUnitIds?.has(v.link.bId)));
  }, [allViews, missionActive, mission, truth, dimUnitIds, seat, seatSide]);

  // Esc returns to the select tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Apply one command; report a rejection instead of changing the world.
  const issue = (command: Command): boolean => {
    const result = step(world, [command]);
    if (result.rejected.length > 0) {
      setMessage(`Rejected: ${result.rejected[0].reason}`);
      return false;
    }
    setWorld(result.world);
    setMessage(undefined);
    return true;
  };

  const setJammer = (unitId: string, config: JammerConfig) => issue({ type: 'setJammer', unitId, config });
  const setWaveform = (netId: string, waveform: Waveform) => issue({ type: 'setWaveform', netId, waveform });

  // Detection display: which side's sensors to show, and what they pick up.
  const [esSide, setEsSide] = useState<EsSide>('blue');
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const detection = useMemo(
    () =>
      esSide === 'off' || missionActive
        ? undefined
        : detectEmitters(world.map, world.units, world.nets, esSide, {
            pfa: world.esPfa[esSide],
            noiseEnv: world.noiseEnv,
            limiter: world.esLimiter[esSide],
            seed: world.seed,
          }),
    [world, esSide],
  );
  const visibleLinks = useMemo(() => linkViews.filter((l) => !hiddenNets.has(l.link.netId)), [linkViews, hiddenNets]);

  const selectHex = (h: Hex) => {
    setSelectedHex(h);
    setMessage(undefined);
    const u = unitAt(world, h);
    setSelectedUnitId(u?.id);
    // Keep the selected link only if it belongs to the newly selected unit.
    if (!u || !linkViews.some((l) => l.link.id === selectedLinkId && (l.link.aId === u.id || l.link.bId === u.id))) {
      setSelectedLinkId(undefined);
    }
  };

  // LOS tool: first click sets A, second sets B, a third starts over. A unit's antenna height is used when present.
  // Coverage tool: a unit's own radio and net are used when one is clicked.
  const pickCoverage = (h: Hex) => {
    const u = unitAt(world, h);
    if (!u) {
      setCov((prev) => ({ ...prev, origin: h, sourceName: undefined }));
      return;
    }
    const spotNet = u.jammer && u.jammer.mode !== 'off' ? world.nets.find((n) => n.id === u.jammer!.targetNetId) : undefined;
    const net = spotNet ?? world.nets.find((n) => n.topology !== 'retrans' && n.memberIds.includes(u.id));
    setCov((prev) => ({
      ...prev,
      origin: h,
      sourceName: u.name,
      powerW: u.radio.powerW,
      antennaHeightM: u.radio.antennaHeightM,
      gainDbi: u.radio.gainDbi,
      freqMHz: net?.freqMHz ?? prev.freqMHz,
      netId: net?.id ?? prev.netId,
    }));
  };

  // J/S mode defaults: the first jammer from the other side to the transmitter's net, else any jammer.
  const jammerUnits = world.units.filter((u) => u.jammer);
  const jsNet = world.nets.find((n) => n.id === cov.netId) ?? world.nets[0];
  const jsJammer =
    jammerUnits.find((j) => j.id === cov.jammerId) ?? jammerUnits.find((j) => j.side !== jsNet.side) ?? jammerUnits[0];

  // Receiver assumed to be a 25 kHz channel with a 6 dB noise figure, in the world's man-made noise.
  const coverageFloor = noiseFloorDbm(25, 6, manMadeNoiseFigureDb(cov.freqMHz, world.noiseEnv));
  const coverageCells = useMemo(() => {
    if (!cov.origin) return undefined;
    const tx = { pos: cov.origin, powerW: cov.powerW, antennaHeightM: cov.antennaHeightM, gainDbi: cov.gainDbi };
    const rx = { antennaHeightM: cov.rxAntennaM, gainDbi: cov.rxGainDbi };
    if (cov.mode === 'js' && jsJammer) {
      return jsCoverageMap(world.map, { ...tx, freqMHz: jsNet.freqMHz }, rx, jsJammer, jsNet, world.nets, cov.rangeKm);
    }
    return coverageMap(world.map, { ...tx, freqMHz: cov.freqMHz }, rx, cov.rangeKm);
  }, [world, cov, jsJammer, jsNet]);
  const coverageColorOf = (cell: CoverageCell | JsCell) =>
    'avgJsDb' in cell ? jsColor(cell.avgJsDb) : coverageColor(cell.rxDbm, coverageFloor);

  // Scope tool: probe the receiver of the unit clicked. Defaults to the selected unit when the tool opens.
  const [probeId, setProbeId] = useState<string>();
  const pickProbe = (h: Hex) => {
    const u = unitAt(world, h);
    if (u) setProbeId(u.id);
    else setFlash({ hex: h, reason: 'No unit here to probe' });
  };
  useEffect(() => {
    if (tool === 'scope' && !probeId && selectedUnitId) setProbeId(selectedUnitId);
  }, [tool, probeId, selectedUnitId]);

  const pickLos = (h: Hex) => {
    const antenna = unitAt(world, h)?.radio.antennaHeightM ?? DEFAULT_LOS.antennaAM;
    setLos((prev) =>
      !prev.a || prev.b ? { ...prev, a: h, b: undefined, antennaAM: antenna } : { ...prev, b: h, antennaBM: antenna },
    );
  };

  const moveTo = (h: Hex) => {
    if (missionActive) {
      setFlash({ hex: h, reason: 'In a mission, move units from the console: <unit>: move col,row' });
      return;
    }
    if (!selectedUnitId) {
      setFlash({ hex: h, reason: 'Select a unit first, then right-click to move it' });
      return;
    }
    const unit = unitById(world, selectedUnitId)!;
    if (hexEquals(unit.pos, h)) return;
    const result = step(world, [{ type: 'moveUnit', unitId: selectedUnitId, to: h }]);
    if (result.rejected.length > 0) {
      setFlash({ hex: h, reason: result.rejected[0].reason });
      return;
    }
    setWorld(result.world);
    setSelectedHex(h);
    setMessage(undefined);
  };

  const toggleNet = (id: string) =>
    setHiddenNets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const newMap = () => {
    setWorld(createScenario(Math.floor(Math.random() * 1_000_000)));
    setSelectedHex(undefined);
    setSelectedUnitId(undefined);
    setSelectedLinkId(undefined);
    setMessage(undefined);
    setLos((prev) => ({ ...prev, a: undefined, b: undefined }));
    setCov((prev) => ({ ...prev, origin: undefined, sourceName: undefined }));
  };

  // Mission console: parse a line, apply it, and log parse errors in the console itself.
  const onConsole = (line: string, as?: PlayerSide) => {
    // Watching a server while its game runs: the line goes to the server's console for that side.
    if (server && mission && mission.status === 'running') {
      const pre = /^(blue|red)>\s*/i.exec(line.trim());
      const side = pre && mission.humans.includes(pre[1].toLowerCase() as PlayerSide) ? (pre[1].toLowerCase() as PlayerSide) : (as ?? seatSide);
      void fetch(`${server}/${side}`, { method: 'POST', body: pre ? line.trim().slice(pre[0].length) : line });
      return;
    }
    // Functional update: a pasted script delivers many lines in one event, each must build on the last.
    setMission((prev) => {
      if (!prev) return prev;
      const seed = /^seed\s+(\d+)$/i.exec(line.trim());
      if (seed) {
        const next = createMission(Number(seed[1]), prev.mission);
        return { ...next, log: [...next.log, { minute: 0, kind: 'info', text: `Mission restarted on seed ${seed[1]}.` }] };
      }
      // Script lines may carry their console ('red> send'): strip the prefix, and route by it when it names a side
      // this mission has a console for. Test directives (mission, expect, rejects) are skipped.
      // No mutation here: React may run this updater twice, and both runs must see the same line.
      const pre = /^(blue|red)>\s*/i.exec(line.trim());
      const named = pre ? (pre[1].toLowerCase() as PlayerSide) : undefined;
      const body = pre ? line.trim().slice(pre[0].length) : line;
      if (/^(mission|expect|rejects)\s+\S+$/i.test(body.trim())) return prev;
      const side = named && prev.humans.includes(named) ? named : (as ?? prev.side);
      const p = parseCommand(body, side, knownIdsOf(prev.world));
      return p.ok ? issueMission(prev, p.command, side) : { ...prev, log: [...prev.log, { minute: prev.minute, kind: 'error', text: p.error, side }] };
    });
  };
  // A mission script loaded from the bar (missions/*.txt): its lines run through onConsole, a line, a turn or all at
  // a press, so the log and the map show each step.
  const [script, setScript] = useState<LoadedScript>();
  const loadScript = (name: string, text: string) => {
    const parsed = parseScript(text);
    const next = missionFromScript(parsed, Math.floor(Math.random() * 1_000_000));
    const kind = next.mission;
    setMission({ ...next, log: [...next.log, { minute: 0, kind: 'info', text: `Loaded ${name}: ${parsed.commands.length} lines${parsed.seed !== undefined ? `, seed ${parsed.seed}` : ''}. Step, Turn or Run all in the script bar.` }] });
    setScript({ name, commands: parsed.commands, cursor: 0 });
    setSeat(kind === 'hide' ? 'red' : 'blue');
    setReplayPlaying(false);
    onChapter('missions');
    setTool('select');
  };
  // Play a scenario: load its script, run every line, and open the replay.
  const playScript = (name: string, text: string) => {
    const parsed = parseScript(text);
    const next = missionFromScript(parsed, Math.floor(Math.random() * 1_000_000));
    setMission({ ...next, log: [...next.log, { minute: 0, kind: 'info', text: `Playing ${name}: ${parsed.commands.length} lines.` }] });
    setSeat(next.humans.length > 1 ? 'umpire' : next.mission === 'hide' ? 'red' : 'blue');
    setReplayPlaying(false);
    setInspection({ tab: 'minute' });
    onChapter('missions');
    setTool('select');
    for (const line of parsed.commands) onConsole(line);
    if (!/^(?:(?:blue|red)>\s*)?reveal$/i.test(parsed.commands[parsed.commands.length - 1] ?? '')) onConsole('reveal');
    setScript({ name, commands: parsed.commands, cursor: parsed.commands.length });
  };
  const runScriptTo = (end: number) => {
    if (!script) return;
    for (const line of script.commands.slice(script.cursor, end)) {
      // Echo the line on the console it runs on, then run it as if typed there.
      setMission((prev) => {
        if (!prev) return prev;
        const pre = /^(blue|red)>\s*/i.exec(line);
        const named = pre ? (pre[1].toLowerCase() as PlayerSide) : undefined;
        const side = named && prev.humans.includes(named) ? named : prev.side;
        return { ...prev, log: [...prev.log, { minute: prev.minute, kind: 'info', text: `> ${pre ? line.slice(pre[0].length) : line}`, side }] };
      });
      onConsole(line);
    }
    setScript({ ...script, cursor: Math.min(end, script.commands.length) });
  };
  const startMission = (kind: MissionKind = 'find') => {
    setScript(undefined);
    setMission(createMission(Math.floor(Math.random() * 1_000_000), kind));
    setSeat(kind === 'hide' ? 'red' : 'blue');
    setReplayPlaying(false);
    onChapter('missions');
    setTool('select');
    setSelectedHex(undefined);
    setSelectedUnitId(undefined);
    setSelectedLinkId(undefined);
  };

  // Mission timeline (sequence chart) in place of the map.
  const [timeline, setTimeline] = useState(false);

  // The replay inspector: open while the replay is paused. On the Fix tab the map draws the chosen track built from
  // its first k bearings (or at the chosen minute for a moving emitter), as the panel explains it.
  const [inspection, setInspection] = useState<Inspection>({ tab: 'minute' });
  const inspecting = missionActive && !!mission.replay && !replayPlaying;
  const mapTracks = useMemo(() => {
    if (!inspecting || !view || inspection.tab !== 'fix') return view?.tracks;
    const t = view.tracks.find((x) => x.id === inspection.trackId) ?? view.tracks[0];
    if (!t) return view.tracks;
    const truth = mission.history[Math.min(mission.replay!.minute, mission.history.length - 1)]?.positions[t.emitterId];
    if (t.moving) {
      const minutes = movingMinutes(t);
      const k = Math.max(1, Math.min(inspection.k ?? minutes.length, minutes.length));
      const at = minutes[k - 1];
      const b = movingFix(view.truth.map, t, at, truth);
      const cut: typeof t = { ...t, bearings: t.bearings.filter((x) => (x.heardMin ?? 0) <= at), fix: b.fix, fixes: (t.fixes ?? []).filter((f) => f.minute <= at) };
      return view.tracks.map((x) => (x.id === t.id ? cut : x));
    }
    const k = Math.max(1, Math.min(inspection.k ?? t.bearings.length, t.bearings.length));
    const b = fixBuildUp(view.truth.map, t, k, truth);
    const cut: typeof t = { ...t, bearings: b.used, fix: b.fix };
    return view.tracks.map((x) => (x.id === t.id ? cut : x));
  }, [inspecting, view, inspection, mission]);

  const losActive = tool === 'los';
  const coverageActive = tool === 'coverage';
  const scopeActive = tool === 'scope';

  return (
    <div className="app">
      <div className="map-col">
        <Toolbar tool={tool} onSelect={setTool} allowed={missionActive ? ['select', 'los'] : undefined} />
        {missionActive && timeline ? (
          <SequenceChart mission={mission} replayMinute={mission.replay?.minute} onJump={(minute) => setMission((prev) => (prev ? jumpReplay(prev, minute) : prev))} />
        ) : (
        <MapView
          world={world}
          links={visibleLinks}
          selectedHex={losActive || scopeActive ? undefined : selectedHex}
          selectedUnitId={losActive ? undefined : scopeActive ? probeId : selectedUnitId}
          selectedLinkId={selectedLinkId}
          onSelectHex={losActive ? pickLos : coverageActive ? pickCoverage : scopeActive ? pickProbe : selectHex}
          onMoveTo={tool === 'select' ? moveTo : () => {}}
          losA={losActive ? los.a : undefined}
          losB={losActive ? los.b : undefined}
          losPreview={losActive && !!los.a && !los.b}
          flash={flash}
          detections={detection?.emitters}
          tracks={mapTracks}
          dimUnitIds={dimUnitIds}
          sectors={view?.sectors}
          plans={view?.plans}
          trails={view?.trails}
          layers={layers}
          onLayersChange={setLayers}
          alignTo={
            losActive && los.alignMap && los.a && los.b && plotSpan && !hexEquals(los.a, los.b)
              ? { a: los.a, b: los.b, ...plotSpan }
              : undefined
          }
          coverage={coverageActive && cov.origin && coverageCells ? { origin: cov.origin, cells: coverageCells, colorOf: coverageColorOf } : undefined}
        />
        )}
        {losActive && <LosTool map={world.map} los={los} onChange={setLos} onPlotSpan={setPlotSpan} />}
        {scopeActive && !missionActive && <ScopeTool world={world} linkViews={linkViews} probeId={probeId} />}
        {missionActive && (
          <ReplayBar
            mission={mission}
            playing={replayPlaying}
            speed={replaySpeed}
            onMove={replayMove}
            onJump={(minute) => {
              setReplayPlaying(false);
              setMission((prev) => (prev ? jumpReplay(prev, minute) : prev));
            }}
            onPlay={setReplayPlaying}
            onSpeed={setReplaySpeed}
            onReveal={() => setMission((prev) => (prev ? issueMission(prev, { type: 'reveal' }) : prev))}
          />
        )}
        {inspecting && (
          <Inspector
            mission={mission}
            minute={mission.replay!.minute}
            side={seatSide}
            umpire={seat === 'umpire'}
            world={view!.truth}
            tracks={view!.tracks}
            linkViews={linkViews}
            inspection={inspection}
            onChange={setInspection}
            onLesson={(level) => window.open(lessonUrl({ level, step: '', title: '' }), '_blank', 'noopener')} // a new tab: the replay stays as it is
          />
        )}
        {missionActive && <ScriptBar script={script} onLoad={loadScript} onRunTo={runScriptTo} onUnload={() => setScript(undefined)} disabled={!!server} />}
        {missionActive && (
          <div className="consoles">
            {oneConsole && mission.humans.length > 1 ? (
              <Console log={mission.log} prompt="duel>" showSide onSubmit={(line) => onConsole(line, seatSide)} />
            ) : (
              mission.humans.map((side) => (
                <Console key={side} log={visibleLog(mission, side)} prompt={`${side}>`} onSubmit={(line) => onConsole(line, side)} />
              ))
            )}
          </div>
        )}
        {coverageActive && !missionActive && (
          <CoverageTool
            state={cov}
            jammerId={jsJammer?.id}
            netId={jsNet.id}
            cells={coverageCells}
            noiseFloorDbm={coverageFloor}
            jammers={jammerUnits}
            nets={world.nets}
            onChange={setCov}
          />
        )}
      </div>
      {missionActive ? (
        <MissionPanel
          mission={mission}
          view={view!}
          linkViews={linkViews}
          timeline={timeline}
          onToggleTimeline={() => setTimeline((t) => !t)}
          seat={seat}
          onSeat={setSeat}
          oneConsole={oneConsole}
          onOneConsole={setOneConsole}
          server={server ? { url: server, ...(serverInfo ?? { turn: 0, turnMin: 0, waitingFor: [], status: 'connecting' }) } : undefined}
          onNewMission={() => startMission(mission.mission)}
          onExit={() => onChapter('sandbox')}
          onInspectTrack={inspecting ? (trackId) => setInspection({ tab: 'fix', trackId, k: undefined }) : undefined}
        />
      ) : chapter === 'missions' ? (
        <MissionPicker onStart={startMission} onLoadScript={loadScript} onPlayScript={playScript} />
      ) : (
      <SidePanel
        world={world}
        linkViews={linkViews}
        hiddenNets={hiddenNets}
        selectedHex={selectedHex}
        selectedLinkId={selectedLinkId}
        message={message}
        onToggleNet={toggleNet}
        onSelectLink={setSelectedLinkId}
        onSetJammer={setJammer}
        onSetWaveform={setWaveform}
        detection={detection}
        esSide={esSide}
        onSetEsSide={setEsSide}
        onSetPfa={(side, pfa) => issue({ type: 'setPfa', side, pfa })}
        onSetLimiter={(side, on) => issue({ type: 'setLimiter', side, on })}
        onSetNoiseEnv={(env) => issue({ type: 'setNoiseEnv', env })}
        onNewMap={newMap}
        onStartMission={startMission}
      />
      )}
    </div>
  );
}
