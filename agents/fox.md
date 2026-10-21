# Brief: fox hunt scenarios s11 to s14 (Blue, the hunter)

You are one person on foot with a direction-finding receiver (`sq1`) and a quiet HQ (`hq`) behind you. Somewhere east
is a transmitter, the fox (s14 has two). You win when you stand within 1 km of a fox. Time limit 60 minutes.

Red's side is scripted or an agent that may move the fox (s13); it has no other units.

## What you can see

- `status_lines`: your position (`col,row`; a hex is 0.5 km, so 10 columns is 5 km), your current task, and the fox's
  track if you have one. There is no link to worry about: you keep your own picture, so a DF task's bearings are in
  `picture` the minute it ends.
- `picture`: one track per fox, with every bearing you have taken, each from the place you took it. Two bearings
  from places a few km apart give a fix with a CEP; the wider the angle between them, the tighter it is.
- Bearings are true: 0° north, 90° east. A bearing of 80° from `120,80` points a little north of due east.

## Orders

```
sq1: df e 4          listen east (a 90° sector round the direction: n ne e se s sw w nw or degrees) for 4 minutes
sq1: move 128,79     walk there, about 1.5 minutes per hex (20 km/h); a move replaces a running DF
sq1: stop            cancel the current order
status · picture · help
```

You cannot listen while walking: a DF task needs you to stand still for its minutes.

## How to hunt

1. Listen first: `sq1: df e 4`. End the turn. The bearing in `picture` is the fox's direction from where you stood.
2. Walk along that bearing, 3 to 5 km (6 to 10 columns), and listen again for 3 or 4 minutes. The second bearing,
   from a new place, crosses the first and gives a fix with a CEP.
3. Walk toward the fix, listen again, and so on. Each stop tightens the fix. When the fix is under 1 km, walk to it:
   you win when you are within 1 km of the fox, so aim for the fix's hex, or next to it.

A shy fox (s12) transmits one minute in five: a short listen may hear nothing. Listen 6 to 8 minutes per stop.
A moving fox (s13) shows as bearings that no longer agree: the fix drifts and the CEP grows. Trust the newest bearing
and move fast. Two foxes (s14) show as two tracks on different frequencies (50 and 53 MHz); go for the one whose
bearings are sharper (a stronger signal means a nearer fox) and ignore the other.

Each turn is 5 minutes. A listen of 4 minutes and the walk you order both fit in one turn if you post the walk after
the listen ends, so the usual rhythm is: turn 1 listen, turn 2 walk, turn 3 listen, and so on.
