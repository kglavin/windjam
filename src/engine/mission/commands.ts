import { LEVELS } from './deception';
import type { Level } from './orbat';
import { type Hex, offsetToAxial } from '../hex';
import type { JammerMode, Waveform } from '../units';

// The jammer modes the console offers (ew: jam <net> <mode>); spot when none is given.
export const JAM_MODES: JammerMode[] = ['spot', 'barrage', 'partial', 'pulse', 'follower', 'sync'];
import type { MissionCommand, PlayerSide, SortieLeg } from './types';

// Short names used at the prompt, per side.
export const UNIT_ALIASES: Record<PlayerSide, Record<string, string>> = {
  blue: { hq: 'b-hq', relay: 'b-relay', sq1: 'b-sq1', sq2: 'b-sq2', sq3: 'b-sq3', uav: 'b-uav', ew: 'b-ew' },
  red: { hq: 'r-hq', relay: 'r-relay', sq1: 'r-sq1', sq2: 'r-sq2', sq3: 'r-sq3', ew: 'r-ew', uav: 'r-uav' },
};

export const NET_ALIASES: Record<PlayerSide, Record<string, string>> = {
  blue: { cmd: 'blue-cmd', retrans: 'blue-retrans', uavlink: 'blue-uav' },
  red: { cmd: 'red-cmd', retrans: 'red-retrans', squad: 'red-squad', uavlink: 'red-uav' },
};

export const aliasOf = (unitId: string): string => {
  for (const side of ['blue', 'red'] as const) {
    const hit = Object.entries(UNIT_ALIASES[side]).find(([, id]) => id === unitId);
    if (hit) return hit[0];
  }
  // Scenario units: the id less its side prefix (r-radar1 is radar1).
  return unitId.replace(/^[br]-/, '');
};

// The ids a mission has, so a scenario's units and nets (r-radar1 as radar1, red-track as track) parse by name.
export interface KnownIds {
  units: string[];
  nets: string[];
}
export const knownIdsOf = (w: { units: { id: string }[]; nets: { id: string }[] }): KnownIds => ({ units: w.units.map((u) => u.id), nets: w.nets.map((n) => n.id) });

// A console name to a unit id: the alias table, else the side's prefix on the name when the mission has that unit.
const unitIdFor = (side: PlayerSide, name: string, known?: KnownIds): string | undefined => {
  const hit = UNIT_ALIASES[side][name];
  if (hit) return hit;
  const id = `${side[0]}-${name}`;
  return known?.units.includes(id) ? id : undefined;
};
const netIdFor = (side: PlayerSide, name: string, known?: KnownIds): string | undefined => {
  const hit = NET_ALIASES[side][name];
  if (hit) return hit;
  const id = `${side}-${name}`;
  return known?.nets.includes(id) ? id : undefined;
};

export const netAliasOf = (netId: string): string => {
  for (const side of ['blue', 'red'] as const) {
    const hit = Object.entries(NET_ALIASES[side]).find(([, id]) => id === netId);
    if (hit) return hit[0];
  }
  return netId.replace(/^(blue|red)-/, '');
};

const COMPASS: Record<string, number> = {
  n: 0, north: 0,
  ne: 45, northeast: 45,
  e: 90, east: 90,
  se: 135, southeast: 135,
  s: 180, south: 180,
  sw: 225, southwest: 225,
  w: 270, west: 270,
  nw: 315, northwest: 315,
};

// The waveform words of the console (<net>: waveform fixed|slow|fast|dsss); the analyses describe enemy nets with them too.
export const WAVEFORMS: Record<string, Waveform> = {
  fixed: { kind: 'fixed' },
  slow: { kind: 'fh', hopsPerSec: 100 },
  fast: { kind: 'fh', hopsPerSec: 32000 },
  dsss: { kind: 'dsss', chipRateMcps: 5 },
};

