# Design: Link lab level 7, Frequency hopping

Levels 1 to 5 attack a direct-sequence link. Level 7 attacks the other kind of spread spectrum: a link that hops its
carrier from channel to channel. The same jammers behave very differently against it. Partial-band noise, useless
against direct sequence (level 3), is the strongest attack on hopping. A new attack appears: the follower jammer,
which listens for each hop and jams it, and which is a race against the hop's dwell time and the extra distance its
signal travels. Time hopping and hybrid links close the level.

Sources: "Core anti-jam waveform characteristics" (DSSS, FHSS, THSS, hybrid) and "Jamming strategies and J/S models"
(follower and swept jamming), pasted 2026-10-17 and 18. Used as sources, not copied; section 6 lists their errors.

## 1. Decisions

D1. **Noncoherent BFSK on each hop.** Hopping radios rarely keep the carrier phase from one hop to the next, so each
hop sends noncoherent binary FSK. Its bit error rate is ½·exp(−Eb/2N0): worse than BPSK by about 4 dB at the same
Eb/N0, which the lesson says. The theory is already in `theory.ts` (`berNoncoherentBfskLin`, `berPartialBandBfsk`,
`worstRhoBfsk`).

D2. **A hop-level link.** A new engine module `fh.ts` simulates hops, not chips: each hop picks a channel from the
hop set (seeded), the jammer decides which hops it covers and how strongly, and each bit in a hop is wrong with the BER
of that hop's Eb/(N0 + J0). A run returns the same `RunSummary` as the direct-sequence runs, so the run box, the BER
curve, predictions and deny goals work unchanged. Theory per jammer is computed alongside, as in levels 2 to 5.

D3. **A time–frequency instrument: the hop waterfall.** Time across, channel up, one tile per hop. The jammer's
coverage is drawn over it: partial-band rows shaded, a follower's tile starting late in each dwell, a sweep as a
diagonal band. Hit hops turn red after a run. It is a figure-area instrument like the spectrum and the DF view. The
player reads the hop set from it: number of channels, channel spacing, dwell time.

D4. **Gp = number of channels, against broadband noise only.** A broadband jammer spreads its power over all N
channels, so each hop meets J/N: Eb/J0 = Gp − J/S in dB, as level 2. Against partial-band and follower jamming the
protection depends on the hop rate and on coding across hops, and the level says so.

D5. **The follower on the level 6 map.** A follower hears the hop, finds the channel, tunes and transmits. Its signal
arrives late by its processing time plus the extra path, (d_TJ + d_JR − d_TR) ÷ c. The share of each dwell it covers
is 1 − (T_proc + extra path ÷ c) ÷ T_dwell. The places where that share reaches a goal form an ellipse with the
transmitter and receiver as foci, drawn on the DF view. The player places the follower; the run uses that share.

