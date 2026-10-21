# Mission scripts

Plain-text console sessions for the "find the enemy" mission. One command per line, `#` starts a comment.

Two directives are allowed:

- `seed <n>` fixes the map, the Red transmission schedule and the bearing errors, so a run repeats exactly.
- `expect won|lost|running|ended|draw` lets the test suite and the runner check the outcome (`expect blue|red|draw` in a duel checks the winner).

Use a script four ways:

1. **Load it in the app.** In the Missions chapter choose it under *Or play a script* (or *Open file…* for a script on disk), or use the script bar above the consoles once a mission is running. The mission starts on the script's seed, and **Step**, **Turn** (through the next `wait`) and **Run all** play it, each line echoed on the console it runs on.
2. **Paste it into the console.** Copy the whole file and paste at the `blue>` prompt. Each line runs in order. If the file starts with `seed`, the mission restarts on that seed first.
3. **Run it headless.** `npm run mission -- missions/01-two-squads-triangulate.txt` prints the log and a summary, and exits non-zero if a line is rejected or the outcome differs from `expect`.
4. **Test suite.** `npm test` runs every script in this folder.

Grid positions below are for seed 1234 (Blue HQ 102,80; Squads at 114,68, 116,80, 114,92; UAV 120,78). Other seeds move the terrain but not the starting positions.

Mission 2 scripts start with `mission hide` and use the Red grammar (`send`, `emcon`, `power`, `waveform`, `antenna`, `decoy`, `jam`). See `07-red-stay-hidden.txt`.

Mission 3 scripts start with `mission duel` and prefix every console line with `blue> ` or `red> `. `expect blue|red|draw` checks the winner. See `08-duel-hot-seat.txt`. Pasted into either in-app console, a prefixed line runs on the console it names, and the `mission`, `expect` and `rejects` directives are skipped.

Scenario scripts (`sNN-<name>.txt`) start with `scenario <id>`, which builds the mission from the scenario's own
forces, rules, seed and consoles (`src/engine/mission/scenarios.ts`, docs/design-scenarios.md). The rest of the file
is a two-side script with `blue> ` and `red> ` prefixes. The mission picker's Scenarios list plays each one to the end
and opens the replay; Step loads it for the script bar instead. Fox hunts (`mission fox`) end when a Blue squad is
within 1 km of a Red transmitter; air defence (`mission iads`) scores Red's engagement cycle, and `expect blue|red|draw`
checks the winner. `ew: jam <net> [spot|barrage|partial|pulse|follower|sync]` picks the jammer mode. `computer red` (or `blue`, `both`)
hands a side to the engine's own player (docs/design-computer-player.md); that side's lines in the script are then
skipped, while `wait`, `status`, `picture` and `reveal` still run.

Mission 4 scripts start with `mission uav` and use the same `blue> ` / `red> ` prefixes as a duel. Red's extra orders are `uav: launch`, `uav: burst`, `uav: hold`, `uav: resume`, `uav: power <W>`, `uavlink: waveform ...` and `uav: antenna toward hq`; Blue can `ew: jam uavlink`. See `09-uav-track.txt`.
