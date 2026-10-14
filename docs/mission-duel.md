# Mission 3: Duel

Two people at one screen. Blue hunts from the `blue>` console, Red hides from the `red>` console, and each sees only its own side's lines. The rules are mission 2's: Blue wins with three fixes under 1 km on real Red emitters, Red wins by denying that while passing four of its six orders on time, and hidden-but-silent is a draw.

This is the hot-seat step toward autonomous agents and networked play. The engine already routes every command by the side that typed it, so a second player, a script, or an agent can take either console without engine changes.

## Rules

| Item | Value |
|---|---|
| Blue wins | 3 real Red emitters fixed with CEP under 1 km before T+60. Decoys don't count. |
| Red wins | Blue has fewer than 3 such fixes at T+60 and Red delivered at least 4 of 6 orders on time |
| Draw | Blue fails to fix 3, but Red delivered fewer than 4 orders |
| Clock | Turn-based. `wait <min>` from either console advances the clock for both. |

Red's orders, electronic-protection measures and picture are as in [mission 2](mission-stay-hidden.md). Blue's DF tasks, sorties, reporting and picture are as in [mission 1](mission-find-the-enemy.md). There is no scripted side: neither player has a playbook.

## Playing it

1. Click **Mission 3: duel** in the sandbox header. Two consoles appear under the map, `blue>` on the left and `red>` on the right.
2. Agree a turn length (five minutes works). Each side types its orders for the turn into its own console, then one side types `wait 5`.
3. Read what came back, and go again. `status` and `picture` on each console show that side's view only.
4. The **Blue view**, **Red view** and **Umpire** buttons in the panel choose whose picture the map and panel show. Blue view hides Red's units, Red view hides Blue's, Umpire shows everything. The consoles are always per side, whatever the map shows. For an honest game, leave the map on the seat of the player whose turn it is, or on Umpire with both players agreeing to not use it.
5. At the end, `reveal` from either console shows both sides' truth to both consoles and opens the replay. The Timeline works as in the other missions.

**One console.** Tick **One console** in the panel to replace the two consoles with a single `duel>` console that shows both sides' lines, each tagged `blue` or `red`. Type lines with their prefix (`blue> sq1: df e 5`, `red> send`); a line without one goes to the side whose view is selected (Blue when the map is on Umpire). This is the easy way to replay a duel script: paste the whole file at once.

## Scripts

A duel script prefixes each line with its console:

```
mission duel
seed 1234
expect red
red> emcon cmd 0
blue> sq1: df e 10
blue> wait 5
red> send
red> wait 5
```

`expect blue|red|draw` checks the winner. Run one headless with `npm run mission -- missions/08-duel-hot-seat.txt`, or paste it into either console: a `blue>` or `red>` prefix routes the line to that side's console whichever one it was pasted in, and the `mission`, `expect` and `rejects` directives are skipped. Pasting a turn's lines at a time keeps the hot-seat rhythm.

## What the engine does differently

- `issue(state, command, side)` takes the side that typed the command. Ownership checks, help text, status and picture, and the net checks for `emcon` and `waveform` use that side. Console lines are tagged with it, so each console filters the log to its own side plus lines meant for both.
- `send` works only from the red console.
- Red's untasked ES (squads and relay listening all round) runs as in mission 2, so Red builds a picture of Blue's reports and the UAV link.
- `viewOf(state, side, umpire)` gives the map one side's view or the truth.
- The mission's `status` is from Blue's seat (`won` means Blue won); `winner` holds `blue`, `red` or `draw` and is what the panel and the runner show.
