# Design: Link lab level 11, Urban EW

Levels 1 to 10 work in open country: free space or a flat ground, a clear line of sight. Towns break that (teaching point
T7). Buildings block and reflect, so the loss at a given distance is larger, varies from street to street, and comes by
several paths at once. A jammer's J/S becomes a range of values rather than one number; bearings and time differences
point at walls instead of transmitters; and friendly and civilian receivers sit close to every target, so the jammer
must hit the enemy without hitting them.

Source: "Urban EW, propagation and operational challenges" (pasted 2026-10-18), summarised in design-curriculum.md
section 2 and corrected in its section 4. Used as a source, not copied; section 6 repeats its errors.

## 1. Decisions

D1. **Urban path loss as models, not ray tracing.** Hata (urban, 150 to 1500 MHz, with its mobile-height correction),
a two-slope street microcell (free space to a breakpoint, then 40·log10), a building entry loss, and a rooftop
diffraction term are formulas the player can work. A new module `urban.ts` with tests.

D2. **Shadowing is log-normal.** At a given distance the loss varies from spot to spot with a standard deviation of 6 to
10 dB. J/S then has a spread of √(σJ² + σS²) (the jammer's and the transmitter's paths shadowed independently), and a
jammer that must work at, say, 90% of spots needs a margin of 1.28 σ. An instrument draws J/S over many spots.

D3. **Multipath for the lessons the lab already taught.** Fading: a single path can drop 10 dB 1 time in 10 and 20 dB
1 time in 100 (Rayleigh); direct sequence resolves paths more than a chip apart and combines them (a rake), which
fights fades. For DF (level 6): a bearing taken where the direct path is blocked points at the reflecting wall; the
error is the angle between wall and transmitter. For TDOA: the correlation peak smears and an early weak path can hide
behind a later strong one.

D4. **Friendly receivers in the scene.** Fratricide is counted: each friendly or civilian receiver gets its own J/S from
the jammer, with a tolerance. A directional jammer (boresight gain, side lobes some dB down) isolates the target:
electronic isolation. The scored task places and points the jammer so the enemy's J/S is high and every friendly's is
low.

D5. **Counter-IED as the urban case of a protection bubble.** A vehicle jammer denies radio triggers within a radius.
The radius follows from the trigger's power and distance and the path model: r = d_t × (P_j ÷ P_t ÷ J/S needed)^(1/n).
It also jams the convoy's own radios, so it needs coordination.

D6. **Teaching shape as levels 1 to 10.** Worked example, practice, then the enemy (scored), plain words, videos and
glossary marks.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Why towns are different | A1 lesson | Blocked, reflected, scattered; few lines of sight; everything close together | – | Open ground against a street grid |
| B Urban path loss | B1 example, B2 practice, B3 enemy | Hata and its slope (about 3.5, not 4 or more, for a 30 m base); the street microcell; building entry and rooftop losses; J/S from a street against from behind a block | 20: J/S at the enemy receiver for two jammer places | One distance, three losses |
| C Shadowing | C1 example, C2 practice, C3 enemy | Log-normal spread; J/S as a spread; margin for coverage at a given share of spots | 15: the J/S spread, and the margin for 90% of spots | J/S scattered over a street grid |
| D Multipath | D1 lesson, D2 enemy | Fading and how often; the rake; DF bearings off walls; smeared TDOA peaks | 10: the bearing error from a reflection | A bearing bending off a wall |
| E Fratricide and isolation | E1 example, E2 practice, E3 enemy | Friendly and civilian receivers near the target; tolerances; a directional jammer and its side lobes | 25: place and point the jammer: enemy J/S above the goal, every friendly below its tolerance | The beam on the target, side lobes on friends |
| F Counter-IED | F1 example, F2 enemy | The protection bubble; its radius against power and path; jamming your own radios | 10: the bubble radius | The bubble around a convoy |
| G Check | G1 questions | Three questions | 20 | – |

Total 100, pass mark 60.

## 3. Instruments

| Instrument | Shows |
|---|---|
| Street map | A block grid on the level 6 map: streets, buildings, the enemy pair, friendly and civilian receivers, the jammer with a beam; each receiver's J/S |
| Shadowing spread | J/S at many spots as a histogram, the mean, the 90% line |
| Fading strip | A received level along a street, with fades marked |

## 4. Videos

`level11-A1` open ground against a town; `level11-B1` urban loss; `level11-C1` shadowing spread; `level11-D1` multipath
and DF; `level11-E1` isolation. Numbers exported from the engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Hata urban loss and slope, two-slope microcell, building and rooftop losses; log-normal shadowing, J/S spread and coverage margin; Rayleigh fade probability; reflection bearing error; directional jammer gain; fratricide check; protection bubble radius | `src/engine/lab/urban.ts` with tests |
| `LEVEL_11`, truth, values, setup; instruments | `levels/level11.ts`, `src/ui/lab/` |
| Glossary: shadowing, multipath, fading, rake, Hata model, fratricide, electronic isolation, counter-IED | `glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| The modified Hata model adds the a(h_m) correction for dense cores | a(h_m), the mobile antenna height correction, is part of the original Hata model (with a large-city form); COST-231 Hata is the extension, to 2 GHz |
| Dense-urban Hata path loss exponents n ≥ 4 | Hata's distance slope is (44.9 − 6.55·log10 h_b)/10, about 3.5 for a 30 m base antenna |
| Walfisch–Bertoni for antennas at or below rooftop height | Walfisch–Bertoni assumes the base antenna above the rooftops; below-rooftop cases are the street-canyon and COST-231 Walfisch–Ikegami domain |

## 7. Left out

Ray tracing, COST-231 Walfisch–Ikegami in full, indoor propagation beyond an entry loss, Doppler spread, and the
specifics of any counter-IED system.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `urban.ts` with tests.
2. Street map and shadowing instruments, units A to C.
3. Units D to G, scoring.
4. Videos and glossary terms.
