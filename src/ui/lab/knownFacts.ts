// The "What you know" card: what the player has confirmed about the enemy link, or what is established
// about the practice link, with the player's own first entry beside each confirmed value.
import { type FlatStep, type KnownLinkInfo, type Truth, berText } from '../../engine/lab/levels';
import { berBpsk, undb } from '../../engine/lab/theory';
import type { StepState } from './levelState';

export interface FactRow {
  label: string;
  value: string | null; // null: not known yet
  you?: { text: string; ok: boolean };
}

export interface FactsCard {
  heading: string;
  rows: FactRow[];
}

interface Facts {
  chipRateMcps: number;
  n: number;
  periodUs: number;
  gpDb: number;
  bitRateKbps: number;
}

const trim1 = (v: number) => String(Number(v.toFixed(1)));
const sig3 = (v: number) => String(Number(v.toPrecision(3)));

export const factsOfTruth = (t: Truth): Facts => ({
  chipRateMcps: t.chipRateMcps,
  n: t.n,
  periodUs: t.n / t.chipRateMcps,
  gpDb: t.gpDb,
  bitRateKbps: t.bitRateKbps,
});

// Rows, each fed by one field of one step.
const SOURCES = {
  enemy: { chipRate: ['C3', 'chipRate'], period: ['D3', 'period'], length: ['D3', 'length'], gp: ['E3', 'gpDb'], bitRate: ['E3', 'bitRate'] },
  practice: { chipRate: ['C2', 'chipRate'], period: ['D2', 'period'], length: ['D2', 'length'], gp: ['E2', 'gpDb'], bitRate: ['E2', 'bitRate'] },
} as const;

// `shownIndex` is the flat index of the step on screen. For the practice link a value is also known once the
// player has moved past the step that establishes it (the link persists across the practice steps).
export function knownFacts(
  mode: 'enemy' | 'practice',
  flat: FlatStep[],
  states: StepState[],
  shownIndex: number,
  facts: Facts | KnownLinkInfo,
): FactsCard {
  const src = SOURCES[mode];
  const indexOf = (id: string) => flat.findIndex((f) => f.step.id === id);
  const lookup = (key: keyof typeof src) => {
    const [stepId, fieldId] = src[key];
    const i = indexOf(stepId);
    const st = i >= 0 ? states[i] : undefined;
    const r = st?.fields?.[fieldId];
    const first = st?.first?.[fieldId] ?? (r ? { value: r.value, ok: r.ok } : undefined);
    let known: boolean;
    if (mode === 'enemy') known = !!r;
    else known = shownIndex > i || !!st?.worked || !!r?.ok;
    return { known, first };
  };
  const you = (key: keyof typeof src, fmt: (v: number) => string) => {
    const { first } = lookup(key);
    return first ? { text: `you: ${fmt(first.value)}`, ok: first.ok } : undefined;
  };
  const cr = lookup('chipRate');
  const pe = lookup('period');
  const le = lookup('length');
  const gp = lookup('gp');
  const br = lookup('bitRate');
  const rows: FactRow[] = [
    { label: 'Chip rate', value: cr.known ? `${facts.chipRateMcps.toFixed(1)} Mcps` : null, you: cr.known ? you('chipRate', (v) => v.toFixed(1)) : undefined },
    { label: 'Chip duration', value: cr.known ? `${trim1(1 / facts.chipRateMcps)} µs` : null },
    { label: 'Code period', value: pe.known ? `${trim1(facts.periodUs)} µs` : null, you: pe.known ? you('period', trim1) : undefined },
    { label: 'Code length (chips per bit)', value: le.known ? `${facts.n} chips` : null, you: le.known ? you('length', String) : undefined },
    { label: 'Gp', value: gp.known ? `${facts.n} times (${trim1(facts.gpDb)} dB)` : null, you: gp.known ? you('gp', trim1) : undefined },
    { label: 'Bit rate', value: br.known ? `${sig3(facts.bitRateKbps)} kbps` : null, you: br.known ? you('bitRate', sig3) : undefined },
  ];
  return { heading: mode === 'practice' ? 'Practice link' : 'What you know', rows };
}

