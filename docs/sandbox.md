# Windjam: the sandbox map and missions

The reference for the sandbox map and the missions. The landing page is the [README](../README.md); the Link lab is described there and in [design-curriculum.md](design-curriculum.md).

A browser simulation for exploring communications electronic warfare (EW): how radio links behave over terrain, how jamming degrades them, how they are protected, and how an enemy's emitters are detected and located. It follows the structure of *Modern Communications Jamming Principles and Techniques* (Poisel). Section references (§1–§8) point to the CliffNotes summary of that book.

Everything shown is calculated, not scripted. A link turns red because the physics says its bit error rate crossed a threshold. The map, the link panel, the tools and the scope all read from one engine.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # every engine and UI test
npm run build      # typecheck + production build
```

Requires Node 22.

## The world

- **Map.** 256 × 160 hexes of 500 m, about 128 × 69 km. The terrain is water, plain, forest, hill and mountain, each with an elevation. It is generated from a seed, and every seed has the same terrain mix (10% water, 10% mountain). **New map** picks a new seed.
- **Operating area.** A 32 × 17 km block in the centre. The map opens on it (**Home**). **Fit** shows the whole world.
- **Sides.** Blue in the west, Red in the east, plus two civilian emitters that currently have no effect.

| Unit | Blue | Red | Notes |
|---|---|---|---|
| HQ | 1 | 1 | 50 W, 10 m mast, hub of its command net |
| Squad | 3 | 3 | 5 W manpack, 2 m antenna, also an ES sensor |
| Relay | 1 | 1 | 20 W, 15 m mast, cross-band retransmission |
| EW team | 1 | 1 | 200 W jammer |
| Drone | 1 | — | Squad-launched quadcopter: ES sensor at 150 m, 40 km/h, 30 min endurance, tethered to 5 km of Blue Squad 2 unless on a sortie |

- **Nets.**

| Net | Frequency | Shape | Starting waveform |
|---|---|---|---|
| Blue Command | 60 MHz | hub at Blue HQ | fixed |
| Blue Retrans | 70 MHz | squad → relay hop | fixed |
| Red Command | 45 MHz | hub at Red HQ | slow hopping, 100 hops/s |
| Red Retrans | 48 MHz | squad → relay hop | fixed |
| Red Squad | 52 MHz | every squad to every squad | fixed |

- **Movement rules.** Right-click moves the selected unit. Squads and HQs can't enter water or mountains. Relays and EW teams can go on mountains. Drones fly anywhere within their control range. A rejected move flashes the hex red with the reason.

## Radio propagation (§5, §8)

Each link is analysed along the straight line between its two antennas over the terrain profile:

- **Base loss.** Free-space loss up to the two-ray breakpoint distance. Beyond it, two-ray ground-reflection loss (inverse fourth power). Antenna heights count from the mean terrain along the path, so a site on a hilltop gains height.
- **Obstructions.** Single knife-edge diffraction (ITU-R P.526) at the worst obstacle. Obstacles include 20 m trees on forest hexes and the earth's curvature (4/3-earth model).
- **Clutter.** +6 dB for an antenna inside forest.
- **Noise.** Receiver noise figure plus man-made noise from ITU-R P.372. Rural, or urban at about 9.6 dB more.
- **Bit error rate.** Noncoherent BFSK at 16 kbps in a 25 kHz channel.
- **Link quality.** Uses the BER regimes from §3: good below 10⁻³, degraded up to 10⁻¹, denied at 10⁻¹ and above.

**Relays.** A hub net can route a squad through its relay: squad to relay on the retrans frequency, then relay to HQ on the command frequency. The relay route is used only when the direct link isn't good and the relay route has a lower BER. Two-hop BER is `1 − (1−p₁)(1−p₂)`.

## Waveforms (§3, §4)

Set per net in the side panel.

- **Fixed frequency.** One 25 kHz channel.
- **Frequency hopping.** Hops across 2,320 channels (30–88 MHz in 25 kHz steps). Presets are slow (100/s, 160 bits per hop) and fast (32,000/s, 2 hops per bit), or a custom rate.
- **Direct sequence (DSSS).** Spread over the chip rate (default 5 MHz). Processing gain is spread bandwidth over data rate, 24.9 dB at the default. Resistance to jamming and low probability of detection both follow from the signal occupying 5 MHz. Nothing is added as a special case.

## Jamming (§5, §6)

Each EW team has nine modes:

| Mode | What it does |
|---|---|
| Off | Silent, and invisible to enemy ES |
| Spot | All power on the target net's channel. A hopper lands there 1 hop in 2,320. |
| Barrage | Power spread over 30–88 MHz, about −33.7 dB per channel. Hits every net, including your own. |
| Partial-band | Noise over a fraction ρ of the band around the target. A hopper is hit ρ of the time, at 1/ρ the power density of barrage. |
| Multitone | q CW tones across the band, each at 1/q power |
| Pulse | Bursts at duty k on the target channel, with 1/k peak power |
| Swept | One full-power tone swept across the band |
| Follower | Chases a hopper's current channel but arrives late (reaction time plus extra path delay), so it covers only the rest of each dwell. Fast hoppers outrun it. |
| Sync (smart) | Jams only packet headers (3% of air time). A lost header loses the whole packet. |

- **How it combines.** Every receiver is in one of three states, with time shares that sum to 1: clear, jammed (BER from Eb/(N0+J0)), or lost (BER 0.5). BER is averaged over those time shares.
- **Front-end overload.** If a jammer's peak power at the antenna exceeds −20 dBm, the receiver loses everything for the jammer's on-time, on every net, even with no jammer energy in its channel.

## Timeliness (§1)

Jamming doesn't change what an order says. It delays it.

1. BER becomes the packet error rate for 1,024-bit packets, calculated separately for each state.
2. Packets are resent up to 8 times (ARQ).
3. The result is the time to deliver a 32-packet order against a 20 s decision window.

Each link's order is **on time**, **late** or **lost**. The panel header shows the headline score, *orders on time* per side.

## Detection and direction finding (§2, §7)

- **Sensors.** Every squad, and the drone while it is within control range.
- **Detector.** An energy detector per 25 kHz channel across 30–88 MHz. Noise alone gives a Rayleigh envelope, and signal plus noise a Ricean one.
- **Threshold.** You set the false-alarm probability (Pfa) and the threshold follows (Neyman-Pearson). Detection probability is the Marcum Q function, tested against the textbook point: Pfa 10⁻⁶ needs 13.2 dB for Pd 0.9.
- **False alarms per sweep.** Pfa × 2,320 channels.
- **Urban noise.** It is impulsive. Without a limiter the real false-alarm rate is 30× the setting. The limiter fixes this at a 2 dB SNR cost.
- **Low probability of intercept and detection.**
  - A hopper is caught on about 63% of sweeps. A fast hopper also loses energy within each 1 ms look.
  - A DSSS emitter puts only 25 kHz of its 5 MHz into a search channel.
  - Pulse and sync jammers are detected on their average power, so they are harder to find.
- **Direction finding.** Each sensor with Pd ≥ 0.5 measures a bearing. The error is 20°/√SNR, with a 2° floor, and is seeded so it repeats. Two or more bearings give a weighted least-squares fix with an error ellipse, a CEP (the radius half of fixes fall within) and the actual miss distance.
- **On the map.** Detection rings around detected emitters: white for Pd ≥ 0.9, yellow 0.5–0.9, orange 0.1–0.5. Pink bearing lines, an X at each fix, and its error ellipse.

## Tools

| Tool | Use |
|---|---|
| **Select** | Click to select a hex or unit. Right-click to move. Shows unit radios, links, jammer controls, and full link detail. |
| **Line of sight** | Click two hexes. Shows a side view with ground coloured by terrain, trees, earth curvature, the ray, the first Fresnel zone and the worst obstacle, plus the loss breakdown. By default the map turns and zooms so A and B sit directly above the ends of the chart. |
| **Coverage** | Click a hex or unit to place a transmitter. **Signal** colours every hex within range by received power. **J/S** colours each hex by the time-averaged J/S a receiver there would see from a chosen jammer, in its current mode, against that transmitter. |
| **Scope** | Click a unit and choose an incoming link. Four instruments, all resolved in time on a slow-motion clock: **Spectrum** (live, average or max-hold), **Waterfall**, **Time trace** (signal, noise and noise-plus-jamming in the listened channel, with a strip showing the BER regime) and **Constellation** (BFSK detector outputs, one dot per bit). |

## Mission mode

Four missions share one engine. Click **Mission 1: find the enemy**, **Mission 2: stay hidden**, **Mission 3: duel** or **Mission 4: track the UAV** in the sandbox header.

### Mission 1: find the enemy

Red is hidden and you command Blue from a `blue>` console. Full rules are in [docs/mission-find-the-enemy.md](mission-find-the-enemy.md).

- **Objective.** Fix 3 Red emitters to CEP under 1 km within 60 mission minutes.
- **Time.** Turn-based. The clock moves only on `wait <minutes>`.
- **Red.** Static, with each radio transmitting in about 20% of minutes on a seeded schedule.
- **DF tasks.** `sq1: df e 5` points Squad 1's receiver at a 90° sector for 5 minutes. Only squads and the UAV can DF. Each minute an active emitter in the sector is heard with probability `1 − (1 − Pd)^25`, and the bearings average down to `√(σ²/n + 1°²)`.
- **Reporting.** A finished task's bearings reach HQ only if the unit's route to HQ (direct or via the relay) can deliver. Otherwise the report is held and retried each minute. The UAV reports through its squad.
- **Picture.** HQ groups bearings into tracks (`E1 · 45 MHz hopper`). One bearing draws a wedge; two or more give a fix with an error ellipse and CEP. The console and the Tracks panel list them.
- **UAV sortie.** `uav: sortie 130,74 e 4; 140,90 n 3` flies a plan of one or more legs beyond the 5 km tether, listens radio-silent on each, then returns and hands every leg's bearings to its squad at once. Bearings on the same emitter from two legs give a fix from the drone alone. The quad flies at 40 km/h with 30 minutes' endurance, and can't be re-tasked while out.
- **Commands.** `<unit>: df <dir> <min>`, `<unit>: move <col>,<row>`, `uav: sortie <col>,<row> <dir> <min>; ...`, `<unit>: stop`, `wait <min>`, `status`, `picture`, `help`. Units: `hq relay sq1 sq2 sq3 uav ew`.
- **End and debrief.** The console reports the result but reveals nothing. `reveal` (which also ends a mission still running) shows where Red really was and opens a replay at T+0; `next` jumps to each moment the picture changed, `step`/`back` move a minute, `exit` leaves it. The map replays Blue's positions and HQ's tracks as they were, with Red units greyed until first heard and Red links only between found units.
- **Scripts.** [missions/](../missions/) holds plain-text console sessions. Load one from the script bar above the consoles (or from the mission picker) and play it a line, a turn or all at a time; paste one at the prompt; run it headless with `npm run mission -- missions/01-two-squads-triangulate.txt`, or let `npm test` check them all. A script may start with `seed <n>` for a repeatable run and declare `expect won|lost|running`.

Simplifications: perfect data association (bearings are grouped by the true emitter, so no ghost fixes), Red does not react, and Red's jammer is off.

### Mission 2: stay hidden

You command Red from a `red>` console while a scripted Blue, running one of three hunting plans chosen by the seed, looks for you. Full rules are in [docs/mission-stay-hidden.md](mission-stay-hidden.md).

- **Objective.** Blue wins with 3 fixes under 1 km on your real emitters. You win if it has fewer at T+60 and you delivered 4 of your 6 orders on time. Hidden but silent is a draw.
- **Orders.** One every ten minutes, each to a named squad. `send` transmits it: a one-minute burst from HQ (and the relay if routed through it), then the squad's acknowledgement. Every send is a bearing for Blue.
- **Electronic protection.** `emcon <net> <pct>` cuts background chatter; `<unit>: power <W>`; `<net>: waveform fixed|slow|fast|dsss`; `hq: antenna toward relay` (+6 dBi on axis, −14 dBi off, HQ and relay only); `ew: decoy cmd` makes the EW team transmit the net's signature so Blue fixes the wrong thing; `ew: jam cmd` holds Blue's reports at the cost of being the loudest emitter on the map.
- **Red's picture.** Your squads, relay and EW team listen all round. Blue is heard when it reports, acknowledges, or flies the UAV on a linked DF; a silent sortie is invisible.
- **Debrief.** `reveal` shows Blue's plan, what Blue got on each of your emitters and when (which transmission gave it away, heard by whom), where Blue's units were, and the fate of each order.

### Mission 3: duel

Two people at one screen, Blue on a `blue>` console and Red on a `red>` console side by side under the map, mission 2 rules, no scripted side. Full notes are in [docs/mission-duel.md](mission-duel.md).

- **Turns.** Each side types its orders into its own console; `wait <min>` from either advances the clock for both. Each console sees only its own side's lines.
- **Seats.** **Blue view**, **Red view** and **Umpire** in the panel choose whose picture the map and panel show. Umpire shows the truth and both pictures: Blue's tracks on Red in pink (E1, E2, ...), Red's tracks on Blue in amber (B1, B2, ...).
- **Result.** Blue wins with 3 fixes; Red wins by denying that and passing 4 of 6 orders on time; otherwise a draw. `reveal` from either console shows both sides' truth.
- **Scripts.** Lines carry their console: `blue> sq1: df e 5`, `red> send`. `expect blue|red|draw` checks the winner. See [missions/08-duel-hot-seat.txt](../missions/08-duel-hot-seat.txt). A prefixed line pasted into either console runs on the console it names.
- **One console.** Tick **One console** in the panel for a single `duel>` console showing both sides' lines tagged by side. Paste a whole duel script there at once.

This is the hot-seat step toward autonomous agents and networked play: the engine routes every command by the side that typed it, so a script or an agent can take either console.

### Mission 4: track the UAV

Two consoles, as in the duel. Red flies a reconnaissance UAV along a seeded ten-waypoint route and must get a report to Red HQ at least every three minutes; Blue tries to fix it. Full notes are in [docs/mission-track-the-uav.md](mission-track-the-uav.md).

- **Reports.** Each is a 6 s burst on the UAV link, forced when three minutes have passed, or sent early with `uav: burst`. It counts only if HQ receives it (the UAV-to-HQ direction of the link).
- **Fixes.** A moving emitter is fixed one minute at a time: two sites must hear the same burst. Blue wins with 5 fixes under 1 km; Red wins by completing the route with at most one report lost while Blue is short; otherwise a draw.
- **Red's levers.** `uav: launch|hold|resume|burst`, `uav: power <W>`, `uavlink: waveform dsss`, `uav: antenna toward hq`.
- **Blue's levers.** Short DF tasks, moving squads into the UAV's beam toward HQ, and `ew: jam uavlink`, which costs Red reports unless it turns the power up.
- **Script.** [missions/09-uav-track.txt](../missions/09-uav-track.txt).

### Mission 5: UAV hunt

The simplest two-sided mission, for long games between agents. Each side has an HQ and one UAV, 68 km apart, and nothing else. A UAV must report to its HQ every 5 minutes; every report is a burst the other side can hear. HQ and the UAV listen all round, the UAV's bearings come down with its next report, and the first UAV to hear the other's report from within 3 km wins. Draw at T+180. Orders: `uav: route <col>,<row>; ...`, `launch`, `hold`, `resume`, `burst`, `power`, `uavlink: waveform`, `antenna toward hq`. Notes in [docs/mission-uav-hunt.md](mission-uav-hunt.md), script in [missions/10-uav-hunt.txt](../missions/10-uav-hunt.txt), agent brief in [agents/hunt.md](../agents/hunt.md).

### Game server and agents

`npm run serve -- --mission uav --seed 4242 --turn 5` runs one mission with a console per side over HTTP (`POST /blue`, `POST /red`, `GET /state?side=`, `POST /<side>/end`; the clock advances when both sides have ended their turn). Open the GUI with `?server=http://localhost:8787` to watch it from the umpire seat, type into either console, and replay it when it ends. Finished games are archived in `games/` (`npm run games` tabulates them). [agents/](../agents/) has the protocol, the player prompt and a brief per side, so two AI agents can play each other while a person watches. Ground moves route around terrain (A*), and every unit starts with a working link to its HQ on every seed.

