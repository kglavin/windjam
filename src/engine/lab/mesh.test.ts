import { describe, expect, it } from 'vitest';
import {
  MESH_RADIO, allFloodSends, backbone, brokenLinks, chipRangeM, cutNodes, cutOff, denialRadii, dutySavingDb, floodSends, helloDuty,
  hiddenPairs, isDominatingConnected, jammedAdj, lifeDays, linkDropS, meshLinks, meshLossDb, mpr, mprFlood, navCtsUs, navRtsUs, parts,
  radiusKm, route, rttDelayErrorKm, rttKm, rxDbm, silenced, tdmaFrameMs, toaKm, toleratedJsDb, pulseRangeM, claimedSpeedKmh, maxMoveKm,
  neighboursFit, claimFitsRange,
} from './mesh';

const r = MESH_RADIO;
const p = (xKm: number, yKm: number) => ({ xKm, yKm });
// A line of 5 radios 2 km apart (each reaches only its neighbours), then a second line joined through node 2.
const line = [p(0, 0), p(2, 0), p(4, 0), p(6, 0), p(8, 0)];

describe('the radio model', () => {
  it('two-ray loss: 108 dB at 1 km, 12 dB more per doubling', () => {
    expect(meshLossDb(r, p(0, 0), p(1, 0))).toBeCloseTo(120 - 20 * Math.log10(4), 6);
    expect(meshLossDb(r, p(0, 0), p(2, 0)) - meshLossDb(r, p(0, 0), p(1, 0))).toBeCloseTo(40 * Math.log10(2), 6);
    expect(rxDbm(r, p(0, 0), p(1, 0))).toBeCloseTo(30 - 107.96, 1);
  });

  it('radiusKm inverts rxDbm; the link range is about 2.7 km', () => {
    const d = radiusKm(r, 1, r.sensDbm);
    expect(rxDbm(r, p(0, 0), p(d, 0))).toBeCloseTo(r.sensDbm, 6);
    expect(d).toBeCloseTo(2.67, 2);
  });
});

