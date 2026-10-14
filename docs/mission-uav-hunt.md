# Mission 5: UAV hunt

The simplest two-sided mission, built for long games between agents. Each side has an HQ and one UAV, 68 km apart on the wide map, and nothing else. Each UAV must report to its HQ every five minutes. Every report is a burst the other side can hear. The first UAV to hear the other's report from within 3 km has found it.

## Rules

| Item | Value |
|---|---|
| Forces | Blue HQ and Blue UAV (west); Red HQ and Red UAV (east). No squads, relays or jammers |
| UAV | 60 km/h, 150 m up, 240 min endurance, launched from HQ with `uav: launch` |
| Reports | Forced every 5 min; `uav: burst` sends one early and restarts the clock. A 6 s burst on the side's UAV link (Blue 62 MHz, Red 65 MHz). It counts as received when the UAV-to-HQ direction of the link is not denied |
| Listening | HQ and the airborne UAV listen all round every minute. HQ's bearings reach its picture at once; the UAV's bearings come down with its next delivered report, tagged with where it was when it took them |
| Win | A UAV hears the other UAV's report from within 3 km |
| Draw | T+180 with no find |

## Orders

Both consoles have the same grammar:

```
uav: route 120,80; 150,70; 170,90   set or replace the waypoints (the UAV flies on from where it is; it loiters at the end)
uav: launch · uav: hold · uav: resume · uav: burst
uav: power <W>                     0.1 to 10 W
uavlink: waveform fixed|dsss       DSSS spreads the burst thin (hard to hear) and resists jamming
uav: antenna toward hq · uav: antenna omni
status · picture · help
```

`status` gives the UAV's position, waypoints to go, reports received and lost, the next forced report, how many bearings wait for it, and the latest bearing on the enemy UAV. `picture` lists the tracks.

## What the game is about

- At altitude, VHF carries far: HQ hears the other side's UAV from 60 km on seed 1234, and a UAV hears the other from similar ranges. Hearing is easy; finding (3 km) means closing in on bearings that are a few degrees wide and five minutes old.
- Your own report gives you away. A UAV that reaches the other quietly, and lets the other transmit first, wins. `burst` early before closing in, then stay quiet for the approach, or hold short of the last bearing and wait for the other's forced report.
- Low power keeps you quiet but the report has to reach HQ: Red at 0.3 W loses its reports beyond about 25 km from its HQ on seed 1234 (lost reports do not lose the game here, but each one is a bearing-free five minutes for your own HQ picture).
- HQ's bearing and the UAV's bearing on the same burst make a fix; both arrive late and loose at long range, so the picture is a direction to fly, not a point.
- The UAV's DF array is its own omni antenna: pointing the link antenna at HQ makes the UAV quieter sideways but not deaf.
- If both UAVs report inside 3 km in the same minute, each finds the other and the game is a draw.
- The reporting clocks are the game within the game. Each side's reports fall every 5 minutes from its last burst, and the other side can read that clock from the minutes of its bearings. The side that arrives inside 3 km just before the enemy's report and just after its own wins.

## Script

[missions/10-uav-hunt.txt](../missions/10-uav-hunt.txt): both fly toward the middle, Blue hears Red's forced report from 2.8 km at T+35.

## Engine notes

- `createMission(seed, 'hunt')` keeps only the two HQs, moves them to the reference-grid points in `HUNT_RULES.hqRef`, and adds a UAV and a telemetry net per side (`blueUav`, `uav` in the state).
- The mission-4 UAV code (`uavCommand`, `flyUav`, `uavReports`) now takes a `UavState`; `route` replaces the waypoints and `landsWhenDone` is false, so the UAV loiters.
- `listen()` records `sensorPos` for a flying sensor; `writeReport()` uses it, so bearings taken on the move are placed where they were taken.
- `found` is set in the tick when a capture by a UAV of the other UAV is within `interceptKm`; `resolve()` makes the finder the winner.