### Planned: a commander and unit agents per side

[docs/design-hierarchical-agents.md](design-hierarchical-agents.md) specifies the next steps for agent play: one commander agent per side at HQ, one small agent per unit, the commander's orders carried over the simulated radio net with its delay, loss and jamming, a staff of analyst agents (signals, EW, own comms, operations) that work from HQ's picture with the engine's own calculations exposed as side-limited analysis endpoints, a dedicated agent harness with tools and TTPs kept apart, network and RF planning tools, and real terrain. Not built yet; the note has the engine changes, endpoints, briefs, metrics, experiments and build order.

### Replay bar (all missions)

When a mission is over, a bar under the map offers **Reveal and replay**, then transport controls: to start, back a minute, play/pause, forward a minute, next event, a scrubber, and a speed (3 s, 1 s or 0.3 s per mission minute). As it plays, the map and the timeline move to that minute and the console narrates what each side said and heard in it. The console commands `next`, `step`, `back` and `exit` still work.

### Scenarios

The mission picker lists 18 scenarios ([docs/design-scenarios.md](design-scenarios.md)), each a script for both sides on its own forces: crossing angles, a weak bearing, a relay route under jamming, Red's power discipline, a decoy, a waveform race, jammer modes against the clock, a UAV sortie, finding a hub among nine radios, an HQ that moves, four fox hunts (one hunter on foot closing on a transmitter), and four against a distributed air-defence net (radar sites reporting to a fire control node that orders launchers, denied by jamming the links). Play runs one to the end and opens the replay; the inspector then shows what each was built to show. Scenario scripts are `missions/sNN-*.txt`, with a `scenario <id>` directive; they also run headless and in the test suite.

