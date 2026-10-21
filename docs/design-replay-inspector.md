# Design: the replay inspector

The replay (docs/sandbox.md, "Replay bar") plays a finished mission back a minute at a time. It shows what each
side's picture looked like, but not how the picture came to be: why a fix has the ellipse it has, why a link was
denied, what an order cost. The inspector answers those questions. Pause the replay, point at a thing, and the panel
shows the sums behind it at that minute, using the engine's own functions and the Link lab's way of laying them out.

## 1. Decisions

D1. **Three questions, three views.** The inspector has three tabs. *Minute*: what happened in the minute shown, as
cause and effect (a transmission, who heard it, the bearings it gave, the track it changed). *Fix*: how a track's
fix was built from its bearings, one bearing at a time. *Link*: the budget of one link at that minute, with the
orders that set its power, antenna, waveform and jamming. The Minute tab is the way in: each line links to the fix
or the link it concerns.

D2. **The build-up is replayed on the map.** On the Fix tab a slider sets how many of the track's bearings count. The
panel recomputes the fix from the first k bearings with the engine's `fixFromBearings`, and the map draws that: one
wedge, then two lines and an ellipse, then the ellipse shrinking as bearings arrive. Nothing is animated by hand.

D3. **Each bearing is explained from its captures.** A reported bearing is the average of the minutes its sensor
heard the emitter. The event record keeps each capture with its SNR and that minute's σ (20° ÷ √SNR, floor 2°, over
√n sweeps), and the report's σ is √(1 ÷ Σ weights + site error²). The panel lists the captures under the bearing and
shows that sum, so a wide wedge traces back to a weak signal or few minutes.

D4. **Settings are snapshotted, so a replay minute's budget is that minute's.** Today a snapshot keeps positions,
tracks, sectors and plans; the replay's world uses the final radio settings. The snapshot gains each unit's power,
antenna, decoy and jammer, each net's waveform, and the emcon settings, and `viewOf` applies them. The Link tab then
reads the ordinary link budget at the minute shown, and the map's link colours in the replay become right too.

D5. **Orders beside their effect.** The Link tab lists the console orders, with their minutes, that set the state
the budget uses: power, antenna, waveform, emcon, decoy and jamming for either end and for any jammer hitting the
link. They come from the mission log, which already records every accepted order with its unit. In an agent game
that is the agent's decision shown next to what it bought.

D6. **The lab is the textbook.** Each view names the lesson that teaches its sum and links to that level: a bearing's
σ to level 6 C1, two and three bearings to level 6 D1 and E1, the budget ladder to level 0 F3, J/S and Eb/J0 to
level 2 B1, each jammer mode to the level that covers it (3 for partial-band and pulse, 4 for tones, 5 for sync, 7
for follower and sweep), hopping and spreading to 7 and 2. The lesson opens in a new tab, so the replay and the
inspector stay exactly as they were; the step is named in the link.

D7. **Pure functions, then a panel.** The sums live in `src/engine/mission/inspect.ts` as functions of a mission
state, a minute and a selection, with tests. The panel renders their results. Nothing in the panel computes.

## 2. The views

### Minute

For the minute shown, grouped by emitter:

- *Transmissions*: each `emit` event (unit, what, signature).
- *Heard by*: each `capture` of it (sensor, SNR, the bearing measured and its σ).
- *Reports*: each `report` sent that minute, delivered or held, and each `release` of a held one.
- *Picture*: each `track` event (new track, or a fix and its CEP).
- *Orders and acknowledgements*: `send` and `ack` events.
- *Console*: the orders typed that minute, both sides in the umpire seat.

Each track line opens the Fix tab on that track; each report or send line opens the Link tab on the link it used.

### Fix

For a chosen track (a dropdown, or from the Minute tab, or a click on a track row in the mission panel):

- The bearings in the order they reached HQ: sensor, bearing, σ, minutes heard, report minute. Under each, its
  captures and the σ sum (D3).
- A slider, 1 to n bearings. The fix from the first k: position, ellipse axes and angle, CEP, and the true miss
  (the replay shows the truth). With one bearing: a wedge and no fix. With two: why the crossing angle sets the
  ellipse's long axis. The map draws the truncated track (D2).
- The lesson links (D6).

A moving emitter (a UAV track) has one fix per minute from that minute's bearings; the slider then walks the
minutes instead.

### Link

For a chosen link of the side shown (a dropdown of the side's links at that minute, or from the Minute tab):

- The budget as the sandbox's link detail shows it: path, losses, signal, noise, each jammer's contribution, J/S,
  time clear/jammed/lost, SNR, processing gain, Eb/(N0+J0), BER each way, and the order verdict (on time, late,
  lost) with its latency.
- The orders that set the state in use (D5), newest first, each with its minute and console.
- The lesson links (D6).

## 3. Engine changes

| Change | Where |
|---|---|
| Snapshot gains `settings`: per unit power, antenna, decoy, jammer; per net waveform; emcon. `viewOf` applies them in a replay | `types.ts`, `mission.ts` |
| `inspect.ts`: `minuteEvents(s, minute, side)` grouped as in section 2; `fixBuildUp(s, track, k)`; `bearingCaptures(s, bearing)` with the σ sum; `linkOrders(s, minute, link)`; `lessonsFor(...)` | `src/engine/mission/inspect.ts` with tests |

## 4. UI

| Piece | Where |
|---|---|
| `Inspector` panel with the three tabs, shown under the replay bar while the replay is open and not playing | `src/ui/Inspector.tsx` |
| The map draws the truncated track while the Fix tab's slider is below n | `App.tsx` (the tracks passed to the map) |
| Track rows in the mission panel open the Fix tab | `MissionPanel.tsx` |
| Lesson links open the lab at the level in a new tab | `?chapter=lab&level=N` |

## 5. Left out

Playing the inspector forward (the panel updates as the replay plays; it reads the paused minute only), editing
hypotheses in the replay (the agents' analysis endpoints do that on a live game), and anything about the sandbox
map outside a mission.

## 6. Build order

1. Engine: snapshot settings and `viewOf`; `inspect.ts` with tests.
2. The panel, the map build-up, the track rows, the lesson links; render tests; a browser check.
3. docs/sandbox.md and the README.
