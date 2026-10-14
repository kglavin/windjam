# Mission 2: Stay hidden

You command Red from a `red>` prompt. Blue is hunting you with the same sensors and tactics you used in mission 1, following a playbook you can't see. Blue wins by fixing three of your emitters. You win by keeping your command net working while denying Blue those fixes.

The tension is the whole mission: every order you pass is a transmission, and every transmission is a bearing for Blue. Going silent keeps you hidden and stops you commanding. Electronic protection (notes §1 EP, §3 LPI/LPD) is the set of ways to transmit and still not be fixed.

## Rules

### Objective

| Item | Value |
|---|---|
| Blue wins | 3 real Red emitters fixed with CEP under 1 km. Decoys don't count. |
| Red wins | Blue has fewer than 3 such fixes at T+60 **and** Red delivered at least 4 of its 6 orders on time |
| Draw | Blue fails to fix 3, but Red delivered fewer than 4 orders: hidden, but not commanding |
| Time limit | 60 mission minutes |

### Red's orders

HQ has six orders to pass during the mission, one every ten minutes, each to a named squad with a ten-minute window:

| Order | Window | To |
|---|---|---|
| 1 | T+0–10 | Squad 1 |
| 2 | T+10–20 | Squad 3 |
| 3 | T+20–30 | Squad 2 |
| 4 | T+30–40 | Squad 1 |
| 5 | T+40–50 | Squad 3 |
| 6 | T+50–60 | Squad 2 |

- `send` transmits the current order now. It is a one-minute burst from HQ on the command net. If the squad's route goes through the relay, the relay transmits too. The squad acknowledges with a one-minute burst of its own.
- Delivery uses the existing order model: on time, late or lost by the link's state at that minute (notes §1 timeliness). An order not sent by the end of its window is lost.
- You choose *when* in the window to send. That is the only thing you can time, and Red's intercepts of Blue (below) are the only hint about when Blue is listening.

### Background chatter and EMCON

Mission 1 modelled Red radios transmitting in about 20% of minutes. That is an undisciplined net. In this mission it is a setting:

- `emcon <net> <percent>` sets the share of minutes each radio on the net chatters, from 20 down to 0 (silence, orders only).
- Chatter is what gives Blue most of its bearings. Cutting it is free in this mission, which is realistic: emission discipline costs nothing but habit. The orders are what you can't avoid.

### What Blue does

Blue runs a **playbook**: a mission-1 script (`missions/*.txt`) turned into a timetable by its `wait` lines. You don't see which one. Several exist and the seed picks one, so you can't learn the schedule between games. Blue's units, links and tracks are hidden from you until the reveal.

Blue's sensors, detection, bearings, reporting over its radio net and fixing are exactly mission 1's.

### What Red can sense

Red's squads, relay and EW team carry ES receivers. They listen all the time, no tasking needed, and report over Red's net like Blue's do. Red hears Blue only when Blue transmits:

