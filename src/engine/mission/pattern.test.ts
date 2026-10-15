import { describe, expect, it } from 'vitest';
import { motion, nextTransmission, predict, reportingPeriod } from './pattern';

// Synthetic track: one fix per minute, moving east at 1 km/min from the origin.
const eastward = [0, 1, 2].map((minute) => ({ minute, x: minute, y: 0 }));

describe('reportingPeriod', () => {
  it('finds a period of 5 on phase 3 in a clean series', () => {
    expect(reportingPeriod([3, 8, 13, 18, 23])).toEqual({ period: 5, phase: 3, score: 1 });
  });

  it('still finds period 5 with one stray minute', () => {
    const r = reportingPeriod([3, 8, 10, 13, 18, 23]);
    expect(r?.period).toBe(5);
    expect(r?.phase).toBe(3);
    expect(r?.score).toBeGreaterThanOrEqual(0.8);
  });

  it('needs at least three distinct minutes', () => {
    expect(reportingPeriod([5, 10])).toBeUndefined();
    expect(reportingPeriod([5, 5, 10, 10])).toBeUndefined();
  });

  it('counts a repeated minute once', () => {
    expect(reportingPeriod([3, 3, 8, 8, 13, 13, 18, 23])?.period).toBe(5);
  });
});

describe('nextTransmission', () => {
  it('gives the next minute on the phase after the last report', () => {
    expect(nextTransmission([3, 8, 13], 13)).toBe(18);
    expect(nextTransmission([3, 8, 13], 14)).toBe(18);
  });

  it('is undefined when no period is found', () => {
    expect(nextTransmission([5, 10], 10)).toBeUndefined();
  });
});

describe('motion', () => {
  it('gives 1 km per minute heading 90 for an eastward track', () => {
    const m = motion(eastward);
    expect(m?.speedKmPerMin).toBeCloseTo(1);
    expect(m?.headingDeg).toBeCloseTo(90);
  });

  it('gives heading 0 for a northward track', () => {
    const north = [0, 1, 2].map((minute) => ({ minute, x: 0, y: -minute }));
    expect(motion(north)?.headingDeg).toBeCloseTo(0);
  });

  it('is undefined with one fix or no elapsed time', () => {
    expect(motion([{ minute: 0, x: 0, y: 0 }])).toBeUndefined();
    expect(
      motion([
        { minute: 4, x: 0, y: 0 },
        { minute: 4, x: 1, y: 0 },
      ]),
    ).toBeUndefined();
  });
});

describe('predict', () => {
  it('adds 5 km to x when predicting 5 minutes ahead of an eastward track', () => {
    const p = predict(eastward, 7);
    expect(p?.x).toBeCloseTo(7);
    expect(p?.y).toBeCloseTo(0);
  });

  it('is undefined when there is no motion', () => {
    expect(predict([{ minute: 0, x: 0, y: 0 }], 5)).toBeUndefined();
  });
});
