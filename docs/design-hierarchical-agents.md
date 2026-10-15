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
Q8. The EW teams are on no net today, so HQ cannot order them over the air (WP-1.2 refuses). Options: put them on the hub net (changes link views and balance in missions 2 to 4), give them their own net, or a courier delay. Decide before the staff (Part 2) tasks jamming through orders.
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

## Part 3: the agent harness, tools and TTPs

Status: concept. Parts 1 and 2 describe who the agents are and what they can ask of the engine. This part is how they run.

### 22. The split that matters

- **TTPs are procedural knowledge**: when to go quiet, how to time a burst against the enemy's clock, where to put a second sensor, how to read a net plan. They belong in text the model reads: the brief, or a skill loaded for a role. A tool cannot decide.
- **Data analysis is computation**: path loss, detection footprint, J/S, fix and dilution of precision, pattern of life, track association, link matrices. It belongs in deterministic code with tests, called by the model as tools. Everything in section 14 is of this kind, and all of it already exists in the engine as TypeScript functions.
- **The harness** is separate from both: the loop that gives a model its brief, its tools and its turn, and records what it did.

### 23. Why a dedicated loop

Claude Code subagents calling the server with curl got the first games played in an afternoon, and they remain the quickest way to put a human-supervised agent on a console. For repeated, measured games they are the wrong harness: tool calls are untyped text through Bash; cost per turn is not controlled; there is no reproducible record of tool inputs and outputs; and every game is orchestrated through a live session.

A dedicated loop in TypeScript, using the Anthropic SDK's tool runner (`client.beta.messages.toolRunner` with tools defined by `betaZodTool`), fixes all four:

- one process per participant (commander, each unit, each analyst), started by a referee script with the role, the side, the server URL and the model;
- tools are typed functions with schemas, so inputs are validated and the model cannot call anything it was not given;
- the brief is the system prompt, cached (`cache_control` on the stable block), with the per-turn state appended as the user message;
- the per-turn hooks log every tool call and result to the game archive, so a game is replayable from its transcript;
- a model per role (`claude-sonnet-5-5` for commanders and analysts, `claude-haiku-5-5` for units, as the experiments in sections 8 and 19 need), effort set per role, and a task budget and a turn cap so a runaway turn cannot run the bill;
- it runs standalone from the terminal (`npm run agents -- --server http://localhost:8787 --blue sonnet --red haiku`), with no live session in the loop.

The referee script owns: starting the server or attaching to one, creating the participants, waiting for the game to end, and writing the archive. Adaptive thinking stays on; `tool_choice` is left on `auto` with the brief naming the tools to use, since the current models reject forced tool use.

### 24. Three exposures of one routine

Write each analysis routine once, in the engine, with its own tests. Expose it three ways, all thin wrappers:

1. **HTTP endpoints** on the game server (section 14). First, because they make the routines usable by a person and by curl now, and testable end to end.
2. **An MCP server** that wraps the same functions, for any harness that is not the custom loop: Claude Code subagents today (so analysts get exact tools before the loop exists), a person playing analyst in Claude Desktop, another model's harness later. MCP earns its place only when a routine must be served to more than one consumer.
3. **Embedded tool definitions** in the custom loop, importing the engine functions directly. Last, when the loop is built; fewest moving parts.

The side-limiting rule applies to all three: inputs about the enemy come from the side's picture or are stated hypotheses, never the truth.

### 25. Routines to add

Two analysis routines are missing and would be the first new code:

- **Track association.** Bearings are grouped by true emitter today, a stated simplification. The ES analyst should own association: cluster bearings by signature, time and geometry into tracks, with the ambiguity exposed (two tracks that may be one emitter, one track that may be two). This is deterministic code with a confidence output, and the analyst's judgement sits on top of it.
- **Pattern of life.** Period detection on a track's transmission minutes (the reporting clock), chatter duty estimation, and prediction of the next transmission minute and position. This is what reading the enemy's clock means in the hunt brief.

### 26. Risks