### Replay inspector (all missions)

While the replay is open and paused, an inspector sits under the replay bar ([docs/design-replay-inspector.md](design-replay-inspector.md)). **Minute** lists what happened in the minute that just ended, by emitter: who transmitted, who heard it (SNR and the bearing measured), which reports got through and which tracks changed, plus the orders typed. **Fix** takes a track (choose one, or click a track row in the panel) and rebuilds its fix from its first k bearings: a slider walks from one wedge to two crossing lines to the ellipse, the map follows, and each bearing is traced to the minutes its sensor heard the emitter and the σ sum. **Link** shows a link's budget at that minute, with the orders that set the power, antenna, waveform and jamming it uses. Each view links to the Link lab lesson that teaches the sum, opened in a new tab so the replay stays put.

Snapshots keep each minute's radio settings, so a replay minute's link colours and budgets are that minute's.

### Timeline (all missions)

The **Timeline** button in the mission panel swaps the map for a sequence chart: one lifeline per unit on both sides, minutes down the page. Task windows are bars, transmissions are dots coloured by kind (amber orders, green reports, pink decoy, purple jamming, cyan UAV link, grey chatter), captures are arrows from emitter to sensor, reports are arrows to HQ, and fixes are diamonds on the HQ lifeline. Hover for detail; after the mission, click a minute to move the replay there. The chart is built from a structured event record the engine keeps alongside the console log.