- **Report bursts.** When a Blue DF task ends, the squad (or the UAV's squad) sends its report to HQ: a one-minute burst on 60 MHz. Red logs an intercept with a rough bearing from each sensor that heard it, with the same error model as Blue's bearings. Two intercepts from different sensors give Red a fix on that Blue squad.
- **Blue HQ.** Transmits when it acknowledges a report. Same treatment.
- **The UAV's control link** during a *linked* DF (`uav: df`). A silent sortie emits nothing and is invisible to Red by RF.

Intercepts tell you where Blue's sensors are, and when a task has just ended. They don't tell you what Blue heard.

### Red's measures

| Command | Measure | Effect (from the existing model unless noted) |
|---|---|---|
| `emcon <net> <pct>` | Emission control | Fewer chatter bursts to hear. 20% → 5% cuts the chance a 3-minute Blue station hears a radio by about 4×. |
| `<unit>: power <W>` | Power control | Received power at Blue's sensors drops with it. 50 W → 5 W is −10 dB. Too little and your own links degrade. Bounded by the radio's maximum. |
| `<net>: waveform fixed\|slow\|fast\|dsss` | LPI/LPD waveform | DSSS puts 25 kHz of a 5 MHz signal in a Blue search channel: −23 dB. Fast hopping: −15 dB per look and caught on 63% of sweeps. |
| `<unit>: antenna toward <unit>` / `omni` | Directional antenna | **New.** HQ and relay only. +6 dBi within 30° of the pointed unit, −14 dBi elsewhere: 20 dB less toward anything off-axis, Blue's sensors included. Links to units off-axis suffer the same 20 dB, so pointing HQ at the relay pushes the squads onto the relay route. |
| `<unit>: move <col>,<row>` | Terrain masking, relocation | Path loss toward Blue rises behind a ridge; a fix on where you were goes stale. Squads 20 km/h; HQ moves at 10 km/h and can't transmit while moving. |
| `ew: decoy <net>` / `ew: decoy off` | Screening broadcast (§1 EP) | **New.** The EW team transmits dummy traffic with the net's frequency and waveform from where it stands. Blue hears a signature identical to the real net and gets a track and, with two bearings, a fix on the EW team instead. That fix doesn't count toward Blue's three. The decoy is itself an emitter; move the EW team away from the real HQ first. |
| `ew: jam blue-cmd` / `ew: jam off` | Attack the reporting channel | Blue's reports are held while its route to HQ is lost, so bearings pile up unfused and fixes arrive late. The jammer is a 200 W beacon: Blue's playbook can't exploit that, but a future Blue would. Jamming while a decoy runs isn't possible: one transmitter. |
| `send` | Pass the current order | The one emission you must make. |

Not included, by design: jamming the UAV's control link (needs the link modelled, T19) and anything kinetic.

### Stacking matters

At mission-1 ranges Blue's sensors had 40–55 dB of margin on every Red emitter. No single measure removes that:

| Measure | Gain against Blue's sensors |
|---|---|
| DSSS | −23 dB |
| Power 50 W → 5 W | −10 dB |
| Directional, Blue off-axis | −20 dB |
| Relocate behind a ridge | often −20 dB or more, terrain-dependent |
| EMCON 20% → 0% | removes chatter entirely; only orders remain |

DSSS plus power control plus a directional link takes 50 dB off and makes HQ's six order bursts hard to hear. EMCON removes everything else. The mission is won by a combination, and the debrief shows which transmissions Blue actually caught.

Two lessons the first runs taught:

- **A directional antenna only helps if the enemy is off its axis.** On the default map the relay sits west of HQ, on Blue's side. Pointing HQ at the relay puts Blue inside the beam and makes HQ louder toward Blue, not quieter. Move the relay first, or point at something else.
- **Red's own ES listens for free.** Squads and the relay take untasked intercepts of Blue's report bursts and chatter, so Red usually has a fix on every Blue sensor within a few minutes. Use it to choose where to stand and which direction is safe to transmit in.

## Commands

```
send                                 transmit the current order now (one-minute burst)
emcon <net> <percent>                background chatter on a net, 0-20
<unit>: power <watts>                transmit power, up to the radio's maximum
<net>: waveform fixed|slow|fast|dsss
<unit>: antenna toward <unit>        HQ and relay only
<unit>: antenna omni
<unit>: move <col>,<row>
ew: decoy <net>  ·  ew: decoy off
ew: jam blue-cmd  ·  ew: jam off
wait <minutes>
status                               units, links, current order and its window, intercepts
picture                              Red's picture of Blue: intercepts and fixes
reveal · next · step · back · exit   debrief, as in mission 1
help
```

Units: `hq relay sq1 sq2 sq3 ew`. Nets: `cmd retrans squad`.

Example:

```
red> emcon cmd 0
red> emcon squad 0
red> cmd: waveform dsss
red> hq: antenna toward relay
red> ew: move 146,86
red> wait 4
red> ew: decoy cmd
red> send
[T+05] HQ: order 1 sent to Squad 1 via relay. Delivered, on time.
[T+05] Relay: intercept, 60 MHz burst, bearing 258° ± 3°.      ← Blue reporting
red> wait 10
[T+15] Status: order 2 (Squad 3) window T+10-20.
```

## How it fits the engine

- **Two sides in one state.** `MissionState` gains a `side` for the player and a `playbook` for the opponent: the opponent's script converted into minute-stamped commands, issued automatically at the start of each tick. Blue's mission-1 logic runs unchanged.
- **Red's picture** reuses the track machinery: Blue's bursts are emissions, Red's sensors take bearings, HQ fuses them. The labels are Blue's signatures (`60 MHz fixed`).
- **Red's orders** reuse `orderDelivery` for status and the link routing for which units transmit.
- **Chatter and sends become the emission schedule.** `redActive` is replaced by a per-net duty plus the order bursts, so a Blue sensor can only hear Red when Red is actually transmitting.
- **New mechanics:** an antenna pattern on `Unit` (`boresight` toward a unit, gains as above) applied in both `linkBudget` and `sensorLook`; a decoy mode on the EW team that emits a chosen net's signature; power as a settable value with a per-kind maximum.
- **Reveal** gains two lines: which Red transmissions Blue caught (minute and emitter), and which Blue fixes were decoys.
- **Scripts** work as before, with `side red` as a directive, so Red playbooks can be tested headless too.

## Tests

- A send during a Blue station produces bearings; the same send outside any Blue task produces none.
- `emcon 0` leaves only order bursts as emissions.
- Pointing HQ at the relay drops HQ's direct links to the squads by 20 dB and routes them via the relay.
- A decoy produces a Blue track with the real net's signature, and a fix on it doesn't count toward Blue's win.
- Power below the link's need degrades Red's own orders.
- Red's intercepts of Blue report bursts give a fix on the reporting squad from two Red sensors.
- A playbook replays identically for a seed, and Red can't see Blue until the reveal.
- Win, lose and draw conditions.

## Decisions to confirm

- **D1.** Blue plays a fixed playbook chosen by seed, not an adaptive AI.
- **D2.** Six orders, one per ten minutes, at least four on time to win.
- **D3.** Chatter reduction is free; the orders are the only unavoidable emissions.
- **D4.** Directional antennas on HQ and relay only, +6 / −14 dBi with a 30° beam.
- **D5.** The EW team is the decoy, and can't jam and decoy at once.
- **D6.** Red's ES is untasked: automatic intercepts with bearings, no sector tasking.

## Later

- Blue that reacts: re-tasks toward decoys, chases relocations, jams back.
- Tasked Red DF and a Red UAV.
- The UAV control link as an emitter (T19), so linked DF becomes risky and the sortie's silence pays off against Red too.
- Realistic track association, so a frequency change or a relocation really does break Blue's picture.
