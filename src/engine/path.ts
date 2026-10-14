import { type Hex, hexDistance, hexKey, hexNeighbors } from './hex';
import { getTile, inBounds } from './map';
import { canEnter } from './terrain';
import { type World, unitAt } from './world';

// Shortest ground route for a unit: A* over the hex grid, through terrain it may enter, around other units.
// Returns the hexes after the start, ending at `to`, or undefined when no route exists within the search budget.
export function findPath(world: World, unitId: string, to: Hex, maxNodes = 40_000): Hex[] | undefined {
  const unit = world.units.find((u) => u.id === unitId);
  if (!unit) return undefined;
  const passable = (h: Hex) => {
    if (!inBounds(world.map, h)) return false;
    const tile = getTile(world.map, h);
    if (!tile || !canEnter(tile.terrain, unit.kind)) return false;
    const occupant = unitAt(world, h);
    return !occupant || occupant.id === unitId;
  };
  if (!passable(to)) return undefined;
  const start = unit.pos;
  const startKey = hexKey(start);
  const goalKey = hexKey(to);
  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[startKey, 0]]);
  const hexes = new Map<string, Hex>([[startKey, start]]);
  // A small binary heap keyed on f = g + h.
  const open: { key: string; f: number }[] = [{ key: startKey, f: hexDistance(start, to) }];
  const push = (item: { key: string; f: number }) => {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p].f <= open[i].f) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && open[l].f < open[m].f) m = l;
        if (r < open.length && open[r].f < open[m].f) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };
  const closed = new Set<string>();
  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    const { key } = pop();
    if (closed.has(key)) continue;
    closed.add(key);
    expanded++;
    if (key === goalKey) {
      const path: Hex[] = [];
      for (let k = goalKey; k !== startKey; k = cameFrom.get(k)!) path.push(hexes.get(k)!);
      return path.reverse();
    }
    const cur = hexes.get(key)!;
    const gc = g.get(key)!;
    for (const n of hexNeighbors(cur)) {
      const nk = hexKey(n);
      if (closed.has(nk) || !passable(n)) continue;
      const tentative = gc + 1;
      if (tentative >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, tentative);
      hexes.set(nk, n);
      cameFrom.set(nk, key);
      push({ key: nk, f: tentative + hexDistance(n, to) });
    }
  }
  return undefined;
}