## Map display

- **Navigation.** Scroll to zoom from 50% to 4,000%. Drag to pan. **Home** and **Fit** buttons.
- **Layers ▾.**
  - Terrain as elevation (greyscale, the default), colour or off.
  - Toggles for hex grid, radio links, jamming, detections, DF, units, coverage heatmap and legend.
- **Hover tooltip.** Terrain, elevation, movement rule, grid position and unit. In the Coverage tool it also shows received power and J/S.
- **Performance.** The map redraws only when something changes. Hex borders hide when hexes are tiny on screen.

## Architecture

```
src/engine/    pure TypeScript: no DOM, deterministic, seeded
  hex.ts         axial hex maths, lines, offset conversion
  map.ts         terrain generation
  terrain.ts     terrain properties and who may enter
  units.ts       units, radios, nets, waveforms, jammer configs
  rf.ts          path loss, diffraction, noise
  ew.ts          jamming patterns, band overlap, follower race, overload, BER
  budget.ts      per-direction link budget with clear/jammed/lost states
  timeliness.ts  packet errors, ARQ, order delivery
  detect.ts      ES detection, Marcum Q, LPI/LPD, direction finding and fixes
  coverage.ts    signal and J/S maps
  scope.ts       time-resolved spectrum, hops, gates, trace samples, BFSK symbols
  world.ts       World state, commands, step(), link views and routing
  scenario.ts    starting world
  mission/       mission 1: command parser, turn logic, DF tasks, reports, HQ picture
src/ui/        React panels and a Pixi.js map that read the engine
```

