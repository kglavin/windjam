import { type Hex, hexKey, offsetToAxial, axialToOffset } from './hex';
import { createRng, type Rng } from './rng';
import { TERRAIN, type TerrainType } from './terrain';

export interface Tile {
  hex: Hex;
  terrain: TerrainType;
  elevationM: number; // ground height above sea level
  peakM?: number; // highest ground in the hex; real terrain only, generated maps leave it undefined
}

export interface HexMap {
  cols: number;
  rows: number;
  hexSizeKm: number; // centre-to-centre distance between neighbours
  tiles: Record<string, Tile>;
}

export const getTile = (map: HexMap, h: Hex): Tile | undefined => map.tiles[hexKey(h)];

export function inBounds(map: HexMap, h: Hex): boolean {
  const { col, row } = axialToOffset(h);
  return col >= 0 && col < map.cols && row >= 0 && row < map.rows;
}

// Value noise on a lattice, smoothstep-interpolated and summed over octaves.
function makeNoise(rng: Rng, latticeSize: number) {
  const grid: number[] = Array.from({ length: latticeSize * latticeSize }, () => rng());
  const at = (x: number, y: number) =>
    grid[((y % latticeSize) + latticeSize) % latticeSize * latticeSize + (((x % latticeSize) + latticeSize) % latticeSize)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = smooth(x - x0);
    const sy = smooth(y - y0);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  return (x: number, y: number) => {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      total += sample(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

export function generateMap(seed: number, cols = 32, rows = 20, hexSizeKm = 1): HexMap {
  const rng = createRng(seed);
  const heightNoise = makeNoise(rng, 64);
  const moistureNoise = makeNoise(rng, 64);
  const samples: { hex: Hex; h: number; m: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Sample noise in km at the true hex centre (odd rows sit half a hex right), so terrain
      // features keep their real size whatever the hex size. Features span about 7 km.
      const x = ((col + (row & 1) * 0.5) * hexSizeKm) / 7;
      const y = (row * 0.866 * hexSizeKm) / 7;
      samples.push({ hex: offsetToAxial(col, row), h: heightNoise(x, y), m: moistureNoise(x + 31.7, y + 17.3) });
    }
  }

  // Thresholds are percentiles of the noise, so every seed gets the same terrain mix.
  const sortedH = samples.map((s) => s.h).sort((a, b) => a - b);
  const sortedM = samples.map((s) => s.m).sort((a, b) => a - b);
  const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const waterTop = pct(sortedH, 0.1);
  const lowlandTop = pct(sortedH, 0.65);
  const hillTop = pct(sortedH, 0.9);
  const forestMin = pct(sortedM, 0.6);
  const maxH = sortedH[sortedH.length - 1];
  const lerp = (h: number, h0: number, h1: number, e0: number, e1: number) =>
    e0 + ((h - h0) / Math.max(h1 - h0, 1e-9)) * (e1 - e0);

  const tiles: Record<string, Tile> = {};
  for (const { hex, h, m } of samples) {
    let terrain: TerrainType;
    let elevationM: number;
    if (h < waterTop) {
      terrain = 'water';
      elevationM = 0;
    } else if (h < lowlandTop) {
      terrain = m > forestMin ? 'forest' : 'plain';
      elevationM = lerp(h, waterTop, lowlandTop, 20, 150);
    } else if (h < hillTop) {
      terrain = 'hill';
      elevationM = lerp(h, lowlandTop, hillTop, 150, 500);
    } else {
      terrain = 'mountain';
      elevationM = lerp(h, hillTop, maxH, 500, 1500);
    }
    tiles[hexKey(hex)] = { hex, terrain, elevationM: Math.round(elevationM) };
  }
  return { cols, rows, hexSizeKm, tiles };
}

// Map file as written by scripts and external rasters. Tiles use offset (col, row) coordinates;
// the engine converts them to axial hexes on load.
export interface MapFile {
  hexSizeKm: number;
  cols: number;
  rows: number;
  home?: { col0: number; row0: number; cols: number; rows: number };
  tiles: { col: number; row: number; terrain: TerrainType; elevationM: number; peakM?: number }[];
}

const TERRAIN_TYPES = Object.keys(TERRAIN) as TerrainType[];
const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;

export function loadMap(file: MapFile): { map: HexMap; home?: MapFile['home'] } {
  if (!(file.hexSizeKm > 0)) throw new Error(`hexSizeKm must be positive, got ${file.hexSizeKm}`);
  if (!isPositiveInt(file.cols)) throw new Error(`cols must be a positive integer, got ${file.cols}`);
  if (!isPositiveInt(file.rows)) throw new Error(`rows must be a positive integer, got ${file.rows}`);

  const tiles: Record<string, Tile> = {};
  const seen = new Set<string>();
  for (const t of file.tiles) {
    const { col, row } = t;
    if (!(Number.isInteger(col) && Number.isInteger(row)) || col < 0 || col >= file.cols || row < 0 || row >= file.rows) {
      throw new Error(`tile (${col},${row}) is outside the ${file.cols}x${file.rows} grid`);
    }
    if (!TERRAIN_TYPES.includes(t.terrain)) throw new Error(`tile (${col},${row}) has unknown terrain "${t.terrain}"`);
    const cell = `${col},${row}`;
    if (seen.has(cell)) throw new Error(`tile (${col},${row}) appears twice`);
    seen.add(cell);
    const hex = offsetToAxial(col, row);
    tiles[hexKey(hex)] = {
      hex,
      terrain: t.terrain,
      elevationM: t.elevationM,
      ...(t.peakM !== undefined ? { peakM: t.peakM } : {}),
    };
  }
  if (file.tiles.length !== file.cols * file.rows) {
    throw new Error(`expected ${file.cols * file.rows} tiles (cols x rows), got ${file.tiles.length}`);
  }

  const h = file.home;
  if (h) {
    const fits =
      Number.isInteger(h.col0) && Number.isInteger(h.row0) && h.col0 >= 0 && h.row0 >= 0 &&
      isPositiveInt(h.cols) && isPositiveInt(h.rows) &&
      h.col0 + h.cols <= file.cols && h.row0 + h.rows <= file.rows;
    if (!fits) throw new Error(`home does not fit inside the ${file.cols}x${file.rows} grid`);
  }

  const map: HexMap = { cols: file.cols, rows: file.rows, hexSizeKm: file.hexSizeKm, tiles };
  return { map, home: file.home };
}

export function saveMap(map: HexMap, home?: MapFile['home']): MapFile {
  const tiles = Object.values(map.tiles)
    .map((t) => {
      const { col, row } = axialToOffset(t.hex);
      return { col, row, terrain: t.terrain, elevationM: t.elevationM, ...(t.peakM !== undefined ? { peakM: t.peakM } : {}) };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return {
    hexSizeKm: map.hexSizeKm,
    cols: map.cols,
    rows: map.rows,
    ...(home ? { home } : {}),
    tiles,
  };
}
