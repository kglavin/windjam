import { describe, expect, it } from 'vitest';
import { type DetectOptions, hypothesisEmission, hypothesisUnit, sensorLook } from './analysis';
import { createScenario } from './scenario';
import { RADIO_PRESETS } from './units';
import { unitById } from './world';

const opts: DetectOptions = { pfa: 1e-3, noiseEnv: 'rural', limiter: false, seed: 1 };

describe('hypothesis units', () => {
  it('takes the squad preset radio and belongs to nobody', () => {
    const u = hypothesisUnit({ pos: { q: 0, r: 0 }, kind: 'squad' });
    expect(u.side).toBe('neutral');
    expect(u.radio).toEqual(RADIO_PRESETS.squad);
  });

  it('applies the stated radio fields over the preset', () => {
    const u = hypothesisUnit({ pos: { q: 0, r: 0 }, kind: 'squad', powerW: 10, antennaHeightM: 20 });
    expect(u.radio.powerW).toBe(10);
    expect(u.radio.antennaHeightM).toBe(20);
    expect(u.radio.gainDbi).toBe(RADIO_PRESETS.squad.gainDbi);
  });

  it('gives the same snrDb as the real squad at its position', () => {
    const world = createScenario(1234);
    const squad = unitById(world, 'b-sq1')!;
    const listener = unitById(world, 'b-hq')!;
    const em = hypothesisEmission({ pos: squad.pos, kind: 'squad' });
    const real = sensorLook(world.map, squad, listener, em, opts);
    const guess = sensorLook(world.map, hypothesisUnit({ pos: squad.pos, kind: 'squad' }), listener, em, opts);
    expect(guess.snrDb).toBe(real.snrDb);
  });
});
