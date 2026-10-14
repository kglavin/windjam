// Tabulate archived games: npm run games [-- games/]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'games';
let files: string[] = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
} catch {
  console.log(`No ${dir}/ folder yet. Finished games are archived there by the server.`);
  process.exit(0);
}
if (files.length === 0) {
  console.log(`No games in ${dir}/ yet.`);
  process.exit(0);
}

interface Record_ {
  mission: string;
  seed: number;
  turnMin: number;
  turns: number;
  endedAt: number;
  winner: string;
  finishedAt: string;
  orders: { side: string }[];
  summary: { blue: string[]; red: string[] };
}

const rows = files.map((f) => {
  const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record_;
  const blueOrders = r.orders.filter((o) => o.side === 'blue').length;
  const redOrders = r.orders.filter((o) => o.side === 'red').length;
  return { file: f, ...r, blueOrders, redOrders };
});

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(`${pad('finished', 20)} ${pad('mission', 8)} ${pad('seed', 7)} ${pad('turn', 5)} ${pad('end', 5)} ${pad('winner', 7)} ${pad('orders b/r', 11)} blue summary`);
for (const r of rows) {
  console.log(
    `${pad(r.finishedAt.slice(0, 19).replace('T', ' '), 20)} ${pad(r.mission, 8)} ${pad(r.seed, 7)} ${pad(r.turnMin, 5)} ${pad(`T+${r.endedAt}`, 5)} ${pad(r.winner, 7)} ${pad(`${r.blueOrders}/${r.redOrders}`, 11)} ${r.summary.blue[0] ?? ''}`,
  );
}
const tally = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.winner]: (a[r.winner] ?? 0) + 1 }), {});
console.log(`\n${rows.length} game${rows.length === 1 ? '' : 's'}: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')}`);
