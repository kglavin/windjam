// Level 9: Jammer tactics (docs/design-level-9.md). Units A to C: power is scarce, distance beats power,
// look-through. Every number in the texts is checked in level9.test.ts.
import { createRng } from '../../rng';
import { dcPowerW, lookThroughLossDb, platform, timeOnAirH } from '../tactics';
import { type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

export const level9Truth = shortCodeTruth;

// A3: the UAV's mission, in hours.
const MISSION_H = [3, 4, 5];
export const missionHours = (t: Truth): number => MISSION_H[Math.floor(createRng((t.seed ^ 0x9a3) >>> 0)() * MISSION_H.length)];
export const affordableRfW = (t: Truth): number => {
  const u = platform('uav');
  return (u.energyWh * u.efficiency) / missionHours(t);
};
// B3: J/S that leaves Eb/J0 of 3 dB.
export const b3GoalDb = (t: Truth): number => Number((t.gpDb - 3).toFixed(1));

// Practice sets, one per "Try another".
const A2_SETS = [{ rf: 50, eff: 0.4, wh: 500 }, { rf: 5, eff: 0.25, wh: 60 }, { rf: 100, eff: 0.5, wh: 2000 }, { rf: 20, eff: 0.3, wh: 240 }];
const B2_KM = [20, 12, 30, 16];
const C2_SETS = [{ look: 2, period: 10 }, { look: 1, period: 20 }, { look: 5, period: 25 }, { look: 3, period: 12 }];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
export const a2Set = (n: number) => at(A2_SETS, n);
export const b2Km = (n: number) => at(B2_KM, n);
export const c2Set = (n: number) => at(C2_SETS, n);
// A 10 W pack matches a 200 W vehicle's J/S from km ÷ 20^(1/4), near the ground.
export const packKmFor = (vehicleKm: number): number => vehicleKm / 20 ** 0.25;

const s3 = (v: number) => String(Number(v.toPrecision(3)));
const f2 = (v: number) => v.toFixed(2);

export function level9Values(t: Truth, practiceN: number, baseJsDb: number): Record<string, string> {
  const u = platform('uav');
  const a2 = a2Set(practiceN);
  const c2 = c2Set(practiceN);
  return {
    pN: String(practiceN),
    gpDb: t.gpDb.toFixed(1),
    uavRf: String(u.rfW),
    uavEff: String(Math.round(u.efficiency * 100)),
    uavWh: String(u.energyWh),
    uavDc: s3(dcPowerW(u.rfW, u.efficiency)),
    uavHours: s3(timeOnAirH(u.energyWh, u.rfW, u.efficiency)),
    mission: String(missionHours(t)),
    affordable: s3(affordableRfW(t)),
    uavDcBudget: s3(u.energyWh / missionHours(t)),
    b3Goal: b3GoalDb(t).toFixed(1),
    b3Start: baseJsDb.toFixed(1),
    b3Gain: (b3GoalDb(t) - baseJsDb).toFixed(1),
    b3Factor: s3(10 ** ((b3GoalDb(t) - baseJsDb) / 40)),
    pRf: String(a2.rf),
    pEff: String(Math.round(a2.eff * 100)),
    pWh: String(a2.wh),
    pDc: s3(dcPowerW(a2.rf, a2.eff)),
    pHours: s3(timeOnAirH(a2.wh, a2.rf, a2.eff)),
    pKm: String(b2Km(practiceN)),
    pPackKm: s3(packKmFor(b2Km(practiceN))),
    pLook: String(c2.look),
    pPeriod: String(c2.period),
    pOn: f2(1 - c2.look / c2.period),
    pLoss: f2(lookThroughLossDb(c2.look, c2.period)),
  };
}

export const LEVEL_9: LevelDef = {
  id: 9,
  title: 'Jammer tactics',
  intro:
    'Levels 2 to 8 asked whether a jammer can break a link. This one asks what it costs, and how to spend it. Power has to be carried or generated where the jammer is, and it runs out. So where the jammer stands, when it transmits, and what it aims at matter more than how big it is.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Power is scarce',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Example: what a soldier can carry',
          visual: { kind: 'platforms' },
          paragraphs: [
            'A [[jammer|jammer]] needs power where it stands. A soldier carries batteries; a small UAV has a few hundred grams to spare; a vehicle has a generator; an aircraft takes power from its engines. The table gives the lab\'s round figures.',
            'The power amplifier turns only part of its supply into radio power: here 30 to 50%. The rest is heat. So every watt sent costs two or three watts of battery.',
          ],
          steps: [
            'The soldier pack sends 10 W of radio power at 30% efficiency.',
            'DC power = 10 ÷ 0.3 = 33.3 W.',
            'Its 150 Wh battery lasts 150 ÷ 33.3 = 4.5 hours of jamming.',
            'Jamming only a quarter of the time (a duty of 0.25), it lasts 4 times as long: 18 hours.',
          ],
          rule: 'DC power = RF power ÷ efficiency. Time on air = energy ÷ DC power. Jam only when it pays.',
          check: {
            question: 'A jammer sends 20 W at 40% efficiency. What DC power does it draw, in W?',
            unit: 'W',
            answer: 50,
            tol: { abs: 0.5 },
            wrong: '20 ÷ 0.4.',
          },
        },
        {
          kind: 'practice',
          id: 'A2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'platforms' },
          task: 'A jammer sends {pRf} W at {pEff}% efficiency from {pWh} Wh. What DC power does it draw, and how long can it jam?',
          hint: 'DC = RF ÷ efficiency. Hours = Wh ÷ DC.',
          fields: [
            { id: 'dc', label: 'DC power', unit: 'W', truth: (_t, ctx) => dcPowerW(a2Set(ctx.practiceN ?? 0).rf, a2Set(ctx.practiceN ?? 0).eff), check: { rel: 0.02 }, points: 0 },
            { id: 'hours', label: 'Time on air', unit: 'h', truth: (_t, ctx) => { const s = a2Set(ctx.practiceN ?? 0); return timeOnAirH(s.wh, s.rf, s.eff); }, check: { rel: 0.02 }, points: 0 },
          ],
          worked: ['DC = {pRf} ÷ 0.{pEff} = {pDc} W.', 'Time = {pWh} ÷ {pDc} = {pHours} h.'],
        },
        {
          kind: 'apply',
          id: 'A3',
          title: 'The enemy mission: a UAV jammer',
          instruments: [],
          visual: { kind: 'platforms' },
          task: 'You must jam the enemy link for {mission} hours from the small UAV ({uavRf} W, {uavEff}% efficiency, {uavWh} Wh). What DC power does it draw, how long does it last at full power, and how much RF power can it afford for the whole mission?',
          hint: 'DC = RF ÷ efficiency; hours = Wh ÷ DC. For the mission: DC budget = Wh ÷ hours, and RF = DC budget × efficiency.',
          fields: [
            { id: 'dc', label: 'DC power', unit: 'W', truth: () => { const u = platform('uav'); return dcPowerW(u.rfW, u.efficiency); }, check: { rel: 0.02 }, points: 5 },
            { id: 'hours', label: 'Time on air', unit: 'h', truth: () => { const u = platform('uav'); return timeOnAirH(u.energyWh, u.rfW, u.efficiency); }, check: { rel: 0.02 }, points: 5 },
            { id: 'rf', label: 'RF power for the mission', unit: 'W', truth: (t) => affordableRfW(t), check: { rel: 0.03 }, points: 5 },
          ],
          reveal: [
            'DC = {uavRf} ÷ 0.{uavEff} = {uavDc} W: {uavWh} ÷ {uavDc} = {uavHours} h at full power.',
            'For {mission} h: {uavWh} ÷ {mission} = {uavDcBudget} W of DC, × 0.{uavEff} = {affordable} W of RF. The rest of the J/S has to come from getting close.',
          ],
        },
      ],
    },
    {
      id: 'B',
      title: 'Distance beats power',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Example: a small jammer close in',
          visual: { kind: 'distance' },
          paragraphs: [
            'J/S is set at the enemy receiver. Near the ground, the jammer\'s signal falls by 12 dB each time its distance doubles (level 0, F1). So halving the distance gains 12 dB: the same as 16 times the power.',
            'A directional jammer antenna adds its gain toward the target: 10 dBi is worth 10 times the power, if it is pointed at the receiver.',
            'Planning models such as Egli add a term for frequency, but the jammer and the link share the frequency, so it cancels out of J/S.',
          ],
          steps: [
            'A 200 W vehicle jammer gets the J/S it needs from 20 km.',
            'A 10 W pack is 20 times weaker: 10 × log10(20) = 13 dB.',
            'Near the ground, distance gives 40 × log10 of the ratio: 13 dB is a ratio of 10^(13 ÷ 40) = 2.1.',
            'The pack gets the same J/S from 20 ÷ 2.1 = 9.5 km.',
          ],
          rule: 'Near the ground J/S changes by 40 × log10 of the distance ratio: halving the distance is worth 16 times the power.',
          check: {
            question: 'Near the ground, a jammer moves from 8 km to 2 km from the receiver. How many dB does J/S gain?',
            unit: 'dB',
            answer: Number((40 * Math.log10(4)).toFixed(1)),
            tol: { abs: 0.2 },
            wrong: '40 × log10(8 ÷ 2).',
          },
        },
        {
          kind: 'practice',
          id: 'B2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'distance' },
          task: 'A 200 W vehicle jammer works from {pKm} km. How close must a 10 W pack get for the same J/S, near the ground?',
          hint: '13 dB less power is made up by a distance ratio of 10^(13 ÷ 40) = 2.1.',
          fields: [{ id: 'km', label: 'Distance', unit: 'km', truth: (_t, ctx) => packKmFor(b2Km(ctx.practiceN ?? 0)), check: { rel: 0.03 }, points: 0 }],
          worked: ['{pKm} ÷ 20^(1/4) = {pKm} ÷ 2.11 = {pPackKm} km.'],
        },
        {
          kind: 'find',
          id: 'B3',
          title: 'The enemy: get the pack close',
          measure: 'js',
          atLeastDb: 0,
          atLeastFrom: b3GoalDb,
          points: 15,
          editable: ['jammer'],
          instruments: [],
          task: 'Your soldier carries a 10 W pack. From where it starts, J/S at the enemy receiver is {b3Start} dB. Move the jammer (drag it, or type its position) until J/S reaches {b3Goal} dB: Eb/J0 of 3 dB against the link\'s Gp of {gpDb} dB.',
          hint: 'You need {b3Gain} dB more: a distance {b3Factor} times shorter, near the ground.',
          reveal: ['J/S {b3Goal} dB: Eb/J0 = {gpDb} − {b3Goal} = 3 dB. Distance did what power could not: 10 W close in.'],
        },
      ],
    },
    {
      id: 'C',
      title: 'Look-through',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: stop to listen',
          visual: { kind: 'none' },
          paragraphs: [
            'A jammer cannot hear the link while it transmits: its own signal drowns everything. To know whether the target is still there, or has moved to another frequency, it must stop now and then and listen. This is look-through.',
            'Every look costs jamming time. Too few looks and the jammer may be shouting at an empty channel; too many and its average J/S falls.',
          ],
          steps: [
            'The jammer listens for 1 ms in every 10 ms, so it jams 90% of the time.',
            'Its average J/S falls by 10 × log10(1 ÷ 0.9) = 0.46 dB.',
            'If the link moves just after a look, it is free until the next one: up to 10 ms.',
          ],
          rule: 'Look-through costs 10 × log10(1 ÷ share on) of J/S, and a link that moves stays free for up to one look period.',
          check: {
            question: 'A jammer listens 2 ms in every 10 ms. How many dB of average J/S does that cost?',
            unit: 'dB',
            answer: Number(lookThroughLossDb(2, 10).toFixed(2)),
            tol: { abs: 0.02 },
            wrong: 'It jams 80% of the time: 10 × log10(1 ÷ 0.8).',
          },
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'none' },
          task: 'A jammer listens {pLook} ms in every {pPeriod} ms. How many dB of average J/S does it lose, and for how long at most can a link that moves stay free?',
          hint: 'Share on = 1 − look ÷ period. Loss = 10 × log10(1 ÷ share on).',
          fields: [
            { id: 'loss', label: 'J/S lost', unit: 'dB', truth: (_t, ctx) => lookThroughLossDb(c2Set(ctx.practiceN ?? 0).look, c2Set(ctx.practiceN ?? 0).period), check: { abs: 0.03 }, points: 0 },
            { id: 'free', label: 'Free for up to', unit: 'ms', truth: (_t, ctx) => c2Set(ctx.practiceN ?? 0).period, check: { abs: 0.5 }, points: 0 },
          ],
          worked: ['Share on = 1 − {pLook} ÷ {pPeriod} = {pOn}. Loss = 10 × log10(1 ÷ {pOn}) = {pLoss} dB.', 'A move just after a look waits a whole period: {pPeriod} ms.'],
        },
      ],
    },
  ],
  debrief:
    'Power is the jammer\'s scarcest resource: an amplifier wastes half or more of what it draws, and the battery decides how long it can jam. Distance is cheaper than power: near the ground, halving it is worth 16 times the watts. Look-through buys knowledge of the target at a small cost in J/S.',
};
