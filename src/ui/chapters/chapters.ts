export type Chapter = 'home' | 'sandbox' | 'missions' | 'lab';

export const CHAPTERS: { id: Exclude<Chapter, 'home'>; title: string; blurb: string }[] = [
  { id: 'sandbox', title: 'Sandbox map', blurb: 'The hex world: links, coverage, jamming and the analysis tools.' },
  { id: 'missions', title: 'Missions', blurb: 'Five missions against a hidden enemy, played at the console or by agents.' },
  { id: 'lab', title: 'Link lab', blurb: 'Observe, characterise and attack an emulated spread-spectrum link.' },
];

const IDS: string[] = CHAPTERS.map((c) => c.id);

export function chapterFromSearch(search: string): { chapter: Chapter; level?: number } {
  const p = new URLSearchParams(search);
  if (p.has('server')) return { chapter: 'missions' };
  const c = p.get('chapter');
  if (!c || !IDS.includes(c)) return { chapter: 'home' };
  if (c !== 'lab') return { chapter: c as Chapter };
  const raw = p.get('level');
  const level = raw !== null && /^\d+$/.test(raw) ? Number(raw) : 0;
  return level > 0 ? { chapter: 'lab', level } : { chapter: 'lab' };
}

export function searchFor(current: string, chapter: Chapter, level?: number): string {
  const p = new URLSearchParams(current);
  if (p.has('server')) return current;
  if (chapter === 'home') p.delete('chapter');
  else p.set('chapter', chapter);
  if (chapter === 'lab' && level !== undefined) p.set('level', String(level));
  else p.delete('level');
  const s = p.toString();
  return s ? `?${s}` : '';
}
