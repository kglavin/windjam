// Level progress kept in localStorage. Every access is guarded: the page works without storage.
const KEY = 'windjam.lab.progress';

export type Progress = Record<number, { best: number; passed: boolean }>;

export function loadProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return {};
    const out: Progress = {};
    for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
      const r = e as { best?: unknown; passed?: unknown };
      if (typeof r?.best === 'number' && Number.isFinite(r.best)) out[Number(k)] = { best: r.best, passed: r.passed === true };
    }
    return out;
  } catch {
    return {};
  }
}

// Keeps the best score; a pass is never lost.
export function recordScore(levelId: number, score: number, passed: boolean): Progress {
  const all = loadProgress();
  const prev = all[levelId];
  all[levelId] = { best: Math.max(prev?.best ?? 0, score), passed: passed || !!prev?.passed };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the score is shown but not kept
  }
  return all;
}
