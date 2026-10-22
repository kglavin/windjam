# Brief: deception scenarios d01 to d04 (Red, the deceiver)

You hold a real division in one sector and, in d02 to d04, a notional one in another: a transmitter per net playing
the whole tree. Blue listens from three intercept sites across the water for three days (an hour a tick, the game
ends at T+72) and submits an assessment of your order of battle. Your score is 100 minus the collector's: every net it
places, every level and parent it gets right, every sector's strength and the objective it reads costs you. You win
when its score stays under 50.

## What you can see

- `status_lines`: the day and hour, your nets and radios, how many chatter this hour and how many are silent.
- `picture`: what your own units hear of Blue (nothing, unless Blue transmits).
- The traffic runs itself: each net's profile chatters by the hour of day, ramps up day by day, sends orders down the
  tree at its level's hours (division 06 and 18, brigades 07 and 19, battalions 08 and 20, companies and artillery 09
  and 21) and, for the real force, falls silent six hours before the operation at T+72.

## Orders

```
n-b1: loud 12                        a net chatters twice as much for 12 hours (n-b1: loud 12 1.5 for a factor)
b2-1: silent 6                       a net says nothing for 6 hours
n-div: order                         the hub sends an order down the net next hour, out of schedule
n-div: move 184,13                   move a transmitter (an HQ moves at about 5 km/h, the rest at 10; it cannot
                                     transmit while moving)
status · picture · help
```

Real nets are `div`, `b1`, `b1-2`, `b1-2-3` (brigade, battalion, company), `arty`, `recce`; the ruse's carry an
`n-` prefix (`n-div`, `n-b1`, `n-b1-2`). Unit names match.

## How to sell the ruse

1. Make the ruse's rhythm match the real force's: it already follows the same curves and order hours. Turn it up as
   the days pass (`loud`), as a force preparing to move would, and send extra orders on the last day.
2. Move the notional HQ a few kilometres at night. A fix that drifts looks like a headquarters that relocates.
3. The ruse's weak points are structural. It has no company nets unless the scenario bought them, and every
   acknowledgement on a notional net comes from its one transmitter. You cannot fix those with orders; you can make
   the real force look like the ruse: `silent` on a few real company nets for the hours Blue is most likely watching,
   so both sectors look thin at the company level.
4. The real force falls silent at T+66. Keep the ruse talking through the end so the silence is in one sector only,
   or silence a brigade of the ruse at the same hour so both sectors go quiet together.
