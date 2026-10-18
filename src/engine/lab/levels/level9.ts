// Level 9: Jammer tactics (docs/design-level-9.md). Units A to C: power is scarce, distance beats power,
// look-through. Every number in the texts is checked in level9.test.ts.
import { createRng } from '../../rng';
import { type Pt } from '../geoloc';
import { type Network, type Target, bestShare, dcPowerW, lookThroughLossDb, networkDenial, platform, timeOnAirH } from '../tactics';
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

// --- Unit D: three enemy links, one jammer ------------------------------------------------------------------------

export const SHARE_GOAL_BER = 0.01;
const SHARE_SETS = [[1, 3, 6], [-2, 0, 1], [0, 2, 4], [2, 3, 8], [-4, -1, 2]]; // Eb/J0 (dB) with the whole jammer on each
const NAMES = ['Alpha', 'Bravo', 'Charlie'];
export const targetsOf = (ebJ0s: number[]): Target[] => ebJ0s.map((e, i) => ({ name: NAMES[i], gpDb: 15, jsDb: 15 - e, ebN0Db: 25 }));
export const EXAMPLE_TARGETS = targetsOf([1, 3, 6]);
export const shareTargets = (t: Truth): Target[] => targetsOf(SHARE_SETS[1 + Math.floor(createRng((t.seed ^ 0x51a) >>> 0)() * (SHARE_SETS.length - 1))]);
export const bestShareOf = (t: Truth) => bestShare(shareTargets(t), SHARE_GOAL_BER);

// --- Unit E: a hub and five outstations -------------------------------------------------------------------------

export const NET_GOAL_BER = 0.01;
export const PACK = { powerW: 10, heightM: 2 };
const round1 = (v: number) => Math.round(v * 10) / 10;
export function netOf(hub: Pt, seed: number): Network {
  const r = createRng(seed);
  const turn = 2 * Math.PI * r();
  const spokes = [0, 1, 2, 3, 4].map((k) => {
    const a = turn + (2 * Math.PI * k) / 5 + 0.4 * (r() - 0.5);
    const d = 4.5 + 2 * r();
    return { xKm: round1(hub.xKm + d * Math.cos(a)), yKm: round1(hub.yKm + 0.7 * d * Math.sin(a)), name: `S${k + 1}` };
  });
  return {
    nodes: [{ ...hub, name: 'hub' }, ...spokes],
    links: [...spokes.map((_, i) => ({ from: i + 1, to: 0 })), ...spokes.map((_, i) => ({ from: 0, to: i + 1 }))],
    txW: 5,
    heightM: 3,
    gpDb: 15,
    ebN0Db: 25,
    freqMHz: 50,
  };
}
export const EXAMPLE_NET = netOf({ xKm: 0, yKm: 9 }, 7);
export const level9Network = (t: Truth): Network => {
  const r = createRng((t.seed ^ 0x9e7) >>> 0);
  return netOf({ xKm: round1(-2 + 4 * r()), yKm: round1(8 + 3 * r()) }, (t.seed * 31 + 5) >>> 0);
};
// The links a jammer at `at` denies, and whether it denies every link into the hub (the first five).
export function networkTry(net: Network, at: Pt) {
  const links = networkDenial(net, { ...at, ...PACK }, NET_GOAL_BER);
  return { links, inbound: links.slice(0, 5).filter((l) => l.denied).length, all: links.slice(0, 5).every((l) => l.denied) };
}

// --- Unit F: the pack's duty for a long mission -----------------------------------------------------------------

const F_HOURS = [6, 9, 12];
export const fMissionHours = (t: Truth): number => F_HOURS[Math.floor(createRng((t.seed ^ 0xf2) >>> 0)() * F_HOURS.length)];
export const fDuty = (t: Truth): number => {
  const s = platform('soldier');
  return timeOnAirH(s.energyWh, s.rfW, s.efficiency) / fMissionHours(t);
};

