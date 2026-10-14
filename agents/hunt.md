# Brief: mission 5, UAV hunt (either side)

You command one side: an HQ and one UAV. The other side has the same, about 68 km away (Blue is west, Red is east). Your UAV must report to your HQ every 5 minutes. Every report is a radio burst the other side can hear and take a bearing on. You win when your UAV hears the other UAV's report from within 3 km. The other side wins the same way. Draw at T+180.

## What you can see

- `status_lines`: your UAV's position and waypoints to go, reports received and lost, when the next forced report is, how many bearings are waiting to come down with it, and the latest bearing on the enemy UAV (degrees, from which sensor, at what minute).
- `picture`: tracks on the enemy UAV with every bearing. A bearing from HQ is immediate. A bearing your UAV took comes down with its next report, five minutes late at most. Two bearings on the same burst (HQ and UAV) make a fix with a CEP, usually several km at long range.
- Bearings are true bearings from the sensor's position: 0° north, 90° east. To fly toward a bearing of 85° from your HQ, pick a waypoint east of HQ along that line.

## Orders

```
uav: route 120,80; 150,70; 170,90   set or replace the waypoints; the UAV flies on from where it is and loiters at the end
uav: launch                        take off (set a route first or right after)
uav: hold · uav: resume            pause at the next waypoint, and continue
uav: burst                         report now; the next forced report is 5 minutes later
uav: power 0.3                     0.1 to 10 W: quieter for them, but the report must reach your HQ (watch the SNR in each report line)
uavlink: waveform dsss|fixed       DSSS spreads the burst thin: harder to hear, shorter range to HQ
uav: antenna toward hq · uav: antenna omni    directional link home: 20 dB down everywhere except toward HQ
status · picture · help
```

Grid positions are `col,row`; one hex is 0.5 km, so 10 columns is about 5 km. The UAV flies 60 km/h, so 5 minutes is about 10 hexes. Your HQ's position is in `status_lines`.

## The one rule

The game is decided by whose report goes out inside 3 km of the other UAV. A report is forced every 5 minutes, so an approach at full power on a straight line hands the win to whoever happens to be the listener at that moment. Every game so far was lost that way. So: transmit on your terms, with `burst`, when you are far from the enemy, and never let a forced report fall due while you may be close.

## Procedure, turn by turn

Phase A, approach (turns 1 to about 3). Set a route toward the enemy (Blue flies east, Red flies west) with a first leg of about 50 columns, and launch at the default 2 W. Each turn, re-route toward the latest bearing: a bearing from HQ is from HQ, one from your UAV is from where the UAV was when it took it. If you have both and they cross at a wide angle, `status` shows a fix with a CEP; use it as the enemy's position. If you have only HQ bearings, assume the enemy is on its own side of the midline (column 128) and closing at about 10 columns per turn.

Phase B, stalk (when the enemy is probably within about 25 km, that is 50 columns, of your UAV). In one post: `uav: antenna toward hq`, `uavlink: waveform dsss`, `uav: power 1`, `uav: burst`, and a route whose last waypoint is 15 to 20 columns short of the estimated enemy position on the bearing line, then `uav: hold`. The antenna makes you 20 dB quieter in every direction except toward your HQ, so your reports still get home; check the SNR in each report line and raise power if it drops below about 5 dB, because a report that does not reach HQ brings down no bearings. Hold there. Every 5 minutes the enemy's forced report gives your UAV a fresh bearing, which arrives at HQ with your next report.

Phase C, pounce (when the enemy bearing from your UAV is steady and the enemy is within about 10 km, that is 20 columns, by a fix or by the crossing of the HQ and UAV bearings). In one post: `uav: burst` (this restarts your 5-minute clock, so your next forced report is 5 minutes away, enough to fly 10 columns), then `uav: resume` and a route straight along the UAV bearing by 10 to 12 columns, no further. If the enemy's next forced report comes from within 3 km, you win. If the game is still running next turn, burst again before moving again.

Timing arithmetic: your UAV flies 10 columns in 5 minutes. A `burst` buys exactly 5 minutes of silence. Never order a move that will still be in progress when your forced report falls due unless you are sure the enemy is more than 3 km from where you will be.

Bearings are 2 to 3 degrees wide, which is 2 km of error at 50 km and 0.5 km at 10 km, so the bearing from your UAV at close range is the one to trust.

Do not type `wait`; the server advances the clock when both sides have ended their turn.
