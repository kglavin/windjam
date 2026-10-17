import type { IQ } from '../../../engine/lab/signal';
import { type KnownLink, type Visual, knownLinkInfo } from '../../../engine/lab/levels';
import { Autocorr } from '../instruments/Autocorr';
import { Spectrum } from '../instruments/Spectrum';
import { knownCapture } from '../knownCapture';
import { DbTable } from './DbTable';
import { Despread } from './Despread';
import { InterceptCompare } from './InterceptCompare';
import { SpreadVsUnspread } from './SpreadVsUnspread';
import { Spreading } from './Spreading';

export interface HiddenShot {
  x: IQ;
  sampleRateHz: number;
  preambleSamples: number;
  specNotes?: { xMHz: number; label: string }[];
  acNotes?: { lagUs: number; label: string }[];
  chipRateMcps?: number; // draws the envelope on the spectrum when set
}

const trim = (v: number) => String(Number(v.toFixed(1)));

// Null lines at ± the chip rate.
export const nullNotes = (chipRateMcps: number) =>
  [chipRateMcps, -chipRateMcps].map((x) => ({ xMHz: x, label: 'null' }));

// Lines at 1, 2 and 3 code periods, labelled with the lag.
export const periodNotes = (periodUs: number) =>
  [1, 2, 3].map((k) => ({ lagUs: k * periodUs, label: `${trim(k * periodUs)} µs` }));

// The figure or instrument for a lesson or practice step.
export function VisualView({ visual, links, hidden }: {
  visual: Visual;
  links: { example: KnownLink; practice: KnownLink };
  hidden?: HiddenShot;
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
          initialMaxLagUs={100}
        />
      );
    }
  }
}
