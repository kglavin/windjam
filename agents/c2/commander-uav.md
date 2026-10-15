# Blue commander brief: mission 4 in C2 mode, explicit orders

You command Blue from HQ. Red is flying a reconnaissance UAV somewhere east of you along a route you do not know. Every few minutes it transmits a short telemetry burst to Red HQ. Your job is to fix where it was when it transmitted, five times, with CEP under 1 km, before it finishes its route (T+60 at the latest).

You do not move or task any unit yourself. Every instruction to a squad or the UAV is an order you send over the radio net, and a unit acts on it only when it gets it. Read this brief and the protocol in `agents/README.md` (section "C2 mode").

## Units, agents and auto units

Your launch prompt lists which units have an agent. Every other unit is auto.

- An agent unit is another AI that reads its own console, sees its own bearings, and decides how to carry out your order. With this brief you send it concrete unit orders and it executes them as written. An order on a good link reaches it the turn you send it: it acts after you end your turn, in the same game minute an auto unit would.
- An auto unit executes your order text literally the minute the order arrives. If the text is not a valid unit order, the unit does nothing and your console shows `cannot execute order n: <error>`.

Either way, write orders in the unit grammar below.

## What you have

- Three squads (`sq1`, `sq2`, `sq3`) and a UAV (`uav`, tethered within 5 km of sq2 on a linked DF, free on a silent sortie). Only squads and the UAV can take bearings. HQ (`hq`), the relay and the EW team do not.
- `status` lists every unit's grid position, current task and link to HQ, as HQ knows them. A unit whose line says `link to HQ: LOST` cannot deliver bearings and, most likely, cannot get orders either.
- The EW team (`ew`) is on its own net from HQ. `send ew: jam uavlink` spot-jams the UAV's telemetry link and `send ew: jam off` stops it. Jamming makes Red lose reports (Red wins only with at most 1 lost; 2 or more lost makes it a draw) but does not help your own fixes, and Red can answer by raising the UAV's power, which makes it easy to hear. The order and its acknowledgement are two short transmissions on the EW net (56 MHz). While it jams, the EW team is the loudest emitter on the map and Red can fix it. A jam order takes effect the minute it arrives.
- `status` shows your orders: `Unit agents: sq1, uav. Auto: sq2, sq3, ew.` and `Orders: 5 sent; acknowledged 3 (on time 2, late 1); pending 1 (n4 to sq2 since T+10); lost 1 (n2 to sq3).`
- Red's other emitters (HQ, relay, squads) chatter. You will hear and fix them. They are not the objective. The UAV's signature is `65 MHz UAV link` (or `65 MHz DSSS` if Red spreads it).
- HQ's own radio you set directly, with no order: `hq: power 20`, `hq: antenna toward relay`, `emcon cmd 0` (quieter chatter on a net, 0 to 20 percent of minutes).

## How orders travel

- `send sq1: df e 5` is a one-minute burst from HQ on the command net. Red's sensors can hear it, and it shows Red where HQ is. Every order costs you.
- If sq1's link is good, the order arrives in the same minute. If the link is degraded, it arrives later, up to 5 minutes. If the link is lost, it never arrives.
- When the unit gets the order it sends an acknowledgement, another one-minute burst Red can hear. When the acknowledgement reaches HQ, the order's receipt is `on time` (arrived the minute you sent it) or `late`.
- The receipt is `pending` until then. After 3 minutes with no acknowledgement it becomes `lost`. Lost means HQ heard nothing back. The unit may still have the order and may be acting on it. A lost order is not a reason to assume the unit is idle.
- Your console shows each step: `HQ: order 3 to Blue Squad 1 sent.`, `HQ: order 3 acknowledged by Blue Squad 1.`, `HQ: order 3 to Blue Squad 1: no acknowledgement, lost.` The `Orders:` line in `status` counts every order by state and lists the pending and lost ones as `n<number> to <unit>`, so you do not need your own list.
- A unit that loses its link keeps executing its last order. A unit that hears nothing from you does not stop. A quiet unit is not a dead unit.
- A unit on a silent sortie is out of contact until it returns. An order to the UAV then is refused (`Blue UAV is on a silent sortie and cannot be reached until it returns.`) and is not sent. Wait until it is home.
- HQ cannot send while it is moving. It does not move in this mission.
- Each turn is 5 minutes. Your orders go out, then you end your turn, then the units act, the clock advances, and the receipts and reports come back as the minutes pass.

## How fixes work here

- A bearing comes from a unit on a DF task: `sq1: df e 3` listens over a 90° sector centred east. The bearings reach HQ when the task ends. The task must be running during the minute the UAV transmits.
- A fix on a moving emitter needs two different sites to hear the same burst in the same minute. One site, however many minutes, is only wedges. See the two-sensor rule in Plan.
- The UAV reports at least every 3 minutes. Each report is a 6 s burst, so a weak burst is missed more often than a chatterer.
- If Red runs low power with a directional antenna pointed at Red HQ (east of the route), sensors off that line hear little. Get a sensor near the line from the UAV's area to Red HQ.
- Auto units cannot `report`. A DF task reports when it ends, so the task length is your reporting interval.
- A DF order replaces a move, so let a move finish (status says `moving, N hexes to go`) before tasking DF.

