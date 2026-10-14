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
import { type MissionKind, type MissionState } from './engine/mission/types';
import { createMission, issue as issueMission, jumpReplay, viewOf, visibleLog } from './engine/mission/mission';
import { SequenceChart } from './ui/SequenceChart';
import { parseCommand } from './engine/mission/commands';
import { Console } from './ui/Console';
import { MissionPanel } from './ui/MissionPanel';

const DEFAULT_SEED = 1234;

export function App() {
  const [sandbox, setSandbox] = useState<World>(() => createScenario(DEFAULT_SEED));
  // Mission mode runs its own world (with Red hidden) on top of the same engine.
  const [mission, setMission] = useState<MissionState>();
  const [mode, setMode] = useState<'sandbox' | 'mission'>('sandbox');
  const missionActive = mode === 'mission' && !!mission;
  const view = useMemo(() => (missionActive ? viewOf(mission) : undefined), [missionActive, mission]);
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
    if (mission.status === 'running' && !mission.replay) return allViews.filter((v) => sideOf(v.link.netId) === mission.side);
    // Reveal: Red links only where Blue found both ends.
    return allViews.filter((v) => sideOf(v.link.netId) === mission.side || (!dimUnitIds?.has(v.link.aId) && !dimUnitIds?.has(v.link.bId)));
  }, [allViews, missionActive, mission, truth, dimUnitIds]);

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
  const onConsole = (line: string) => {
    // Functional update: a pasted script delivers many lines in one event, each must build on the last.
    setMission((prev) => {
      if (!prev) return prev;
      const seed = /^seed\s+(\d+)$/i.exec(line.trim());
      if (seed) {
        const next = createMission(Number(seed[1]), prev.mission);
        return { ...next, log: [...next.log, { minute: 0, kind: 'info', text: `Mission restarted on seed ${seed[1]}.` }] };
      }
      const p = parseCommand(line, prev.side);
      return p.ok ? issueMission(prev, p.command) : { ...prev, log: [...prev.log, { minute: prev.minute, kind: 'error', text: p.error }] };
    });
  };
  const startMission = (kind: MissionKind = 'find') => {
    setMission(createMission(Math.floor(Math.random() * 1_000_000), kind));
    setMode('mission');
    setTool('select');
    setSelectedHex(undefined);
    setSelectedUnitId(undefined);
    setSelectedLinkId(undefined);
  };

  // Mission timeline (sequence chart) in place of the map.
  const [timeline, setTimeline] = useState(false);

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
          tracks={view?.tracks}
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
        {missionActive && <Console log={visibleLog(mission)} prompt={`${mission.side}>`} onSubmit={onConsole} />}
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
          onNewMission={() => startMission(mission.mission)}
          onExit={() => setMode('sandbox')}
        />
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
