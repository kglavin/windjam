# Mission 1: Find the enemy

Blue starts with its own units known and Red hidden. You command Blue by typing orders at a `blue>` prompt. Your units take bearings on Red radio emissions and report them to HQ over Blue's own radio net. HQ combines the bearings into fixes. You win by fixing enough Red emitters, accurately enough, before time runs out.

This is the first use of the engine as a game. It adds three things to the sandbox:

1. **Blue's picture, separate from the truth.** Red is shown only through what Blue has reported.
2. **A mission clock.** Orders take minutes, and time is limited.
3. **A command line.** Orders become timed actions that produce reports.

## Rules

### Objective

| Item | Value |
|---|---|
| Win | Fix 3 Red emitters, each with an estimated error (CEP) under 1 km |
| Time limit | 60 mission minutes |
| When it ends | The console reports the result. Nothing is revealed until you ask. |

### Reveal and replay

`reveal` ends the mission if it is still running, then prints where each Red emitter really was, found or never heard, and opens a replay at T+0 with Red visible on the map. Then:

- `next` jumps to the next minute where something changed: a unit moved, a report reached HQ, a track was fixed or refined. It replays that minute's console lines.
- `step` and `back` move one minute forward or back.
- `exit` returns to the final picture.

During the replay the map shows Blue where it stood at that minute, HQ's tracks as they were then, and each Red unit greyed out until the minute Blue first heard it. Red links are drawn only between units found by then. Unit positions and tracks are taken from a snapshot the engine keeps for every minute, so the replay is exact.

### What Blue knows

- **Blue units:** shown on the map as usual.
- **Red units, Red links and Red jamming:** hidden.
- **Red in Blue's picture:** shown only through *tracks* built from reports that reached HQ. Each track is labelled by what was heard, for example `E2 · 45 MHz hopper`, never by which Red unit it is.

| A track with | Shows as |
|---|---|
| 1 bearing | A wedge: the bearing ± 2σ out to 30 km. The emitter is somewhere inside it. |
| 2 or more bearings | A fix: an estimated position with its 2σ error ellipse and CEP |

- **Tools available:** only **Select** and **Line of sight**. Coverage J/S and the Scope would reveal Red, so they're off in mission mode.

### Time

- **Turn-based.** The clock moves only when you type `wait <minutes>`.
- **One order per unit.** A new order replaces the current one, with a warning.
- **Busy units.** A unit doing a timed order (DF, move) can't do anything else until it finishes.

### Red

- **Static.** Red units stay where the scenario put them.
- **Intermittent.** Each Red radio transmits in about 20% of minutes, following a seeded schedule so a replay gives the same result. A Red unit on more than one net (relay, squads) can be heard on each.
- **Red EW team:** off for this mission.

### Direction finding

`df <direction> <minutes>` points a unit's DF antenna at a 90° sector (direction ± 45°) for that many minutes. For each minute:

1. **Silent emitters, or emitters outside the sector:** not heard that minute.
2. **Active emitters:** the per-sweep detection probability `Pd` comes from the existing detection model (energy detector, Pfa 10⁻³, rural noise, hopper and DSSS intercept effects).
3. **Sweeps:** a sweep of the band takes about 2.3 s, so a minute holds 25 sweeps. The emitter is heard that minute with probability `1 − (1 − Pd)^25`. When heard, the minute yields `max(1, round(25 · Pd))` bearing measurements.
4. **Bearing error:** each measurement has error `σ = max(2°, 20°/√SNR)`, the same as the sandbox.
5. **End of the task:** the measurements for each emitter are averaged. The averaged error is `√(σ²/n + 1°²)`. The 1° term is the site error (local reflections, calibration), which averaging can't remove.

**Where sensors come from.** Only units with an ES receiver can DF: squads and the drone. HQ, the relay and the EW team cannot.

### Reporting

When a DF task ends, the unit writes a report: one bearing per emitter it heard, with the averaged error, measurement count and frequency signature.

**How a report reaches HQ.** It travels over Blue's radio net:

- **Squads:** the route the squad's command-net link uses, direct or through the relay.
- **Drone:** passes the report to its parent squad, which forwards it.
- **Delivered** if that route's order status isn't *lost*. It then reaches HQ the same minute, because delivery takes seconds.
- **Held** if the route is lost. The unit retries every minute, and the console shows `report held: no link to HQ`. Red jamming of this channel is future work, but the mechanism is already in place.

### Fusion at HQ

- **Grouping.** Bearings are grouped into tracks, one per Red emitter.
  - **Simplification:** grouping uses the true emitter identity. That's perfect data association, with no ghost fixes from wrongly paired bearings. Realistic association is future work.
- **Fixing.** A track with 2 or more bearings is fixed by the same weighted least-squares method as the sandbox, using each bearing's own sensor position and error.
- **Better geometry.** Bearings from units far apart, crossing at large angles, give small ellipses. Bearings from nearby units give long thin ones. Moving a unit before taking a second bearing is a valid technique.

