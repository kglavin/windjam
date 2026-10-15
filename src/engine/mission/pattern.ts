// Pattern of life for a side's picture of an emitter: when it reports, and where it is going (design note part 6, WP-2.6).
// Pure functions. Positions are km, x east and y south, as hexToKm returns them.

const MIN_PERIOD = 2;
const MAX_PERIOD = 15;
const MIN_MINUTES = 3;
const MIN_SCORE = 0.6;

export interface ReportingPeriod {
  period: number; // minutes between transmissions
  phase: number; // minute mod period on which they fall
  score: number; // share of distinct minutes on that phase
}

export interface KmFix {
  minute: number;
  x: number;
  y: number;
}

export interface Motion {
  speedKmPerMin: number;
  headingDeg: number; // clockwise from north
}

// Modulo that stays in 0..p for negative minutes.
const mod = (a: number, p: number): number => ((a % p) + p) % p;

const byMinute = (fixes: KmFix[]): KmFix[] => [...fixes].sort((a, b) => a.minute - b.minute);

// A repeated minute is one transmission, so duplicates do not count towards the period.
export function reportingPeriod(minutes: number[]): ReportingPeriod | undefined {
  const mins = [...new Set(minutes)];
  if (mins.length < MIN_MINUTES) return undefined;
  let best: ReportingPeriod | undefined;
  let bestCount = 0;
  for (let p = MIN_PERIOD; p <= MAX_PERIOD; p++) {
    const counts = new Map<number, number>();
    for (const m of mins) counts.set(mod(m, p), (counts.get(mod(m, p)) ?? 0) + 1);
    let phase = 0;
    let count = 0;
    for (const [ph, c] of counts) {
      if (c > count || (c === count && ph < phase)) {
        phase = ph;
        count = c;
      }
    }
    // Strictly better only: a multiple of the true period scores the same, and the smallest period should win.
    if (count > bestCount) {
      bestCount = count;
      best = { period: p, phase, score: count / mins.length };
    }
  }
  return best && best.score >= MIN_SCORE ? best : undefined;
}

export function nextTransmission(minutes: number[], afterMinute: number): number | undefined {
  const r = reportingPeriod(minutes);
  if (!r) return undefined;
  const from = afterMinute + 1;
  return from + mod(r.phase - from, r.period);
}

// Speed and heading from the last three fixes (two if there are only two).
export function motion(fixes: KmFix[]): Motion | undefined {
  if (fixes.length < 2) return undefined;
  const used = byMinute(fixes).slice(-3);
  const a = used[0];
  const b = used[used.length - 1];
  const dt = b.minute - a.minute;
  if (dt === 0) return undefined;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // y points south, so north is -y. atan2(east, north) gives a bearing clockwise from north.
  const headingDeg = mod((Math.atan2(dx, -dy) * 180) / Math.PI, 360);
  return { speedKmPerMin: Math.hypot(dx, dy) / dt, headingDeg };
}

export function predict(fixes: KmFix[], atMinute: number): { x: number; y: number } | undefined {
  const m = motion(fixes);
  if (!m) return undefined;
  const last = byMinute(fixes)[fixes.length - 1];
  const dist = m.speedKmPerMin * (atMinute - last.minute);
  const h = (m.headingDeg * Math.PI) / 180;
  return { x: last.x + dist * Math.sin(h), y: last.y - dist * Math.cos(h) };
}
