import { describe, expect, it } from 'vitest';
import {
  type FhJammer, type FhLink, bitsPerHop, fhTheoryBer, followerDelayUs, followerEllipse, followerShare, hopChannel, jammedChannels,
  runFh, worstRhoFh,
} from './fh';
import { C_KM_PER_US, distanceKm } from './geoloc';
import { berNoncoherentBfskLin, undb, worstRhoBfsk } from './theory';

const SLOW: FhLink = { channels: 32, rateKbps: 10, dwellMs: 2, hopsPerBit: 1, ebN0Db: 30 };
const FAST: FhLink = { ...SLOW, hopsPerBit: 3 };

// The run's 95% interval, widened a little, holds the theory.
function agrees(link: FhLink, jammer: FhJammer, jsDb: number, seed = 3) {
  const r = runFh({ kind: 'fh', link, jammer, jsDb, seed, maxErrors: 400, maxBits: 400_000, timeBoundMs: 60_000 });
  const t = fhTheoryBer(link, jammer, jsDb);
  expect(t, `${jammer.kind} theory ${t} run ${r.ber}`).toBeGreaterThanOrEqual(r.lo * 0.85);
  expect(t, `${jammer.kind} theory ${t} run ${r.ber}`).toBeLessThanOrEqual(r.hi * 1.15);
  return r;
}

describe('frequency hopping link', () => {
  it('hops uniformly over the hop set, deterministic per seed', () => {
    const counts = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) counts[hopChannel(5, i, 8)]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
    expect(hopChannel(5, 17, 8)).toBe(hopChannel(5, 17, 8));
    expect(bitsPerHop(SLOW)).toBe(20);
    expect(jammedChannels(32, 0.1)).toBe(3);
    expect(jammedChannels(32, 0.001)).toBe(1);
  });

  it('broadband noise: Eb/J0 = N ÷ (J/S), noncoherent BFSK', () => {
    // J/S 9 dB over 32 channels: Eb/J0 = 32 / 7.94 = 4.03, BER ½·e^(−2.01) = 0.067.
    expect(fhTheoryBer(SLOW, { kind: 'bbn' }, 9)).toBeCloseTo(berNoncoherentBfskLin(1 / (1 / undb(30) + undb(9) / 32)), 12);
    agrees(SLOW, { kind: 'bbn' }, 9);
  });

  it('partial band: the best fraction turns an exponential into 1/x', () => {
    const js = 3; // Eb/J0 broadband = 32 / 2 = 16
    const rho = worstRhoFh(SLOW, js);
    expect(rho).toBeCloseTo(2 / (32 / undb(js)), 9);
    const worst = fhTheoryBer(SLOW, { kind: 'partial', rho }, js);
    const bbn = fhTheoryBer(SLOW, { kind: 'bbn' }, js);
    expect(worst).toBeCloseTo(worstRhoBfsk(32 / undb(js)).ber, 2);
    expect(worst / bbn).toBeGreaterThan(100); // Eb/J0 16: 0.023 against 0.00017
    // At Eb/J0 32 (J/S 0 dB) broadband noise is helpless (½·e⁻¹⁶) while the best partial band still gives e⁻¹ ÷ 32.
    const r0 = worstRhoFh(SLOW, 0);
    expect(fhTheoryBer(SLOW, { kind: 'partial', rho: r0 }, 0) / fhTheoryBer(SLOW, { kind: 'bbn' }, 0)).toBeGreaterThan(1e5);
    agrees(SLOW, { kind: 'partial', rho }, js);
  });

  it('fast hopping with a vote over 3 hops beats the same partial-band jammer', () => {
    const js = 3;
    const rho = worstRhoFh(SLOW, js);
    expect(fhTheoryBer(FAST, { kind: 'partial', rho }, js)).toBeLessThan(fhTheoryBer(SLOW, { kind: 'partial', rho }, js) / 3);
    agrees(FAST, { kind: 'partial', rho: 0.4 }, 3);
  });

  it('a follower jams the share of each dwell it reaches, with all its power in one channel', () => {
    const r = agrees(SLOW, { kind: 'follower', share: 0.5 }, -3);
    expect(r.hops.every((h) => h.jammedFrom === 0.5)).toBe(true);
    expect(fhTheoryBer(SLOW, { kind: 'follower', share: 0 }, 10)).toBeCloseTo(berNoncoherentBfskLin(undb(30)), 12);
  });

  it('a sweep hits each channel for its share of the time', () => {
    agrees(SLOW, { kind: 'sweep', widthChannels: 4, sweepMs: 7 }, 0);
  });

  it('keeps the first hops for the waterfall', () => {
    const r = runFh({ kind: 'fh', link: SLOW, jammer: { kind: 'partial', rho: 0.25 }, jsDb: 3, seed: 9, maxBits: 5000 });
    expect(r.hops).toHaveLength(60);
    expect(r.hops[1].startMs).toBeCloseTo(SLOW.dwellMs, 9);
    for (const h of r.hops) expect(h.jammedFrom === 0).toBe(h.channel < jammedChannels(32, 0.25));
  });
});

describe('follower timing', () => {
  const tx = { xKm: 0, yKm: 0 };
  const rx = { xKm: 20, yKm: 0 };

  it('a follower on the line between them adds no path, only its processing time', () => {
    expect(followerDelayUs(tx, rx, { xKm: 7, yKm: 0 }, 100)).toBeCloseTo(100, 9);
    const off = { xKm: 10, yKm: 15 };
    expect(followerDelayUs(tx, rx, off, 100)).toBeCloseTo(100 + (2 * Math.hypot(10, 15) - 20) / C_KM_PER_US, 9);
    expect(followerShare(1000, 250)).toBeCloseTo(0.75, 12);
    expect(followerShare(1000, 2000)).toBe(0);
  });

  it('the ellipse holds the places that cover exactly the share asked for', () => {
    const pts = followerEllipse(tx, rx, 1000, 200, 0.5)!;
    const extra = (1000 * 0.5 - 200) * C_KM_PER_US;
    for (const p of pts) expect(distanceKm(tx, p) + distanceKm(p, rx)).toBeCloseTo(20 + extra, 6);
    for (const p of pts) expect(followerShare(1000, followerDelayUs(tx, rx, p, 200))).toBeCloseTo(0.5, 6);
    expect(followerEllipse(tx, rx, 1000, 900, 0.5)).toBeUndefined();
  });
});
