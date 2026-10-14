# Design: hierarchical agents, a commander and unit agents per side

Status: concept, not built. This note is the specification to build from. It assumes the game server (`scripts/serve.ts`), the agent protocol (`agents/README.md`) and missions 4 and 5 as they stand at commit d0cd186.

## 1. The idea

Today one agent plays a whole side: it sees HQ's picture and moves every unit with perfect, instant communication. Real C2 is not like that, and neither is the engine: orders in Windjam travel over a radio net with delay, loss and jamming, and every transmission is a bearing for the enemy. The engine already models this for Red's orders in mission 2 (`send`, windows, on time / late / lost) and for every unit's DF reports.

The concept is to split a side into a **commander** at HQ and one **unit agent** per unit, and to route the commander's orders to the units over the simulated net. The commander is a larger model (Sonnet); the unit agents are small, fast and many (Haiku). Each turn the units act concurrently. The research question is how coordination degrades as the net degrades, with real decision-makers at both ends, and whether briefing units with intent rather than explicit orders makes a side robust to a jammed or silenced net.

## 2. Roles

### Commander (one per side, Sonnet)

Sees: HQ's picture (`picture`), the side's `status` (every unit's reported position and link state, as HQ knows them), the console lines that reach HQ, and the receipts for its own orders (delivered on time, late, lost, pending).

Does: writes orders to units (`send sq1: df e 5`), sets side-wide EP (`emcon`, net waveforms, HQ antenna, jamming by the EW team through an order to it), decides when to transmit at all.

Does not: move or task a unit directly. Every instruction to a unit is a transmission.

### Unit agent (one per squad, UAV, EW team; Haiku)

Sees: its own position and link state, what its unit heard this turn (its local intercepts, with bearings, before they reach HQ), the orders that have reached it, with the minute each arrived, and its own task state.

Does: executes orders with the unit's own verbs (`df`, `move`, `sortie`, `burst`, `jam`, `decoy`, `power`, `antenna`), and, when briefed with intent, chooses its own tasks within that intent. It may `report` (send what it heard to HQ now) or hold its report; a report is a transmission.

Does not: see HQ's picture, other units' views, or the enemy. It cannot talk to other units except through HQ.

### Umpire

As now: the GUI on the umpire seat, `/full`, `/history`, and the archive.

## 3. Order transport over the net

Mission 2's `send` becomes general.

- `send <unit>: <order text>` from the commander creates an **order message**: `{ n, fromId: hq, toId, text, sentMin }`. It is a one-minute burst from HQ on the command net (and from the relay on the retrans net when routed through it), exactly as mission 2's order bursts are now, so the enemy can hear it.
- Delivery uses the existing link view for that unit at that minute: `order.status` on time (arrives this minute), late (arrives after `latencyS`, rounded up to the next minute; cap at, say, 5 minutes), lost (never arrives; the commander sees `lost` only when the unit fails to acknowledge within a timeout, see below).
- The unit **acknowledges** a delivered order with a one-minute burst on its net (as squads do in mission 2). The commander's receipt flips from pending to on time or late when the acknowledgement gets back over the same link model. No acknowledgement within `ackTimeoutMin` (say 3) marks the order `lost` at HQ, whether or not the unit got it: HQ cannot know. This asymmetry is the point.
- A unit whose link is down **keeps acting on its last order** (decision D-link below). Its reports queue in `held` as now and arrive when the link returns.
- Orders are text, parsed by the unit's console with the unit's own grammar, so the commander can send `sq1: df e 5` or, in the intent variant, `sq1: find the UAV east of you, report every 10 min`, which the unit agent interprets. The engine does not interpret free text; the unit agent does.
- Unit reports stay as they are (DF reports at task end, UAV telemetry), plus an explicit `report` verb for a unit to send what it has now.

Engine state additions (`src/engine/mission/types.ts`):

```ts
interface OrderMessage { n: number; side: PlayerSide; fromId: string; toId: string; text: string; sentMin: number; arriveMin?: number; ackMin?: number; status: 'pending' | 'on time' | 'late' | 'lost' }
MissionState.messages: OrderMessage[]
```

Engine functions (`src/engine/mission/mission.ts`): `sendOrder(s, side, toId, text)` (creates the message and the burst), `deliverOrders(s, links)` in `tick` after movement (arrival, acknowledgement burst, receipts), `inbox(s, unitId, sinceMin)` for the unit view, `receipts(s, side)` for the commander view. Events: `{ kind: 'send', ... }` already exists for mission 2; add `ack`.

## 4. Server endpoints

Side endpoints (`/state?side=`, `POST /<side>`, `POST /<side>/end`) become the commander's. New per-unit endpoints:

| Call | Returns or does |
|---|---|
| `GET /state?side=red&unit=sq1&after=N` | the unit's console since `N`, its position and link state, its intercepts this turn, `inbox` (orders received, with minutes), `task` (current order and its end) |
| `POST /red/sq1` (text) | unit verbs only, applied to that unit; `send`, `emcon`, net waveform and other units' ids are rejected |
| `POST /red/sq1/end` | the unit has ended its turn |
| `POST /red/sq1/report` | send what the unit has heard now (a transmission) |

Turn gating: the clock advances when the commander and every unit agent of both sides have ended. A unit with no agent attached (a human umpire can leave some units unmanned) is marked `auto` at `/new` and ends its turn automatically after executing its inbox literally.

Access: unit agents are given only their unit URL. The umpire key gates `/full` and `/history` as now. Commanders are not given unit URLs. Nothing stops a dishonest agent from guessing another unit's URL, so the archive records every call's path for audit; a per-unit token at `/new` can be added if it matters.

## 5. Turn structure

With turn length T (5 minutes recommended):

1. Commander reads receipts, picture, status; posts `send` lines and side-wide settings; ends.
2. Units read inboxes (orders that arrived during the last T minutes, stamped), local intercepts and task state; post unit orders; end. Units run concurrently.
3. Server advances T minutes: bursts go out, deliveries and acknowledgements resolve minute by minute, tasks run, reports flow.

Order latency is therefore at least one turn from the commander's decision to the unit's action, plus the net's own delay, which is the realistic shape of the problem.

## 6. Briefs

Three briefs per mission: commander, unit (one template with the unit kind filled in), and the shared protocol. Two variants of the commander brief for the experiment in section 8:

- **Explicit**: the commander sends concrete verbs (`sq1: df e 5`). Units execute literally.
- **Intent**: the commander sends intent and constraints (`sq1: cover the sector east of you for the next 15 minutes, report when you hear the UAV link`). Units choose verbs. The unit brief explains the unit's own sensors, its grammar, and what "cover", "report", "move toward" mean in verbs.

Unit briefs are short: one page, no mission-wide picture, the unit's capabilities, the grammar, the rule that a report is a transmission.

## 7. Metrics, from the archive

Per game (`games/*.json` gains `messages`): orders sent, delivered on time, late, lost; mean and max order-to-action delay (sent minute to the minute the unit's matching order appeared); acknowledgements lost; minutes each unit spent with its link down; bearings taken while the link was down and when they reached HQ; transmissions per side per hour; outcome and time. `scripts/games.ts` prints these as columns.

## 8. Experiments

Each is a set of games on fixed seeds, varying one thing.

E1. Baseline: mission 4, explicit orders, no jamming. Does the split side do as well as the single agent did (games 1 and 2 in the archive)?
E2. Jammed net: Red jams Blue's command net from T+10. Explicit versus intent briefs. Expectation: explicit collapses when orders stop arriving, intent degrades gracefully.
E3. Emcon: Blue's commander is told to minimise transmissions. How few orders can coordinate a search?
E4. Model mix: Sonnet commander with Haiku units, versus Haiku commander with Haiku units, versus Sonnet everywhere. Cost and outcome.
E5. Scale: the duel with six units per side; the hunt with two UAVs per side (needs mission work: a second UAV and a per-UAV net or a shared net).

## 9. Engine and server changes, in build order

1. `OrderMessage` and `messages` in the state; `sendOrder`, `deliverOrders`, `inbox`, `receipts`; acknowledgement bursts; receipts in the commander's `status`; tests in `src/engine/mission/c2.test.ts` (delivered, late, lost by jamming, lost acknowledgement, held report release).
2. Unit view: `unitStatusLines(s, unitId)` (position, link, task, inbox, intercepts this turn) and `visibleLogFor(s, unitId)` (the unit's own console lines; log entries gain an optional `unitId`).
3. Server: per-unit endpoints, verb restriction, `auto` units, turn gating over all participants, `messages` in the archive, call-path audit.
4. Briefs: `agents/c2/commander-uav.md`, `agents/c2/unit.md`, protocol additions in `agents/README.md`.
5. `scripts/games.ts`: C2 columns.
6. A referee note: how to launch one commander and N units per side from a Claude Code session (one Agent call per participant; units in the background with `run_in_background`, all told their single URL).
7. GUI: nothing required. Later: a per-unit seat in the panel, and the timeline already draws sends and acknowledgements.

## 10. Decisions taken in this note

D-link. A unit whose link is down keeps acting on its last order and queues its reports. The alternative (stop and wait) is safer and uninteresting.
D-ack. Acknowledgements are real transmissions and can be lost; HQ marks an unacknowledged order lost after 3 minutes whether or not it arrived.
D-text. Orders are free text to the unit agent; the engine only carries them. Explicit and intent variants differ in the brief, not the engine.
D-turn. One turn gate for commander and units together, 5 minutes. A two-phase turn (commander first, then units) adds a round trip per turn and is not worth it; the net delay already orders things.
D-auto. Unmanned units execute their inbox literally, so a game can run with fewer agents than units.

## 11. Open questions

Q1. Should a unit be able to message another unit directly (a mesh net exists for Red's squads)? Realistic, more transmissions, more coordination. Leave out of the first build.
Q2. How much local picture should a unit agent get: raw bearings only, or its own small track table? Start with raw bearings this turn plus the last five it took.
Q3. Does the commander see the enemy's jamming as such (the EW team's intercept line already names a jammer)? Yes, through the EW team's report when it has a link.
Q4. Token budget: five Haiku units and one Sonnet commander per side, 36 turns at 5 minutes, is roughly 36 × 6 × 2 calls. At the observed 3 000 to 5 000 tokens per call that is about 1.3 million tokens per game. Acceptable for experiments, not for bulk; E4 will tell whether Haiku commanders are enough for bulk runs.

## Part 2: a staff at HQ, and putting the EW science to work

Status: concept, extends Part 1. Part 1 gives a side a commander and units. This part gives the commander a staff: analyst agents at HQ that the commander tasks, that work from HQ's data with the engine's own EW calculations, and that answer with assessments and recommended taskings. The commander decides and transmits; the staff never transmit. This models a commander and staff rather than a lone commander, and it is where the physics in the engine, most of it unused by agents so far, gets used.

### 12. Why a staff

The agents so far play by rules of thumb from the brief ("2 to 3 degrees wide", "about 25 km at 1 W"). The engine can answer those questions exactly for the side's own situation: how far a given emitter is detectable by a given sensor over this terrain, what J/S a jammer achieves at a receiver, whether an order will get through, where a track will be when it next transmits. A staff turns those calculations into advice, and the division of labour keeps the commander's context small. It also mirrors how an HQ works: the commander states intent, the staff produce options, the commander chooses.

### 13. Staff roles

The staff has two cells under the commander. The **intelligence cell** processes the known state of the environment: what has been heard, what it is, where it is and where it will be. The **EW cell** applies the EW tactics and science: electronic attack, electronic protection and the side's own communications. The commander controls both, states intent, and is the only one who transmits. Four roles cover the engine, two per cell; the operations planner is optional and sits with the commander. A game can run with any subset; the commander's brief lists who is on the staff.

| Role | Works from | Produces |
|---|---|---|
| ES analyst (intelligence cell) | HQ's picture: tracks, bearings, fixes, intercept lines, signatures; the reveal is never available | Emitter identification and order of battle (which signature is which net, hub or member, static or moving); pattern of life (reporting intervals, chatter duty, next expected transmission); predicted position of moving tracks; sensor tasking that would improve the picture (which unit, which sector, when) |
| EW officer, electronic attack (EW cell) | Own jammer positions and modes; enemy nets as the ES analyst has characterised them (frequency, waveform, likely receiver positions); terrain | Jamming options with predicted J/S at the victim receivers, mode choice (spot, barrage, follower, sync) against the waveform, cost in own exposure; decoy plans; when to stop |
| EW officer, electronic protection and own comms (EW cell) | Own nets, units, links, link budgets, timeliness, receipts of orders | Net health and what each order's delivery odds are; emcon and waveform recommendations; relay and antenna placement; which of the side's transmissions are most exposed to enemy DF and what to do about it |
| Operations planner (with the commander, optional) | The other three's outputs and the commander's intent | A tasking table for the next turns: per unit, orders in the unit grammar, with the reason and the transmission cost; alternatives when the net is degraded |

Each analyst answers a tasking in a fixed shape: assessment (what is known, with confidence), recommendation (orders in the unit grammar, ready to `send`), and what would change the assessment. The commander may accept, edit or ignore.

### 14. Analysis tools: the engine over HTTP, side-limited

Analysts need the engine's calculations, run on what the side knows, never on the truth. The server exposes read-only analysis endpoints per side. Each takes positions the side has (its own units' true positions, enemy positions only as fixes or hypotheses supplied by the caller) and returns numbers from the same functions the simulation uses.

| Endpoint | Engine | Answers |
|---|---|---|
| `GET /analyse/path?side=&from=&to=&f=` | `analyzePath`, `knifeEdgeLossDb`, `fresnelRadiusM` | Terrain profile, line of sight, loss between two hexes at a frequency |
| `GET /analyse/coverage?side=&unit=&net=` or `&at=&powerW=&antennaM=` | `coverageMap`, `noiseFloorDbm`, `manMadeNoiseFigureDb` | Where a transmitter can be received, as a grid, for own units or a hypothesised enemy emitter |
| `GET /analyse/detect?side=&sensor=&at=&powerW=&waveform=&antennaM=` | `sensorLook`, `detectionProbability`, `bearingSigmaDeg`, `emissions` | Pd per sweep and bearing error for one of the side's sensors against a hypothesised emitter at a hex: the detection footprint of a sensor |
| `GET /analyse/js?side=&jammer=&mode=&net=&rx=` | `jsCoverageMap`, `linkBudget` with jammers | J/S and link quality at a hypothesised receiver position under a jamming option; the J/S map for the Coverage tool |
| `GET /analyse/link?side=&net=&a=&b=` | `linkBudget`, `orderDelivery` | Own link quality and order delivery odds between two of the side's units, or from a unit to a proposed position |
| `GET /analyse/fix?side=&track=` and `POST /analyse/fix` with bearings | `fixFromBearings`, `cepFromSigmas` | The fix the side's bearings support; what one more bearing from a proposed site would do to the CEP (dilution of precision) |
| `GET /analyse/predict?side=&track=` | track history (`fixes`, bearing minutes) | Reporting interval, next expected transmission minute, speed and heading from the fix history, predicted position at that minute |
| `GET /analyse/exposure?side=` | `sensorLook` from hypothesised enemy sensor positions (fixes on enemy units) | For each own transmitter and net, the estimated chance the enemy hears it from where the picture says the enemy is |

Rules for these endpoints: inputs about the enemy must come from the side's picture or be stated hypotheses (the analyst supplies a position and parameters); the server never fills them from the truth. Outputs are data, not console lines, so they do not appear in the log and cost no transmission. The umpire can see every analysis call in the archive.

### 15. How the EW science maps to the staff

What the engine models, who uses it, and for what.

| In the engine | Role | Use |
|---|---|---|
| Free space, two-ray, knife edge, earth bulge, Fresnel (`rf.ts`) | all | Any range question over this terrain instead of a rule of thumb |
| Man-made noise, rural and urban (`rf.ts`) | ES, signals | Noise floor at a sensor or receiver; why a site hears less |
| Energy detector, Pfa, Marcum Q, sweeps and intercept probability (`detect.ts`) | ES | Pd of a burst by a sensor; how many sweeps a 6 s burst gives; Pfa setting and the limiter trade |
| DSSS processing gain and the LPD sliver per search channel; FH hop sets (`detect.ts`, `ew.ts`) | ES, EW, signals | Why DSSS is hard to hear and hard to jam; follower against hopping; what spreading costs in link margin |
| Bearing error from SNR, averaging, site error; fix by weighted least squares; CEP and ellipse; baseline and crossing guards (`detect.ts`) | ES | Where to put the next sensor for a fix; when a fix is not to be trusted |
| Nine jammer modes, band overlap dilution, follower race, front-end overload, link states (`ew.ts`, `budget.ts`) | EW | Mode against waveform; J/S maps; collateral on own nets; the jammer as the loudest emitter |
| Packet error rate, ARQ, order delivery on time, late, lost (`timeliness.ts`) | signals, ops | Will the order arrive; how long; when to repeat |
| Directional antenna pattern, main lobe and sidelobes (`rf.ts`) | signals, EW | Pointing to keep the link and cut exposure; the beam's blind side |
| Decoys, emcon duty, chatter schedules (`mission.ts`) | ES, signals | Recognising a decoy by pattern; setting own duty cycles |
| Relay routes and retrans nets (`world.ts`) | signals | Where a relay restores a link; what a relay exposes |
| Spectrum and time-domain scope (`scope.ts`) | ES | Signature description for the picture; what a waveform looks like |

### 16. Flow of a staffed turn

1. The commander reads receipts, picture and status, and posts taskings to the staff: `ask es: what is track E6 and when does it transmit next`, `ask ew: options to deny the UAV link for the next 20 minutes`, `ask sigs: can sq3 receive an order now`, `ask ops: tasking for the next two turns to get two sites on E6`. Taskings are text to the analyst agents; they are not transmissions.
2. Analysts run concurrently. Each calls its analysis endpoints as needed and returns its assessment and recommendations in the fixed shape.
3. The commander chooses, edits and `send`s. Units receive over the net as in Part 1.
4. The archive records taskings, answers, which recommendations were sent, and later what happened to them.

Staff turns cost wall time. Keep analysts to one tasking each per turn, or let the commander skip the staff on quiet turns.

### 17. Server additions for the staff

- Staff endpoints are the commander's: `POST /<side>/ask` with `{ role, question }` creates a tasking; the analyst agent reads `GET /<side>/staff?role=` (its open taskings plus the same picture and status the commander sees) and answers with `POST /<side>/staff/<role>` (text). The commander reads answers in `GET /state?side=` under `staff`. This keeps the staff inside the server's record rather than in a side channel.
- Analysis endpoints as in section 14, gated to the side and to picture-derived inputs.
- The archive gains `staff: [{ turn, role, question, answer, usedBy: [message n] }]` and `analyses: [{ turn, side, role, endpoint, params }]`.

### 18. Briefs for the staff

One short brief per role: its data, its endpoints, the answer shape, and the EW facts it should know cold (the table in section 15, written out for that role). Analysts are told they never transmit and never see the truth. The commander's brief gains a section on using the staff: ask narrow questions, prefer recommendations that come as unit-grammar lines, and remember that every `send` is a transmission even when the staff recommends six of them.

### 19. Metrics and experiments for the staff

Metrics, from the archive against the truth at debrief: prediction error of the ES analyst's next-transmission minute and position; J/S predicted by the EW planner against achieved; delivery odds predicted by the signals officer against outcomes; share of recommendations the commander sent; outcomes.

Experiments:

E6. Staff or no staff: mission 4 and the hunt, same seeds, same commander model, with and without analysts. Does advice from exact calculations beat the brief's rules of thumb?
E7. Which analyst matters: each role alone.
E8. Analyst model: Haiku analysts with exact tools against a Sonnet commander with no tools.
E9. Cost: tokens and wall time per turn with a full staff; the point at which a staff is not worth it for a given mission.

### 20. Build order for Part 2

1. Analysis endpoints (section 14), as thin wrappers over existing engine functions, with the side-limiting rules and tests that they refuse truth inputs. This is useful on its own: a human player can call them too.
2. Staff taskings and answers in the server and the archive (section 17).
3. Briefs for the four roles and the commander's staff section.
4. `scripts/games.ts` columns for staff metrics.
5. Then Part 1's unit split can come first or second; the staff works with a single commander agent playing the whole side as now, so Part 2 does not depend on Part 1.

### 21. Open questions for Part 2

Q5. Should the ES analyst be allowed to run its own data association (we give it perfect association today, tracks grouped by true emitter)? Realistic association is a separate piece of work; the analyst role is where it would live.
Q6. Should analysts see the sequence chart's event record for their own side (captures by own sensors with SNR)? Probably yes: that is what an ES cell sees.
Q7. One ops planner or none: the commander may be enough with three analysts. E7 answers it.
