# Design: the computer player

A side can be played by the engine itself: no server, no model, no script that knows the seed. The computer reads
what its side knows each turn and issues console orders through the same `issue` path a person or an agent uses. It
makes every mission playable against the computer in the browser, gives the scenarios a reactive opponent, and gives
the replay inspector decisions the computer made rather than ones a script fixed in advance.

## 1. Decisions

D1. **Behaviours, not a planner.** A behaviour is a pure function of the side's view and a small memory, returning
console commands for this turn. Five cover the missions and scenarios: *hunt* (Blue finds and fixes emitters),
*command* (Red passes its orders and protects its radios), *fox* (the one-person hunter), *iads-blue* (take the
air-defence net down) and *iads-red* (keep it up). A behaviour is chosen per side from the mission kind, or named.

D2. **Only what the side knows.** A behaviour sees its own units and their orders, its picture (tracks, bearings,
fixes), its console lines, and the events its own sensors produced. It never reads the enemy's units. The one
assumption it shares with the briefs is the side of the map the enemy is on: east of Blue, west of Red.

D3. **It plays in turns.** Every `turnMin` minutes (5 by default; every minute for the one-person fox hunt), at the
start of the minute and before the clock moves, the computer side speaks, as the mission 2 playbook does now and as an agent does on the server. Its lines are
echoed on its console (`> sq1: df e 5`), so the replay and the inspector show them as orders with their minute.

D4. **Deterministic and quiet.** No randomness beyond the mission seed, and no order the engine would reject: moves
are checked with the path finder and a free hex is chosen before the order is given, so a computer game has no error
lines and the script tests can run it.

D5. **The playbooks stay.** Mission 2's scripted Blue still exists; the computer is an alternative chosen at start.

D6. **Three ways to start it.** In the app, the mission picker gets "Computer plays Blue / Red" checkboxes for the
missions and the scenarios. A script can say `computer red` (or `blue`, or both). The server takes `--computer red`,
so an agent, or a person at the GUI, plays against it.

## 2. The behaviours

**hunt** (Blue in find, duel, uav, and any scenario on Blue's standard forces).
- Each turn, every idle DF-capable unit listens for the turn: toward a track without a fix (its last bearing, from
  that sensor if it has one, else from HQ), else toward the enemy side, the squads fanned over east-northeast, east and
  east-southeast so three sectors cover the front.
- When a track has a fix whose CEP has not improved for two turns, the squad with the shallowest crossing on it walks
  3 km perpendicular to its bearing, then listens again.
- With an EW team and a fixed enemy hub (the busiest signature), the team moves toward the fix, stopping 4 km short,
  and jams the hub's net.

**command** (Red in hide, duel, uav): `send` when an order window opens; `emcon cmd 5` at the start; when Red's own
picture holds a Blue jammer track, `cmd: waveform dsss`; when Red's reports show two Blue sensors heard from the same
side, `hq: antenna toward relay`.

**fox** (Blue in fox): the brief's procedure. Listen 4 minutes (8 for a shy fox: no capture in the first listen);
walk 4 km along the newest bearing; listen again; when a fix exists, walk to the fix's hex or the free hex nearest it;
with two tracks, follow the one with the smaller σ.

**iads-blue** (Blue in iads): hunt for two turns; once a 47 or 49 MHz track has a fix, take the busiest as the node;
move the EW team to 4 km short of it along the line from its own position; when it has arrived, `ew: jam track`; if
the next two cycles still complete (the engagements count in its status), switch to `jam fire`, then to `barrage`.

**iads-red** (Red in iads): `emcon track 0` and `emcon fire 0` at the start; when a cycle's report leg goes late or
lost, `track: waveform dsss` and the node's antenna toward the radar that failed; when an order leg fails, `fire:
waveform dsss` and the launcher it failed to walks 2 km away from the jammer's fix if there is one, else east.

## 3. Engine changes

| Change | Where |
|---|---|
| `Behaviour` type and the five behaviours; `computerTurn(s, side)` returning commands; `MissionState.computer` with each side's behaviour and memory; the hook at the start of a turn in `tick` | `src/engine/mission/computer.ts`, `mission.ts`, `types.ts` |
| `computer red` directive | `script.ts` |
| `--computer blue,red` and `computer` in `POST /new` | `scripts/serve.ts` |
| Tests: hunt fixes 3 emitters in mission 1 within the limit on several seeds; fox finds the fox in s11 and s12; iads-blue denies 6 against a passive Red; iads-red completes 8 against a scripted jammer; no error lines in any | `computer.test.ts` |

## 4. UI

| Piece | Where |
|---|---|
| "Computer plays Blue / Red" in the picker, for missions and scenarios | `MissionPicker.tsx`, `App.tsx` |
| The script bar line shows which sides the computer plays | `ScriptBar.tsx` |

## 5. Left out

Learning or search (the behaviours are fixed rules), a commander and unit split for the computer (the agents' C2
mode), and the computer playing the UAV hunt, which needs timing play the briefs describe and the rules do not yet.
