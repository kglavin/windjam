import { describe, expect, it } from 'vitest';
import { BITS, despreadData, spreadingData } from './data';

describe('lesson figure data', () => {
  it('sent chips are bit x code, 28 of them', () => {
    const d = spreadingData();
    expect(d.sent).toHaveLength(28);
    d.sent.forEach((v, k) => expect(v).toBe(d.code[k] * BITS[Math.floor(k / 7)]));
  });
  it('the received sums come out near +7, -7, -7, +7', () => {
    const { sums } = despreadData();
    sums.forEach((s, i) => {
      expect(Math.sign(s)).toBe(BITS[i]);
      expect(Math.abs(s)).toBeGreaterThan(4);
      expect(Math.abs(s)).toBeLessThan(10);
    });
    expect(despreadData()).toEqual(despreadData());
  });
});
