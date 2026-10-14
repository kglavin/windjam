# Blue brief: mission 4, track the UAV

You command Blue. Red is flying a reconnaissance UAV somewhere east of you along a route you do not know. Every few minutes it transmits a short telemetry burst to Red HQ. Your job is to fix where it was when it transmitted, five times, with CEP under 1 km, before it finishes its route.

## What you have

- Three squads (`sq1`, `sq2`, `sq3`) and a UAV (`uav`, tethered within 5 km of sq2 on a linked DF, free on a silent sortie). `status` lists every unit's grid position and its link to HQ. Only squads and the UAV can take bearings.
- Turn 1: read `status_lines`. A unit whose line says `link to HQ: LOST` cannot deliver its bearings; its reports are held until the link works. Move it a few hexes (`sq3: move <col>,<row>`, routes go around mountains) toward the relay or HQ, or rely on the units that are linked.
- An EW team (`ew`) that can spot-jam the UAV's telemetry link: `ew: jam uavlink`. Jamming makes Red lose reports (Red loses if more than one is lost), but it does not help your own fixes, and Red can answer by turning its power up, which makes the UAV easy to hear.
- Red's other emitters (HQ, relay, squads) chatter. You will hear and fix them; they are not the objective. The UAV's signature is `65 MHz UAV link` (or `65 MHz DSSS` if Red spreads it).

## How fixes work here

- A bearing is taken by a unit on a DF task: `sq1: df e 3` listens over a 90° sector centred east for 3 minutes. The bearings reach HQ when the task ends, so short tasks (3 minutes) give a fresher picture, and the task must be running during the minute the UAV transmits.
- A fix on a moving emitter needs two different sites to hear the same burst in the same minute. One site, however many minutes, is only wedges.
- The UAV reports at least every 3 minutes. Red can report early. Each report is a 6 s burst: only a few of a minute's sweeps can catch it, so a weak burst is missed more often than a static chatterer.
- If Red runs low power with a directional antenna pointed at Red HQ (east of the route), sensors off that line hear little. Get a sensor near the line from the UAV's area to Red HQ: move a squad east (`sq1: move 130,70`, 20 km/h) or fly the UAV on a silent sortie (`uav: sortie 126,76 e 5`: one leg, 5 min on station, back in about 12 min; 40 km/h, 30 min endurance including the flight home, so keep legs within 6 km of sq2 and the total under 25 min; reports on return).

## Each turn

1. Read your new console lines, `status_lines` and `picture`. Note any `E? · 65 MHz` track and its bearings.
2. Keep every squad and the UAV on a DF task every turn; an idle sensor hears nothing. Point sectors at where the UAV was last heard, or east if nothing yet.
3. Decide whether to jam, and whether to move a sensor toward the UAV's line to Red HQ.
4. Post the lines, read `rejected`, fix anything refused, then end your turn.

## Orders

```
sq1: df e 3            sector east for 3 min (n ne e se s sw w nw or degrees)
uav: df e 3            UAV on a linked DF (within 5 km of sq2)
uav: sortie 128,76 e 6; 132,84 e 6     silent sortie, listens on each leg, reports when back
sq1: move 130,70       drive to a grid position
ew: jam uavlink        spot-jam the telemetry link; ew: jam off
sq1: stop              cancel an order
status · picture · help
```

Do not type `wait`; the server advances the clock when both sides have ended their turn.

## Opening that works

Turn 1, before anything else: `sq1: move 130,70` and `sq3: move 130,90` (about 25 min of driving, so they are on the UAV's line to Red HQ by T+25), `sq2: df e 5`, `uav: sortie 126,76 e 5`. Turn 3 (T+10): `ew: jam uavlink` unless you already have two sites hearing the UAV; jamming costs Red reports and pushes it to raise power. Every later turn: every sensor on a 5-minute DF task toward the last bearing, and the UAV on another short sortie when it is home. Waiting to see the UAV before moving is too late: by the time you hear it, it is halfway through its route.