// Practice sets, one per "Try another".
const A2_SETS = [{ rf: 50, eff: 0.4, wh: 500 }, { rf: 5, eff: 0.25, wh: 60 }, { rf: 100, eff: 0.5, wh: 2000 }, { rf: 20, eff: 0.3, wh: 240 }];
const B2_KM = [20, 12, 30, 16];
const D2_SETS = [{ e: 2, k: 3 }, { e: -1, k: 2 }, { e: 4, k: 4 }, { e: 0, k: 5 }];
const C2_SETS = [{ look: 2, period: 10 }, { look: 1, period: 20 }, { look: 5, period: 25 }, { look: 3, period: 12 }];
const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];
export const a2Set = (n: number) => at(A2_SETS, n);
export const b2Km = (n: number) => at(B2_KM, n);
export const c2Set = (n: number) => at(C2_SETS, n);
export const shareD2Set = (n: number) => at(D2_SETS, n);
// A 10 W pack matches a 200 W vehicle's J/S from km ÷ 20^(1/4), near the ground.
export const packKmFor = (vehicleKm: number): number => vehicleKm / 20 ** 0.25;

const s3 = (v: number) => String(Number(v.toPrecision(3)));
const f2 = (v: number) => v.toFixed(2);

export function level9Values(t: Truth, practiceN: number, baseJsDb: number): Record<string, string> {
  const u = platform('uav');
  const a2 = a2Set(practiceN);
  const c2 = c2Set(practiceN);
  const d2 = shareD2Set(practiceN);
  const best = bestShareOf(t);
  const ts = shareTargets(t);
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
    dE: String(d2.e),
    dK: String(d2.k),
    dShared: (d2.e + 10 * Math.log10(d2.k)).toFixed(1),
    dDuty: f2(1 / d2.k),
    dTenLog: (10 * Math.log10(d2.k)).toFixed(1),
    shareList: ts.map((x) => `${x.name} ${x.gpDb - x.jsDb} dB`).join(', '),
    bestDenied: String(best.denied),
    bestPlan: `${best.mode} sharing over ${best.chosen.map((i) => ts[i].name).join(' and ')}`,
    fHours: String(fMissionHours(t)),
    fDuty: f2(fDuty(t)),
    fLoss: (10 * Math.log10(1 / fDuty(t))).toFixed(1),
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
          video: 'level9-A1',
          paragraphs: [
            'A [[jammer|jammer]] needs power where it stands. A soldier carries batteries; a small UAV has a few hundred grams to spare; a vehicle has a generator; an aircraft takes power from its engines. The table gives the lab\'s round figures.',
            'The [[power amplifier|efficiency]] turns only part of its supply into radio power: here 30 to 50%. The rest is heat. So every watt sent costs two or three watts of battery.',
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
          video: 'level9-B1',
          paragraphs: [
            'J/S is set at the enemy receiver. Near the ground, the jammer\'s signal falls by 12 dB each time its distance doubles (level 0, F1). So halving the distance gains 12 dB: the same as 16 times the power.',
            'A directional jammer antenna adds its gain toward the target: 10 dBi is worth 10 times the power, if it is pointed at the receiver.',
            'Planning models such as [[Egli|egli]] add a term for frequency, but the jammer and the link share the frequency, so it cancels out of J/S.',
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
            'A jammer cannot hear the link while it transmits: its own signal drowns everything. To know whether the target is still there, or has moved to another frequency, it must stop now and then and listen. This is [[look-through|look-through]].',
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
    {
      id: 'D',
      title: 'Sharing across targets',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: one jammer, three links',
          visual: { kind: 'sharing' },
          video: 'level9-D1',
          paragraphs: [
            'One jammer, several enemy links. [[Power sharing|power-sharing]] splits its power: each link gets 1/k of it all the time, 10 × log10(k) dB less. [[Time sharing|time-sharing]] jams one link at a time with everything: each is hit for 1/k of the time, like level 3\'s pulses.',
            'Which is better is level 3\'s best-duty rule again: time sharing wins when each link, under the whole jammer, keeps an Eb/J0 above about −1.5 dB.',
          ],
          steps: [
            'Under the whole jammer, Alpha, Bravo and Charlie would see Eb/J0 of 1, 3 and 6 dB. The goal: BER of 0.01.',
            'Power sharing over all three: each 4.8 dB weaker, Eb/J0 5.8, 7.8 and 10.8 dB: BER 0.003, 0.0003 and almost 0. None broken.',
            'Time sharing over all three: each hit a third of the time at full power: 0.019, 0.008 and 0.0008. One broken.',
            'Time sharing over Alpha and Bravo only: half the time each: 0.028 and 0.012. Two broken.',
          ],
          rule: 'Spend the jammer only on links it can break. Time sharing beats power sharing when the links have margin.',
          check: {
            question: 'Power sharing over 4 links. How many dB less J/S does each get?',
            unit: 'dB',
            answer: Number((10 * Math.log10(4)).toFixed(1)),
            tol: { abs: 0.1 },
            wrong: '10 × log10(4).',
          },
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'sharing' },
          task: 'A link would see Eb/J0 of {dE} dB under the whole jammer, and the jammer serves {dK} links. What Eb/J0 does it see under power sharing, and what share of the time is it jammed under time sharing?',
          hint: 'Power sharing adds 10 × log10(k) dB to Eb/J0. Time sharing jams each link 1/k of the time.',
          fields: [
            { id: 'ebj0', label: 'Eb/J0, power sharing', unit: 'dB', truth: (_t, ctx) => shareD2Set(ctx.practiceN ?? 0).e + 10 * Math.log10(shareD2Set(ctx.practiceN ?? 0).k), check: { abs: 0.15 }, points: 0 },
            { id: 'duty', label: 'Share of time, time sharing', unit: '', truth: (_t, ctx) => 1 / shareD2Set(ctx.practiceN ?? 0).k, check: { abs: 0.01 }, points: 0 },
          ],
          worked: ['{dE} + 10 × log10({dK}) = {dE} + {dTenLog} = {dShared} dB.', '1 ÷ {dK} = {dDuty} of the time.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'The enemy: share your jammer',
          instruments: [],
          task: 'Three enemy links, and one jammer. Under the whole jammer each would see: {shareList}. Choose the links to jam and power or time sharing, then commit. The goal for each: BER 0.01.',
          hint: 'Leave out links you cannot break. Links with margin fall to time sharing.',
          fields: [],
          share: { targets: shareTargets, goalBer: SHARE_GOAL_BER, points: 20 },
          reveal: ['The best plan breaks {bestDenied}: {bestPlan}.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'Networks as targets',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: stand near the hub',
          visual: { kind: 'network', example: 'hub' },
          video: 'level9-E1',
          paragraphs: [
            'An enemy [[hub|hub]] talks to five outstations. Every message to the hub arrives at one receiver; every message from it goes to five.',
            'A jammer near the hub raises J/S at the one receiver all the outstations send to: every link into the hub breaks at once. Near one outstation, it breaks only the hub\'s link to that outstation.',
            'The map shows the 10 W pack 1.5 km from the hub: all five links into it are red. Your jammer cannot hear which way messages go, but the hub sends the most, so level 6 finds it.',
          ],
          rule: 'Against hub and spoke, jam the hub\'s receiver: one jammer, every spoke.',
          check: {
            question: 'A hub serves 5 outstations, with a link each way. A jammer near the hub breaks every link into it. How many links is that?',
            answer: 5,
            tol: { exact: true },
            wrong: 'One link into the hub from each outstation.',
          },
        },
        {
          kind: 'apply',
          id: 'E2',
          title: 'The enemy: deny the hub',
          instruments: ['df'],
          dfMethod: 'network',
          task: 'Special forces can leave your 10 W pack anywhere on the map. Place it (click) so every link into the enemy hub breaks.',
          hint: 'J/S is set at the hub\'s receiver: get the pack close to the hub, not to an outstation.',
          fields: [],
          locate: { maxSites: 1, points: 20, task: 'Click the map to place the pack; click again to move it. Full points within 3 placements, half after.' },
          reveal: ['Only a small area round the hub breaks all five links into it: there J/S at the hub beats every outstation\'s signal.'],
        },
      ],
    },
    {
      id: 'F',
      title: 'Planning',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Platform, place and time',
          visual: { kind: 'platforms' },
          paragraphs: [
            'A plan brings it together. The platform sets the power and how long it lasts; the place sets the J/S; the target sets what it breaks; the time on target sets how much battery it needs.',
            'A pack left near the hub needs little power, but its battery lasts 4.5 hours at full power. For a longer mission it must jam less of the time. A duty below 1 costs average J/S, 10 × log10(1 ÷ duty) dB, exactly like look-through, so it must start with that much to spare.',
          ],
          steps: [
            'The mission lasts 9 hours. The pack lasts 4.5 hours at full power.',
            'Duty = 4.5 ÷ 9 = 0.5: jam half the time.',
            'That costs 10 × log10(1 ÷ 0.5) = 3 dB of average J/S: place the pack where it has 3 dB to spare.',
          ],
          rule: 'Duty = time on air ÷ mission time. It costs 10 × log10(1 ÷ duty) dB, made up by standing closer.',
        },
        {
          kind: 'apply',
          id: 'F2',
          title: 'The enemy: a long mission',
          instruments: [],
          task: 'The hub must stay jammed for {fHours} hours by the pack you left near it (4.5 hours at full power). What duty lets its battery last, and how many dB of average J/S does that cost?',
          hint: 'Duty = 4.5 ÷ mission hours. Cost = 10 × log10(1 ÷ duty).',
          fields: [
            { id: 'duty', label: 'Duty', unit: '', truth: (t) => fDuty(t), check: { abs: 0.01 }, points: 5 },
            { id: 'loss', label: 'Average J/S lost', unit: 'dB', truth: (t) => 10 * Math.log10(1 / fDuty(t)), check: { abs: 0.15 }, points: 5 },
          ],
          reveal: ['Duty = 4.5 ÷ {fHours} = {fDuty}.', 'Cost = 10 × log10(1 ÷ {fDuty}) = {fLoss} dB: stand that much closer, about a factor 10^({fLoss} ÷ 40) in distance.'],
        },
      ],
    },
    {
      id: 'G',
      title: 'Check',
      steps: [
        {
          kind: 'questions',
          id: 'G1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: 'Near the ground, which gives a jammer more J/S?',
              options: ['Doubling its power', 'Halving its distance to the receiver', 'They are the same'],
              correct: 1,
              explain: 'Halving the distance gives 12 dB near the ground; doubling the power gives 3 dB.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'Against a hub and its outstations, where does one jammer do the most?',
              options: ['Near the hub, whose one receiver hears every outstation', 'Near the farthest outstation', 'Halfway between two outstations'],
              correct: 0,
              explain: 'Every message into the hub arrives at one receiver. Jam it and every spoke breaks.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'One jammer, three links that each keep some margin under it. What breaks the most?',
              options: ['Power sharing over all three', 'Jamming only the strongest', 'Time sharing over the ones it can break'],
              correct: 2,
              explain: 'Links with margin fall to full-power bursts, as level 3\'s pulses showed; links it cannot break waste its time.',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'Power is the jammer\'s scarcest resource: an amplifier wastes half or more of what it draws, and the battery decides how long it can jam. Distance is cheaper than power: near the ground, halving it is worth 16 times the watts. Spend the jammer only on links it can break, aim at the hub, and plan the duty the battery allows.',
};
