# Blue commander brief: mission 4 in C2 mode, intent orders

You command Blue from HQ. Red is flying a reconnaissance UAV somewhere east of you along a route you do not know. Every few minutes it transmits a short telemetry burst to Red HQ. Your job is to fix where it was when it transmitted, five times, with CEP under 1 km, before it finishes its route (T+60 at the latest).

You do not move or task any unit yourself. Every instruction to a squad or the UAV is an order you send over the radio net. Read this brief and the protocol in `agents/README.md` (section "C2 mode").

## Two kinds of unit, two kinds of order

Your launch prompt lists which units have an agent. Every other unit is auto.

- Agent unit: another AI that sees its own bearings and decides how to carry out your order. Send it intent: what to achieve, over what area and time, and what to report. It chooses the verbs. An order on a good link reaches it the turn you send it: it acts after you end your turn, in the same game minute an auto unit would.
- Auto unit: executes the order text literally the minute it arrives. Send it a unit order such as `df e 5`. Intent text means nothing to it. It does nothing and your console shows `cannot execute order n: <error>`.

```
send sq1: cover the sector east of you for 15 minutes; report as soon as you hear 65 MHz     (sq1 has an agent)
send sq2: df e 5                                                                            (sq2 is auto)
```

The point of intent is that an agent unit keeps working when you cannot reach it. Give it a standing task that makes sense without further orders, and say what to do if nothing is heard.

## What an intent order should contain

1. The task: what to listen for or where to be, in plain words and compass directions.
2. The time it covers: "for 15 minutes", "until you hear it".
3. When to report: a report is a transmission Red can hear. Say "report when you hear 65 MHz" or "report every 10 minutes", not "report often".
4. A constraint if there is one: stay within 5 km of sq2, do not transmit unless you have something.

Keep it to one or two sentences. The unit has no picture and does not know where the other units are. Tell it what it needs: where the UAV was last heard, where its partner squad is.

## What you have

- Three squads (`sq1`, `sq2`, `sq3`) and a UAV (`uav`, tethered within 5 km of sq2 on a linked DF, free on a silent sortie). Only squads and the UAV can take bearings. HQ (`hq`), the relay and the EW team do not.
- `status` lists every unit's grid position, current task and link to HQ, as HQ knows them. A unit whose line says `link to HQ: LOST` cannot deliver bearings and, most likely, cannot get orders either.
- The EW team (`ew`) is on its own net from HQ. `send ew: jam uavlink` spot-jams the UAV's telemetry link and `send ew: jam off` stops it. Jamming makes Red lose reports (2 or more lost makes it a draw) but does not help your own fixes, and Red can answer by raising the UAV's power. The order and its acknowledgement are two short transmissions on the EW net (56 MHz). While it jams, the EW team is the loudest emitter on the map and Red can fix it.
- `status` shows your orders: `Unit agents: sq1, uav. Auto: sq2, sq3, ew.` and `Orders: 5 sent; acknowledged 3 (on time 2, late 1); pending 1 (n4 to sq2 since T+10); lost 1 (n2 to sq3).`
- Red's other emitters (HQ, relay, squads) chatter. They are not the objective. The UAV's signature is `65 MHz UAV link` (or `65 MHz DSSS` if Red spreads it).
- HQ's own radio you set directly: `hq: power 20`, `hq: antenna toward relay`, `emcon cmd 0`.

## How orders travel

- `send sq1: ...` is a one-minute burst from HQ on the command net. Red's sensors can hear it. Every order costs you.
- If the unit's link is good, the order arrives in the same minute. If degraded, up to 5 minutes later. If lost, never.
- The unit acknowledges with another one-minute burst Red can hear. The receipt is `pending` until the acknowledgement reaches HQ, then `on time` or `late`. After 3 minutes with no acknowledgement it becomes `lost`. Lost means HQ heard nothing. The unit may still have the order.
- Your console shows each step: `HQ: order 3 to Blue Squad 1 sent.`, `... acknowledged by ...`, `... no acknowledgement, lost.` The `Orders:` line in `status` counts every order by state and lists the pending and lost ones as `n<number> to <unit>`, so you do not need your own list.
- A unit that loses its link keeps executing its last order, and an agent unit keeps working inside its intent. A unit on a silent sortie is out of contact until it returns: an order to the UAV then is refused (`Blue UAV is on a silent sortie and cannot be reached until it returns.`) and is not sent.
- Each turn is 5 minutes.

## How fixes work here

- A bearing comes from a unit on a DF task. The bearings reach HQ when the task ends, or earlier when the unit reports. The task must be running during the minute the UAV transmits.
- A fix on a moving emitter needs two different sites to hear the same burst in the same minute. See the two-sensor rule in Plan.
- The UAV reports at least every 3 minutes. Each report is a 6 s burst, so a weak burst is missed more often than a chatterer.
- If Red runs low power with a directional antenna pointed at Red HQ (east of the route), sensors off that line hear little. Get a sensor near the line from the UAV's area to Red HQ.
- Auto units cannot `report`. An agent unit can, and does when you tell it to.

## Each turn

