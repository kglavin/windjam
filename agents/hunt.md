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

Phase B, stalk (when the enemy is probably within about 35 km, that is 70 columns, of your UAV; remember it is closing at up to 10 columns per 5 minutes, so count where it will be, not where it was). In one post: `uav: antenna toward hq`, `uav: power 1`, `uav: burst`, a route whose last waypoint is 30 to 40 columns short of where the enemy will be, then `uav: hold`. The antenna makes you 20 dB quieter in every direction except toward your HQ, so your reports still get home. Keep the fixed waveform unless the report SNR is above about 15 dB: DSSS does not add range, it spreads the same power, and at 1 W beyond 30 km from HQ it loses the link (one player lost two reports that way). A report that does not reach HQ brings down no bearings. Your UAV keeps listening all round whatever its link antenna does. Hold there. Every 5 minutes the enemy's forced report gives your UAV a fresh bearing, which arrives at HQ with your next report.

Phase C, pounce. Do not close inside 10 km without a bearing from your own UAV; HQ bearings alone are 2 km wide out here. Then use the enemy's clock: the minutes of the bearings on it are the minutes it reports, every 5. Your own forced report comes 5 minutes after your last burst. Plan the move so that you arrive inside 3 km of the enemy at a minute when its next report comes before yours. Example: its reports fall at T+35, 40, 45. Burst at T+40 (yours moves to T+45), fly 8 columns (4 minutes) to arrive at T+44 within 3 km, and its T+45 report is heard first. If the two reports would fall in the same minute, both find each other and it is a draw, which is still better than being heard first. `burst`, `resume` and the route go in one post; the move must end before your forced report falls due.

Timing arithmetic: your UAV flies 10 columns in 5 minutes. A `burst` buys exactly 5 minutes of silence from the moment it is posted. Never order a move that will still be in progress when your forced report falls due unless you are sure the enemy is more than 3 km from where you will be at that minute, including its own movement.

If the enemy holds too, creep: one burst and a 4-column leg per turn, timed as above. The side that closes carelessly loses; the side that closes on the enemy's clock wins.

Bearings are 2 to 3 degrees wide, which is 2 km of error at 50 km and 0.5 km at 10 km, so the bearing from your UAV at close range is the one to trust. A second viewpoint (a lateral hop of 10 columns) turns two bearings from your UAV into a fix.

Do not type `wait`; the server advances the clock when both sides have ended their turn.