R1. The custom loop loses what the subagent harness gave for free: permission gates and a human in the loop. The loop needs its own limits (turn cap, token budget per role, hard stop when the server says the game is over) and its own audit (every call recorded).
R2. Prompt caching needs a frozen brief; anything per-turn goes after the cached block, or the cache never hits.
R3. A tool that returns a lot (a coverage grid) will flood a small model's context; return summaries by default (ranges, counts, the ten best hexes) and the full grid only on request.

## Part 4: network and RF planning tools

Status: concept.

### 27. One propagation model for the plan and the game

A planner that runs a different propagation model from the simulation predicts links the game does not honour, and the agent learns to distrust its tools. The planning tools therefore call the engine's own `analyzePath`, `linkBudget`, `orderDelivery`, `sensorLook` and `jsCoverageMap`. Open-source propagation models enter as a second, selectable model behind `analyzePath`, used by the simulation and the planner together, so a game can be run and planned under ITM instead of the engine's two-ray plus knife-edge model and the two compared.

### 28. What the open-source world offers

| Tool | What it does | Fit |
|---|---|---|
| NTIA ITM (Longley-Rice), reference C++ and Python ports | Point-to-point and area propagation over terrain profiles; the standard for VHF/UHF planning | A second propagation model behind `analyzePath`, selectable per game |
| ITU-R P.1812 / P.452 open implementations | Terrestrial path loss with clutter and diffraction | Same slot; needs clutter data the map does not carry yet |
| SPLAT!, Signal Server | Coverage maps from DEM data using ITM | Validate the engine's coverage map against a known tool on the same real terrain (Part 5); too heavy to run per turn |
| Radio Mobile, CloudRF | GUI and SaaS planning | Reference only |
| Graph algorithms (minimum spanning tree, k-connectivity, Steiner points) | Topology planning | Small enough to implement in the engine; relay placement and redundancy come from here |
| ns-3, OMNeT++ | Packet-level network simulation | Overkill; the timeliness model is the right fidelity for this game |

### 29. The planning tools

All over the engine's functions, side-limited as in section 14, called by the EW cell's electronic-protection officer, first at deployment and again whenever the picture or the plan changes.

1. `plan/links`: for a deployment (positions, nets, powers, antennas), the full link matrix with quality, delivery odds, and the weakest hop of every route to HQ.
2. `plan/relay`: candidate hexes for a relay that restore or harden weak links, ranked by routes fixed and by the relay's own exposure.
3. `plan/antenna`: pointing and power per link that keeps delivery above a threshold at the lowest power radiated sideways.
4. `plan/exposure`: for a plan, which own transmissions the enemy's likely sensors can hear and DF, from hypothesised enemy positions.
5. `plan/deploy`: a search over sensor positions subject to constraints: DF baselines wide enough for fixes over the expected area (dilution of precision), every unit linked to HQ at better than marginal, exposure minimised, movement time bounded. Multi-objective, so it returns a few candidate plans with their trade-offs rather than one answer.

The search in `plan/deploy` is a local search over hexes within reach of each unit, scored by a weighted sum the caller sets (connectivity, DF geometry, exposure, time), with `ensureLinks` in `scenario.ts` as the existing one-objective ancestor.

### 30. The work product: a net plan

A net plan is a document the officer produces and the commander approves: a table of units with positions, nets, routes and link qualities, pointing and power per link, the relay placement, the exposure estimate, and the orders in unit grammar that implement it. It is stored in the archive with the game, and the GUI renders it as a plan layer on the map (planned positions and links, dashed), so the umpire can compare the plan with what happened. The agent adds the choice: the tool returns candidates and numbers; the officer picks the plan that fits the commander's intent (a quiet net for a hide mission, a robust one for a search) and writes the reasons.

## Part 5: terrain sources

Status: concept.

### 31. What the engine needs

Per hex: an elevation, a terrain class (water, plain, forest, hill, mountain, and urban when it is added) and the hex size. Propagation, line of sight, noise and access rules derive from that. So any source that provides a height raster and a land-cover raster can feed the engine through one importer that bins rasters into hexes: mean height per hex, majority land cover, with ridge peaks preserved where a hex straddles one (keep the maximum height as a second field if diffraction needs it).

### 32. Real terrain

