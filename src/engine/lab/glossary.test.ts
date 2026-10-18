import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSS_MARK, glossaryEntry, plainText, richParts, wikiUrl } from './glossary';
import { LEVELS, flatSteps } from './levels';

// Every text a lesson step shows, for checking its [[glossary]] marks.
const texts = LEVELS.flatMap((l) => [
  l.intro,
  l.debrief,
  ...flatSteps(l).flatMap(({ step: s }) => [
    ...('paragraphs' in s ? s.paragraphs ?? [] : []),
    ...('steps' in s ? s.steps ?? [] : []),
    ...('rule' in s && s.rule ? [s.rule] : []),
    ...('task' in s && typeof s.task === 'string' ? [s.task] : []),
    ...('hint' in s && s.hint ? [s.hint] : []),
  ]),
]);

describe('glossary', () => {
  it('has unique ids and names, a definition and a Wikipedia article for every term', () => {
    // A name (id, term or alias) may repeat within one entry but must not belong to two.
    const names = GLOSSARY.flatMap((e) => [...new Set([e.id, e.term.toLowerCase(), ...(e.aliases ?? [])])]);
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    expect(new Set(names).size).toBe(names.length);
    for (const e of GLOSSARY) {
      expect(e.short.length, e.id).toBeGreaterThan(20);
      expect(wikiUrl(e.wiki), e.id).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/);
    }
  });

  it('points each term at a lesson that exists', () => {
    for (const e of GLOSSARY.filter((x) => x.taught)) {
      const level = LEVELS.find((l) => l.id === e.taught!.level);
      expect(level && flatSteps(level).some((f) => f.step.id === e.taught!.step), e.id).toBe(true);
    }
  });

  it('every [[mark]] in the lesson texts names a glossary term', () => {
    let count = 0;
    for (const t of texts) {
      for (const m of t.matchAll(GLOSS_MARK)) {
        expect(glossaryEntry(m[2] ?? m[1]), m[0]).toBeDefined();
        count++;
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  it('splits a text into words and terms, and strips the marks for plain text', () => {
    const t = 'A [[jammer]] raises [[J/S|js]] at the [[receiver]].';
    expect(plainText(t)).toBe('A jammer raises J/S at the receiver.');
    const parts = richParts(t);
    expect(parts.filter((p) => typeof p !== 'string').map((p) => (typeof p === 'string' ? p : p.entry.id))).toEqual(['jammer', 'js', 'receiver']);
    expect(richParts('no marks')).toEqual(['no marks']);
    expect(richParts('an [[unknownterm]] stays text')).toEqual(['an ', 'unknownterm', ' stays text']);
  });
});
