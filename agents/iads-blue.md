# Brief: air-defence scenarios s15 to s18 (Blue)

Red runs a distributed air-defence net east of you: three radar sites that report tracks to a fire control node
every 5 minutes, and four launchers that node orders. Each cycle, every radar sends a track report on the Red track
net (47 MHz); if it arrives, the fire control node sends an engagement order to a launcher on the Red fire net
(49 MHz). An engagement counts for Red when both legs arrive on time. You win by denying 6 engagements (a leg late or
lost) before T+60. Red wins with 8 completed. The scenario plays to T+60 whatever happens, so keep denying.

You have the standard Blue force: HQ, a relay, three squads (`sq1 sq2 sq3`), the UAV (`uav`, tethered to sq2 within
5 km) and the EW team (`ew`, a 200 W jammer). Only the squads and the UAV take bearings.

## What you can see

- `status_lines`: engagements completed and denied so far, every unit's position, task and link to HQ.
- `picture`: tracks on Red's radios with bearings and fixes. The signatures tell you what each is: `47 MHz fixed`
  is the track net (radars reporting, and the node acknowledging), `49 MHz fixed` the fire net (the node ordering, the
  launchers acknowledging). The fire control node is on both; it transmits most.
- The reports and orders are bursts at T+5, T+10, T+15 and so on. Your DF tasks must cover those minutes.

## Orders

```
sq1: df e 10                         listen east for 10 minutes (sectors n ne e se s sw w nw, or degrees)
uav: df e 10                         the UAV listens from 150 m up: longer reach
uav: sortie 130,70 e 4; 130,90 e 4   silent sortie, bearings on return
ew: move 134,80                      bring the jammer forward (about 1.5 min per hex)
ew: jam track                        jam the track net: no report arrives, no order goes out
ew: jam fire                         jam the fire net: reports arrive, orders do not
ew: jam track barrage|partial|pulse|follower|sync   a mode other than spot (the default)
ew: jam off
status · picture · help
```

## How to take the net down

1. Find the nodes first. Two turns of DF from all four sensors fix the fire control node and the radars. The node is
   the busiest emitter and sits between the radars and the launchers.
2. Choose the leg. Jamming the track net denies the whole cycle (no report, no order). Jamming the fire net lets the
   reports in and kills the orders. Either denies an engagement; the track net is the single point.
3. Move the jammer to where it reaches the receiver that matters. Reports are received at the fire control node:
   J/S is set there, so the jammer must be closer to the node than the radars are, allowing for the radars' 20 W
   masts against your 200 W. Orders are received at the launchers: a jammer near the launchers denies them one by
   one. `ew: move` first; jamming from 20 km away does little.
4. Jam from T+15 or so and hold it. Each cycle you deny is one of the six.
5. Watch Red's counters in `picture` and `status`: a node that points its antenna, raises power, or moves a launcher
   changes which leg to jam. Re-site or switch nets.

The jammer, once on, is the loudest emitter on the map; Red will fix it. That costs nothing here, since Red has no
jammer, but note it for other scenarios.
