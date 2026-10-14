# Red brief: mission 4, fly the UAV and keep reporting

You command Red. Your reconnaissance UAV (`uav`, at Red HQ, 152,80) must fly a ten-waypoint route west over the contested middle and back, and get a telemetry report to Red HQ at least every 3 minutes. Blue is trying to fix where the UAV was when it transmitted. You win if the route is completed with at most one report lost and Blue has fewer than five fixes under 1 km. Lose more than one report and the best you get is a draw.

## What you have

- The UAV: 60 km/h, 150 m up, route shown in your console at launch (about 30 minutes). Its telemetry link is `uavlink` (65 MHz).
- Your squads, relay and EW team listen all round and report Blue's transmissions to you as tracks `B1`, `B2`, ... on your picture. Blue's squads start around 114,68, 116,80 and 114,92; its UAV near 120,78; its EW team on high ground near 123,72.
- Red HQ, relay and squads chatter on your command nets. That chatter gives Blue bearings on them, not on the UAV; it is not the objective.

## The trade-offs

- Every report is a bearing for any Blue sensor that hears it. A report is a 6 s burst, so a weak one is often missed.
- `uav: power 0.3` (down to 0.1, up to 10 W): quieter for Blue, but HQ must still receive it.
- `uavlink: waveform dsss`: spreads the burst thin across a search channel (hard to detect) and resists jamming.
- `uav: antenna toward hq`: +6 dBi toward Red HQ, 20 dB down everywhere else. Blue sensors off the UAV-to-HQ line hear little. On seed 1234, 0.3 W, DSSS and the antenna toward HQ gave Blue no usable fix from its starting line.
- If Blue jams `uavlink`, your reports are lost unless you raise power, which makes the UAV easy to fix. Watch your console: `report ... lost: link denied` means jamming or range. `uav: hold` lets you wait at the next waypoint, for instance until a jammer is off or a Blue sensor has moved away; reports continue while holding.
- `uav: burst` reports now and restarts the 3-minute clock. Use it to choose the moment: when the UAV is far from Blue's sensors, or pointed away from them.

## Each turn

1. Read your new console lines, `status_lines` (route progress, reports received and lost, next forced report) and `picture` (where Blue's units are, from your intercepts).
2. Before launch: set power, waveform and antenna, then `uav: launch`. Launching later shortens Blue's window but the route must finish before T+60.
3. In flight: decide whether to burst early, hold, or change power. Keep the lost count at one or fewer.
4. Post the lines, read `rejected`, fix anything refused, then end your turn.

## Orders

```
uav: launch            start the route
uav: burst             report now (resets the 3-minute clock)
uav: hold · uav: resume
uav: power 0.3         0.1 to 10 W
uavlink: waveform dsss|fixed|slow|fast
uav: antenna toward hq · uav: antenna omni
emcon cmd 0            quieten a net's chatter (cmd retrans squad uavlink)
status · picture · help
```

Do not type `wait`; the server advances the clock when both sides have ended their turn.
