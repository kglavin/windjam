/// <reference types="vite/client" />
// The mission scripts in missions/, bundled so the app can load one without a paste (ScriptBar).
const files = import.meta.glob('../../missions/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface BundledScript {
  name: string; // the file name, e.g. 01-two-squads-triangulate.txt
  text: string;
}

export const BUNDLED_SCRIPTS: BundledScript[] = Object.keys(files)
  .sort()
  .map((path) => ({ name: path.split('/').pop()!, text: files[path] }));
