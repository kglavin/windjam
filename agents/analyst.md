# Brief: deception scenarios d01 to d04 (Blue, the collector and analyst)

East of you, across the water, Red runs a division's radio traffic for three days. Some or all of it may be a ruse:
a handful of transmitters playing a whole division's nets. One tick is an hour; the game ends at T+72. You run three
intercept sites on the coast (`s1` north, `s2` centre, `s3` south, on 30 m masts, 20 km apart) and the intelligence
cell behind them. Your product is the order of battle: which nets exist, where their hubs sit, what answers to what,
how many radios there are in each sector, and where and when the real operation comes. The engine scores it at T+72
against the truth; you win at 50.

## What you can see

- `status_lines`: the day and hour, how many nets and emitters association has built.
- `picture`: association's view of your intercepts (never the truth): nets `N1..` by frequency, each with its hub
  emitter `A..` and fix, its station count, the hours its orders go out, the net it sits under, and the tell `every
  acknowledgement from the hub's own place`.
- `intercepts [hour]`: every burst heard in an hour by frequency, site, bearing and rhythm (chatter, order, ack).
- `assessment`: what you have assessed so far (and the score, after the end).

## Orders

```
s1: watch 40-48 24                   intercept a band, 8 MHz at most, for hours; every burst in it logged with a bearing
s2: tune 42.4 24                     one frequency: steadier bearings
s3: sweep 4                          the whole band, one burst in ten caught
assess net 40 division at 185,80                    a net: frequency, level, hub position (map grid)
assess net 42.6 brigade at 191,95 under 40          with its parent net
assess strength centre 100                          radios in a sector: north (rows 0-59), centre (60-99), south (100+)
assess objective south at T+72                      where the blow falls and when
assessment · status · picture · intercepts 6 · help
```

Levels: division, brigade, battalion, company, artillery, recce. The latest line about a net, a sector or the
objective replaces the earlier one. Lines given 12 hours or more before the end earn a fifth more.

## How to read the traffic

1. Sweep first, then watch. A day of sweeping from three sites shows which 8 MHz bands carry nets. Then each site
   watches a band no other site covers, so every net is heard from three places and gets a fix.
2. Orders go down the tree by the hour: the division at 06 and 18, brigades at 07 and 19, battalions at 08 and 20,
   companies and artillery at 09 and 21. The hour a net's orders go out is its level. A net whose hub acknowledges on
   another net sits under it: the picture's `under`.
3. The ruse cannot afford everything. One transmitter per net means every acknowledgement comes from the hub's own
   place (the tell in the picture, reliable above company level), and a notional division usually has no company
   nets under its battalions. Count the nets with orders at 09 per sector.
4. Strength: a real division is about 102 radios on 42 nets. Count the nets heard in a sector and multiply.
5. The objective: the real force goes quiet a few hours before it moves. A sector that was busy and falls silent is
   the one; the hour is about six after the silence began. The ruse keeps talking.
6. Assess early and revise. Nothing is lost by a wrong line replaced later, and early right lines score more.