const COMMON_HELP = [
  '<unit>: move <col>,<row>           move to a grid position (hover a hex to read col,row)',
  '<unit>: stop                       cancel the current order',
  'send <unit>: <text>                send an order to a unit over the net; the unit acknowledges it, HQ marks it lost after 3 minutes',
  'wait <minutes>                     advance the clock',
  'status                             every unit: position, order, link to HQ, held reports',
  'picture                            tracks: bearings, fixes, CEP',
  'seed <n>                           restart the mission on a seed (a pasted script may start with this)',
  'reveal                             end the mission (if still running), show the truth, open the replay at T+0',
  'next · step · back · exit          replay: jump to the next event, one minute forward, one back, leave the replay',
  'help                               this list',
];

export const HELP: Record<PlayerSide, string[]> = {
  blue: [
    '<unit>: df <direction> <minutes>   bearing sweep over a 90° sector; direction n ne e se s sw w nw, or degrees 0-359',
    '<site>: watch 40-48 24  ·  <site>: tune 42.4 24  ·  <site>: sweep 24   deception: intercept a band (8 MHz at most), one frequency, or sweep everything, for hours; intercepts [hour] lists what was heard',
    'assess net 42.6 brigade at 191,95 [under 40]  ·  assess strength centre 100  ·  assess objective centre at T+72  ·  assessment   deception: say what is there (division brigade battalion company artillery recce), radios per sector, where and when the blow falls; scored at T+72',
    'uav: sortie <col>,<row> <dir> <min>; ...   silent sortie: fly each leg, DF there, then home; all legs reported on return',
    "ew: jam <net> [mode]  ·  ew: jam off   jam an enemy net: spot (default), barrage, partial, pulse, follower or sync (the jammer itself is loud)",
    'uav: launch  ·  uav: route <col>,<row>; ...  ·  uav: hold  ·  uav: resume  ·  uav: burst   mission 5: fly, re-route, pause, report now',
    'uav: power <W>  ·  uavlink: waveform fixed|dsss  ·  uav: antenna toward hq  ·  uav: antenna omni   mission 5: shape the report burst',
    ...COMMON_HELP,
    `units: ${Object.keys(UNIT_ALIASES.blue).join(' ')}`,
  ],
  red: [
    'send                               transmit the current order now (a one-minute burst Blue can hear)',
    'emcon <net> <percent>              background chatter on a net, 0-20 percent of minutes',
    "<unit>: power <watts>              transmit power, up to the radio's maximum",
    '<net>: waveform fixed|slow|fast|dsss',
    '<unit>: antenna toward <unit>      directional antenna, HQ and relay only; <unit>: antenna omni to undo',
    "ew: decoy <net>  ·  ew: decoy off  transmit a net's signature from where the EW team stands",
    "ew: jam <net> [mode]  ·  ew: jam off   jam Blue's net: spot (default), barrage, partial, pulse, follower or sync (holds Blue's reports; the jammer itself is loud)",
    'uav: launch  ·  uav: hold  ·  uav: resume  ·  uav: burst   missions 4-5: fly the route, pause at the next waypoint, report to HQ now',
    'uav: route <col>,<row>; <col>,<row>; ...   mission 5: replace the UAV route (it flies on from where it is)',
    ...COMMON_HELP,
    `units: ${Object.keys(UNIT_ALIASES.red).join(' ')} · nets: ${Object.keys(NET_ALIASES.red).join(' ')}`,
  ],
};

export type ParseResult = { ok: true; command: MissionCommand } | { ok: false; error: string };

