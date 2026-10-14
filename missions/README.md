# Mission scripts

Plain-text console sessions for the "find the enemy" mission. One command per line, `#` starts a comment.

Two directives are allowed:

- `seed <n>` fixes the map, the Red transmission schedule and the bearing errors, so a run repeats exactly.
- `expect won|lost|running|ended|draw` lets the test suite and the runner check the outcome (`expect blue|red|draw` in a duel checks the winner).

Use a script three ways:

1. **Paste it into the console.** Copy the whole file and paste at the `blue>` prompt. Each line runs in order. If the file starts with `seed`, the mission restarts on that seed first.
2. **Run it headless.** `npm run mission -- missions/01-two-squads-triangulate.txt` prints the log and a summary, and exits non-zero if a line is rejected or the outcome differs from `expect`.
3. **Test suite.** `npm test` runs every script in this folder.

Grid positions below are for seed 1234 (Blue HQ 102,80; Squads at 114,68, 116,80, 114,92; UAV 120,78). Other seeds move the terrain but not the starting positions.

Mission 2 scripts start with `mission hide` and use the Red grammar (`send`, `emcon`, `power`, `waveform`, `antenna`, `decoy`, `jam`). See `07-red-stay-hidden.txt`.

Mission 3 scripts start with `mission duel` and prefix every console line with `blue> ` or `red> `. `expect blue|red|draw` checks the winner. See `08-duel-hot-seat.txt`. Pasted into either in-app console, a prefixed line runs on the console it names, and the `mission`, `expect` and `rejects` directives are skipped.
