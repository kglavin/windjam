# Agents: playing Windjam over HTTP

The game server owns one mission and offers a console per side over HTTP. Anything that can make HTTP requests can play a side: a person with curl, a script, or an AI agent given a brief from this folder. The browser watches the same game.

## Run a game

```bash
npm run serve -- --mission uav --seed 1234 --turn 5 --port 8787   # the server
npm run dev                                                        # the GUI, then open
#   http://localhost:5173/?server=http://localhost:8787
```

`--computer red` (or `blue`, or `blue,red`) has the engine play that side (docs/design-computer-player.md), so one agent, or a person at the GUI, plays against the computer; `GET /` lists `computer`. `--mission` is `duel` or `uav` (two consoles). `--scenario s15` plays a scenario instead (docs/design-scenarios.md): its forces, rules and seed, with `--seed` overriding the seed; `GET /` reports `scenario`. `--turn N` is the turn length in minutes. With `--turn 0` either side may `wait` as in the hot-seat game.

## Protocol

Every response is JSON. Lines use the console grammar (`help` lists it).

| Call | What it does |
|---|---|
| `GET /` | Mission, seed, clock, status, winner, turn, who the server is waiting for |
| `GET /state?side=red&after=N` | New console lines for that side since cursor `N` (returns the next `cursor`), plus `status_lines` and `picture` |
| `GET /help?side=red` | The side's command list |
| `POST /red` (body: text, one command per line) | Issue orders. Returns `accepted`, `rejected` (with reasons) and the console `lines` they produced |
| `POST /red/end` | End the side's turn. When both sides have ended, the clock advances `turn` minutes; the reply says `advanced` and the new `minute` |
| `POST /new` `{"mission":"uav","seed":1234,"turn":5}` or `{"scenario":"s16","turn":5}` | Start over |
| `POST /end` | Umpire: stop the game and open the debrief |
| `GET /full?key=K` | The whole state for the browser. Umpire only: `K` is the key the server prints at start (or `WINDJAM_UMPIRE_KEY`) |
| `GET /history?key=K` | Every line posted, with turn, side and minute. Umpire only |

In turn mode a side's `wait` is refused, and `reveal` is the umpire's (`POST /end`). After the mission ends, `status` and `picture` still work; the GUI handles the replay. `/full` and `/history` show both sides' truth, so they need the umpire key and a player is never given it.

## An agent's loop

```
cursor = 0
read GET /help?side=X once
loop:
  s = GET /state?side=X&after=cursor        # new console lines, status, picture
  cursor = s.cursor
  if s.status != "running": stop
  if s.yourTurnEnded: sleep 2; continue       # the other side is still thinking
  decide orders from s.console, s.status_lines, s.picture
  POST /X  with the order lines              # check rejected[] and fix anything refused
  POST /X/end
```

Keep orders short and concrete. The reply to `POST /X` tells you exactly what was accepted and why anything was refused, so one correction round per turn is enough.

## Archive

Every finished game is written to `games/` (orders, both consoles, the reveal, the outcome). `npm run games` tabulates them. Play the same seeds with different briefs or models and compare.

## Running agents

[player-prompt.md](player-prompt.md) is the prompt a side's agent gets, with the side, brief and server filled in. Launch both sides at once against one server; the game is over when `GET /` says `status` is not `running`.

## C2 mode: a commander and unit agents

A side can be split into a commander at HQ and one agent per unit, with orders carried over the simulated net ([design](../docs/design-hierarchical-agents.md)). C2 mode is chosen per side at start: `--c2-blue sq1,uav` (and `--c2-red ...`) on the CLI, or `{"mission":"uav","seed":1234,"turn":5,"c2":{"blue":{"agents":["sq1","uav"]}}}` to `POST /new`. `agents` lists the unit aliases that get an agent. Every other unit of that side is auto: it executes each order's text literally when the order arrives. A side with no `c2` entry plays as above.

