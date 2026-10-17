import { describe, expect, it } from 'vitest';
import { evaluate, formatResult } from './calc';

const val = (s: string, ans?: number) => {
  const r = evaluate(s, ans);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.value;
};
const err = (s: string, ans?: number) => {
  const r = evaluate(s, ans);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('calc', () => {
  it('numbers and the four operations', () => {
    expect(val('1e6')).toBe(1e6);
    expect(val('2.5e-3')).toBe(0.0025);
    expect(val('.5+1')).toBe(1.5);
    expect(val('31.5*2')).toBe(63);
    expect(val('2000/63')).toBeCloseTo(31.746, 3);
    expect(val('7 × 3 ÷ 21')).toBe(1);
    expect(val('1 − 3')).toBe(-2);
  });
  it('precedence, power, unary minus and parentheses', () => {
    expect(val('2+3*4')).toBe(14);
    expect(val('(2+3)*4')).toBe(20);
    expect(val('2^3^2')).toBe(512);
    expect(val('-2^2')).toBe(-4);
    expect(val('2^-1')).toBe(0.5);
    expect(val('--3')).toBe(3);
    expect(val('10-3-2')).toBe(5);
    expect(val('8/2/2')).toBe(2);
  });
  it('functions and ans', () => {
    expect(val('10*log10(63)')).toBeCloseTo(17.993, 3);
    expect(val('log10(1000)')).toBeCloseTo(3, 12);
    expect(val('ln(1)')).toBe(0);
    expect(val('sqrt(16)+1')).toBe(5);
    expect(val('ans*2', 21)).toBe(42);
    expect(val('LOG10(100)')).toBeCloseTo(2, 12);
  });
  it('errors are messages, never throws', () => {
    expect(err('')).toMatch(/Type/);
    expect(err('1/0')).toBe('Divide by zero');
    expect(err('2+')).toMatch(/Unfinished/);
    expect(err('(2+3')).toBe('Missing )');
    expect(err('2 3')).toMatch(/Unexpected/);
    expect(err('foo(2)')).toMatch(/Unknown/);
    expect(err('log10')).toMatch(/needs/);
    expect(err('log10(0)')).toMatch(/positive/);
    expect(err('sqrt(-1)')).toMatch(/negative/);
    expect(err('ans')).toMatch(/No previous/);
    expect(err('2 $ 3')).toMatch(/Unexpected/);
    expect(err('10^1000')).toBe('Not a number');
    expect(err('eval(1)')).toMatch(/Unknown/);
  });
  it('formats results', () => {
    expect(formatResult(1 / 3)).toBe('0.3333333333');
    expect(formatResult(63)).toBe('63');
  });
});