D6. **Slow and fast hopping, and the vote.** Slow hopping sends many bits per hop, so one jammed hop breaks a burst of
bits. Fast hopping sends each bit over several hops and votes (level 5's majority vote), so a partial-band jammer must
hit most of a bit's hops. The lesson shows the worst-case partial-band BER collapsing once the link votes across 3 hops.

D7. **Teaching shape as levels 1 to 6.** Worked example, practice (unscored, try another), then the enemy (scored), in
plain words, with videos and glossary marks. The scene and J/S work as in levels 2 to 5.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Hopping | A1 example, A2 practice, A3 enemy | Hop set, channel spacing, dwell, hop rate; reading them from the waterfall; Gp = N, in dB 10·log10 N | 10: number of channels; 10: dwell time and Gp | Hops landing on the waterfall; a wide band built from narrow channels |
| B Broadband against hopping | B1 example, B2 practice, B3 enemy | J spread over N channels; Eb/J0 = Gp − J/S; noncoherent BFSK ½·exp(−Eb/2J0); why it needs a lot of power | 10: Eb/J0 (5) and a BER prediction scored against a run (5) | – |
| C Partial band against hopping | C1 example, C2 practice, C3 enemy | Jam a fraction ρ of the channels at J/ρ each; BER ≈ ρ·½·exp(−ρ·Eb/2J0); best ρ = 2 ÷ (Eb/J0); BER ≈ 0.37 ÷ (Eb/J0), falling only as 1/x; the opposite of level 3's result for direct sequence | 20: channels to jam, about 2 × J/S (5); a run reaching BER 0.01 within 3 runs (15) | Same jammer, two links: direct sequence shrugs it off, hopping breaks |
| D Slow and fast hopping | D1 example, D2 enemy | Bits per hop against hops per bit; a burst of errors per hit hop; voting over 3 hops; the best partial band against fast hopping | 10: BER prediction for the voting link, then a run | One hit hop against three votes |
| E Follower jamming | E1 example, E2 practice, E3 enemy | Hear, tune, transmit: processing time and the extra path; share of the dwell covered; the ellipse of useful positions; short dwells beat followers | 20: place the follower on the map, run, reach a BER goal within 3 runs | The follower racing the hop; the ellipse round transmitter and receiver |
| F Other ways to spread | F1 lesson, F2 lesson | Swept jamming (a narrow jammer sweeping the band, hits each channel briefly); time hopping (bursts in random slots); hybrid DS/FH (Gp multiplies) | – | A sweep across the waterfall; time-hopped bursts |
| G Check | G1 questions | Three questions | 20 | – |

Total 100, pass mark 60. The enemy's hop set (24 to 64 channels, 25 kHz spacing, dwell 2 to 10 ms) and J/S come
from the level seed. Unit E uses a fast radio (200 kHz channels) whose transmitter and receiver stand north of the
line; its dwell (100 to 220 µs) is set from the seed so the best place on the friendly side covers about 30% of each
dwell, with 60 µs of follower processing. About a third of the friendly side then reaches the goal.

## 3. The hop waterfall

| Element | Shown as |
|---|---|
| Axes | Time (ms) across, channel (or MHz) up, about 40 hops wide |
| Hop | A tile one channel tall and one dwell wide |
| Partial band | Shaded rows over the jammed channels |
| Follower | The part of each tile after the follower's delay, hatched |
| Sweep | A diagonal band |
| After a run | Hit hops red, clean hops blue; counts under the plot |

Hover reads a tile's channel and start time, so the player can measure spacing and dwell.

## 4. Videos

`level7-A1` hops on the waterfall; `level7-C1` partial band against direct sequence and against hopping;
`level7-D1` slow against fast hopping and the vote; `level7-E1` the follower race and its ellipse; `level7-F1` the
sweep; `level7-F2` time hopping and hybrid links. Numbers exported from the engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Hop-level link and run: hop set, hop sequence, jammers (broadband, partial band, follower, sweep), voting over hops; `RunSummary` out; theory alongside | `src/engine/lab/fh.ts` with tests |
| Follower timing: delay, share of dwell, the ellipse of positions | `fh.ts`, using `geoloc.ts` |
| `LEVEL_7`, its truth (hop set from the seed), values and setup | `src/engine/lab/levels/level7.ts`, `src/ui/lab/levelSetup.ts` |
| Hop waterfall instrument | `src/ui/lab/instruments/Waterfall.tsx` |
| Run plans for hopping links, so the run box and deny goals take them | `src/engine/lab/berRun.ts` |
| Glossary: hop set, dwell, hop rate, slow and fast hopping, partial-band (against hopping), follower jammer, swept jammer, time hopping, hybrid DS/FH | `src/engine/lab/glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| FHSS Gp = W_ss ÷ W_channel | Holds against broadband noise. Against partial-band or follower jamming the protection depends on hop rate and on coding across hops |
| Fast FHSS (several hops per bit) resists follower jamming; slow FHSS is structurally vulnerable | What beats a follower is a dwell shorter than its processing time plus the extra path. Fast hopping usually has short dwells, but hops per bit is not the test |
| Time hopping defeats radiometric energy integrators by concentrating energy into bursts | Bursts are easier to see with a burst or peak detector; low average power only helps against long-averaging detectors. Its anti-jam value is that a jammer must cover all the time or guess the slots |
| Partial-band noise overwhelms with less total power than broadband | True against hopping (unit C); against direct sequence it gains essentially nothing (level 3) |

## 7. Left out

M-ary FSK and its symbol-level partial-band results, error-correcting codes beyond the 3-hop vote, hop
synchronisation (level 8), and the transmitter-side cost of fast synthesisers.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `fh.ts` (hop link, jammers, follower timing, theory) with tests.
2. Run plans for hopping links in the run box and worker, the waterfall instrument, and units A to C.
3. Units D to G, scoring.
4. Videos and glossary terms.