In C2 mode the side's endpoints belong to the commander, and units have their own:

| Call | What it does |
|---|---|
| `POST /blue` | The commander's lines. A line that tasks a unit directly (`df`, `move`, `sortie`, `stop`, `power`, `antenna`, `decoy`, `jam`, `uav`) is rejected with `in C2 mode, task units with send <unit>: <order>`. `send <unit>: <order>`, `emcon`, `status`, `picture`, `help` and HQ's own settings (`hq: power 20`) are accepted |
| `GET /state?side=blue&unit=sq1&after=N` | The unit's view, with `hqTurnEnded` (true once its commander has ended the turn): `console` (its own lines), `cursor`, `status_lines` (its line with position, task and link, orders received, bearings heard), `inbox` (orders that reached it since its last turn, including orders sent this turn on a good link). No picture |
| `POST /blue/sq1` | The unit's lines, without its name (`df e 5`). Accepts `df move sortie launch stop burst hold resume route jam decoy power antenna`, plus `report`, `status`, `help`. A UAV with an agent can `launch` |
| `POST /blue/sq1/report` | Send what the unit has heard so far to HQ (a transmission). The same as a `report` line |
| `POST /blue/sq1/end` | The unit ends its turn |

A unit endpoint for a unit with no agent answers 403 `no agent seat for <alias>`. Units act after their commander: while the side's commander has not ended the turn (`hqTurnEnded` false), `POST /blue/sq1` with any line other than `status` or `help`, `POST /blue/sq1/report` and `POST /blue/sq1/end` answer 409 `{"error":"wait until HQ has ended its turn"}`. A unit loop reads state again after a short sleep until `hqTurnEnded` is true. The clock advances when the commander of each side and every listed unit agent have ended their turn. `GET /` lists them in `waitingFor` as `blue`, `blue/sq1`, and so on, a side's units only once its commander has ended.