// Level 2's card. The enemy link: Gp is given, J/S is live from the scene, the rest fill in as the "Your turn"
// steps are submitted. The practice link: the same rows, filled in by the practice steps.
export interface Level2Facts {
  n: number;
  gpDb: number;
  jsDb: number; // enemy: the scene's J/S now; practice: the practice J/S
  ebJ0Db: number; // Gp less the J/S the level started with (enemy), or less the practice J/S
}

const SOURCES2 = {
  enemy: { ebJ0: ['B3', 'ebJ0'], ber: ['D3', 'ber'], needed: ['E3', 'jsNeeded'] },
  practice: { ebJ0: ['B2', 'ebJ0'], ber: ['D2', 'ber'], needed: ['E2', 'jsNeeded'] },
} as const;

export function level2Card(
  mode: 'enemy' | 'practice',
  flat: FlatStep[],
  states: StepState[],
  shownIndex: number,
  f: Level2Facts,
): FactsCard {
  const src = SOURCES2[mode];
  const lookup = (key: keyof typeof src) => {
    const [stepId, fieldId] = src[key];
    const i = flat.findIndex((x) => x.step.id === stepId);
    const st = i >= 0 ? states[i] : undefined;
    const r = st?.fields?.[fieldId];
    const first = st?.first?.[fieldId] ?? (r ? { value: r.value, ok: r.ok } : undefined);
    const known = mode === 'enemy' ? !!r : shownIndex > i || !!st?.worked || !!r?.ok;
    return { known, first, r, st };
  };
  const eb = lookup('ebJ0');
  const ber = lookup('ber');
  const need = lookup('needed');
  const youFmt = (x: ReturnType<typeof lookup>, fmt: (v: number) => string) =>
    x.known && x.first ? { text: `you: ${fmt(x.first.value)}`, ok: x.first.ok } : undefined;
  const runs = ber.st?.runs ?? [];
  const measured = mode === 'enemy' ? runs[0] : runs[runs.length - 1]; // enemy: the scored run; practice: the latest
  const rows: FactRow[] = [
    { label: mode === 'enemy' ? 'Gp (given)' : 'Gp', value: `${f.n} times (${trim1(f.gpDb)} dB)` },
    { label: 'Chips per bit', value: String(f.n) },
    { label: mode === 'enemy' ? 'J/S now' : 'J/S', value: `${trim1(f.jsDb)} dB` },
    { label: 'Eb/J0', value: eb.known ? `${trim1(f.ebJ0Db)} dB` : null, you: youFmt(eb, trim1) },
    {
      label: 'BER, predicted and measured',
      value: ber.known && measured ? `${berText(measured.ber)} (range ${berText(measured.lo)} to ${berText(measured.hi)})` : null,
      you:
        ber.known && ber.st?.prediction !== undefined && ber.r
          ? { text: `you: ${berText(ber.st.prediction)}`, ok: ber.r.grade !== 'miss' }
          : undefined,
    },
    { label: 'J/S needed', value: need.known ? `${trim1(f.gpDb + 0.9)} dB` : null, you: youFmt(need, trim1) },
  ];
  return { heading: mode === 'practice' ? 'Practice link' : 'What you know', rows };
}

// Level 3's card. The enemy link: Gp and the scene's J/S are given, the bit length, the pulsed BER at 10% and the
// best duty fill in as the "Your turn" steps are submitted. The practice link: filled in by the practice steps.
export interface Level3Facts {
  n: number;
  gpDb: number;
  chipRateMcps: number;
  jsDb: number; // enemy: the scene's J/S now; practice: the practice J/S
  ebJ0Db: number; // broadband: Gp less the J/S the level started with (enemy), or less the practice J/S
}

const SOURCES3 = {
  enemy: { bit: ['D2', 'bitUs'], ber: ['C3', 'ber'], duty: ['E3', 'duty'] },
  practice: { bit: ['', ''], ber: ['C2', 'ber'], duty: ['E2', 'duty'] },
} as const;

