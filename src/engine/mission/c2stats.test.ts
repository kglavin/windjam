import { describe, expect, it } from 'vitest';
import { analysisCounts, askCounts, c2Stats, type ArchivedC2 } from './c2stats';
import type { OrderMessage } from './types';

const units = [
  { id: 'b-sq1', name: 'Blue Squad 1', side: 'blue' as const },
  { id: 'b-sq2', name: 'Blue Squad 2', side: 'blue' as const },
  { id: 'b-sq3', name: 'Blue Squad 3', side: 'blue' as const },
];

// Three orders from blue: n1 on time and acted on two minutes after arrival, n2 late and acted on five minutes after
// it was sent, n3 lost. sq1 logs its receipt at T+05 and its action at T+07; the receipt line must not count as action.
const messages: OrderMessage[] = [
  { n: 1, side: 'blue', fromId: 'b-hq', toId: 'b-sq1', text: 'df e 5', sentMin: 5, arriveMin: 5, ackMin: 5, status: 'on time' },
  { n: 2, side: 'blue', fromId: 'b-hq', toId: 'b-sq2', text: 'df n 5', sentMin: 10, arriveMin: 12, ackMin: 12, status: 'late' },
  { n: 3, side: 'blue', fromId: 'b-hq', toId: 'b-sq3', text: 'df w 5', sentMin: 10, status: 'lost' },
];

const record: ArchivedC2 = {
  messages,
  units,
  console: {
    blue: [
      '[T+05] Blue Squad 1: order 1 received: df e 5',
      '[T+05] HQ: order 1 acknowledged by Blue Squad 1.',
      '[T+07] Blue Squad 1: DF east (45°-135°) for 5 min.',
      '[T+12] Blue Squad 2: order 2 received: df n 5',
      '[T+15] Blue Squad 2: DF north (315°-45°) for 5 min.',
    ],
    red: [],
  },
};

describe('c2Stats', () => {
  it('counts orders by side and status, and measures sent to first action', () => {
    const s = c2Stats(record);
    expect(s?.sent).toEqual({ blue: 3, red: 0 });
    expect(s?.onTime).toEqual({ blue: 1, red: 0 });
    expect(s?.late).toEqual({ blue: 1, red: 0 });
    expect(s?.lost).toEqual({ blue: 1, red: 0 });
    // sq1: acted at T+07, sent at T+05 gives 2. sq2: acted at T+15, sent at T+10 gives 5. Mean 3.5.
    expect(s?.meanDelayMin).toEqual({ blue: 3.5, red: undefined });
  });

  it('gives no delay for an order that never arrived or was never acted on', () => {
    const s = c2Stats({ ...record, messages: [messages[2]], console: { blue: [], red: [] } });
    expect(s?.lost).toEqual({ blue: 1, red: 0 });
    expect(s?.meanDelayMin.blue).toBeUndefined();
  });

  it('returns undefined for a record written before messages existed', () => {
    expect(c2Stats({ console: { blue: [], red: [] } })).toBeUndefined();
  });
});

describe('analysisCounts and askCounts', () => {
  it('counts /analyse calls by their side parameter and ignores other paths and bad sides', () => {
    const calls = [{ path: '/analyse/fix?side=blue&track=E1' }, { path: '/analyse/exposure?side=blue' }, { path: '/analyse/path?side=red&from=1,1' }, { path: '/analyse/fix' }, { path: '/state?side=blue' }, { path: '/analyse/fix?side=green' }];
    expect(analysisCounts(calls)).toEqual({ blue: 2, red: 1 });
  });

  it('counts taskings by side', () => {
    expect(askCounts([{ side: 'blue' }, { side: 'blue' }, { side: 'red' }])).toEqual({ blue: 2, red: 1 });
    expect(askCounts([])).toEqual({ blue: 0, red: 0 });
  });
});
