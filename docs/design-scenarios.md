# Design: scenarios with autoplay

The five missions all use one set of forces (`UNIT_SPECS` in `scenario.ts`): an HQ, three squads, a relay and an EW
team a side, Blue west and Red east. Scenarios change that. A scenario names its forces, its rules, its seed, and a
script for both sides, so it plays itself to the end and opens the replay, where the inspector
(docs/design-replay-inspector.md) shows what each one was built to show.

## 1. Decisions

D1. **A scenario is a script with a `scenario` directive.** `missions/sNN-<name>.txt` starts with `scenario <id>`.
The id names a definition in `src/engine/mission/scenarios.ts`: title, what to watch for, the rule set
(`MissionKind`), the seed, the forces, both sides as consoles, and any chatter settings. The rest of the file is the
two-side console script, `blue>` and `red>` lines as in a duel. The script loader, the headless runner and the test
suite already run such files; they gain the directive and nothing else.

D2. **Forces are data.** `createScenario(seed, forces)` takes the unit specs and nets; the standard set is the
default. Console names come from the ids (`r-radar1` is `radar1`, `r-fox` is `fox`), so new units need no alias
table. Positions are on the 1 km reference grid as now, nudged onto open ground and into link with their HQ.

D3. **Two new rule sets.** *fox*: Blue wins when a Blue squad stands within 1 km of a Red transmitter; the hunter
keeps its own picture, so its bearings need no net back to an HQ. *iads*: Red runs an engagement cycle every 5
minutes: each radar site sends a track report to the fire control node on the report net, and the fire control node
sends an engagement order to a launcher on the order net. Each leg is delivered on time, late or lost by the link
budget, as orders are now. An engagement counts when both legs are on time. Blue wins when it has denied 6; Red wins
with 8 completed at T+60; otherwise a draw.

D4. **Jammer modes from the console.** `ew: jam <net> [spot|barrage|partial|pulse|follower|sync]`, spot by
default, with the sandbox's defaults for the mode's parameters. The inspector's Link tab then shows each mode's
budget beside the order that chose it.

D5. **Scripts are pre-planned, not reactive.** The autoplay is a written session for both sides. It knows the seed,
so it can walk a hunter toward the fox or jam the right net at the right minute. It is deterministic and repeatable,
which is what a teaching replay needs. Reactive play is the agents' job over the game server, on the same scenarios.

D6. **One way to play.** The mission picker lists the scenarios with a line on what to look for. Play loads the
script, runs it to the end and opens the replay. The script bar still allows stepping through a turn at a time.

## 2. The scenarios

Standard forces unless stated. Positions are reference-grid columns and rows.

| Id | Title | Forces | The autoplay | Watch in the inspector |
|---|---|---|---|---|
| s01 | Crossing angle | Blue: HQ, 2 squads. Red: HQ chattering | Both squads DF from close together, then one walks 8 km north and both DF again | Fix: the same two sensors, a 15° crossing against a 60° one |
| s02 | The weak bearing | Blue: HQ, 2 squads, UAV. Red: HQ at 5 W, far east | Three sensors DF for 10 minutes | Fix: σ from SNR per bearing; the weak one barely tightens the ellipse |
| s03 | Behind the ridge | Blue: HQ, relay, 2 squads east of a ridge. Red: HQ, EW team | Red spot-jams Blue's retrans net at T+15 | Link: the relay route and its two-hop budget; Minute: reports held |
| s04 | Power discipline | Standard | Red steps down: 10 W, antenna toward the relay, DSSS, at T+10, 20, 30. Blue hunts | Link: each order above the budget it changed; Fix: Blue's CEP stops improving |
| s05 | The decoy | Standard | Red runs the decoy from T+2; Blue hunts | Fix: a tight fix on the EW team, "actually 12 km off"; Minute: emits say decoy |
| s06 | Waveform race | Blue: HQ, 3 squads. Red: HQ, 2 squads | Red's command net goes fixed, slow hopping, DSSS at T+0, 15, 30 | Minute: captures thin out; Link: processing gain appears |
| s07 | Jammer against the clock | Standard | Blue EW cycles spot, barrage, pulse against Red's command net, 10 minutes each, while Red passes orders | Link: J/S, clear/jammed/lost, the order verdict per mode |
| s08 | Sortie geometry | Blue: HQ, 1 squad, UAV. Red: HQ | The UAV flies a two-leg silent sortie | Fix: a moving sensor's two legs crossing |
| s09 | Find the hub | Blue: HQ, 2 squads, UAV. Red: HQ, 2 relays, 6 squads | Blue DFs the busiest signature first | Minute: nine emitters; Fix: the hub tightens first |
| s10 | The HQ that moves | Standard | Red HQ relocates 6 km every 15 minutes | Fix: old bearings pull the fix behind; the ellipse grows |
| s11 | Plain fox hunt | Blue: HQ, 1 hunter. Red: 1 fox, chattering 90% | DF, walk 2 km along the bearing, repeat | Fix: successive places from one platform |
| s12 | The shy fox | As s11, fox at 20% | Longer listens per stop | Minute: empty minutes; bearing origin with few captures |
| s13 | The moving fox | As s11, fox moves 1 km between transmissions | Hunter as s11 | Fix: the fix lagging the fox; the true miss |
| s14 | Two foxes | Blue: 1 hunter. Red: 2 foxes on 50 and 53 MHz | The hunter closes on the nearer | Minute: two emitters; Fix per track |
| s15 | Map the net | Blue: standard. Red: fire control, 3 radars, 4 launchers | Red cycles; Blue hunts | Minute: the reporting rhythm; the fire control node sends most |
| s16 | Cut the reports | As s15 | Blue jams the report net from T+20; Red raises radar power at T+35 | Link: report links late then lost, Red's power order beside it |
| s17 | Cut the orders | As s15 | Blue jams the order net from T+20; Red moves a launcher to high ground at T+30 | Link: the losses that decide which launcher the jammer reaches |
| s18 | Decoy radar | As s15 plus a Red EW decoy | Blue jams the decoy's net until T+30, then the real one | Fix: a tight fix 9 km off; Link: J/S at a receiver that does not matter |

## 3. Engine changes

| Change | Where |
|---|---|
| `Forces`, `STANDARD_FORCES`, `createScenario(seed, forces)` | `scenario.ts` |
| Console names from ids; `jam` takes a mode | `commands.ts` |
| `createMission(seed, kind, { forces, humans, emcon, scenario })`; fox and iads rules; the engagement cycle; status and debrief lines | `mission.ts`, `types.ts` |
| Scenario definitions | `scenarios.ts` |
| `scenario` directive | `script.ts` |
| Each scenario script runs clean and meets its `expect` | `scripts.test.ts` |

## 4. UI

| Piece | Where |
|---|---|
| Scenario list with Play in the mission picker | `MissionPicker.tsx` |
| Play: load, run all, reveal | `App.tsx` |
| Titles and objective text for fox and iads | `MissionPanel.tsx` |

## 5. Left out

Reactive autoplay in the app, radar as an emitter in its own right (a radar here is its reporting link), and
scenario editing in the browser.