export function level3Card(
  mode: 'enemy' | 'practice',
  flat: FlatStep[],
  states: StepState[],
  shownIndex: number,
  f: Level3Facts,
): FactsCard {
  const src = SOURCES3[mode];
  const lookup = (key: keyof typeof src) => {
    const [stepId, fieldId] = src[key];
    const i = flat.findIndex((x) => x.step.id === stepId);
    const st = i >= 0 ? states[i] : undefined;
    const r = st?.fields?.[fieldId];
    const first = st?.first?.[fieldId] ?? (r ? { value: r.value, ok: r.ok } : undefined);
    const known = i >= 0 && (mode === 'enemy' ? !!r : shownIndex > i || !!st?.worked || !!r?.ok);
    return { known, first, r, st };
  };
  const bit = lookup('bit');
  const ber = lookup('ber');
  const duty = lookup('duty');
  const youFmt = (x: ReturnType<typeof lookup>, fmt: (v: number) => string) =>
    x.known && x.first ? { text: `you: ${fmt(x.first.value)}`, ok: x.first.ok } : undefined;
  const runs = ber.st?.runs ?? [];
  const measured = runs[0];
  const ratio = 10 ** (f.ebJ0Db / 10);
  const rows: FactRow[] = [
    { label: mode === 'enemy' ? 'Gp (given)' : 'Gp', value: `${f.n} times (${trim1(f.gpDb)} dB)` },
    { label: 'Chips per bit', value: String(f.n) },
  ];
  if (mode === 'enemy') {
    rows.push({ label: 'Bit length', value: bit.known ? `${trim1(f.n / f.chipRateMcps)} µs` : null, you: youFmt(bit, trim1) });
  }
  rows.push(
    { label: mode === 'enemy' ? 'J/S now' : 'J/S', value: `${trim1(f.jsDb)} dB` },
    { label: 'Broadband Eb/J0', value: `${trim1(f.ebJ0Db)} dB` },
    mode === 'enemy'
      ? {
          label: 'Pulsed BER at 10%, measured',
          value: ber.known && measured ? `${berText(measured.ber)} (range ${berText(measured.lo)} to ${berText(measured.hi)})` : null,
          you: ber.known && ber.st?.prediction !== undefined && ber.r ? { text: `you: ${berText(ber.st.prediction)}`, ok: ber.r.grade !== 'miss' } : undefined,
        }
      : {
          label: 'Pulsed BER at 10%',
          value: ber.known ? berText(0.1 * berBpskLin(f.ebJ0Db - 10)) : null,
        },
    {
      label: 'Best duty',
      value: duty.known ? String(Number(Math.min(1, 0.7 / ratio).toPrecision(2))) : null,
      you: youFmt(duty, String),
    },
  );
  return { heading: mode === 'practice' ? 'Practice link' : 'What you know', rows };
}

const berBpskLin = (ebJ0Db: number): number => berBpsk(undb(ebJ0Db));

// Level 4's card. The enemy link: Gp, chips per bit, chip rate and the scene's J/S are given; the line spacing fills in
// after C3 and the highest average J/S after D3. The practice link: the line spacing once C2 is done.
export interface Level4Facts {
  n: number;
  gpDb: number;
  chipRateMcps: number;
  jsDb: number; // enemy: the scene's J/S now; practice: the practice J/S
  maxAvgDb?: number; // enemy: the highest average J/S of D3
}

const SOURCES4 = {
  enemy: { spacing: ['C3', 'spacing'], limit: ['D3', 'avgJs'] },
  practice: { spacing: ['C2', 'spacing'], limit: ['', ''] },
} as const;

