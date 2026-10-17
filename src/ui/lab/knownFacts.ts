// The "What you know" card: what the player has confirmed about the enemy link, or what is established
// about the practice link, with the player's own first entry beside each confirmed value.
import { type FlatStep, type KnownLinkInfo, type Truth, berText } from '../../engine/lab/levels';
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