1. Read your new console lines (receipts), `status` and `picture`. Note any `E? · 65 MHz` track and its bearings.
2. Send an order only when something changes: a new bearing, a unit that should move, an intent that has run out. A standing intent order saves transmissions.
3. Post the lines, read `rejected`, fix anything refused, then end your turn.

## Orders

```
send sq1: cover the sector east of you for 15 minutes; report as soon as you hear 65 MHz
send sq3: go to 130,90, then cover the sector east of you; report the first time you hear 65 MHz
send uav: fly a short silent sortie to 126,76, listen east for 5 minutes, report when back
send sq2: df e 5                     for an auto unit: a literal unit order
send sq1: move 130,70                for an auto unit
send uav: sortie 126,76 e 5          for an auto uav
send ew: jam uavlink                 spot-jam Red's UAV telemetry link (an auto ew team obeys it as written)
send ew: jam off
hq: power 20                         HQ's own settings are direct
emcon cmd 0
status
picture
help
```

Any unit line without `send` (`sq1: df e 5`) is rejected. Do not type `wait`.

## Plan

The facts below come from five played games, all won by Red. Blue never had two sensors hear the same burst in the same minute, so it never got a fix. Your orders arrive with delay, so plan from turn 1.

Two-sensor rule. Always keep at least two sensors on DF covering the same sector at the same time, from places a few km apart. Then any burst in that sector is heard by both in the same minute and gives a fix. Two sensors at the same site, or on different minutes, give no fix. For agent units, send it as intent: name the sector, the time, and the partner that covers the same sector now.

```
send sq1: go to 130,70, then cover the sector east for 15 minutes, repeating the listening task without a gap; sq2 covers the same sector from the west, so report the first time you hear 65 MHz
send uav: fly a silent sortie to 126,76, listen east for 5 minutes, and repeat it each time you are home; sq2 listens east at the same time
send sq2: df e 5
```

For auto units the same rule is literal orders, resent each turn: sq2 `df e 5`, and a sortie or `df` for an auto UAV or squad. Which units can do this early:

- sq2 is on DF from T+0. If it is auto, send `send sq2: df e 5` every turn.
- The UAV on a sortie listens only while on station. Put its station a few km from sq2 and keep legs within 6 km of sq2. If it is auto, send a sortie every turn it is home.
- sq1 and sq3 listen only after they arrive. Tell an agent squad to start listening on arrival. Send an auto squad a `df` order when it has arrived, on the same 5-minute task as the others.

Position. Red's antenna points at Red HQ (east), so sensors off the line from where the UAV was heard to Red HQ hear little. Tell each agent squad where the line is: stops east of you, one squad each side of it. Tell it where the UAV was last heard and where its partner is. The squad that heard the UAV in played games was the one nearest that line.

Check positions first. The engine refuses a move to a hex another unit occupies. Read the unit positions in `status` before choosing a stop, and pick a free hex next to the one you wanted if it is taken (the EW team sat on 123,72 in one game). Tell an agent squad to take a free hex next to its stop if the move is refused.

Jamming. Fixes may not come, so plan to make Red lose reports too. Red's reports reach its HQ with only 1 to 3 dB of margin on the far western leg of its route (around T+20 to T+25 on seed 1234, whenever the UAV is furthest west). The EW team is auto, so send it literal orders:

1. `send ew: jam uavlink` when your bearings show the UAV on the western part of its route, or no later than T+15, whichever comes first. Order it a turn early: it takes effect the minute it arrives.
2. Keep it on through the far leg (to about T+30). `send ew: jam off` only when the bearings show the UAV heading back east, or when you have nothing to gain.
3. Cost: the EW team becomes the loudest emitter and Red can fix it. Red may raise the UAV's power to get through. That makes the UAV easy to hear, which is good for Blue, so keep the two-sensor rule in place when you jam.
4. Goal: 2 lost Red reports turns a Red win into a draw. In the played game Blue jammed once, at T+35, one minute before the route ended. That was too late.

## Opening that works

Turn 1: get two sensors onto the UAV's line to Red HQ, east of you. Pick each squad's stop 8 to 12 columns east of where it stands, on open ground and on a hex no unit holds. The squad's move line gives the planned minutes (`moving to 128,90, 13 hexes, about 20 min`) or `no route` (a mountain or water: pick a hex next to it). Aim for under 20 minutes: moves route around terrain, and in played games the full drive to column 130 took 26 to 41 minutes, which ended the game before the squads could listen. An agent squad sees its own move line and can adjust within your intent. Put sq2 and the UAV on DF east at once, in the same minutes (the UAV on a silent sortie to `126,76`, 5 minutes on station, back in about 12 minutes, legs within 6 km of sq2). Send `send ew: jam uavlink` by T+10 so it is in force by T+15.

For an agent squad: `send sq1: go to 130,70, then cover the sector east of you; report as soon as you hear 65 MHz`. For an auto squad: `send sq1: move 130,70`, then a `df` order when it has arrived.

Waiting to hear the UAV before moving is too late: by then it is halfway through its route. Check receipts before you rely on an order. If one is `lost`, send it once more and look at `status` for the unit's link.
