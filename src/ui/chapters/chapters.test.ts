import { describe, expect, it } from 'vitest';
import { chapterFromSearch, searchFor } from './chapters';

describe('chapterFromSearch', () => {
  it('defaults to home', () => {
    expect(chapterFromSearch('')).toEqual({ chapter: 'home' });
    expect(chapterFromSearch('?chapter=nope')).toEqual({ chapter: 'home' });
  });
  it('server wins over chapter', () => {
    expect(chapterFromSearch('?server=http://x&chapter=lab&level=2')).toEqual({ chapter: 'missions' });
  });
  it('reads valid chapters', () => {
    expect(chapterFromSearch('?chapter=sandbox')).toEqual({ chapter: 'sandbox' });
    expect(chapterFromSearch('?chapter=missions')).toEqual({ chapter: 'missions' });
  });
  it('home is not a valid chapter param value to select but yields home', () => {
    expect(chapterFromSearch('?chapter=home')).toEqual({ chapter: 'home' });
  });
  it('level only for lab', () => {
    expect(chapterFromSearch('?chapter=lab&level=3')).toEqual({ chapter: 'lab', level: 3 });
    expect(chapterFromSearch('?chapter=sandbox&level=3')).toEqual({ chapter: 'sandbox' });
  });
  it('rejects bad levels', () => {
    for (const l of ['0', '-1', '1.5', 'x', '']) expect(chapterFromSearch(`?chapter=lab&level=${l}`)).toEqual({ chapter: 'lab' });
  });
});

describe('searchFor', () => {
  it('leaves server urls unchanged', () => {
    expect(searchFor('?server=http://x&key=k', 'home')).toBe('?server=http://x&key=k');
  });
  it('sets and deletes chapter', () => {
    expect(searchFor('', 'sandbox')).toBe('?chapter=sandbox');
    expect(searchFor('?chapter=sandbox', 'home')).toBe('');
  });
  it('keeps unrelated params', () => {
    expect(searchFor('?a=1&chapter=lab&level=2', 'missions')).toBe('?a=1&chapter=missions');
    expect(searchFor('?a=1', 'home')).toBe('?a=1');
  });
  it('level only for lab with a level', () => {
    expect(searchFor('', 'lab', 4)).toBe('?chapter=lab&level=4');
    expect(searchFor('', 'lab')).toBe('?chapter=lab');
    expect(searchFor('', 'sandbox', 4)).toBe('?chapter=sandbox');
  });
});
