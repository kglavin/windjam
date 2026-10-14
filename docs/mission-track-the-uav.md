# Mission 4: Track the UAV

Two consoles, as in the duel. Red flies a reconnaissance UAV along a ten-waypoint route and must get a report back to Red HQ at least every three minutes. Blue tries to find, track and fix the UAV from what those reports give away.

The mission is about a moving, intermittent emitter. A static emitter gives Blue the whole mission to average bearings; a UAV gives Blue one short burst every few minutes from a new place each time, so every fix has to be built from bearings taken in the same minute.

## Rules

| Item | Value |
|---|---|
| Red's task | Fly the route (10 waypoints, about 30 minutes at 60 km/h) and report to HQ every 3 minutes |
| Report | A 6 s telemetry burst on the UAV link (65 MHz). It counts only if Red HQ receives it |
| Blue wins | 5 position fixes on the UAV with CEP under 1 km, before the route ends |
| Red wins | Route complete with at most 1 report lost, and Blue short of 5 fixes |
| Draw | Anything else at route end or T+60: Blue short of fixes and Red with 2 or more lost reports (or the route unfinished) |

### Reports

The UAV's clock starts at launch. If three minutes pass without a report, one is forced. `uav: burst` reports now and restarts the clock, so Red chooses the moment: over a hill from Blue's squads, or pointed away from them. The report is received when the UAV-to-HQ direction of the link is not denied; the uplink and jamming at the UAV do not matter.

### Fixes

Blue's sensors hear a burst only if a sweep lands on it (a 6 s burst gives about 3 of the minute's 25 sweeps a chance). Each minute's bearings on the UAV stand alone: two sites hearing the same burst give a fix for that minute, with its own CEP. The track panel lists the fixes; the map draws them as a dotted line of crosses with the latest ellipse. Bearings reach HQ when the DF task ends, so short tasks give a fresher picture.

## Red's levers

- `uav: launch` when ready; `uav: hold` to wait at the next waypoint; `uav: resume`.
- `uav: burst` to report at a moment of your choosing.
- `uav: power <W>` (0.1 to 10 W). Lower is harder to hear, and harder for HQ to receive.
- `uavlink: waveform dsss` spreads the burst: a search channel holds a sliver of it (LPD), and it resists jamming by its processing gain.
- `uav: antenna toward hq` points the link home: +6 dBi within 30° of HQ, 20 dB down everywhere else. Blue sensors off that line hear little.

At 0.3 W, DSSS, antenna toward HQ, Blue's line of squads gets no usable fix on seed 1234. At 1 W fixed-frequency it gets five by T+21.

## Blue's levers

- DF tasks and the UAV as before. Short tasks (3 minutes) report sooner; two sites must hear the same burst.
- Move squads toward the UAV's line to HQ to get inside its antenna beam.
- `ew: jam uavlink`: the EW team spot-jams the telemetry link at Red HQ. Red then loses reports unless it turns the power up, which makes the UAV easy to hear. Jamming does not help Blue's own fixes.

## Script

[missions/09-uav-track.txt](../missions/09-uav-track.txt): Red goes low, spread and directional; Blue sweeps, gets nothing, jams and pushes a squad forward. Draw: Blue gets no fix, Red loses six reports.

## Engine notes

- `createMission(seed, 'uav')` adds `r-uav` (a 60 km/h drone with a 150 m antenna, flown from Red HQ) and the `red-uav` hub net, and seeds the route from fixed reference points with up to a kilometre of jitter.
- `listen()` keys a moving emitter's accumulator by minute (`heardMin`) and records where it was (`emitterPos`) for scoring; `merge()` fixes each minute separately and keeps `track.fixes`.
- `emissionsAt()` returns `sweeps` for a burst so detection uses the burst length, not the whole minute.
- Scores: `uavFixes()` and `uavGaps()`; the winner is set as in the duel.
