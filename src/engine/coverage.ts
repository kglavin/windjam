import type { Hex } from './hex';
import type { HexMap } from './map';
import { analyzePath, hexDistanceKm, wattsToDbm } from './rf';
import { jammingAt } from './ew';
import type { Net, Unit } from './units';

export interface CoverageTx {
  pos: Hex;
  powerW: number;
  antennaHeightM: number;
  gainDbi: number;
  freqMHz: number;
}

export interface CoverageRx {
  antennaHeightM: number;
  gainDbi: number;
}

export interface CoverageCell {
  rxDbm: number;
  lineOfSight: boolean;
}

// Received power at every hex within maxRangeKm of one transmitter, using the same path model as the links.
// Hexes beyond the range are left out.
export function coverageMap(map: HexMap, tx: CoverageTx, rx: CoverageRx, maxRangeKm = Infinity): Record<string, CoverageCell> {
  const eirpDbm = wattsToDbm(tx.powerW) + tx.gainDbi;
  const out: Record<string, CoverageCell> = {};
  for (const [key, tile] of Object.entries(map.tiles)) {
    if (hexDistanceKm(map, tx.pos, tile.hex) > maxRangeKm) continue;
    const path = analyzePath(map, tx.pos, tx.antennaHeightM, tile.hex, rx.antennaHeightM, tx.freqMHz);
    out[key] = { rxDbm: eirpDbm + rx.gainDbi - path.totalLossDb, lineOfSight: path.lineOfSight };
  }
  return out;
}

export interface JsCell extends CoverageCell {
  jammerDbm: number; // in-channel jamming while hitting, -Infinity if none
  jsDb: number; // in-channel J/S while hitting
  fraction: number; // share of time the jammer is hitting
  avgJsDb: number; // time-averaged J/S: J/S + 10 log10(fraction)
}

// What one jammer, in its current mode, does to a receiver at every hex listening to `tx` on `net`.
// tx.freqMHz should be net.freqMHz so spot jamming lines up with the channel.
// Uses the same rules as the link budgets, including band overlap, hop coverage and the follower race.
export function jsCoverageMap(
  map: HexMap,
  tx: CoverageTx,
  rx: CoverageRx,
  jammer: Unit,
  net: Net,
  nets: Net[],
  maxRangeKm = Infinity,
): Record<string, JsCell> {
  const signal = coverageMap(map, tx, rx, maxRangeKm);
  const txUnit = probeUnit('coverage-tx', tx.pos, tx.antennaHeightM, tx.gainDbi, tx.powerW);
  const out: Record<string, JsCell> = {};
  for (const [key, tile] of Object.entries(map.tiles)) {
    const s = signal[key];
    if (!s) continue;
    const rxUnit = probeUnit('coverage-rx', tile.hex, rx.antennaHeightM, rx.gainDbi, 0);
    const [c] = jammingAt(map, txUnit, rxUnit, net, [jammer], nets);
    const jammerDbm = c ? c.powerDbm : -Infinity;
    const fraction = c ? c.fraction : 0;
    const jsDb = jammerDbm - s.rxDbm;
    out[key] = { ...s, jammerDbm, jsDb, fraction, avgJsDb: fraction > 0 ? jsDb + 10 * Math.log10(fraction) : -Infinity };
  }
  return out;
}

// A stand-in radio at a hex, so the jamming rules can be applied to arbitrary points.
function probeUnit(id: string, pos: Hex, antennaHeightM: number, gainDbi: number, powerW: number): Unit {
  return { id, name: id, side: 'neutral', kind: 'squad', pos, radio: { powerW, antennaHeightM, gainDbi, noiseFigureDb: 6 } };
}
