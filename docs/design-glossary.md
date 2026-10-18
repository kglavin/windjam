# Design: glossary popups

Lesson texts mark technical terms. Clicking one opens a small card with a plain definition, the lesson that teaches
it, and a Wikipedia article to read more. A Glossary page on the level list shows every term.

## Decisions

D1. **Our definition first, the link second.** The card's definition is written in the lessons' own words and stands
alone; Wikipedia is pitched at engineers and may not open on a training network.

D2. **Wikipedia, whole articles.** Each entry names an English Wikipedia article title, checked to exist on
2026-10-18 through the Wikipedia API (canonical titles, no redirects, no section anchors, which break when articles
are edited).

D3. **Explicit markup.** `[[term]]` or `[[shown text|term]]` in a lesson text; `term` is an entry's id, term or alias.
`{…}` stays the placeholder syntax. An unknown term renders as plain text, and a test fails on it.

D4. **Click, not hover.** The card opens on click or tap, closes on Escape or a click elsewhere, so it works on touch
screens.

D5. **Where the marks are.** The first appearance of each term in each lesson's paragraphs. Worked steps, rules,
reveals and tasks are left unmarked. Very common words (frequency, bit, dB values) are not marked; transmitter,
receiver and antenna only in level 0.

## Files

| Path | Content |
|---|---|
| `src/engine/lab/glossary.ts` | `GLOSSARY` (id, term, aliases, definition, lesson, article), `richParts`, `plainText`, `wikiUrl` |
| `src/ui/lab/Rich.tsx` | `Rich` (text with marks), `GlossaryTerm` (the popup), `GlossaryPage` |
| `src/ui/lab/StagePanel.tsx` | Lesson paragraphs, steps, rules, tasks, hints, reveals, intro, debrief and checks render through `Rich` |
| `src/engine/lab/glossary.test.ts` | Unique names, every lesson reference and every mark resolves, markup parsing |

Tests that compare lesson text word for word compare `plainText`, the text as a reader sees it.

## Adding a term

Add an entry to `GLOSSARY` with a one or two sentence definition in plain words, the lesson that teaches it, and an
article title checked to exist; then mark its first appearance in each lesson that uses it.