### Silent sortie (UAV only)

`uav: sortie <col>,<row> <direction> <minutes>; <col>,<row> <direction> <minutes>; ...` is the alternative to a linked DF task. It is a flight plan of one or more legs, separated by semicolons:

1. **Each leg.** The drone flies to the point at 40 km/h (0.75 min per hex), then listens over the sector for the given minutes, radio silent. A leg with no direction and minutes is a transit waypoint. The 5 km tether doesn't apply: the plan is pre-programmed and flown without a control link. The remaining plan is drawn on the map as a dashed cyan line, and the current sector while listening.
2. **Back.** After the last leg it flies to its squad and, once within 1 km, hands over everything it heard: one bearing per emitter per leg, each from that leg's position. Bearings on the same emitter from two legs give a fix from the drone alone. The report then travels by the squad's route to HQ, or is held if that route is lost.

- **Endurance:** all flying (including the return) plus all time on station must be within the drone's endurance, 30 minutes for the squad quad. That is a practical radius of about 8 km with a few minutes on station. The console refuses longer plans and says why. Speed and endurance are properties of the drone, so bigger classes can be added later.
- **Unreachable:** while out, the drone can't be stopped or re-tasked.
- **If the squad moves** while the drone is away, the drone follows it on the way back.
- **Trade-off:** a linked DF reports at once but is tethered to the squad. A sortie reaches further and emits nothing while out, but the picture lags by the flight time. The emission advantage will matter once Red can detect Blue.

### Movement

`move <col>,<row>` moves a unit hex by hex in a straight line. It stops early at the first hex it can't enter.

| Unit | Minutes per hex | Speed |
|---|---|---|
| Squad, EW team | 1.5 | about 20 km/h |
| Drone | 0.75 | 40 km/h (squad-launched quadcopter), ignores terrain |
| Drone limit | — | can't move beyond 5 km of its parent squad |

## Commands

```
<unit>: df <direction> <minutes>   bearing sweep; direction n ne e se s sw w nw, or degrees 0-359
<unit>: move <col>,<row>           move to a grid position (see the hover tooltip for col,row)
uav: sortie <col>,<row> <dir> <min>; ...   silent sortie: fly each leg, DF there, then home; all legs reported on return
<unit>: stop                       cancel the current order
wait <minutes>                     advance the clock
status                             every unit: position, order, link to HQ, held reports
picture                            list tracks: bearings, fixes, CEP
help                               this list
```

- **Unit names:** `hq`, `relay`, `sq1`, `sq2`, `sq3`, `uav`, `ew`.
- **Format:** commands are case-insensitive. The colon after the unit is optional.

Example session:

```
blue> sq1: df e 5
[T+00] Squad 1: DF east (45°-135°) for 5 min.
blue> uav: df ne 5
[T+00] UAV: DF northeast (0°-90°) for 5 min.
blue> wait 5
[T+05] Squad 1: DF east done. 2 emitters, 3 bearings. Reported to HQ.
[T+05] UAV: DF northeast done. 1 emitter, 1 bearing. Reported to HQ.
[T+05] HQ: E1 (45 MHz hopper) fixed: CEP 0.8 km.
blue> picture
E1 · 45 MHz hopper   fixed, CEP 0.8 km, 2 bearings
E2 · 52 MHz          1 bearing (Squad 1, 97° ± 3°)
```

## How it fits the engine

- **Ground truth is the existing `World`,** and the sandbox models are reused unchanged: propagation, detection, link and order delivery.
- **New engine module `src/engine/mission/`:**
  - Mission state: clock, orders, held reports, picture, log, status.
  - A pure `issue(state, command)` and `advance(state, minutes)`, testable without the UI.
  - A command parser that turns text into typed commands or a helpful error.
- **Shared fix calculation.** It is factored out of `detect.ts` so the sandbox and the mission use the same maths.
- **UI.** A **Sandbox / Mission** switch in the header. Mission mode shows:
  - a console dock with the log and the `blue>` prompt
  - a mission panel with the brief, clock, objective progress and track list
  - the map drawn from Blue's picture

## Tests

- The parser accepts every form above and rejects malformed input with a reason.
- A DF task gives no bearings on emitters outside its sector.
- Averaging n bearings reduces the error as `√(σ²/n + 1)`.
- Reports are held while the route to HQ is lost, and delivered when it recovers.
- Two well-separated bearings on the same emitter give a fix near the truth.
- A seeded mission replays identically.
- The mission ends at 60 minutes, or as soon as 3 emitters are fixed under 1 km CEP.

## Later

- Red relocates or goes quiet when it detects Blue (Red ES against Blue emissions).
- Red jams Blue's reporting channel.
- Realistic data association, with ghost fixes.
- More missions: protect the net, jam the enemy's orders, escort the relay.