| Data | Source | Licence | Use |
|---|---|---|---|
| Elevation, 30 m | Copernicus DEM GLO-30, NASA SRTM, USGS 3DEP (US, down to 1 m) | free with attribution | the height raster |
| Land cover, 10 m | ESA WorldCover | CC BY 4.0 | forest, urban, water, open ground |
| Roads, buildings, power lines | OpenStreetMap | ODbL | urban clutter, man-made noise, later civilian emitters |

Pipeline: GDAL clips and reprojects a chosen area to a local metric grid; a script (`scripts/import-terrain.ts`, or Python with rasterio if GDAL bindings are easier there) bins it into the hex map JSON the engine loads. Any area on Earth, any hex size. The external propagation tools in section 28 then run on the same ground, so the engine can be validated against them. Data stays out of the repository except one small sample area; the importer and a download script go in.

### 33. Milsim terrain

Heightmaps from Operation Flashpoint or Arma are good and their scale fits the home area (8 to 20 km across against 32 by 17 km), but the terrain files are proprietary assets: extracting them needs the publisher's tools and the result cannot be redistributed, so it could live only in a local, untracked folder; and land cover is objects, not classes, so forest and urban would have to be reconstructed from object placement. A legally exported heightmap and land-cover layer go through the same importer; nothing specific to those games is built.

### 34. Engine changes

- A map loader beside `generateMap` that reads hex JSON: `{ hexSizeKm, cols, rows, home: GridArea, tiles: [{ hex, terrain, elevationM }] }`, with `home` in the file so a real area says where the home box sits.
- The scenario's reference grid and `ensureLinks` already cope with arbitrary ground. Generated maps stay for repeatable tests.
- The archive's seed field becomes a map name plus seed (the seed still drives schedules and bearing errors).
- A named real area is a scenario in its own right, like a wargame's map sheet; the mission balance will differ by area, which is the point.

### 35. Build order across Parts 3 to 5

1. Analysis endpoints (section 14) over the engine, including `plan/links` and `plan/exposure`, which are the same functions arranged for a plan.
2. The MCP wrapper, so the current subagent harness can use them.
3. The terrain importer and one sample real area, so planning tools and the external propagation tools can be compared on the same ground.
4. The custom loop and referee script.
5. `plan/relay`, `plan/antenna`, `plan/deploy`, the net plan work product and its map layer.
6. Track association and pattern of life.
7. ITM as the second propagation model.

## Part 6: work packages

Status: the implementation breakdown for Parts 1 to 5. Each work package is sized for a small model working alone with this document, the repository and the test suite. A package names its files, its interface, its acceptance test and what it depends on. Packages with no dependency can run in parallel. Nothing here changes the design above; where a package needs a decision the design does not make, the package states the default.

Conventions every package follows:

- Code goes in the file the package names; new engine code gets a `*.test.ts` beside it; `npm test`, `npm run typecheck` and `npm run build` must pass before the package is done.
- Engine code never reads the truth on a side's behalf: a function that takes a `PlayerSide` sees only that side's picture (`pictureOf`, `visibleWorld`) and its own units.
- Console lines are added with `log(s, kind, text, side)` and carry the side that may see them.
- New state fields are copied in `clone()` in `mission.ts` if a turn mutates them; forgetting this leaks mutations between turns (it happened with `blueUav`).
- Scripts in `missions/` and briefs in `agents/` are updated in the same package as the feature they describe.
- A package reports what it built, the test names it added, and anything it could not do.

Size: S is under 100 lines and one session; M is a few hundred lines and a session with tests; L is a day and needs review.

### WP-1: orders over the net (Part 1, section 3)

WP-1.1 (S) `OrderMessage` in `src/engine/mission/types.ts` as written in section 3, plus `messages: OrderMessage[]` on `MissionState`, initialised `[]` in `createMission` and copied in `clone()`. Test: a created mission has `messages` equal to `[]`.

