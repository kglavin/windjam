// Order statistics for an archived game, read by scripts/games.ts. Pure: an archive record in, numbers out.
import type { OrderMessage, PlayerSide } from './types';

export type PerSide<T> = Record<PlayerSide, T>;

// The parts of an archive record this reads. Records written before `messages` and `units` existed lack them.
export interface ArchivedC2 {
  messages?: OrderMessage[];
  units?: { id: string; name: string; side: PlayerSide }[];
  console: PerSide<string[]>;
}

export interface C2Stats {
  sent: PerSide<number>;
  onTime: PerSide<number>;
  late: PerSide<number>;
  lost: PerSide<number>;
  meanDelayMin: PerSide<number | undefined>; // undefined when no order of that side was acted on
}

const LINE = /^\[T\+(\d+)\] (.*)$/;

// Minutes from sent to the first action on the order: the earliest console minute at or after arrival whose line
// starts with the receiving unit's name and is not that unit's receipt line.
function actionDelay(m: OrderMessage, lines: string[], name: string | undefined): number | undefined {
  if (m.arriveMin === undefined || !name) return undefined;
  const receipt = `${name}: order ${m.n} received:`;
  let first: number | undefined;
  for (const line of lines) {
    const hit = LINE.exec(line);
    if (!hit) continue;
    const minute = Number(hit[1]);
    const text = hit[2];
    if (minute < m.arriveMin || !text.startsWith(`${name}:`) || text.startsWith(receipt)) continue;
    if (first === undefined || minute < first) first = minute;
  }
  return first === undefined ? undefined : first - m.sentMin;
}

export function c2Stats(record: ArchivedC2): C2Stats | undefined {
  const messages = record.messages;
  if (!messages) return undefined;
  const names = new Map((record.units ?? []).map((u) => [u.id, u.name]));
  const stats: C2Stats = {
    sent: { blue: 0, red: 0 },
    onTime: { blue: 0, red: 0 },
    late: { blue: 0, red: 0 },
    lost: { blue: 0, red: 0 },
    meanDelayMin: { blue: undefined, red: undefined },
  };
  const delays: PerSide<number[]> = { blue: [], red: [] };
  for (const m of messages) {
    stats.sent[m.side] += 1;
    if (m.status === 'on time') stats.onTime[m.side] += 1;
    if (m.status === 'late') stats.late[m.side] += 1;
    if (m.status === 'lost') stats.lost[m.side] += 1;
    const d = actionDelay(m, record.console[m.side] ?? [], names.get(m.toId));
    if (d !== undefined) delays[m.side].push(d);
  }
  for (const side of ['blue', 'red'] as const) {
    const ds = delays[side];
    if (ds.length) stats.meanDelayMin[side] = ds.reduce((a, b) => a + b, 0) / ds.length;
  }
  return stats;
}
