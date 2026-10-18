// Data for the level 11 videos (level11_a1.py to level11_e1.py): losses against distance, J/S scattered over a town,
// a fading street with one path and a rake, a bearing off a wall, and the isolation example (omni against beam).
import { writeFileSync } from 'node:fs';
import { bearingDeg } from '../../src/engine/lab/geoloc';
import { EXAMPLE_PLACE, EXAMPLE_TOWN, JAMMER, exampleJs } from '../../src/engine/lab/levels';
import { coverageMarginDb, fadingTrack, freeSpaceDb, hataUrbanDb, jsSamples, jsSpreadDb, microcellDb, rakeFadeProbability, reflectionBearingErrorDeg } from '../../src/engine/lab/urban';

const r2 = (v: number) => Math.round(v * 100) / 100;
const f1 = (v: number) => v.toFixed(1); // shown numbers, rounded as the app rounds them
const km = Array.from({ length: 60 }, (_, i) => r2(0.1 * 30 ** (i / 59)));
const spread = jsSpreadDb(8, 8);
const margin = coverageMarginDb(spread, 0.9);
const site = { xKm: 0.3, yKm: 0.3 };
const tx = { xKm: 0.62, yKm: 1.62 };
const wall = { xKm: 1.5, yKm: 0.95 };

writeFileSync(process.argv[2], JSON.stringify({
  loss: {
    km,
    free: km.map((d) => r2(freeSpaceDb(450, d))),
    street: km.map((d) => r2(microcellDb(450, d, 10, 1.5))),
    hata: km.map((d) => r2(hataUrbanDb(450, d, 30, 1.5))),
    at2: { free: f1(freeSpaceDb(450, 2)), street: f1(microcellDb(450, 2, 10, 1.5)), hata: f1(hataUrbanDb(450, 2, 30, 1.5)) },
  },
  shadow: {
    need: 5,
    spread: f1(spread),
    margin: f1(margin),
    planAt: f1(5 + margin),
    // The same spots, planned at the need and at the need plus the margin.
    atNeed: jsSamples(5, 8, 8, 300, 11).map(r2),
    planned: jsSamples(5 + margin, 8, 8, 300, 11).map(r2),
  },
  fading: {
    m: Array.from({ length: 400 }, (_, i) => r2((i * 30) / 399)),
    one: fadingTrack(30, 400, 450, 3, 1).map(r2),
    two: fadingTrack(30, 400, 450, 3, 2).map(r2),
    p1: rakeFadeProbability(10, 1),
    p2: rakeFadeProbability(10, 2),
  },
  bearing: {
    site, tx, wall,
    toTx: bearingDeg(site, tx),
    toWall: bearingDeg(site, wall),
    shown: { toTx: f1(bearingDeg(site, tx)), toWall: f1(bearingDeg(site, wall)), error: f1(reflectionBearingErrorDeg(site, tx, wall)) },
  },
  isolation: {
    receivers: EXAMPLE_TOWN.receivers.map((r) => ({ xKm: r.xKm, yKm: r.yKm, name: r.name, friendly: r.friendly })),
    at: EXAMPLE_PLACE.at,
    beamDeg: EXAMPLE_PLACE.beamDeg,
    halfBeamDeg: JAMMER.halfBeamDeg,
    omni: exampleJs(false).map(f1),
    beam: exampleJs(true).map(f1),
  },
}));
