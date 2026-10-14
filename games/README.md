# Archived games

The game server writes one JSON file here for every game that finishes, named `<mission>-<seed>-<time>.json`, with:

- `orders`: every line each side posted, with its turn and minute.
- `console`: each side's full console as it saw it.
- `reveal`: the debrief lines (the truth, both pictures, the UAV's route and reports).
- `summary`: each side's final `status` lines.
- `winner`, `endedAt`, `turnMin`, `turns`.

`npm run games` prints a table of the folder with a tally of winners. Compare briefs or models by playing the same seeds and reading the table.
