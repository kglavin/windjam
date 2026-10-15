import { type Hex, offsetToAxial } from '../hex';
import type { Waveform } from '../units';
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
  return unitId;
};

export const netAliasOf = (netId: string): string => {
  for (const side of ['blue', 'red'] as const) {
    const hit = Object.entries(NET_ALIASES[side]).find(([, id]) => id === netId);
    if (hit) return hit[0];
  }
  return netId;
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

const WAVEFORMS: Record<string, Waveform> = {
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
    'uav: sortie <col>,<row> <dir> <min>; ...   silent sortie: fly each leg, DF there, then home; all legs reported on return',
    "ew: jam uavlink  ·  ew: jam off    mission 4: spot-jam the Red UAV's telemetry link (the jammer itself is loud)",
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
    "ew: jam cmd  ·  ew: jam off        spot-jam Blue's command net (holds Blue's reports; the jammer itself is loud)",
    'uav: launch  ·  uav: hold  ·  uav: resume  ·  uav: burst   missions 4-5: fly the route, pause at the next waypoint, report to HQ now',
    'uav: route <col>,<row>; <col>,<row>; ...   mission 5: replace the UAV route (it flies on from where it is)',
    ...COMMON_HELP,
    `units: ${Object.keys(UNIT_ALIASES.red).join(' ')} · nets: ${Object.keys(NET_ALIASES.red).join(' ')}`,
  ],
};

export type ParseResult = { ok: true; command: MissionCommand } | { ok: false; error: string };

export function parseCommand(input: string, side: PlayerSide = 'blue'): ParseResult {
  // send <unit>: <text> passes free text to a unit over the net. The text keeps its case; the bare send is mission 2's.
  const order = /^send\s+([^\s:]+)\s*:\s*(.*)$/i.exec(input.trim());
  if (order) {
    const toId = UNIT_ALIASES[side][order[1].toLowerCase()];
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
  if (first === 'reveal') return { ok: true, command: { type: 'reveal' } };
  if (first === 'next' || first === 'step' || first === 'back' || first === 'exit') return { ok: true, command: { type: 'replay', move: first } };
  if (first === 'wait') {
    const minutes = Number(rest[0]);
    if (!(minutes > 0) || !Number.isInteger(minutes)) return { ok: false, error: 'wait needs a whole number of minutes, e.g. wait 5' };
    return { ok: true, command: { type: 'wait', minutes } };
  }
  if (first === 'send') return { ok: true, command: { type: 'send' } };
  if (first === 'emcon') {
    const netId = nets[rest[0] ?? ''];
    const pct = Number(rest[1]);
    if (!netId) return { ok: false, error: `emcon needs a net (${Object.keys(nets).join(' ')}) and a percentage, e.g. emcon cmd 5` };
    if (!(pct >= 0 && pct <= 20)) return { ok: false, error: 'emcon percentage must be between 0 and 20' };
    return { ok: true, command: { type: 'emcon', netId, duty: pct / 100 } };
  }

  // <net>: waveform ...
  if (nets[first] && rest[0] === 'waveform') {
    const wf = WAVEFORMS[rest[1] ?? ''];
    if (!wf) return { ok: false, error: `waveform must be one of ${Object.keys(WAVEFORMS).join(', ')}` };
    return { ok: true, command: { type: 'waveform', netId: nets[first], waveform: wf } };
  }

  const unitId = units[first];
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
      const towardId = units[rest[2] ?? ''];
      if (!towardId) return { ok: false, error: 'antenna toward needs one of your units, e.g. hq: antenna toward relay' };
      return { ok: true, command: { type: 'antenna', unitId, towardId } };
    }
    return { ok: false, error: 'antenna takes "toward <unit>" or "omni"' };
  }
  if (verb === 'decoy') {
    if (rest[1] === 'off') return { ok: true, command: { type: 'decoy', unitId } };
    const netId = nets[rest[1] ?? ''];
    if (!netId) return { ok: false, error: `decoy needs a net (${Object.keys(nets).join(' ')}) or off` };
    return { ok: true, command: { type: 'decoy', unitId, netId } };
  }
  if (verb === 'jam') {
    if (rest[1] === 'off') return { ok: true, command: { type: 'jam', unitId } };
    // Red jams Blue's nets, Blue jams Red's.
    const enemyNets = NET_ALIASES[side === 'red' ? 'blue' : 'red'];
    const netId = enemyNets[rest[1] ?? ''];
    if (!netId) return { ok: false, error: `jam needs an enemy net (${Object.keys(enemyNets).join(' ')}) or off` };
    return { ok: true, command: { type: 'jam', unitId, netId } };
  }
  return { ok: false, error: `Unknown order "${verb}". Type help for the list.` };
}
