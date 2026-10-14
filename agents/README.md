# Agents: playing Windjam over HTTP

The game server owns one mission and offers a console per side over HTTP. Anything that can make HTTP requests can play a side: a person with curl, a script, or an AI agent given a brief from this folder. The browser watches the same game.

## Run a game

```bash
npm run serve -- --mission uav --seed 1234 --turn 5 --port 8787   # the server
npm run dev                                                        # the GUI, then open
#   http://localhost:5173/?server=http://localhost:8787
```

`--mission` is `duel` or `uav` (two consoles). `--turn N` is the turn length in minutes. With `--turn 0` either side may `wait` as in the hot-seat game.

## Protocol

Every response is JSON. Lines use the console grammar (`help` lists it).

| Call | What it does |
|---|---|
| `GET /` | Mission, seed, clock, status, winner, turn, who the server is waiting for |
| `GET /state?side=red&after=N` | New console lines for that side since cursor `N` (returns the next `cursor`), plus `status_lines` and `picture` |
| `GET /help?side=red` | The side's command list |
| `POST /red` (body: text, one command per line) | Issue orders. Returns `accepted`, `rejected` (with reasons) and the console `lines` they produced |
| `POST /red/end` | End the side's turn. When both sides have ended, the clock advances `turn` minutes; the reply says `advanced` and the new `minute` |
| `POST /new` `{"mission":"uav","seed":1234,"turn":5}` | Start over |
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

## Briefs

- [blue-uav.md](blue-uav.md): Blue in mission 4, track the UAV.
- [red-uav.md](red-uav.md): Red in mission 4, fly the UAV and keep reporting.
- [hunt.md](hunt.md): either side in mission 5, UAV hunt (`--mission hunt`, long games: `--turn 10`).

Each brief is the whole context a side's agent gets: objective, what it can see, its orders, and tactics worth knowing. Write a new pair for a new mission.
