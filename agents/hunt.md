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

## How to play it

1. Turn 1: set a route toward where the other side must be (Blue flies east, Red flies west) and launch. A first leg of 60 to 80 columns is fine.
2. Each turn, read the latest bearing on the enemy UAV and re-route toward it: a bearing from your UAV is from where the UAV was when it took it; a bearing from HQ is from HQ. Cross them if you have both.
3. Your own reports give you away in the same way. Decide when to transmit: `burst` while far away, then approach quietly; or `hold` short of the last bearing and wait for the other UAV's forced report. Lower power and DSSS make your bursts harder to hear, but reports that do not reach HQ bring down no bearings.
4. Finding needs 3 km. Bearings at 50 km are 2 to 3 degrees wide, that is 2 km of error, so close in steadily and expect to correct every turn.

Do not type `wait`; the server advances the clock when both sides have ended their turn.
