import { describe, expect, it } from 'vitest';
import { generateMap, loadMap, saveMap, type MapFile } from './map';

// A valid 2x2 map file; each error test edits a copy of it.
const base = (): MapFile => ({
  hexSizeKm: 1,
  cols: 2,
  rows: 2,
  tiles: [
    { col: 0, row: 0, terrain: 'plain', elevationM: 20 },
    { col: 1, row: 0, terrain: 'water', elevationM: 0 },
    { col: 0, row: 1, terrain: 'hill', elevationM: 300 },
    { col: 1, row: 1, terrain: 'mountain', elevationM: 900, peakM: 1100 },
  ],
});

describe('map file round trip', () => {
  it('generated map survives saveMap then loadMap', () => {
    const m = generateMap(1234, 32, 20, 0.5);
    const { map } = loadMap(saveMap(m));
    expect(map.tiles).toEqual(m.tiles);
    expect(map.cols).toEqual(m.cols);
    expect(map.rows).toEqual(m.rows);
    expect(map.hexSizeKm).toEqual(m.hexSizeKm);
  });

  it('survives a JSON.stringify and JSON.parse round trip', () => {
    const m = generateMap(1234, 32, 20, 0.5);
    const { map } = loadMap(JSON.parse(JSON.stringify(saveMap(m))));
    expect(map).toEqual(m);
  });

  it('keeps peakM when present and leaves it out of generated tiles', () => {
    const { map } = loadMap(base());
    const peaked = Object.values(map.tiles).find((t) => t.terrain === 'mountain');
    expect(peaked?.peakM).toBe(1100);
    expect(Object.values(map.tiles).filter((t) => t.peakM !== undefined)).toHaveLength(1);
    expect('peakM' in generateMap(1234, 32, 20, 0.5).tiles['0,0']).toBe(false);
  });

  it('writes tiles sorted by row then col, with peakM only when defined', () => {
    const file = saveMap(loadMap(base()).map);
    expect(file.tiles.map((t) => [t.row, t.col])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect('peakM' in file.tiles[0]).toBe(false);
    expect(file.tiles[3].peakM).toBe(1100);
  });

  it('carries home through loadMap and saveMap', () => {
    const home = { col0: 1, row0: 0, cols: 1, rows: 2 };
    const { home: loaded } = loadMap({ ...base(), home });
    expect(loaded).toEqual(home);
    expect(saveMap(loadMap({ ...base(), home }).map, loaded).home).toEqual(home);
  });

  it('returns no home when the file has none', () => {
    expect(loadMap(base()).home).toBeUndefined();
    expect(saveMap(loadMap(base()).map).home).toBeUndefined();
  });
});

describe('loadMap validation', () => {
  const cases: { name: string; edit: (f: MapFile) => MapFile; message: RegExp }[] = [
    { name: 'hexSizeKm of zero', edit: (f) => ({ ...f, hexSizeKm: 0 }), message: /hexSizeKm must be positive/ },
    { name: 'negative hexSizeKm', edit: (f) => ({ ...f, hexSizeKm: -1 }), message: /hexSizeKm must be positive/ },
    { name: 'zero cols', edit: (f) => ({ ...f, cols: 0 }), message: /cols must be a positive integer/ },
    { name: 'fractional rows', edit: (f) => ({ ...f, rows: 1.5 }), message: /rows must be a positive integer/ },
    {
      name: 'tile col past the grid',
      edit: (f) => ({ ...f, tiles: [...f.tiles.slice(0, 3), { ...f.tiles[3], col: 2 }] }),
      message: /tile \(2,1\) is outside/,
    },
    {
      name: 'tile row below the grid',
      edit: (f) => ({ ...f, tiles: [{ ...f.tiles[0], row: -1 }, ...f.tiles.slice(1)] }),
      message: /tile \(0,-1\) is outside/,
    },
    {
      name: 'unknown terrain',
      edit: (f) => ({ ...f, tiles: [{ ...f.tiles[0], terrain: 'swamp' as never }, ...f.tiles.slice(1)] }),
      message: /unknown terrain "swamp"/,
    },
    {
      name: 'duplicate tile',
      edit: (f) => ({ ...f, tiles: [f.tiles[0], f.tiles[0], f.tiles[2], f.tiles[3]] }),
      message: /tile \(0,0\) appears twice/,
    },
    { name: 'too few tiles', edit: (f) => ({ ...f, tiles: f.tiles.slice(0, 3) }), message: /expected 4 tiles/ },
    {
      name: 'home past the grid',
      edit: (f) => ({ ...f, home: { col0: 1, row0: 0, cols: 2, rows: 1 } }),
      message: /home does not fit/,
    },
    {
      name: 'home with zero size',
      edit: (f) => ({ ...f, home: { col0: 0, row0: 0, cols: 0, rows: 1 } }),
      message: /home does not fit/,
    },
  ];

  it.each(cases)('throws for $name', ({ edit, message }) => {
    expect(() => loadMap(edit(base()))).toThrow(message);
  });
});