export function parseCommand(input: string, side: PlayerSide = 'blue', known?: KnownIds): ParseResult {
  // send <unit>: <text> passes free text to a unit over the net. The text keeps its case; the bare send is mission 2's.
  const order = /^send\s+([^\s:]+)\s*:\s*(.*)$/i.exec(input.trim());
  if (order) {
    const toId = unitIdFor(side, order[1].toLowerCase(), known);
    if (!toId) return { ok: false, error: `Unknown unit "${order[1].toLowerCase()}". Units: ${Object.keys(UNIT_ALIASES[side]).join(' ')}` };
    if (!order[2]) return { ok: false, error: 'send needs the order text, e.g. send sq1: df e 5' };
    return { ok: true, command: { type: 'order', toId, text: order[2] } };
  }
  const text = input.trim().toLowerCase().replace(/:/g, ' ');
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Type help for the command list' };
  const [first, ...rest] = tokens;
  const units = UNIT_ALIASES[side];
  const nets = NET_ALIASES[side];

  if (first === 'help') return { ok: true, command: { type: 'help' } };
  if (first === 'status') return { ok: true, command: { type: 'status' } };
  if (first === 'picture') return { ok: true, command: { type: 'picture' } };
  if (first === 'intercepts') {
    if (rest[0] !== undefined && !/^\d+$/.test(rest[0])) return { ok: false, error: 'intercepts takes an hour, e.g. intercepts 6, or nothing for the last hour' };
    return { ok: true, command: { type: 'intercepts', hour: rest[0] !== undefined ? Number(rest[0]) : undefined } };
  }
  if (first === 'assessment') return { ok: true, command: { type: 'assessment' } };
  if (first === 'assess') {
    const usage = 'assess net <MHz> <level> at <col>,<row> [under <MHz>] · assess strength <sector> <radios> · assess objective <sector> at T+<hour>';
    if (rest[0] === 'net') {
      const freqMHz = Number(rest[1]);
      const level = rest[2] as Level;
      if (!(freqMHz > 0) || !LEVELS.includes(level) || rest[3] !== 'at') return { ok: false, error: `${usage}; levels: ${LEVELS.join(' ')}` };
      const underAt = rest.indexOf('under');
      const at = /^(\d+),(\d+)$/.exec(rest.slice(4, underAt < 0 ? undefined : underAt).join(''));
      if (!at) return { ok: false, error: 'assess net needs the hub position as col,row, e.g. assess net 40 division at 185,80' };
      const underMHz = underAt < 0 ? undefined : Number(rest[underAt + 1]);
      if (underAt >= 0 && !(underMHz! > 0)) return { ok: false, error: 'under needs the parent net\'s frequency, e.g. under 40' };
      return { ok: true, command: { type: 'assess', what: 'net', freqMHz, level, col: Number(at[1]), row: Number(at[2]), underMHz } };
    }
    if (rest[0] === 'strength') {
      const radios = Number(rest[2]);
      if (!rest[1] || !(radios >= 0) || !Number.isInteger(radios)) return { ok: false, error: 'assess strength <sector> <radios>, e.g. assess strength centre 100' };
      return { ok: true, command: { type: 'assess', what: 'strength', sector: rest[1], radios } };
    }
    if (rest[0] === 'objective') {
      const hour = /^t?\+?(\d+)$/.exec(rest[3] ?? '');
      if (!rest[1] || rest[2] !== 'at' || !hour) return { ok: false, error: 'assess objective <sector> at T+<hour>, e.g. assess objective centre at T+72' };
      return { ok: true, command: { type: 'assess', what: 'objective', sector: rest[1], at: Number(hour[1]) } };
    }
    return { ok: false, error: usage };
  }
  if (first === 'reveal') return { ok: true, command: { type: 'reveal' } };
  if (first === 'next' || first === 'step' || first === 'back' || first === 'exit') return { ok: true, command: { type: 'replay', move: first } };
  if (first === 'wait') {
    const minutes = Number(rest[0]);
    if (!(minutes > 0) || !Number.isInteger(minutes)) return { ok: false, error: 'wait needs a whole number of minutes, e.g. wait 5' };
    return { ok: true, command: { type: 'wait', minutes } };
  }
  if (first === 'send') return { ok: true, command: { type: 'send' } };
  if (first === 'emcon') {
    const netId = netIdFor(side, rest[0] ?? '', known);
    const pct = Number(rest[1]);
    if (!netId) return { ok: false, error: `emcon needs a net (${Object.keys(nets).join(' ')}) and a percentage, e.g. emcon cmd 5` };
    if (!(pct >= 0 && pct <= 20)) return { ok: false, error: 'emcon percentage must be between 0 and 20' };
    return { ok: true, command: { type: 'emcon', netId, duty: pct / 100 } };
  }

  // <net>: waveform ...
  if (rest[0] === 'waveform' && (nets[first] || !units[first])) {
    const wf = WAVEFORMS[rest[1] ?? ''];
    if (!wf) return { ok: false, error: `waveform must be one of ${Object.keys(WAVEFORMS).join(', ')}` };
    const netId = netIdFor(side, first, known);
    if (!netId) return { ok: false, error: `Unknown net "${first}"` };
    return { ok: true, command: { type: 'waveform', netId, waveform: wf } };
  }

  const unitId = unitIdFor(side, first, known);
  if (!unitId) {
    return { ok: false, error: `Unknown unit or net "${first}". Units: ${Object.keys(units).join(' ')}${side === 'red' ? ` · nets: ${Object.keys(nets).join(' ')}` : ''}` };
  }
  const verb = rest[0];
  if (!verb) return { ok: false, error: `What should ${first} do? Type help for the orders.` };

  if (verb === 'df') {
    const dir = rest[1];
    const minutes = Number(rest[2]);
    if (dir === undefined) return { ok: false, error: 'df needs a direction and minutes, e.g. sq1: df e 5' };
    const centreDeg = COMPASS[dir] ?? (/^\d+$/.test(dir) && Number(dir) < 360 ? Number(dir) : undefined);
    if (centreDeg === undefined) return { ok: false, error: `Unknown direction "${dir}". Use n ne e se s sw w nw or degrees 0-359` };
    if (!(minutes > 0) || !Number.isInteger(minutes)) return { ok: false, error: 'df needs a whole number of minutes, e.g. sq1: df e 5' };
    return { ok: true, command: { type: 'df', unitId, centreDeg, minutes } };
  }
  // Deception: an intercept site's tasks, in hours.
  if (verb === 'watch' || verb === 'tune' || verb === 'sweep') {
    const hours = Number(rest[verb === 'sweep' ? 1 : 2]);
    if (!(hours > 0) || !Number.isInteger(hours)) return { ok: false, error: `${verb} needs whole hours, e.g. s1: ${verb === 'watch' ? 'watch 40-48 24' : verb === 'tune' ? 'tune 42.4 24' : 'sweep 24'}` };
    if (verb === 'sweep') return { ok: true, command: { type: 'watch', unitId, mode: 'sweep', loMHz: 0, hiMHz: Infinity, minutes: hours } };
    if (verb === 'tune') {
      const f = Number(rest[1]);
      if (!(f > 0)) return { ok: false, error: 'tune needs a frequency in MHz, e.g. s1: tune 42.4 24' };
      return { ok: true, command: { type: 'watch', unitId, mode: 'freq', loMHz: f - 0.05, hiMHz: f + 0.05, minutes: hours } };
    }
    const band = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(rest[1] ?? '');
    if (!band) return { ok: false, error: 'watch needs a band lo-hi in MHz, e.g. s1: watch 40-48 24' };
    const lo = Number(band[1]);
    const hi = Number(band[2]);
    if (!(hi > lo)) return { ok: false, error: 'watch: the band must run low to high, e.g. 40-48' };
    return { ok: true, command: { type: 'watch', unitId, mode: 'band', loMHz: lo, hiMHz: hi, minutes: hours } };
  }
  if (verb === 'move') {
    const m = /^(\d+)\s*,\s*(\d+)$/.exec(rest.slice(1).join(''));
    if (!m) return { ok: false, error: 'move needs a grid position, e.g. uav: move 128,74' };
    return { ok: true, command: { type: 'move', unitId, to: offsetToAxial(Number(m[1]), Number(m[2])) } };
  }
  if (verb === 'sortie') {
    const example = 'e.g. uav: sortie 130,74 e 4; 140,90 n 3';
    const legsText = rest.slice(1).join(' ').split(';').map((t) => t.trim()).filter(Boolean);
    if (legsText.length === 0) return { ok: false, error: `sortie needs at least one leg, ${example}` };
    const legs: SortieLeg[] = [];
    for (const t of legsText) {
      const m = /^(\d+)\s*,\s*(\d+)(?:\s+(\S+)\s+(\d+))?$/.exec(t);
      if (!m) return { ok: false, error: `Bad sortie leg "${t}". Each leg is col,row [direction minutes], ${example}` };
      const to = offsetToAxial(Number(m[1]), Number(m[2]));
      if (!m[3]) {
        legs.push({ to, minutes: 0 });
        continue;
      }
      const centreDeg = COMPASS[m[3]] ?? (/^\d+$/.test(m[3]) && Number(m[3]) < 360 ? Number(m[3]) : undefined);
      if (centreDeg === undefined) return { ok: false, error: `Unknown direction "${m[3]}". Use n ne e se s sw w nw or degrees 0-359` };
      legs.push({ to, centreDeg, minutes: Number(m[4]) });
    }
    return { ok: true, command: { type: 'sortie', unitId, legs } };
  }
  if (verb === 'stop') return { ok: true, command: { type: 'stop', unitId } };
  if (verb === 'launch' || verb === 'burst' || verb === 'hold' || verb === 'resume') return { ok: true, command: { type: 'uav', unitId, action: verb } };
  if (verb === 'route') {
    const legs: Hex[] = [];
    for (const t of rest.slice(1).join(' ').split(';').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(t);
      if (!m) return { ok: false, error: `Bad waypoint "${t}". route takes col,row pairs separated by ;, e.g. uav: route 60,80; 70,90` };
      legs.push(offsetToAxial(Number(m[1]), Number(m[2])));
    }
    if (legs.length === 0) return { ok: false, error: 'route needs at least one waypoint, e.g. uav: route 60,80; 70,90' };
    return { ok: true, command: { type: 'uav', unitId, action: 'route', legs } };
  }
  if (verb === 'power') {
    const watts = Number(rest[1]);
    if (!(watts > 0)) return { ok: false, error: 'power needs watts, e.g. hq: power 5' };
    return { ok: true, command: { type: 'power', unitId, watts } };
  }
  if (verb === 'antenna') {
    if (rest[1] === 'omni') return { ok: true, command: { type: 'antenna', unitId } };
    if (rest[1] === 'toward' || rest[1] === 'towards') {
      const towardId = unitIdFor(side, rest[2] ?? '', known);
      if (!towardId) return { ok: false, error: 'antenna toward needs one of your units, e.g. hq: antenna toward relay' };
      return { ok: true, command: { type: 'antenna', unitId, towardId } };
    }
    return { ok: false, error: 'antenna takes "toward <unit>" or "omni"' };
  }
  if (verb === 'decoy') {
    if (rest[1] === 'off') return { ok: true, command: { type: 'decoy', unitId } };
    const netId = netIdFor(side, rest[1] ?? '', known);
    if (!netId) return { ok: false, error: `decoy needs a net (${Object.keys(nets).join(' ')}) or off` };
    return { ok: true, command: { type: 'decoy', unitId, netId } };
  }
  if (verb === 'jam') {
    if (rest[1] === 'off') return { ok: true, command: { type: 'jam', unitId } };
    // Red jams Blue's nets, Blue jams Red's.
    const enemy: PlayerSide = side === 'red' ? 'blue' : 'red';
    const enemyNets = NET_ALIASES[enemy];
    const netId = netIdFor(enemy, rest[1] ?? '', known);
    if (!netId) return { ok: false, error: `jam needs an enemy net (${Object.keys(enemyNets).join(' ')}) or off` };
    const mode = rest[2];
    if (mode !== undefined && !JAM_MODES.includes(mode as JammerMode)) return { ok: false, error: `jam mode must be one of ${JAM_MODES.join(', ')}` };
    return { ok: true, command: { type: 'jam', unitId, netId, mode: mode as JammerMode | undefined } };
  }
  return { ok: false, error: `Unknown order "${verb}". Type help for the list.` };
}