WP-1.2 (M) `sendOrder(s, side, toId, text)` in `src/engine/mission/mission.ts`: refuses a `toId` not on the side; finds the member's link with a new helper `memberLink(s, unitId, links)` (the `LinkView` on the side's hub net whose `bId` is the unit; for a drone not on a hub net, its parent's view; `undefined` for a unit on no net, such as the EW teams today, and `sendOrder` refuses those with `<unit> is on no net HQ can reach.`); refuses while HQ is moving, as `send()` does; creates the message with `n` from a counter, `status: 'pending'`; pushes HQ's burst on the hub net and, when the view's `route` is `'relay'`, the relay's bursts on both nets, as `send()` does today for mission 2's orders; logs `HQ: order n to <unit> sent.` to the side. Depends on WP-1.1. Test: after `sendOrder`, `s.messages` has one pending message and `s.bursts` has the hub burst at `s.minute`.

WP-1.3 (M) `deliverOrders(s, m, links)` called in `tick` right after the held-reports retry (before the UAV block and the orders loop, so acknowledgement bursts at minute `m` can be heard by DF tasks listening in `m`). Delivery is decided once and the order is never retried:

- At `m === sentMin`: take `memberLink`; if its `order.status` is `'lost'` the order never arrives (`arriveMin` stays undefined); otherwise `arriveMin = m` for `'on time'` and `m + min(5, ceil(order.latencyS / 60))` for `'late'`.
- At `m === arriveMin`: the unit has the order. Log `<unit>: order n received: <text>` to the side. Push the acknowledgement burst from the unit at `m` (on the retrans net when the route is via the relay, else the hub net; `what: 'ack order n'`). Take `memberLink` again at this minute (the unit may have moved): if not lost, set `ackMin = m` and `status` to `'on time'` when `arriveMin === sentMin`, else `'late'`, and log `HQ: order n acknowledged by <unit>.`
- A message still `'pending'` becomes `'lost'` at the first minute where `ackMin` is undefined and either `arriveMin` is undefined and `m - sentMin >= 3`, or `arriveMin` is defined and `m - arriveMin >= 3`. Log `HQ: order n to <unit>: no acknowledgement, lost.` A lost order whose `arriveMin` is defined was in fact received; HQ does not know (decision D-ack).

Depends on WP-1.2. Tests: on seed 1234 mission `duel` an order to `r-sq1` is on time and acknowledged; with the unit moved 60 km away in `s.world` before sending, it is lost after 3 minutes and never arrives; an order that arrives but whose acknowledgement is lost (move the unit away between send and arrival on a late link, or stub `memberLink`) ends `'lost'` with `arriveMin` defined.

WP-1.4 (S) `inbox(s, unitId, sinceMin)` returning the messages to that unit with `arriveMin` defined and `>= sinceMin`, and `receipts(s, side)` returning the side's messages with status. Depends on WP-1.3. Test: both reflect WP-1.3's results.

WP-1.5 (S) Console grammar in `src/engine/mission/commands.ts`: `send <unit>: <text>` parses to `{ type: 'order', toId, text }` for either side; the existing bare `send` stays for mission 2. `issue()` routes `order` to `sendOrder`. Depends on WP-1.2. Test: `parseCommand('send sq1: df e 5', 'blue')` returns `toId: 'b-sq1'` and `text: 'df e 5'`.

WP-1.6 (S) Events and the chart: `MissionEvent` gains `{ kind: 'ack', minute, unitId, side, orderN }`; `deliverOrders` records sends (existing `send` event) and acknowledgements; `src/ui/SequenceChart.tsx` draws an acknowledgement as a short arrow from the unit to HQ in the order colour. Depends on WP-1.3. Test: events contain the `ack` after delivery.

WP-1.7 (M) Unit view: `unitStatusLines(s, unitId)` in `mission.ts` (position, link to HQ, current task and its end, inbox since the last turn, intercepts this turn from `events` filtered by `sensorId`) and `visibleLogFor(s, unitId)` (log entries with a new optional `unitId` field equal to this unit, plus entries with no side). `log()` gains an optional `unitId` parameter and the orders loop in `tick` passes the unit's id for its own lines. Depends on WP-1.4. Test: a squad's view shows its DF task line and not another squad's.