- **Commands.** Every change goes through `step(world, commands)`, which validates each command and returns a new world. The commands are `moveUnit`, `setJammer`, `setWaveform`, `setPfa`, `setLimiter` and `setNoiseEnv`. The UI issues the same commands an AI or a script would, which is what lets the simulation become a game later.
- **Tests.** The engine tests check each model against reference values: free-space loss, the knife-edge diffraction curve, Fresnel radius, band dilution, the BFSK BER formula, Marcum Q, processing gain and the follower timing. They also check that the time-resolved scope agrees with the link budget.
- **Stack.** TypeScript, React 19, Pixi.js 8, Vite, Vitest.

## Simplifications

These are deliberate and worth knowing when you read the numbers:

- **Pessimistic path loss.** Two-ray loss plus diffraction overstates the loss on blocked paths.
- **Tuning values are assumptions, not measured data.** This covers radio presets, terrain losses, the overload threshold, the urban false-alarm factor and the limiter cost.
- **No error correction.** Any bit error loses a packet.
- **Fast hopping.** Modelled only through its short dwell. Diversity gain is not modelled.
- **Several jammers.** When several hit at once, their powers simply add.
- **Nets transmit continuously.** Every radio is treated as always on, in the link budgets, detection and the scope. Real nets take turns.
- **Detection has no game effect yet.** Undetected units aren't hidden, because there is no fog of war.

## Not built yet

| Code | Item |
|---|---|
| T11 | Civilian emitters cost points when jammed |
| T12 | Game layer beyond mission 1: more missions, scoring across missions, Red that reacts, AI opponent |
| T13 | Urban terrain (§8): shadowing, street canyons, rooftops |
| T14 | Design document mapping each mechanic to the notes |
| T15 | Less pessimistic diffraction model |
| T16 | Rejected-move labels can be clipped at the map edge |
| T17 | Git repository and history |
| T18 | Bundle size warning |
| T19 | Drone downlink as a detectable, jammable emitter |
| T20 | Red drone |
| T21 | Scenarios that use the wider world |
| T22 | Persist layer choices |
