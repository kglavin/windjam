# Brief: air-defence scenarios s15 to s18 (Red)

You run a distributed air-defence net: a fire control node (`fc`), three radar sites (`radar1 radar2 radar3`) and four
launchers (`l1 l2 l3 l4`). Every 5 minutes, from T+5, each radar sends a track report to the node on the track net
(`track`, 47 MHz), and the node sends an engagement order to the next launcher on the fire net (`fire`, 49 MHz). The
engine does this for you. An engagement counts when both legs arrive on time. You win with 8 completed by T+60; Blue
wins by denying 6. The scenario plays to T+60.

Blue has three squads, a UAV and a 200 W jammer. It will fix your nodes, bring the jammer forward, and jam one of your
nets. Your job is to keep the legs arriving.

## What you can see

- `status_lines`: engagements completed and denied, each unit's position and link, both nets with their waveform and
  chatter, and the console lines each cycle: `Red Radar 1 → Red Fire Control: track report on time; ... engagement order
  late: missed.` A leg that goes late or lost tells you which net is under attack.
- `picture`: Blue's radios as your radars and the node hear them. Blue's jammer shows as `jammer, spot` (or barrage,
  pulse) and is easy to fix: that tells you where the jamming comes from.

## Orders

```
fc: antenna toward radar2      directional: +6 dBi toward that unit, 20 dB down elsewhere (including toward a jammer off that line)
fc: antenna omni
radar1: antenna toward fc      the radars' masts can point too
radar1: power 20               up to 20 W (the radars), 50 W (the node), 5 W (launchers)
track: waveform dsss|slow|fast|fixed    spread or hop the net; DSSS gives 25 dB of processing gain against a spot jammer
fire: waveform dsss
l2: move 154,92                move a launcher (1.5 min per hex), for instance behind terrain from the jammer
emcon track 0                  no chatter outside the cycle: fewer bearings for Blue
status · picture · help
```

## How to keep the net up

1. From T+0, cut chatter (`emcon track 0`, `emcon fire 0`) so Blue's sensors hear only the cycle bursts.
2. Watch each cycle's lines. Reports going late or lost means the track net is jammed at the node. Spread the net
   (`track: waveform dsss`), and if the jammer is off the line from the node to its radars, point the node's antenna
   along that line so the jammer falls 20 dB down.
3. Orders going lost means the fire net is jammed at the launchers: spread the fire net, and move the launcher the
   jammer reaches best away from it or behind high ground.
4. Fix the jammer from `picture` (it is the loudest emitter) and use that position to choose the antenna line and the
   launcher moves.

Each leg is decided by the link budget at that minute: signal against jamming at the receiver. Processing gain and a
directional antenna are worth 20 to 25 dB; moving a launcher 2 km can be worth more.