## Each turn

1. Read your new console lines (receipts), `status` and `picture`. Note any `E? · 65 MHz` track and its bearings.
2. Decide which units need a new order. A unit on a DF task that ends this turn will sit idle if you send nothing, unless its agent repeats it. Do not rely on that for an auto unit.
3. Keep orders few. Each one is two transmissions. A 10-minute DF task sent every second turn costs half of a 5-minute one sent every turn, but gives you bearings later.
4. Post the lines, read `rejected`, fix anything refused, then end your turn.

## Orders

```
send sq1: df e 5                     sector east for 5 min (n ne e se s sw w nw or degrees)
send sq1: move 130,70                drive to a grid position (20 km/h)
send sq1: stop                       cancel its order
send uav: df e 3                     UAV on a linked DF (within 5 km of sq2)
send uav: sortie 126,76 e 5          silent sortie, listens on station, reports when back
send uav: sortie 128,76 e 6; 132,84 e 6
send ew: jam uavlink                 spot-jam Red's UAV telemetry link
send ew: jam off                     stop jamming
hq: power 20                         HQ's own settings are direct
emcon cmd 0
status
picture
help
```

`hq: power`, `emcon`, `status`, `picture`, `help` apply to HQ. Any other unit line (`sq1: df e 5`) is rejected: use `send`. Do not type `wait`. The server advances the clock when everyone has ended their turn.

## Plan

The facts below come from five played games, all won by Red. Blue never had two sensors hear the same burst in the same minute, so it never got a fix. Your orders arrive with delay, so plan from turn 1.

Two-sensor rule. Always keep at least two sensors on DF covering the same sector at the same time, from places a few km apart. Then any burst in that sector is heard by both in the same minute and gives a fix. Two sensors at the same site, or on different minutes, give no fix. Which units can do this early:

- sq2 is on DF from T+0. Send `send sq2: df e 5` every turn (it is auto and sits idle when a task ends).
- The UAV on a sortie listens only while on station. Put its station a few km from sq2 and keep legs within 6 km of sq2. Send a sortie each turn it is home, so its 5 minutes on station fall in the same minutes as sq2's DF (`send uav: sortie 126,76 e 5`).
- sq1 and sq3 listen only after they arrive. Until then they add nothing. When each arrives, put it on the same sector and the same 5-minute task as the others.

Position. Red's antenna points at Red HQ (east), so sensors off the line from where the UAV was heard to Red HQ hear little. Send sq1 and sq3 east toward that line, one on each side of it, a few km apart, and aim the sector at the last bearing (east if nothing yet). The squad that heard the UAV in played games was the one nearest that line.

Check positions first. The engine refuses a move to a hex another unit occupies. Read the unit positions in `status` before choosing a stop, and pick a free hex next to the one you wanted if it is taken (the EW team sat on 123,72 in one game).

Jamming. Fixes may not come, so plan to make Red lose reports too. Red's reports reach its HQ with only 1 to 3 dB of margin on the far western leg of its route (around T+20 to T+25 on seed 1234, whenever the UAV is furthest west). Jam through that leg:

1. `send ew: jam uavlink` when your bearings show the UAV on the western part of its route, or no later than T+15, whichever comes first. Order it a turn early: it takes effect the minute it arrives.
2. Keep it on through the far leg (to about T+30). `send ew: jam off` only when the bearings show the UAV heading back east, or when you have nothing to gain.
3. Cost: the EW team becomes the loudest emitter and Red can fix it. Red may raise the UAV's power to get through. That makes the UAV easy to hear, which is good for Blue, so keep the two-sensor rule in place when you jam.
4. Goal: 2 lost Red reports turns a Red win into a draw. In the played game Blue jammed once, at T+35, one minute before the route ended. That was too late.

## Opening that works

Turn 1: move sq1 and sq3 east toward the UAV's line to Red HQ (`send sq1: move <col>,<row>`). Pick each squad's stop 8 to 12 columns east of where it stands, on open ground and on a hex no unit holds. The squad's move line gives the planned minutes (`moving to 128,90, 13 hexes, about 20 min`) or `no route` (a mountain or water: pick a hex next to it). Aim for under 20 minutes: moves route around terrain, and in played games the full drive to column 130 took 26 to 41 minutes, which ended the game before the squads could listen. Then `send sq2: df e 5` and `send uav: sortie 126,76 e 5` (one leg, 5 min on station, back in about 12 min; 40 km/h, 30 min endurance including the flight home, so keep legs within 6 km of sq2 and the total under 25 min). Send `send ew: jam uavlink` by T+10 so it is in force by T+15.

From the minute each squad arrives: every sensor on a 5-minute DF task in the same sector, toward the last bearing (east if nothing yet), the UAV on another short sortie when it is home. Waiting to hear the UAV before moving is too late: by then it is halfway through its route.

Check receipts before you rely on an order. If sq3's order is `lost`, send it again once, and look at `status` for its link. Resending is another transmission.
