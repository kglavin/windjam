// Instrument captures for the Link lab: the samples at the receiver input, seeded like simulate().
import { createRng } from '../rng';
import { type Frame, type LinkParams, type RxResult, frame, receive, transmit } from './dsss';
import type { FrontEndConfig } from './frontend';
import { type JammerSpec, jammer } from './jammers';
import { type IQ, addAwgn, addScaled, noiseVariance } from './signal';

export interface CaptureOptions {
  link: LinkParams;
  jammer?: { spec: JammerSpec; js: number };
  s: number;
  nBits: number;
  seed: number;
  preamble?: boolean; // default true
  frontEnd?: FrontEndConfig;
}

export interface Capture {
  rx: IQ; // signal + AWGN + jammer, before any front end
  jam?: IQ; // the jammer alone
  frame: Frame;
  s: number;
}

// Same random streams as simulate(): bits from seed, noise from seed ^ 0x9e3779b9, jammer from seed + 7919.
export function capture(o: CaptureOptions): Capture {
  const bitRng = createRng(o.seed);
  const noiseRng = createRng(o.seed ^ 0x9e3779b9);
  const jamRng = createRng(o.seed + 7919);
  const bits = new Int8Array(o.nBits);
  for (let i = 0; i < o.nBits; i++) bits[i] = bitRng() < 0.5 ? -1 : 1;
  const f = frame(o.link, bits, o.preamble ?? true, 0);
  const rx = transmit(o.link, f, o.s);
  const variance = noiseVariance(o.link.ebN0, o.link.chipsPerBit, o.s);
  if (variance > 0) addAwgn(rx, variance, noiseRng);
  let jam: IQ | undefined;
  if (o.jammer) {
    jam = jammer(o.jammer.spec, o.jammer.js)(rx.re.length, o.s, jamRng, 0);
    addScaled(rx, jam);
  }
  return { rx, jam, frame: f, s: o.s };
}

// The correlator view of a capture: receive() on its samples.
export function despreadCapture(c: Capture, link: LinkParams, frontEnd?: FrontEndConfig): RxResult {
  return receive(link, c.rx, c.s, c.frame, frontEnd);
}