An order is a transmission. It arrives the same minute when the link is good (it is in the unit's `inbox` at once, so an agent unit acts on it the turn it is sent, after the commander ends), later when degraded, never when lost. The unit acknowledges it with another transmission. The commander's console shows `order n ... sent`, `... acknowledged by ...`, or `... no acknowledgement, lost` after 3 minutes. A lost order may still have arrived. The commander's `status` adds `Unit agents: ... Auto: ...` and an `Orders:` line with the sent, acknowledged (on time, late), pending and lost counts and the pending and lost orders by number and unit.

An order cannot reach a UAV on a silent sortie: `send uav: ...` is refused with `<unit> is on a silent sortie and cannot be reached until it returns.` In C2 mode each side with an EW team also has an EW net (Blue 56 MHz, Red 50 MHz) from HQ with no chatter, so `send ew: jam <net>` works (`jam uavlink` in mission 4, `jam cmd` in the duel). The order and its acknowledgement are short transmissions on that net, and while it jams the EW team is the loudest emitter on the map. Without C2 the EW team is on no net and the commander types `ew: jam <net>` directly.

## Analysis and the staff

`GET /analyse/<name>?side=X` runs an engine calculation on what side X knows (never the truth). A bad parameter answers 400 `{error}`. Anyone on the side may call them freely: they are not transmissions.

| Call | What it answers |
|---|---|
| `/analyse/predict?side=&track=` | Transmission times heard, reporting period, next expected transmission, and for a moving track its speed, heading and predicted position |
| `/analyse/exposure?side=&sensor=col,row[,kind]` | Which of the side's own transmitters hypothesised enemy sensors can hear. `sensor` repeats; `kind` defaults to `squad`; with no `sensor` a squad is assumed at each fix in the side's picture |

(The other analyses are `path`, `link`, `coverage`, `detect`, `js` and `fix`.)

Analysis parameters take the calling side's console aliases as well as engine ids: units (`a`, `b`, `unit`, `sensor`, `jammer`) as `hq`, `sq2`, `ew`, nets (`net`) as `cmd`, `retrans`, `uavlink`. An enemy net is never named. `/analyse/js` describes an enemy target by what the side's picture shows: `f=<MHz>` and `waveform=fixed|slow|fast|dsss` (`65 MHz UAV link` is `fixed`, `65 MHz DSSS` is `dsss`, `hopper` is `slow` or `fast`), `tx=col,row` for the transmitter and `txKind=hq|squad|relay|civil|jammer|drone` (default `hq`; `drone` for a UAV link, at the mission's 2 W link power). The server builds a stand-in 25 kHz, 16 kbps net from them and reads no enemy net. `net=` naming an enemy net answers 400. `net=` for an own net still works.

A commander can task a staff of up to four roles: `es` (ES analyst, intelligence cell), `ewa` (EW officer, electronic attack), `ewp` (EW officer, electronic protection and own comms), `ops` (operations planner). Staff agents poll, call `/analyse/*` freely, and never transmit. They take no part in turn gating: the commander waits for the answers it wants before ending its turn.

| Call | What it does |
|---|---|
| `POST /blue/ask` `{"role":"es","question":"..."}` | The commander tasks a role. Returns `{id, side, role, question, turn, minute, askedAt}` with `id` `t1`, `t2`, ... 400 for an unknown role or empty question |
| `GET /blue/staff?role=es&after=N` | The analyst's view: `open` (taskings of that role with no answer, numbered above `N`), `answered` (its last 5 with answers), and the commander's `status`, `minute`, `turn`, `status_lines` and `picture`. For `role=ops` it also returns `cell`: every answered tasking of the side from this turn and last, whatever the role |
| `POST /blue/staff/es` `{"id":"t1","answer":"..."}` | Answer a tasking. 404 for an unknown id or another role's tasking, 409 if already answered |

`GET /state?side=blue` gains `staff`: the side's taskings of this turn and the last, each `{id, role, question, answer?, turn}`. The archive records every tasking with its answer (`staff`) and the number of `/analyse` calls per side (`analyses`); `npm run games` prints both as `analyses b/r` and `asks b/r`.

Briefs for mission 4 (`--mission uav`), Blue side:

- [c2/commander-uav.md](c2/commander-uav.md): the commander, sending explicit unit orders.
- [c2/commander-uav-intent.md](c2/commander-uav-intent.md): the commander, sending intent to agent units and literal orders to auto units.
- [c2/unit.md](c2/unit.md): any unit agent, with `{SIDE}`, `{UNIT}`, `{KIND}` and `{SERVER}` filled in.

[player-prompt.md](player-prompt.md) has the unit agent's prompt. Launch the commander and each unit agent as separate agents against one server, and tell the commander which units have agents. The commander is never given a unit's URL, and a unit is never given the commander's.

## Briefs

- [blue-uav.md](blue-uav.md): Blue in mission 4, track the UAV.
- [red-uav.md](red-uav.md): Red in mission 4, fly the UAV and keep reporting.
- [hunt.md](hunt.md): either side in mission 5, UAV hunt (`--mission hunt`, long games: `--turn 10`).
- [fox.md](fox.md): Blue, the hunter, in the fox-hunt scenarios (`--scenario s11` to `s14`).
- [iads-blue.md](iads-blue.md) and [iads-red.md](iads-red.md): the air-defence scenarios (`--scenario s15` to `s18`).
- [staff/es-analyst.md](staff/es-analyst.md), [staff/ew-attack.md](staff/ew-attack.md), [staff/ew-protect.md](staff/ew-protect.md), [staff/ops.md](staff/ops.md): the staff at HQ (roles `es`, `ewa`, `ewp`, `ops`), for any mission with a commander; launch with the staff prompt in [player-prompt.md](player-prompt.md).

Each brief is the whole context a side's agent gets: objective, what it can see, its orders, and tactics worth knowing. Write a new pair for a new mission.
