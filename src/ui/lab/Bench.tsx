import { useEffect, useMemo, useRef, useState } from 'react';
import { capture, despreadCapture } from '../../engine/lab/capture';
import type { LinkParams } from '../../engine/lab/dsss';
import type { JammerSpec } from '../../engine/lab/jammers';
import { mSequence } from '../../engine/lab/pn';
import type { RunRequest, RunResult } from '../../engine/lab/run';
import {
  berMultitoneLongCode,
  berPartialBandDsss,
  berPulsedBpsk,
  berBpskJammed,
  berToneShortCode,
  undb,
} from '../../engine/lab/theory';
import { Autocorr } from './instruments/Autocorr';
import { BerMeter } from './instruments/BerMeter';
import { Correlator } from './instruments/Correlator';
import { CurvePlot, type CurvePoint } from './instruments/CurvePlot';
import { Spectrum } from './instruments/Spectrum';
import { Trace } from './instruments/Trace';
import { sceneBudget, type Scene } from '../../engine/lab/scene';
import { DEFAULT_SCENE } from './defaultScene';
import { LinkScene } from './LinkScene';

const GP = 63;
const S = 4;
const CHIP_RATE_HZ = 1e6;
const N_BITS = 300;
const LINK: LinkParams = {
  code: mSequence(6),
  chipsPerBit: GP,
  repetition: 1,
  preamblePeriods: 32,
  carrierCyclesPerChip: 0.002,
  ebN0: undb(8),
};

const JAMMERS: Record<string, JammerSpec | undefined> = {
  none: undefined,
  bbn: { kind: 'bbn' },
  'partial 0.25': { kind: 'partial', rho: 0.25 },
  'pulsed 0.1': { kind: 'pulsed', duty: 0.1, periodChips: 10 * GP },
  'tone 0.1': { kind: 'tone', fTc: 0.1 },
  'multitone 8': { kind: 'multitone', q: 8, spacing: 0.05, phases: 'random' },
};

// Theory curve for the selected jammer, where theory.ts has one.
function jammerTheory(spec: JammerSpec): { label: string; f: (jsDb: number) => number } | undefined {
  const e = LINK.ebN0;
  switch (spec.kind) {
    case 'bbn':
      return undefined;
    case 'partial':
      return { label: 'partial-band', f: (d) => berPartialBandDsss(e, GP, undb(d), spec.rho) };
    case 'pulsed':
      return { label: 'pulsed', f: (d) => berPulsedBpsk(e, GP / undb(d), spec.duty) };
    case 'tone':
      return { label: 'tone (short code)', f: (d) => berToneShortCode(e, undb(d), LINK.code, spec.fTc) };
    case 'multitone': {
      const offsets = Array.from({ length: spec.q }, (_, i) => (i - (spec.q - 1) / 2) * spec.spacing);
      return { label: 'multitone (long-code approx.)', f: (d) => berMultitoneLongCode(e, GP, undb(d), offsets) };
    }
  }
}

// Instrument bench: every instrument and jammer on one page, no guidance.
export function Bench({ onBack }: { onBack?: () => void }) {
  const [jamKey, setJamKey] = useState('bbn');
  const [jsDb, setJsDb] = useState(10);
  const [seed, setSeed] = useState(1);
  const [scene, setScene] = useState<Scene>(DEFAULT_SCENE);
  const budget = useMemo(() => sceneBudget(scene), [scene]);
  const sceneJsDb = budget.jsDb;
  const spec = JAMMERS[jamKey];
  const jam = spec ? { spec, js: undb(jsDb) } : undefined;

  // Instruments listen at the intercept: its Eb/N0 gives its chip SNR, and with a jammer its own J/S.
  const icLink: LinkParams = { ...LINK, ebN0: undb(budget.intercept.ebN0Db) };
  const icJam = spec ? { spec, js: undb(budget.intercept.jsDb) } : undefined;
  const takeShot = (shotSeed: number) => capture({ link: icLink, jammer: icJam, s: S, nBits: N_BITS, seed: shotSeed });

  const [shot, setShot] = useState(() => takeShot(1));
  const [points, setPoints] = useState<CurvePoint[]>([]);
  const shotSeed = useRef(1);

  const doCapture = () => {
    const next = seed + 1;
    setSeed(next);
    shotSeed.current = next;
    setShot(takeShot(next));
  };

  // Re-capture when the scene or the jammer type changes, after the player pauses.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      shotSeed.current += 1;
      setShot(takeShot(shotSeed.current));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, jamKey]);

  const corr = useMemo(() => despreadCapture(shot, LINK).corr, [shot]);
  const request: RunRequest | undefined = useMemo(
    () => ({ link: LINK, jammer: jam, s: 1, seed, maxBits: 200_000, timeBoundMs: 5000 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jamKey, jsDb, seed],
  );

  const theory = useMemo(() => {
    const t = [{ label: 'BBN', f: (d: number) => berBpskJammed(LINK.ebN0, GP / undb(d)) }];
    const jt = spec && jammerTheory(spec);
    if (jt) t.push(jt);
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jamKey]);

  const onResult = (r: RunResult, req: RunRequest) => {
    if (!req.jammer) return;
    const kind = req.jammer.spec.kind;
    const d = 10 * Math.log10(req.jammer.js);
    setPoints((p) => [...p, { jsDb: d, ber: r.ber, lo: r.lo, hi: r.hi, kind, label: `${kind} ${d.toFixed(1)} dB, ${r.errors}/${r.bits}` }]);
  };

  const rate = CHIP_RATE_HZ * S;
  return (
    <main className="lab-bench">
      <h1>Link lab: instrument bench</h1>
      {onBack && <button type="button" onClick={onBack}>Back to levels</button>}
      <LinkScene scene={scene} onChange={setScene} targetJsDb={jsDb} />
      <div className="lab-bench-controls">
        <label>
          Jammer{' '}
          <select value={jamKey} onChange={(e) => setJamKey(e.target.value)}>
            {Object.keys(JAMMERS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          J/S{' '}
          <input type="range" min={-10} max={30} step={0.5} value={jsDb} onChange={(e) => setJsDb(Number(e.target.value))} /> {jsDb} dB
        </label>
        <button type="button" onClick={() => setJsDb(Math.max(-10, Math.min(30, Math.round(sceneJsDb * 2) / 2)))}>
          Use scene J/S ({sceneJsDb.toFixed(1)} dB)
        </button>
        <button type="button" onClick={doCapture}>Capture</button>
        <span>Link: 63-chip m-sequence, 1 Mcps, Eb/N0 8 dB, s = 4. Capture: {N_BITS} bits.</span>
      </div>
      <p className="lab-instruments-line">
        Instruments: intercept receiver, chip SNR {budget.intercept.chipSnrDb.toFixed(1)} dB, J/S {budget.intercept.jsDb.toFixed(1)} dB
      </p>
      <div className="inst-grid-layout">
        <Spectrum x={shot.rx} sampleRateHz={rate} />
        <Trace x={shot.rx} sampleRateHz={rate} />
        <Autocorr x={shot.rx} sampleRateHz={rate} preambleSamples={shot.frame.preambleChips * shot.s} />
        <Correlator corr={corr} />
        <BerMeter request={request} onResult={onResult} />
        <CurvePlot points={points} theory={theory} />
      </div>
    </main>
  );
}
