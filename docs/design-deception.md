# Design: the deception mission

Before D-Day the Allies kept a notional army in Kent: dummy tanks and aircraft, and above all radio traffic of the
size and rhythm of a real army, for German intercept and direction-finding to hear and locate. The mission puts both
sides of that on the lab's engine. One side runs a division's radio traffic across 300 km² for three days, some of it
real and some of it a ruse, with the ebb and flow of daily life and a ramp toward an operation. The other side has a
few intercept and DF sites, listens, and feeds an intelligence cell that must draw the order of battle and say where
and when the blow falls. The deceiver wins by the distance between that assessment and the truth.

## 1. Decisions

D1. **One mission kind, `deception`, ticking in hours.** A tick is an hour; a game is 72 ticks (three days). The
physics is unchanged: a bearing's error depends on SNR and the number of looks, not on the name of the time unit. Where
the engine has minute constants (sweeps per minute, movement rates, acknowledgement timeouts) the deception rules set
hourly ones. The replay, the sequence chart and the inspector show T+h.

D2. **The ground is the existing world.** The 128 × 69 km map holds the whole thing: the deceiver's area in the east
(the "coast"), the collector's sites across a "channel" of water in the west, as Blue and Red already sit. Terrain
comes from the seed as now.

D3. **A force is a tree of nets.** An order of battle is a tree: division, brigades, battalions, companies. Each node
is a hub net (the commander's radio as hub, subordinate commanders as members) placed on the ground round a centre
with a spread, so a brigade's battalions sit a few km apart and companies a km from their battalion. A generator
builds the tree from a template (a division of three brigades of three battalions of three companies, plus artillery,
signals and a reconnaissance net) and the seed. Every net has a frequency, a waveform and a daily traffic profile.

D4. **Real and notional.** The deceiver has one real force and places a notional one. A notional net transmits like a
real one but has nothing behind it: no company nets unless the deceiver pays for them, no movement unless scripted,
and a traffic profile the deceiver writes. The deceiver's budget is transmitters and operators: each notional net costs
one, and a real division's worth costs about sixty. The tells are what the budget forces: too few nets per brigade,
nets that never move, profiles too regular, acknowledgements that come too fast or not at all.

D5. **Traffic has three layers.** A daily curve per net (two peaks, quiet night), a ramp over the three days toward
the operation (traffic up, then the real force's silence in the last hours before it moves), and correlated flow: when
a net's hub sends an order, its members acknowledge within the hour and the members that are themselves hubs pass it
down in the next. The flow is what reveals the tree to a listener who times the bursts.

D6. **Association from signals.** Today a track is grouped by the true emitter, a stated simplification. Here the
collector's picture is built from what was intercepted: frequency, waveform, bearing and time. Captures on one
frequency and waveform whose bearings from two or more sites cross within the fix's error are one emitter; the same
frequency at an incompatible place is a second emitter on that net; a net is the set of emitters whose bursts answer
each other on one frequency. Association can be wrong, and that is part of the game. The old perfect association
stays for the other missions.

D7. **The product is an order of battle the engine scores.** The intelligence cell submits its assessment through the
console, as structured lines: a node (a net it believes exists, with a location, a level and a parent), a strength
estimate, and an objective (the sector and the hour). The engine scores it against the truth: nodes placed within 3 km
and at the right level, parent links right, strength within a factor, and the objective. A chart the player edits
comes later; the console grammar is the contract.

D8. **Both sides play as now.** A person at a console, a script, the computer player, or an agent over the server.
The analyst is a good task for an agent: it reads the intercept log and the picture, calls the pattern-of-life
analysis, and submits the assessment. The deceiver's computer behaviour runs the traffic plan and reacts to being
found (moves a notional hub, changes a frequency, adds a decoy).

## 2. The game

- **Deceiver** (Red, east). Three days. It has a real division in one sector and a notional one in another, with a
  budget of notional transmitters. Each hour it may change any net's profile, move a transmitter, go silent, add or
  drop a notional net, send an order down a tree, or run a decoy. Its objective is given by the scenario: the real
  operation's sector and hour. It scores by the collector's assessment error.
- **Collector and analyst** (Blue, west). Three or four fixed intercept and DF sites along the coast, one mobile
  site, each with an operator budget: how many channels it can watch at once. Each hour it tasks each site (watch a
  band, DF a signature, sweep) and reads what came in. At any hour it may submit or revise its assessment; the final
  one at T+72 counts, with a bonus for an assessment that was already right 12 hours earlier.
- **Score.** Node score: each assessed node within 3 km of a true net's hub at the same level, parent right or not.
  Strength: assessed radios per sector against the truth, within a factor of 1.5. Objective: the sector right, the
  hour within 6. The deceiver's score is 100 minus the collector's.

## 3. Forces and traffic

| Piece | What it is |
|---|---|
| Template | Division: HQ net; 3 brigades each with an HQ net and 3 battalion nets; each battalion 3 company nets; artillery net; reconnaissance net; signals (relay) net. About 40 nets, 160 radios |
| Placement | A sector centre and a spread per level: brigades 8 km from division, battalions 4 km from brigade, companies 1.5 km from battalion, nudged onto open ground and into link with their hub |
| Radios | Division and brigade HQs as `hq` (50 W, 10 m), battalions as `relay` (20 W, 15 m), companies as `squad` (5 W, 2 m) |
| Profile | Per net: duty by hour of day (24 values), a ramp multiplier per day, and whether its hub sends orders on the hour |
| Flow | An order from a hub is a burst; members acknowledge in the same hour with a burst each; hub members pass it on next hour |
| Notional net | A net with a profile and a transmitter count but no members' own nets below it unless bought; its acknowledgements come from the same transmitter, in sequence |

## 4. Collection

| Piece | What it is |
|---|---|
| Sites | Fixed: `hq` kind at 30 m on the coast, three to four of them; mobile: a `relay` kind on a vehicle |
| Tasks | `site1: watch 40-50` (a band: intercept and log every burst in it, a bearing on each), `site1: df 45.2` (one frequency: steadier bearings), `site1: sweep` (the whole band, lower chance per burst) |
| Operators | Each site watches at most N MHz of band per hour; sweeping costs nothing but catches a burst with lower probability |
| Intercept log | Per burst heard: hour, frequency, waveform, site, bearing and σ, burst length, and the rhythm (a chatter burst or an order and its acknowledgements) |
| Picture | Emitters associated from the log (D6), nets as sets of emitters that answer each other, with fixes and their history |

## 5. The assessment

Console lines, any hour, replacing the previous assessment of the same node:

```
assess net 45.2 division at 150,80             a net at that frequency, its level, its hub's position
assess net 47.1 brigade at 142,76 under 45.2   with its parent
assess strength east 160                       radios in the east sector
assess objective north at T+66                 where the blow falls, and when
assessment                                     show the current assessment and, after the game, its score
```

Scoring against the truth is in `deception.ts`, pure, and the reveal shows the true tree beside the assessed one.

## 6. Engine changes

| Change | Where |
|---|---|
| Hour rules: `DECEPTION_RULES` (limit 72, looks per hour, acknowledgement within the hour, movement per hour); the mission kind; status, end and reveal lines | `types.ts`, `mission.ts` |
| Force generator: templates, placement, profiles, the real and notional forces from the seed and a scenario | `src/engine/mission/orbat.ts` |
| Traffic: profiles, the ramp, the flow of orders and acknowledgements as bursts; the deceiver's console (`net: profile`, `net: silent`, `net: move`, `net: order`, notional add and drop) | `traffic.ts`, `commands.ts` |
| Collection: sites, watch and df and sweep tasks, operator budgets, the intercept log | `collect.ts` |
| Association from signals; nets from answering bursts; fixes and their history | `associate.ts` |
| Assessment grammar and scoring | `deception.ts` |
| Computer behaviours: `deceiver` (runs the plan, reacts to fixes) and `analyst` (tasks sites, associates, assesses from the flow) | `computer.ts` |
| Scenarios: `d01` a real force only (calibration), `d02` the ruse in the north and the real force south, `d03` the ruse plus a decoy division HQ that moves, `d04` the ruse with company nets bought | `scenarios.ts`, `missions/d0N-*.txt` |

## 7. UI

| Piece | Where |
|---|---|
| Hours on the clock, the replay bar and the sequence chart | existing components, a time-unit prop |
| The order-of-battle panel: the assessed tree beside the picture, and after the reveal the true tree with the score per node | `OrbatPanel.tsx` |
| Intercept log view: by hour and frequency, with the flow drawn as arrows between emitters | `InterceptLog.tsx` |
| Inspector: an *Association* tab: why these captures became one emitter, and where it was wrong | `Inspector.tsx` |

## 8. Agents

Two briefs: `agents/deceiver.md` and `agents/analyst.md`. The analyst's loop reads the intercept log since its last
turn, calls `/analyse/predict` and the picture, and posts `assess` lines. The server gains `assessment` in the state
for the analyst's side.

## 9. Left out

Jamming (the collector only listens), the real operation itself (the game ends at T+72 with the assessment), terrain
other than the seeded map, operator fatigue, and callsign and operator fingerprints beyond frequency, waveform and
rhythm.

## 10. Build order

Each step is reviewed before the next.

1. Hours, the force generator, the traffic model and the deceiver's console, with the old perfect association:
   a real division plays three days and a Blue site hears it. Tests on the profiles, the flow and the placement.
2. Collection: sites, tasks, operator budgets, the intercept log; the collector's console.
3. Association from signals, and the picture built from it. Tests on association errors with known cases.
4. The assessment grammar and the scoring; the reveal; the order-of-battle panel.
5. The two computer behaviours, the four scenarios, the briefs, the inspector's Association tab.
