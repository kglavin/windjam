# Blue commander brief: mission 4 in C2 mode, explicit orders

You command Blue from HQ. Red is flying a reconnaissance UAV somewhere east of you along a route you do not know. Every few minutes it transmits a short telemetry burst to Red HQ. Your job is to fix where it was when it transmitted, five times, with CEP under 1 km, before it finishes its route (T+60 at the latest).

You do not move or task any unit yourself. Every instruction to a squad or the UAV is an order you send over the radio net, and a unit acts on it only when it gets it. Read this brief and the protocol in `agents/README.md` (section "C2 mode").

## Units, agents and auto units

Your launch prompt lists which units have an agent. Every other unit is auto.

- An agent unit is another AI that reads its own console, sees its own bearings, and decides how to carry out your order. With this brief you send it concrete unit orders and it executes them as written. It first sees an order at the start of its next turn, so it acts one turn (5 minutes) after you sent it.
- An auto unit executes your order text literally the minute the order arrives. If the text is not a valid unit order, the unit does nothing and your console shows `cannot execute order n: <error>`.

Either way, write orders in the unit grammar below.

## What you have

- Three squads (`sq1`, `sq2`, `sq3`) and a UAV (`uav`, tethered within 5 km of sq2 on a linked DF, free on a silent sortie). Only squads and the UAV can take bearings. HQ (`hq`), the relay and the EW team do not.
- `status` lists every unit's grid position, current task and link to HQ, as HQ knows them. A unit whose line says `link to HQ: LOST` cannot deliver bearings and, most likely, cannot get orders either.
- The EW team is on no net HQ can reach. You cannot order it and you cannot jam. Do not plan around jamming.
- Red's other emitters (HQ, relay, squads) chatter. You will hear and fix them. They are not the objective. The UAV's signature is `65 MHz UAV link` (or `65 MHz DSSS` if Red spreads it).
- HQ's own radio you set directly, with no order: `hq: power 20`, `hq: antenna toward relay`, `emcon cmd 0` (quieter chatter on a net, 0 to 20 percent of minutes).

## How orders travel

- `send sq1: df e 5` is a one-minute burst from HQ on the command net. Red's sensors can hear it, and it shows Red where HQ is. Every order costs you.
- If sq1's link is good, the order arrives in the same minute. If the link is degraded, it arrives later, up to 5 minutes. If the link is lost, it never arrives.
- When the unit gets the order it sends an acknowledgement, another one-minute burst Red can hear. When the acknowledgement reaches HQ, the order's receipt is `on time` (arrived the minute you sent it) or `late`.
- The receipt is `pending` until then. After 3 minutes with no acknowledgement it becomes `lost`. Lost means HQ heard nothing back. The unit may still have the order and may be acting on it. A lost order is not a reason to assume the unit is idle.
- Your console shows each step: `HQ: order 3 to Blue Squad 1 sent.`, `HQ: order 3 acknowledged by Blue Squad 1.`, `HQ: order 3 to Blue Squad 1: no acknowledgement, lost.` `status` does not list orders, so keep your own list of order numbers, targets and receipts.
- A unit that loses its link keeps executing its last order. A unit that hears nothing from you does not stop. A quiet unit is not a dead unit.
- A unit on a silent sortie is out of contact until it returns. Do not send it orders then.
- HQ cannot send while it is moving. It does not move in this mission.
- Each turn is 5 minutes. Your orders go out, the units act, the clock advances, and the receipts and reports come back as the minutes pass.

## How fixes work here

- A bearing comes from a unit on a DF task: `sq1: df e 3` listens over a 90° sector centred east. The bearings reach HQ when the task ends. The task must be running during the minute the UAV transmits.
- A fix on a moving emitter needs two different sites to hear the same burst in the same minute. One site, however many minutes, is only wedges.
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
hq: power 20                         HQ's own settings are direct
emcon cmd 0
status
picture
help
```

`hq: power`, `emcon`, `status`, `picture`, `help` apply to HQ. Any other unit line (`sq1: df e 5`) is rejected: use `send`. Do not type `wait`. The server advances the clock when everyone has ended their turn.

## Opening that works

The facts below come from games where one agent played Blue with direct control. They still hold, but your orders arrive with delay.

Turn 1: `send sq1: move 130,70` and `send sq3: move 130,90`. The drive takes about 25 minutes, so they are on the UAV's line to Red HQ by T+25. Then `send sq2: df e 5` and `send uav: sortie 126,76 e 5` (one leg, 5 min on station, back in about 12 min; 40 km/h, 30 min endurance including the flight home, so keep legs within 6 km of sq2 and the total under 25 min).

From T+25: every sensor on a 5-minute DF task toward the last bearing (east if nothing yet), the UAV on another short sortie when it is home. Waiting to hear the UAV before moving is too late: by then it is halfway through its route.

Check receipts before you rely on an order. If sq3's order is `lost`, send it again once, and look at `status` for its link. Resending is another transmission.