export function level4Card(
  mode: 'enemy' | 'practice',
  flat: FlatStep[],
  states: StepState[],
  shownIndex: number,
  f: Level4Facts,
): FactsCard {
  const src = SOURCES4[mode];
  const lookup = (key: keyof typeof src) => {
    const [stepId, fieldId] = src[key];
    const i = flat.findIndex((x) => x.step.id === stepId);
    const st = i >= 0 ? states[i] : undefined;
    const r = st?.fields?.[fieldId];
    const first = st?.first?.[fieldId] ?? (r ? { value: r.value, ok: r.ok } : undefined);
    const known = i >= 0 && (mode === 'enemy' ? !!r : shownIndex > i || !!st?.worked || !!r?.ok);
    return { known, first };
  };
  const spacing = lookup('spacing');
  const limit = lookup('limit');
  const youFmt = (x: ReturnType<typeof lookup>, fmt: (v: number) => string) =>
    x.known && x.first ? { text: `you: ${fmt(x.first.value)}`, ok: x.first.ok } : undefined;
  const rows: FactRow[] = [
    { label: mode === 'enemy' ? 'Gp (given)' : 'Gp', value: `${f.n} times (${trim1(f.gpDb)} dB)` },
    { label: 'Chips per bit', value: String(f.n) },
    { label: 'Chip rate', value: `${trim1(f.chipRateMcps)} Mcps` },
    { label: 'Line spacing', value: spacing.known ? `${sig3((f.chipRateMcps * 1000) / f.n)} kHz` : null, you: youFmt(spacing, sig3) },
    { label: mode === 'enemy' ? 'J/S now' : 'J/S', value: `${trim1(f.jsDb)} dB` },
  ];
  if (mode === 'enemy') {
    rows.push({ label: 'PAPR limit: highest average J/S', value: limit.known ? `${trim1(f.maxAvgDb ?? NaN)} dB` : null, you: youFmt(limit, trim1) });
  }
  return { heading: mode === 'practice' ? 'Practice link' : 'What you know', rows };
}

// Level 5's card. Gp, chips per copy and copies per bit are given. The copy and bit lengths fill in after B3, the
// front end's recovery is given from C3 on and the longest period fills in after C3. The practice link: its Gp,
// chips per copy and copies per bit, and the copy length once B2 is done.
export interface Level5Facts {
  n: number;
  gpDb: number;
  chipRateMcps: number;
  recoveryUs: number;
  maxPeriodUs: number;
}

export function level5Card(
  mode: 'enemy' | 'practice',
  flat: FlatStep[],
  states: StepState[],
  shownIndex: number,
  f: Level5Facts,
): FactsCard {
  const stepIdx = (id: string) => flat.findIndex((x) => x.step.id === id);
  const field = (id: string, fid: string) => {
    const i = stepIdx(id);
    const st = i >= 0 ? states[i] : undefined;
    const r = st?.fields?.[fid];
    const first = st?.first?.[fid] ?? (r ? { value: r.value, ok: r.ok } : undefined);
    return { i, st, r, first };
  };
  const youFmt = (x: { first?: { value: number; ok: boolean } }, fmt: (v: number) => string) =>
    x.first ? { text: `you: ${fmt(x.first.value)}`, ok: x.first.ok } : undefined;
  const copyUs = f.n / f.chipRateMcps;
  const rows: FactRow[] = [
    { label: mode === 'enemy' ? 'Gp (given)' : 'Gp', value: `${f.n} times (${trim1(f.gpDb)} dB)` },
    { label: 'Chips per copy', value: String(f.n) },
    { label: 'Copies per bit', value: '3' },
  ];
  if (mode === 'enemy') {
    const pulse = field('B3', 'pulse');
    const period = field('C3', 'period');
    const c3 = stepIdx('C3');
    rows.push(
      { label: 'Copy length', value: pulse.r ? `${trim1(copyUs)} µs` : null },
      { label: 'Bit length', value: pulse.r ? `${trim1(3 * copyUs)} µs` : null, you: pulse.r ? youFmt(pulse, trim1) : undefined },
      { label: 'Front-end recovery (given)', value: c3 >= 0 && shownIndex >= c3 ? `${trim1(f.recoveryUs)} µs` : null },
      { label: 'Longest period', value: period.r ? `${trim1(f.maxPeriodUs)} µs` : null, you: period.r ? youFmt(period, trim1) : undefined },
    );
  } else {
    const done = field('B2', 'pulse');
    const known = shownIndex > done.i || !!done.st?.worked || !!done.r?.ok;
    rows.push({ label: 'Copy length', value: known ? `${trim1(copyUs)} µs` : null });
  }
  return { heading: mode === 'practice' ? 'Practice link' : 'What you know', rows };
}
