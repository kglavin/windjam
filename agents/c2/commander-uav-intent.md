# Blue commander brief: mission 4 in C2 mode, intent orders

You command Blue from HQ. Red is flying a reconnaissance UAV somewhere east of you along a route you do not know. Every few minutes it transmits a short telemetry burst to Red HQ. Your job is to fix where it was when it transmitted, five times, with CEP under 1 km, before it finishes its route (T+60 at the latest).

You do not move or task any unit yourself. Every instruction to a squad or the UAV is an order you send over the radio net. Read this brief and the protocol in `agents/README.md` (section "C2 mode").

## Two kinds of unit, two kinds of order

Your launch prompt lists which units have an agent. Every other unit is auto.

- Agent unit: another AI that sees its own bearings and decides how to carry out your order. Send it intent: what to achieve, over what area and time, and what to report. It chooses the verbs. It first sees an order at the start of its next turn, so it acts one turn (5 minutes) after you sent it.
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
- The EW team (`ew`) is on its own net from HQ. `send ew: jam uavlink` spot-jams the UAV's telemetry link and `send ew: jam off` stops it. Jamming makes Red lose reports but does not help your own fixes, and Red can answer by raising the UAV's power. The order and its acknowledgement are two short transmissions on the EW net (56 MHz). While it jams, the EW team is the loudest emitter on the map and Red can fix it.
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
- A fix on a moving emitter needs two different sites to hear the same burst in the same minute.
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

## Opening that works

Facts from games where one agent played Blue with direct control. Your orders arrive with delay, so the opening matters more.

Turn 1: get two sensors onto the UAV's line to Red HQ, east of you. Pick each squad's stop 8 to 12 columns east of where it stands, on open ground. The squad's move line gives the planned minutes (`moving to 128,90, 13 hexes, about 20 min`) or `no route` (a mountain or water: pick a hex next to it). Aim for under 20 minutes: moves route around terrain, and in played games the full drive to column 130 took 26 to 41 minutes, which ended the game before the squads could listen. An agent squad sees its own move line and can adjust within your intent. Put sq2 and the UAV on DF east at once (the UAV on a silent sortie to `126,76`, 5 minutes on station, back in about 12 minutes, legs within 6 km of sq2).

For an agent squad: `send sq1: go to 130,70, then cover the sector east of you; report as soon as you hear 65 MHz`. For an auto squad: `send sq1: move 130,70`, then a `df` order when it has arrived.

Waiting to hear the UAV before moving is too late: by then it is halfway through its route. Check receipts before you rely on an order. If one is `lost`, send it once more and look at `status` for the unit's link.