describe('graphs', () => {
  const adj = meshLinks(r, line);
  it('a line links only neighbours; the route takes 4 hops; the inner nodes are cut nodes', () => {
    expect(adj).toEqual([[1], [0, 2], [1, 3], [2, 4], [3]]);
    expect(route(adj, 0, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(route(adj, 0, 4, new Set([2]))).toBeUndefined();
    expect(parts(adj, new Set([2]))).toEqual([[0, 1], [3, 4]]);
    expect(cutNodes(adj)).toEqual([1, 2, 3]);
  });

  it('a ring has no cut node and heals round a lost node', () => {
    const ring = Array.from({ length: 8 }, (_, i) => p(3 * Math.cos((i * Math.PI) / 4), 3 * Math.sin((i * Math.PI) / 4)));
    const a = meshLinks(r, ring);
    expect(a.every((n) => n.length === 2)).toBe(true);
    expect(cutNodes(a)).toEqual([]);
    expect(route(a, 0, 2)).toEqual([0, 1, 2]);
    expect(route(a, 0, 2, new Set([1]))).toEqual([0, 7, 6, 5, 4, 3, 2]);
  });

  it('the backbone is connected and every other node touches it', () => {
    const grid = Array.from({ length: 20 }, (_, i) => p(2 * (i % 5), 2 * Math.floor(i / 5)));
    const a = meshLinks(r, grid);
    const b = backbone(a, 7);
    expect(isDominatingConnected(a, b)).toBe(true);
    expect(b.length).toBeLessThan(20);
    expect(backbone(adj, 0)).toEqual([1, 2, 3]);
    expect(isDominatingConnected(adj, [1, 3])).toBe(false); // not connected
  });

  it('hidden terminals on a line: each pair two apart', () => {
    expect(hiddenPairs(adj)).toEqual([{ a: 0, b: 1, c: 2 }, { a: 1, b: 2, c: 3 }, { a: 2, b: 3, c: 4 }]);
  });
});

describe('floods', () => {
  it('one flood is N sends, every node flooding N²; relays cut it', () => {
    expect(floodSends(30)).toBe(30);
    expect(floodSends(30, [1, 2, 3, 4, 5, 6], 0)).toBe(7);
    expect(allFloodSends(20)).toBe(400);
  });

  it('multipoint relays reach every node with fewer sends than a plain flood', () => {
    const grid = Array.from({ length: 25 }, (_, i) => p(1.6 * (i % 5), 1.6 * Math.floor(i / 5)));
    const a = meshLinks(r, grid);
    const f = mprFlood(a, 12);
    expect(f.reached).toBe(25);
    expect(f.sends).toBeLessThan(25);
    for (const u of [0, 12, 24]) {
      const m = mpr(a, u);
      const n1 = new Set(a[u]);
      const two = new Set(a[u].flatMap((v) => a[v]).filter((w) => w !== u && !n1.has(w)));
      expect([...two].every((w) => m.some((v) => a[v].includes(w)))).toBe(true);
    }
  });
});

describe('the MAC', () => {
  const f = { rtsUs: 50, ctsUs: 40, dataUs: 2000, ackUs: 40, sifsUs: 10 };
  it('RTS and CTS announce the rest of the exchange', () => {
    expect(navRtsUs(f)).toBe(40 + 2000 + 40 + 30);
    expect(navCtsUs(f)).toBe(2000 + 40 + 20);
    expect(tdmaFrameMs(10, 2)).toBe(20);
  });
});

describe('jamming a mesh', () => {
  it('a 1 W jammer silences CSMA radios out to 1.5 km, but breaks data on a 0.8 km link only within 0.5 km', () => {
    const d = denialRadii(r, 1, 0.8);
    expect(d.silenceKm).toBeCloseTo(1.50, 2);
    expect(d.dataKm).toBeCloseTo(0.505, 3);
    expect(d.dataKm).toBeLessThan(d.silenceKm);
    // Data jamming reaching as far as the silenced radius needs the power ratio, by the 40·log10 slope.
    expect(10 * Math.log10(d.powerRatio)).toBeCloseTo(40 * Math.log10(d.silenceKm / d.dataKm), 6);
    expect(toleratedJsDb(r)).toBe(8);
  });

  it('a jammer by the middle of the line silences it and splits it', () => {
    const adj = meshLinks(r, line);
    const j = { xKm: 4, yKm: 0.3, powerW: 1, heightM: 2 };
    expect(silenced(r, line, j)).toEqual([2]);
    expect(brokenLinks(r, line, adj, j)).toEqual([[1, 2], [2, 3]]);
    expect(cutOff(jammedAdj(r, line, adj, j, true), 0)).toEqual([2, 3, 4]);
    const far = { xKm: 4, yKm: 1.4, powerW: 1, heightM: 2 };
    expect(brokenLinks(r, line, adj, far)).toEqual([]);
    expect(silenced(r, line, far)).toEqual([2]);
    expect(cutOff(jammedAdj(r, line, adj, far, false), 0)).toEqual([]);
    expect(cutOff(jammedAdj(r, line, adj, far, true), 0)).toEqual([2, 3, 4]);
  });
});

describe('the overhead, ranging and sleep', () => {
  it('jamming only the HELLOs', () => {
    expect(helloDuty(2, 1)).toBeCloseTo(0.002, 12);
    expect(dutySavingDb(0.002)).toBeCloseTo(27.0, 1);
    expect(linkDropS(1, 2)).toBe(2);
  });

  it('TOA and RTT; a delay can only add range', () => {
    expect(toaKm(10)).toBeCloseTo(3.0, 2);
    expect(rttKm(10.2, 5.2)).toBeCloseTo(0.75, 2);
    expect(rttDelayErrorKm(1)).toBeCloseTo(0.15, 2);
    expect(chipRangeM(10)).toBeCloseTo(15, 0);
    expect(pulseRangeM(1)).toBeCloseTo(0.15, 2);
  });

  it('position claims: speed, reach, neighbours, the range bound', () => {
    expect(claimedSpeedKmh(p(0, 0), p(0.3, 0.4), 60)).toBeCloseTo(30, 9);
    expect(maxMoveKm(2, 60)).toBeCloseTo(0.12, 12);
    expect(neighboursFit(p(1, 1), [p(2, 1), p(1, 3)], 2.7)).toBe(true);
    expect(neighboursFit(p(9, 1), [p(2, 1), p(1, 3)], 2.7)).toBe(false);
    expect(claimFitsRange(1.2, 1.5)).toBe(true);
    expect(claimFitsRange(2.0, 1.5)).toBe(false);
  });

  it('fake frames drain the battery; an authenticated preamble saves most of it', () => {
    const b = { batteryWh: 10, sleepMw: 0.01, listenMw: 60, listenDuty: 0.01, wakeMj: 2, checkMj: 0.05 };
    const quiet = lifeDays(b, 0, false);
    expect(quiet).toBeCloseTo(10000 / (0.0099 + 0.6) / 24, 6);
    const attacked = lifeDays(b, 10, false);
    expect(attacked).toBeCloseTo(10000 / (0.6099 + 20) / 24, 6);
    expect(lifeDays(b, 10, true)).toBeGreaterThan(10 * attacked);
  });
});
