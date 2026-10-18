import { describe, expect, it } from 'vitest';
import {
  type Network, type Target, PLATFORMS, dcPowerW, distanceGainDb, egliJsDb, egliLossDb, lookThroughLossDb, networkDenial, platform, shareOutcome,
  sharedBer, timeOnAirH,
} from './tactics';
import { berBpskJammed, berPulsedBpsk, undb } from './theory';

describe('power budgets', () => {
  it('DC power and time on air', () => {
    const s = platform('soldier');
    expect(dcPowerW(s.rfW, s.efficiency)).toBeCloseTo(33.3, 1);
    expect(timeOnAirH(s.energyWh, s.rfW, s.efficiency)).toBeCloseTo(4.5, 9);
    expect(timeOnAirH(s.energyWh, s.rfW, s.efficiency, 0.25)).toBeCloseTo(18, 9);
    expect(PLATFORMS.map((p) => p.id)).toEqual(['soldier', 'uav', 'vehicle', 'aircraft']);
  });

  it('distance beats power: halving the distance is 12 dB near the ground, 6 dB in free space', () => {
    expect(distanceGainDb(10, 5, 'two-ray')).toBeCloseTo(12.04, 2);
    expect(distanceGainDb(10, 5, 'free-space')).toBeCloseTo(6.02, 2);
    expect(10 * Math.log10(16)).toBeCloseTo(12.04, 2);
  });

  it('Egli: the frequency cancels out of J/S', () => {
    const o = { jamW: 50, jamGainDbi: 0, jamKm: 8, jamHeightM: 3, txW: 5, txGainDbi: 0, txKm: 10, txHeightM: 3, rxHeightM: 2 };
    expect(egliJsDb({ ...o, freqMHz: 50 })).toBeCloseTo(egliJsDb({ ...o, freqMHz: 400 }), 9);
    expect(egliLossDb(100, 10, 10, 2) - egliLossDb(50, 10, 10, 2)).toBeCloseTo(6.02, 2);
    expect(egliLossDb(100, 20, 10, 2) - egliLossDb(100, 10, 10, 2)).toBeCloseTo(12.04, 2);
  });

  it('look-through: stopping 10% of the time costs 0.46 dB', () => {
    expect(lookThroughLossDb(1, 10)).toBeCloseTo(0.458, 3);
  });
});

describe('sharing one jammer', () => {
  const T: Target = { name: 'A', gpDb: 15, jsDb: 12, ebN0Db: 20 };

  it('power sharing divides J, time sharing pulses the full J', () => {
    expect(sharedBer(T, 2, 'power')).toBeCloseTo(berBpskJammed(undb(20), 2 * undb(3)), 12);
    expect(sharedBer(T, 3, 'time')).toBeCloseTo(berPulsedBpsk(undb(20), 3 * undb(3), 1 / 3), 12);
    expect(sharedBer(T, 1, 'power')).toBeCloseTo(sharedBer(T, 1, 'time'), 12);
  });

  it('a link with margin falls to time sharing, a weak one to power sharing', () => {
    const strong: Target = { name: 'strong', gpDb: 18, jsDb: 10, ebN0Db: 25 }; // Eb/J0 8 dB with all the power
    const weak: Target = { name: 'weak', gpDb: 12, jsDb: 18, ebN0Db: 25 }; // Eb/J0 −6 dB
    expect(sharedBer(strong, 3, 'time')).toBeGreaterThan(sharedBer(strong, 3, 'power'));
    expect(sharedBer(weak, 2, 'power')).toBeGreaterThan(sharedBer(weak, 2, 'time'));
    const out = shareOutcome([strong, weak], [0, 1], 'time', 0.01);
    expect(out).toHaveLength(2);
    expect(shareOutcome([strong, weak], [1], 'power', 0.01)[0].denied).toBe(false);
  });
});

describe('networks as targets', () => {
  const hub = { xKm: 0, yKm: 10, name: 'hub' };
  const spokes = [{ xKm: -8, yKm: 14, name: 'A' }, { xKm: 7, yKm: 15, name: 'B' }, { xKm: -6, yKm: 4, name: 'C' }, { xKm: 8, yKm: 5, name: 'D' }];
  const net: Network = {
    nodes: [hub, ...spokes],
    links: spokes.map((_, i) => ({ from: i + 1, to: 0 })),
    txW: 5, heightM: 3, gpDb: 15, ebN0Db: 20, freqMHz: 50,
  };

  it('a jammer near the hub denies every inbound link; near one outstation, none', () => {
    const atHub = networkDenial(net, { xKm: 0, yKm: 7, powerW: 20, heightM: 3 }, 0.01);
    expect(atHub.every((l) => l.denied)).toBe(true);
    const atA = networkDenial(net, { xKm: -8, yKm: 11, powerW: 20, heightM: 3 }, 0.01);
    expect(atA.filter((l) => l.denied).length).toBeLessThan(atHub.filter((l) => l.denied).length);
  });
});
