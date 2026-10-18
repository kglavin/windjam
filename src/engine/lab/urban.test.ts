import { describe, expect, it } from 'vitest';
import {
  type Jammer, type Receiver, breakpointKm, bubbleRadiusKm, coverageMarginDb, fadeProbability, freeSpaceDb, hataSlope, hataUrbanDb, isolationCheck,
  fadingTrack, jammerGainDbi, jsAtReceivers, jsSamples, jsSpreadDb, microcellDb, rakeFadeProbability, reflectionBearingErrorDeg, zFor,
} from './urban';

describe('urban path loss', () => {
  it('Hata: the textbook value and its slope', () => {
    // 900 MHz, 10 km, 30 m base, 1.5 m mobile, large city: 69.55 + 77.28 − 20.41 − 0.00 + 35.23 = 161.6 dB.
    expect(hataUrbanDb(900, 10, 30, 1.5)).toBeCloseTo(161.6, 1);
    expect(hataSlope(30)).toBeCloseTo(3.52, 2);
    expect(hataUrbanDb(900, 10, 30, 1.5) - hataUrbanDb(900, 1, 30, 1.5)).toBeCloseTo(35.2, 1);
    expect(hataSlope(200)).toBeLessThan(hataSlope(30));
  });

  it('microcell: free space to the breakpoint, 40 log beyond', () => {
    const bp = breakpointKm(900, 10, 1.5);
    expect(bp).toBeCloseTo(0.18, 2);
    expect(microcellDb(900, bp / 2, 10, 1.5)).toBeCloseTo(freeSpaceDb(900, bp / 2), 9);
    expect(microcellDb(900, 2 * bp, 10, 1.5) - microcellDb(900, bp, 10, 1.5)).toBeCloseTo(12.04, 2);
  });
});

describe('shadowing', () => {
  it('J/S spread and the margin for 90% of spots', () => {
    expect(jsSpreadDb(8, 8)).toBeCloseTo(11.31, 2);
    expect(zFor(0.9)).toBeCloseTo(1.2816, 3);
    expect(coverageMarginDb(11.31, 0.9)).toBeCloseTo(14.5, 1);
    const s = jsSamples(0, 8, 8, 20000, 3);
    const above = s.filter((v) => v >= -coverageMarginDb(jsSpreadDb(8, 8), 0.9)).length / s.length;
    expect(above).toBeGreaterThan(0.88);
    expect(above).toBeLessThan(0.92);
  });
});

describe('multipath', () => {
  it('Rayleigh fades: 10 dB 1 time in 10, 20 dB 1 in 100; a rake of 2 or 3 paths, far rarer', () => {
    expect(fadeProbability(10)).toBeCloseTo(0.095, 3);
    expect(fadeProbability(20)).toBeCloseTo(0.00995, 4);
    expect(rakeFadeProbability(10, 1)).toBeCloseTo(fadeProbability(10), 12);
    expect(rakeFadeProbability(10, 2)).toBeCloseTo(1 - Math.exp(-0.2) * 1.2, 12);
    expect(rakeFadeProbability(10, 3)).toBeCloseTo(0.0036, 4);
  });

  it('a fading track fades as often as Rayleigh says, and a rake of 2 paths as its formula says', () => {
    const share = (t: number[], db: number) => t.filter((v) => v < -db).length / t.length;
    expect(share(fadingTrack(2000, 20000, 450, 5), 10)).toBeGreaterThan(0.08);
    expect(share(fadingTrack(2000, 20000, 450, 5), 10)).toBeLessThan(0.11);
    const two = share(fadingTrack(2000, 20000, 450, 5, 2), 10);
    expect(two).toBeGreaterThan(0.6 * rakeFadeProbability(10, 2));
    expect(two).toBeLessThan(1.5 * rakeFadeProbability(10, 2));
  });

  it('a bearing off a wall points at the wall', () => {
    expect(reflectionBearingErrorDeg({ xKm: 0, yKm: 0 }, { xKm: 0, yKm: 2 }, { xKm: 1, yKm: 1 })).toBeCloseTo(45, 9);
  });
});

describe('isolation and counter-IED', () => {
  const loss = (km: number) => 120 + 35 * Math.log10(km);
  const rx: Receiver[] = [
    { xKm: 0, yKm: 1, name: 'enemy', friendly: false, signalDbm: -90 },
    { xKm: 1, yKm: 0, name: 'friend', friendly: true, signalDbm: -80, toleranceJsDb: -10 },
  ];

  it('a beam on the enemy spares the friend in its side lobes; omni does not', () => {
    const omni: Jammer = { xKm: 0, yKm: 0, powerDbm: 40 };
    const beam: Jammer = { ...omni, boresightDeg: 0, gainDbi: 10, halfBeamDeg: 30, sidelobeDb: 25 };
    expect(jammerGainDbi(0, 90, 10, 30, 25)).toBe(-15);
    const o = isolationCheck(omni, rx, loss, 5);
    const b = isolationCheck({ ...beam, powerDbm: 30 }, rx, loss, 5);
    expect(o.ok).toBe(false);
    expect(b.ok).toBe(true);
    expect(jsAtReceivers(beam, rx, loss)[0] - jsAtReceivers(omni, rx, loss)[0]).toBeCloseTo(10, 9);
  });

  it('bubble radius', () => {
    // Jammer 20 dB above the trigger, 10 dB of J/S needed, slope 3.5: radius = 1 km × 10^(10 ÷ 35).
    expect(bubbleRadiusKm(1, 20, 10, 3.5)).toBeCloseTo(10 ** (10 / 35), 9);
  });
});
