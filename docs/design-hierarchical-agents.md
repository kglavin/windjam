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
