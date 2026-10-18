import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { glossaryEntry } from '../../engine/lab/glossary';
import { GlossaryPage, Rich, taughtLabel } from './Rich';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');

describe('Rich', () => {
  it('shows marked terms as closed buttons and the rest as text', () => {
    const html = renderToString(createElement(Rich, { text: 'A [[jammer]] raises [[J/S|js]].' }));
    expect(html).toContain('A <span class="gloss"><button type="button" class="gloss-term" aria-expanded="false">jammer</button></span> raises');
    expect(html).toContain('>J/S</button>');
    expect(html).not.toContain('gloss-pop');
  });

  it('names the lesson that teaches a term', () => {
    expect(taughtLabel(glossaryEntry('mixer')!)).toBe('Level 0, D2: From the air to 0 MHz');
    expect(taughtLabel(glossaryEntry('gp')!)).toBe('Level 1, A3: The receiver gets the bits back');
  });

  it('lists every term on the glossary page with its Wikipedia link', () => {
    const html = renderToString(createElement(GlossaryPage, { onBack: () => {} }));
    expect(html).toContain('<dt>processing gain</dt>');
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Process_gain"');
    expect(html).toContain('Taught in Level 0, J1: Jammer to signal ratio');
  });
});
