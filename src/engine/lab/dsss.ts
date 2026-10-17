// DSSS transmitter and friendly receiver for the Link lab (design sections 4.2 and 9).
// Eb/N0 is linear and per channel bit; the receiver knows code, chip timing and carrier offset.
import { type Rng, createRng } from '../rng';
import { type FrontEndConfig, frontEnd } from './frontend';
import {
  type IQ,
  addAwgn,
  addScaled,
  chipMatchedFilter,
  chipStream,
  modulate,
  noiseVariance,
  rotate,
} from './signal';

// Link parameters shared by transmitter and receiver.
export interface LinkParams {
  code: Int8Array;
  chipsPerBit: number;
  repetition: 1 | 3 | 5;
  preamblePeriods: number;
  carrierCyclesPerChip: number;
  ebN0: number;
}

// A transmitted frame: spread chips, preamble length in chips, channel bit count and the information bits.
export interface Frame {
  chips: Int8Array;
  preambleChips: number;
  channelBits: number;
  bits: Int8Array;
  startChip: number; // absolute index of chip 0 in the run, so code, carrier and jammer continue across chunks
}

// Builds the chip stream: +1 preamble, then each information bit repeated r times, spread by the running code.
// startChip is the absolute chip index of the first chip; the code is read from startChip mod N.
export function frame(p: LinkParams, bits: Int8Array, withPreamble = true, startChip = 0): Frame {
  const gp = p.chipsPerBit;
  const preambleSymbols = withPreamble ? Math.ceil((p.preamblePeriods * p.code.length) / gp) : 0;
  const channelBits = bits.length * p.repetition;
  const symbols = new Int8Array(preambleSymbols + channelBits);
  symbols.fill(1, 0, preambleSymbols);
  for (let i = 0; i < bits.length; i++) {
    for (let c = 0; c < p.repetition; c++) symbols[preambleSymbols + i * p.repetition + c] = bits[i];
  }
  const n = p.code.length;
  return {
    chips: chipStream(symbols, p.code, gp, startChip % n),
    preambleChips: preambleSymbols * gp,
    channelBits,
    bits,
    startChip,
  };
}

// Noise-free baseband signal at s samples per chip with the carrier offset applied, amplitude 1.
export function transmit(p: LinkParams, f: Frame, s: number): IQ {
  // The carrier phase at sample 0 is that of absolute sample startChip * s, so chunks join without a jump.
  return rotate(modulate(f.chips, s), p.carrierCyclesPerChip / s, 2 * Math.PI * p.carrierCyclesPerChip * f.startChip);
}

// Correlator outputs, per-copy decisions, majority-decoded bits and front end statistics.
export interface RxResult {
  corr: Float32Array;
  copies: Int8Array;
  bits: Int8Array;
  clippedFraction: number;
  compressedFraction: number;
  blankedFraction: number;
}

// Front end, chip filter, derotation, integrate-and-dump per channel bit, then majority logic.
export function receive(p: LinkParams, rx: IQ, s: number, f: Frame, fe?: FrontEndConfig): RxResult {
  let x = rx;
  let clippedFraction = 0;
  let compressedFraction = 0;
  let blankedFraction = 0;
  if (fe) {
    const r = frontEnd(x, fe);
    x = r.out;
    clippedFraction = r.clippedFraction;
    compressedFraction = r.compressedFraction;
    blankedFraction = r.blankedFraction;
  }
  if (s > 1) x = chipMatchedFilter(x, s);
  const gp = p.chipsPerBit;
  const n = p.code.length;
  const c = p.carrierCyclesPerChip;
  const phase0 = (-2 * Math.PI * c * (s - 1)) / (2 * s);
  const corr = new Float32Array(f.channelBits);
  const copies = new Int8Array(f.channelBits);
  for (let j = 0; j < f.channelBits; j++) {
    let sum = 0;
    const start = f.preambleChips + j * gp;
    for (let k = start; k < start + gp; k++) {
      const a = -2 * Math.PI * c * (f.startChip + k) + phase0;
      sum += p.code[(f.startChip + k) % n] * (x.re[k] * Math.cos(a) - x.im[k] * Math.sin(a));
    }
    corr[j] = sum / gp;
    copies[j] = corr[j] < 0 ? -1 : 1;
  }
  const r = p.repetition;
  const nBits = Math.floor(f.channelBits / r);
  const bits = new Int8Array(nBits);
  for (let i = 0; i < nBits; i++) {
    let v = 0;
    for (let c2 = 0; c2 < r; c2++) v += copies[i * r + c2];
    bits[i] = v < 0 ? -1 : 1;
  }
  return { corr, copies, bits, clippedFraction, compressedFraction, blankedFraction };
}

// The jammer at the receiver input: n complex samples at s samples per chip.
// startChip is the absolute chip index of sample 0 (default 0), for jammers with a time structure.
export type Interference = (n: number, s: number, rng: Rng, startChip?: number) => IQ;

// Options for a seeded BER run.
export interface SimOptions {
  nBits: number;
  seed: number;
  s: number;
  frontEnd?: FrontEndConfig;
  interference?: Interference;
  preamble?: boolean;
  startChip?: number; // absolute chip index of the first chip (default 0)
}

// Information-bit and channel-copy error counts, with the correlator outputs.
export interface SimResult {
  bits: number;
  errors: number;
  copyErrors: number;
  copies: number;
  corr: Float32Array;
  clippedFraction: number;
  compressedFraction: number;
  blankedFraction: number;
}

// Seeded BER run: random bits, transmit, AWGN, optional interference, receive, count errors.
export function simulate(p: LinkParams, o: SimOptions): SimResult {
  const bitRng = createRng(o.seed);
  const noiseRng = createRng(o.seed ^ 0x9e3779b9);
  const jamRng = createRng(o.seed + 7919);
  const bits = new Int8Array(o.nBits);
  for (let i = 0; i < o.nBits; i++) bits[i] = bitRng() < 0.5 ? -1 : 1;
  const startChip = o.startChip ?? 0;
  const f = frame(p, bits, o.preamble ?? false, startChip);
  const rx = transmit(p, f, o.s);
  const variance = noiseVariance(p.ebN0, p.chipsPerBit, o.s);
  if (variance > 0) addAwgn(rx, variance, noiseRng);
  if (o.interference) addScaled(rx, o.interference(rx.re.length, o.s, jamRng, startChip));
  const r = receive(p, rx, o.s, f, o.frontEnd);
  let errors = 0;
  for (let i = 0; i < o.nBits; i++) if (r.bits[i] !== bits[i]) errors++;
  let copyErrors = 0;
  for (let j = 0; j < f.channelBits; j++) if (r.copies[j] !== bits[Math.floor(j / p.repetition)]) copyErrors++;
  return {
    bits: o.nBits,
    errors,
    copyErrors,
    copies: f.channelBits,
    corr: r.corr,
    clippedFraction: r.clippedFraction,
    compressedFraction: r.compressedFraction,
    blankedFraction: r.blankedFraction,
  };
}
