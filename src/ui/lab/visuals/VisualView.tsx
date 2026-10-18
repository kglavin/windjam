import type { IQ } from '../../../engine/lab/signal';
import {
  type KnownLink, type Visual, DF_EXAMPLES, exampleBearings, exampleHyperbolas, knownLinkInfo, legPoints, xcorrExample, xcorrPractice,
} from '../../../engine/lab/levels';
import { fixFromBearings } from '../../../engine/lab/geoloc';
import { Autocorr } from '../instruments/Autocorr';
import { DfView } from '../instruments/DfView';
import { XcorrView } from '../instruments/XcorrView';
import { WaterfallDemo } from './WaterfallDemo';
import { Spectrum } from '../instruments/Spectrum';
import { knownCapture } from '../knownCapture';
import { BerCurve } from './BerCurve';
import { Blinding } from './Blinding';
import { MajorityVote } from './MajorityVote';
import { BerRunDemo, DEMO_JS_DB } from './BerRunDemo';
import { DbTable } from './DbTable';
import { Despread } from './Despread';
import { DespreadBars } from './DespreadBars';
import { InterceptCompare } from './InterceptCompare';
import { JammedSpectra } from './JammedSpectra';
import { SpreadVsUnspread } from './SpreadVsUnspread';
import { ThreeJammers } from './ThreeJammers';
import { Peaks } from './Peaks';
import { ToneSpectrum } from './ToneSpectrum';
import { ToneSweep } from './ToneSweep';
import { Spreading } from './Spreading';

export interface HiddenShot {
  x: IQ;
  sampleRateHz: number;
  preambleSamples: number;
  specNotes?: { xMHz: number; label: string }[];
  acNotes?: { lagUs: number; label: string }[];
  chipRateMcps?: number; // draws the envelope on the spectrum when set
}

// The smallest max-lag choice that shows three peaks, so the known links open on a readable plot.
const LAG_CHOICES = [50, 100, 200, 500, 1000];
export const startLagUs = (periodUs: number): number => LAG_CHOICES.find((l) => l >= 3.1 * periodUs) ?? 1000;

const trim = (v: number) => String(Number(v.toFixed(1)));

// Null lines at ± the chip rate.
export const nullNotes = (chipRateMcps: number) =>
  [chipRateMcps, -chipRateMcps].map((x) => ({ xMHz: x, label: 'null' }));

// Lines at 1, 2 and 3 code periods, labelled with the lag.
export const periodNotes = (periodUs: number) =>
  [1, 2, 3].map((k) => ({ lagUs: k * periodUs, label: `${trim(k * periodUs)} µs` }));

// The figure or instrument for a lesson or practice step.
export function VisualView({ visual, links, hidden, practiceJsDb = 12, practiceN = 0 }: {
  visual: Visual;
  links: { example: KnownLink; practice: KnownLink };
  hidden?: HiddenShot;
  practiceJsDb?: number; // level 2: J/S on the practice link
  practiceN?: number; // the "Try another" counter
}) {
  switch (visual.kind) {
    case 'spreading':
      return <Spreading />;
    case 'spreadVsUnspread':
      return <SpreadVsUnspread />;
    case 'despread':
      return <Despread />;
    case 'interceptCompare':
      return <InterceptCompare />;
    case 'dbTable':
      return <DbTable />;
    case 'none':
      return null;
    case 'jammedSpectra':
      return <JammedSpectra />;
    case 'despreadBars': {
      if (visual.link === 'practice') return <DespreadBars gpDb={knownLinkInfo(links.practice).gpDb} jsDb={practiceJsDb} showValue={false} />;
      return <DespreadBars gpDb={visual.gpDb ?? knownLinkInfo(links.example).gpDb} jsDb={visual.jsDb ?? DEMO_JS_DB} />;
    }
    case 'berCurve': {
      const mark =
        visual.mark === 'example'
          ? knownLinkInfo(links.example).gpDb - DEMO_JS_DB
          : visual.mark === 'practice'
            ? knownLinkInfo(links.practice).gpDb - practiceJsDb
            : undefined;
      return <BerCurve markDb={mark} marks={visual.marks} />;
    }
    case 'berRunDemo':
      return <BerRunDemo variants={visual.variants} jsDb={visual.jsDb} />;
    case 'majorityVote':
      return <MajorityVote />;
    case 'blinding':
      return (
        <>
          <Blinding />
          {visual.demo && <BerRunDemo variants={visual.demo.variants} jsDb={visual.demo.jsDb} />}
        </>
      );
    case 'threeJammers':
      return <ThreeJammers />;
    case 'toneSpectrum':
      return <ToneSpectrum />;
    case 'toneSweep':
      return <ToneSweep />;
    case 'peaks':
      return <Peaks />;
    case 'df': {
      const ex = DF_EXAMPLES[visual.example];
      const bearings = exampleBearings(ex);
      return (
        <DfView
          title="Example"
          sites={ex.sites}
          bearings={bearings}
          wedges={!ex.leg}
          fix={ex.showFix ? fixFromBearings(bearings) : undefined}
          target={ex.target}
          path={ex.leg ? legPoints(ex.sites[0], ex.sites[1]) : undefined}
          hyperbolas={exampleHyperbolas(ex)}
        />
      );
    }
    case 'waterfall':
      return <WaterfallDemo link={visual.link} variants={visual.variants} jsDb={visual.jsDb} practiceN={practiceN} />;
    case 'xcorr': {
      if (visual.source === 'practice') return <XcorrView data={xcorrPractice(practiceN)} />;
      const ex = DF_EXAMPLES.G2;
      return (
        <>
          <XcorrView data={xcorrExample()} markPeak />
          <DfView title="Example" sites={ex.sites} target={ex.target} hyperbolas={exampleHyperbolas(ex)} />
        </>
      );
    }
    case 'spectrum':
    case 'autocorr': {
      if (visual.link === 'hidden') {
        if (!hidden) return null;
        return visual.kind === 'spectrum' ? (
          <Spectrum x={hidden.x} sampleRateHz={hidden.sampleRateHz} annotations={visual.annotate ? hidden.specNotes : undefined} envelope={visual.annotate && hidden.chipRateMcps ? { chipRateMHz: hidden.chipRateMcps } : undefined} />
        ) : (
          <Autocorr x={hidden.x} sampleRateHz={hidden.sampleRateHz} preambleSamples={hidden.preambleSamples} annotations={visual.annotate ? hidden.acNotes : undefined} />
        );
      }
      const link = links[visual.link];
      const shot = knownCapture(link);
      const info = knownLinkInfo(link);
      return visual.kind === 'spectrum' ? (
        <Spectrum x={shot.rx} sampleRateHz={shot.sampleRateHz} annotations={visual.annotate ? nullNotes(info.chipRateMcps) : undefined} envelope={visual.annotate ? { chipRateMHz: info.chipRateMcps } : undefined} />
      ) : (
        <Autocorr
          x={shot.rx}
          sampleRateHz={shot.sampleRateHz}
          preambleSamples={shot.preambleSamples}
          annotations={visual.annotate ? periodNotes(info.periodUs) : undefined}
          initialMaxLagUs={startLagUs(info.periodUs)}
        />
      );
    }
  }
}