WP-1.8 (M) Server per-unit endpoints in `scripts/serve.ts` as in section 4: `GET /state?side=&unit=&after=`, `POST /<side>/<unit>` restricted to the verbs `df move sortie stop burst hold resume route jam decoy power antenna report status help`, `POST /<side>/<unit>/end`, `POST /<side>/<unit>/report` (files held bearings now: calls the existing `file` path through a new exported `reportNow(s, unitId)`), turn gating over commander and every attached unit, `auto` units declared at `/new` that execute their inbox literally and end their turn. Depends on WP-1.5 and WP-1.7. Test: a shell script in `scripts/smoke-c2.sh` that starts the server on a free port, posts an order from `/blue`, ends turns, and checks the unit's `GET /state` inbox contains it.

WP-1.9 (S) Archive: `messages` and the per-call audit (`{ turn, path }`) added to the archive record in `serve.ts`; `scripts/games.ts` gains columns orders sent, on time, late, lost, and mean order-to-action delay (sent minute to the minute the unit's matching order line appears in its log). Depends on WP-1.8.

WP-1.10 (S) Briefs: `agents/c2/commander-uav.md` (explicit variant), `agents/c2/commander-uav-intent.md`, `agents/c2/unit.md` with `{UNIT}` and `{KIND}` placeholders, and a section in `agents/README.md` for the unit protocol. Depends on WP-1.8 for the endpoint names.

### WP-2: analysis endpoints and the staff (Part 2, sections 14 and 17)

WP-2.1 (S) `src/engine/analysis.ts`: a module that re-exports the engine functions the endpoints need and adds `hypothesisUnit(pos, kind, powerW, antennaHeightM, gainDbi)` building a `Unit` for a stated enemy hypothesis (as `probeUnit` does in `coverage.ts`). No side logic yet. Test: a hypothesis unit runs through `sensorLook` without error.

WP-2.2 (M) `GET /analyse/path` and `GET /analyse/link` in `serve.ts`: parse `from`, `to` as `col,row`; `f` in MHz; for `link`, `a` and `b` must be the side's own unit ids (else 400) and the net the side's; return `analyzePath`'s profile summary (loss, line of sight, worst obstacle) and `linkBudget` plus `orderDelivery`. Depends on WP-2.1. Test: `scripts/smoke-analyse.sh` checks a known pair on seed 1234 returns `lineOfSight` and a finite loss.

WP-2.3 (M) `GET /analyse/coverage` and `GET /analyse/detect`: coverage for an own unit by id, or for a hypothesis (`at`, `powerW`, `antennaM`, `f`); detect takes `sensor` (own unit id) and a hypothesis; return summaries by default (count of hexes above a threshold, the ten strongest, max range) and the full grid only with `full=1`. Depends on WP-2.1. Test: the hypothesis at an own unit's position gives the same numbers as the unit itself.

WP-2.4 (M) `GET /analyse/js`: own jammer id, `mode`, target `net` (an enemy net id the side knows from its picture signatures, else any net id the caller states), `rx` as a hypothesis position; return `jsCoverageMap` summarised at `rx` and over the grid. Depends on WP-2.1.

WP-2.5 (M) `GET /analyse/fix?side=&track=` and `POST /analyse/fix` with a bearings array: run `fixFromBearings` on the side's track or on the supplied bearings; with `&add=<col,row>&sigma=` compute the CEP if one more bearing from that site were added with the true bearing to the current fix (dilution of precision). Depends on WP-2.1. Test: adding a site at 90 degrees to a two-bearing baseline lowers the CEP.

WP-2.6 (M) `pattern.ts` in `src/engine/mission/`: `reportingPeriod(minutes: number[])` (best period in 2..15 minutes by phase consistency), `nextTransmission(minutes)`, `motion(fixes: {minute, fix}[])` (speed and heading from the last three fixes), `predict(track, atMinute)`. Pure functions with tests on synthetic series. No dependency.

WP-2.7 (S) `GET /analyse/predict?side=&track=` over WP-2.6, and `GET /analyse/exposure?side=` over `sensorLook` from hypothesised enemy sensors (the side's fixes on enemy units with `kind` from the signature, defaulting to squad parameters). Depends on WP-2.3 and WP-2.6.

WP-2.8 (M) Staff taskings in `serve.ts`: `POST /<side>/ask { role, question }`, `GET /<side>/staff?role=` (open taskings plus the commander's status and picture), `POST /<side>/staff/<role>` (answer text); answers appear under `staff` in `GET /state?side=`; both go in the archive. Roles are the four in section 13. No engine change. Depends on nothing but should land after WP-2.2 so the analysts have something to call.

WP-2.9 (S) Analysis audit: every `/analyse/*` call recorded in the archive as `{ turn, side, endpoint, params }`, and a `games.ts` column for analysis calls per side. Depends on WP-2.2.

WP-2.10 (S) Staff briefs: `agents/staff/es-analyst.md`, `agents/staff/ew-attack.md`, `agents/staff/ew-protect.md`, `agents/staff/ops.md`, each with the endpoints it may call, the answer shape (assessment, recommendation as unit-grammar lines, what would change it), and the section-15 facts for that role written out. Depends on WP-2.7 and WP-2.8 for names.

WP-2.11 (L) Track association: `associate(bearings, signaturesKnown)` in `src/engine/mission/association.ts` producing tracks from bearings by signature, time and geometry with a confidence and the ambiguities listed; a mission flag `association: 'perfect' | 'estimated'` chosen at `createMission`; `merge()` uses the estimated path when set. Needs review of how `Track.id` and scoring interact (scoring uses `emitterId`; under estimation a track may hold two emitters, so scoring must match tracks to emitters by majority). Depends on WP-2.6. This is the one package in WP-2 for a larger model.

### WP-3: harness (Part 3)

WP-3.1 (S) `scripts/agents/tools.ts`: tool definitions with `betaZodTool` for the side console (`state`, `post`, `end_turn`, `help`) wrapping the server endpoints over `fetch`; each tool's description is one sentence; the module exports a factory `sideTools(server, side)`. Depends on the SDK being added to `package.json` (`@anthropic-ai/sdk`, `zod`). Test: a unit test with the server mocked by a tiny `http` stub asserts the tools call the right paths.

WP-3.2 (M) `scripts/agents/player.ts`: one participant process: arguments `--server --side --role --brief --model --effort --turn-cap --token-budget`; builds the system prompt from the brief file with `cache_control` on it; runs the tool runner per turn with the per-turn state as the user message; logs every tool call and result as JSON lines to `games/live/<game>-<role>.jsonl`; stops when the server reports the game over or the caps are hit. Adaptive thinking on, `tool_choice` auto. Depends on WP-3.1. Test: against the `http` stub, a scripted game of two turns completes and the log has the calls.

WP-3.3 (M) `scripts/agents/referee.ts`: starts or attaches to a server, launches participants as child processes from a game spec (`{ mission, seed, turn, blue: { commander: model, units?: model, staff?: {...} }, red: {...} }`), waits for the game to end, moves the live logs into the archive record, prints the outcome. `npm run agents -- spec.json`. Depends on WP-3.2 and, for units and staff, WP-1.8 and WP-2.8. Test: a spec with `--dry-run` prints the processes it would start.

WP-3.4 (M) `scripts/mcp-server.ts`: an MCP server exposing the `/analyse/*` endpoints and the side console as MCP tools, for use from Claude Code or Claude Desktop; configuration takes the server URL, the side and, for the umpire, the key. Depends on WP-2.2 to WP-2.7. Test: `scripts/smoke-mcp.sh` lists the tools.

WP-3.5 (S) Cost accounting: `player.ts` records `usage` per request (input, cache read, output) and the referee sums them per role into the archive; `games.ts` prints tokens per side. Depends on WP-3.2.

### WP-4: planning tools (Part 4)

WP-4.1 (M) `src/engine/plan.ts`: `linkMatrix(world, side)` returning, for every unit of the side, its route to HQ with quality, delivery status and the weakest hop, from `allLinkBudgets` and `routeToHq`-style logic lifted out of `mission.ts` into a world-level function; `GET /plan/links?side=` over it. Test: on seed 4242 before `ensureLinks` ran, three Blue units are reported as lost (use `createScenario` with `ensureLinks` bypassed via an exported option).

WP-4.2 (M) `relayCandidates(world, side, radiusHexes)`: for the side's relay, the ring hexes it may stand on, scored by the number of member routes that become not-lost and by its elevation; `GET /plan/relay?side=`. Reuses `ringHexes` and `linkedToHub` from `scenario.ts` (export them). Depends on WP-4.1.

WP-4.3 (M) `antennaPlan(world, side, minStatus)`: for HQ, relay and any unit with a directional antenna, the pointing and the lowest power that keeps every route at `minStatus`, searched over the power steps 0.1, 0.3, 1, 3, 10 and the current maximum; `GET /plan/antenna?side=`. Depends on WP-4.1.

WP-4.4 (S) `GET /plan/exposure?side=`: the WP-2.7 exposure calculation applied to a proposed deployment supplied in the body (positions and powers) rather than the current one. Depends on WP-2.7.

WP-4.5 (L) `deploySearch(world, side, objective, constraints)`: local search over positions reachable within `constraints.minutes` for the side's sensors, scoring connectivity (WP-4.1), DF geometry (the CEP of a fix on the centre of `objective.area` from the sensors, via WP-2.5's DOP calculation), exposure (WP-4.4) and movement time with caller weights; returns the three best plans with scores; `POST /plan/deploy`. Depends on WP-4.1, WP-2.5, WP-4.4. For a larger model; the scoring function and the search are separable, so a small model can build the scoring first against fixed candidate sets.

WP-4.6 (M) Net plan work product: `NetPlan` type (units, positions, nets, routes, qualities, pointing, power, relay, exposure, orders), `planToMarkdown()` and `planToOrders()` (unit-grammar lines), stored in the archive under `plans`; the GUI's `MapView` gets an optional `plan` prop that draws planned positions and links dashed, toggled from the Layers menu. Depends on WP-4.1 to WP-4.3.

WP-4.7 (L) Pluggable propagation: `analyzePath` takes a `model` from the world (`'engine' | 'itm'`); the ITM implementation ported to TypeScript from the NTIA reference, point-to-point mode, with the terrain profile the engine already extracts; a test comparing the two models on the same profiles and a note on the differences. For a larger model.

### WP-5: terrain (Part 5)

WP-5.1 (S) Map file format and loader: `src/engine/map.ts` gains `loadMap(json)` for `{ hexSizeKm, cols, rows, home, tiles: [{ hex, terrain, elevationM }] }` and `generateMap` stays; `World.map` unchanged. Test: a map round-trips through `JSON.stringify` and `loadMap`.

WP-5.2 (M) `scripts/import-terrain.ts`: takes a height raster and a land-cover raster already clipped and reprojected to a local metric grid (GeoTIFF read with a small dependency, or 16-bit PNG plus a sidecar for scale), bins them to hexes (mean height, majority class, max height kept as `peakM`), writes the map JSON; a README in `maps/` with the GDAL commands to produce the inputs from Copernicus DEM and ESA WorldCover for a bounding box. Depends on WP-5.1. Test: a synthetic raster with a ridge produces mountain hexes along it.

WP-5.3 (S) Scenario on a named map: `createScenario(seed, mapName?)` loads `maps/<name>.json` when given and uses its `home`; the server takes `--map`; the archive records `map`; `games.ts` prints it. Depends on WP-5.1.

WP-5.4 (S) One sample area under a free licence in `maps/` (small, a few hundred kilobytes), its attribution in `maps/README.md`, and a script to download and build it. Depends on WP-5.2.

WP-5.5 (S) GUI: the terrain legend and tooltip show `peakM` when present; the elevation shading uses the map's own range rather than the generated map's 0 to 1500 m. Depends on WP-5.1.

### 36. Order and parallelism

Packages with no dependency, which can start at once and in parallel: WP-1.1, WP-2.1, WP-2.6, WP-2.8, WP-3.1, WP-5.1. The critical path to the first staffed, split-side game is WP-1.1 to WP-1.8, WP-2.2, WP-2.8, WP-2.10, then WP-3.1 to WP-3.3. Planning (WP-4) and terrain (WP-5) are independent of both and can proceed beside them. The three packages marked for a larger model are WP-2.11, WP-4.5 and WP-4.7; everything else is sized for a small one.
