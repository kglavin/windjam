# Design: Link lab level 6, Finding the transmitter

Levels 1 to 5 hear, measure and jam an enemy link. Level 6 finds where its transmitter is: bearings, triangulation,
the least-squares fix with its error ellipse and CEP, geometry, a moving sensor, and time difference of arrival. It
needs detection (level 1) but no jamming, so it can be played straight after level 1; it is numbered 6 so levels 2 to
5 keep their numbers.

Source material: "CliffNotes Overview: Electronic Warfare Target Location Methods (2nd Edition)", a summary of
Poisel's book. Used as a source, not copied; section 6 lists its errors and section 7 what is left out.

## 1. Decisions

D1. **One model with the map game.** Bearing error `σ = max(2°, 20°/√SNR)` (`bearingSigmaDeg`), the weighted
least-squares fix of bearing lines, its 1σ error ellipse and the exact CEP (`cepFromSigmas`) are the game's
(`src/engine/detect.ts`), so what the level teaches is what the "Find the enemy" mission plays. The fix's core moves to a
function in kilometres, `fixFromLinesKm`, which the game's hex-based `fixFromBearings` calls; the game's behaviour and
tests do not change.

D2. **In the figure area, not a full-screen map.** A new instrument, the DF view: an SVG plot in the lesson's figure
space like the spectrum and autocorrelation views. A km grid (about 20 × 20 km), the sites, bearing wedges (± 2σ), the
fix, its ellipse and CEP circle, and for TDOA the hyperbolas. Clicking places a site where a task allows it; a button
takes the bearings. Lessons can show it fixed (a worked example) or live.

D3. **SNR from the lab's own link budget.** Each DF site is a `Station`; its SNR comes from the scene's transmitter,
`pathLossDb` and the receiver noise, as the intercept's does in level 1. Moving a site closer raises its SNR and
narrows its bearing, the same lesson as level 1 B1.

D4. **TDOA is a full unit.** The enemy signal reaches two sites at different times. Cross-correlating their captures
(the autocorrelation of level 1 D1, between two receivers instead of one with itself) peaks at the time difference.
`c × Δt` is a range difference, which puts the transmitter on a hyperbola with the two sites as foci; a third site adds
a second hyperbola, and they cross at the fix. The captures are the lab's own signal (`knownCapture`), delayed and with
noise at each site's SNR. Timing error comes from the correlation peak (about one chip wide) and its SNR; a clock
offset between sites shifts the hyperbola (1 µs of clock error = 300 m).

D5. **Teaching shape as levels 1 to 5.** Worked example, then practice (unscored, try another), then the enemy
(scored), in plain words, with videos on the lessons and glossary marks.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Why locate | A1 lesson | The enemy's order of battle, targeting, and for jamming: J/S depends on the jammer's distance to the receiver, which only shows itself when it transmits | – | – |
| B Hear it first | B1 lesson | No fix without detection; each site needs SNR; spread spectrum sits below the noise | – | – |
| C One bearing | C1 example, C2 practice, C3 enemy | A directional antenna's peak; the phase interferometer, Δφ = 2πd·sinθ/λ, d ≤ λ/2; σ = max(2°, 20°/√SNR) | 10: the enemy bearing's σ from its SNR | Interferometer: a wavefront reaching two elements, the phase difference |
| D Two bearings | D1 example, D2 practice, D3 enemy | Triangulation by the law of sines; crossing angle; geometric dilution of precision: about 90° is best, under 30° gives long thin ellipses | 10: range from two bearings; 10: place a second site for a crossing near 90° | Two sites, the transmitter moving round, the ellipse stretching and shrinking |
| E Three or more | E1 example, E2 practice, E3 enemy | The error triangle; the weighted least-squares fix; the error ellipse; CEP | 20: place up to three sites, fix the enemy with CEP under 1 km | Error triangle, least-squares point, ellipse, CEP circle |
| F A moving sensor | F1 example, F2 enemy | One UAV taking bearings along a leg across the line of sight; the baseline it builds | 10: fly a leg that fixes the enemy under 1 km CEP | UAV legs collapsing the ellipse |
| G Time difference | G1 lesson, G2 example, G3 practice, G4 enemy | Δt from cross-correlation; range difference = c·Δt; the hyperbola; three sites, two hyperbolas, the fix; clock sync; why TDOA needs no directional antennas; a note on Doppler (FDOA) | 10: Δt and range difference from a correlation; 10: TDOA fix with three sites | Cross-correlation peak; hyperbola growing from a range difference; two hyperbolas crossing |
| H Check | H1 questions | Three questions | 20 | – |

Total 100, pass mark 60, as the other levels. The enemy transmitter's position comes from the level seed; the reveal
shows it with the fix.

## 3. The DF view

| Element | Shown as |
|---|---|
| Grid | km, north up, about 20 × 20 km, scale bar |
| Site | A dot, its SNR and σ beside it; draggable or placed by click in tasks that allow it |
| Bearing | A line from the site with a ± 2σ wedge |
| Fix | A cross; the 1σ ellipse; the CEP circle with its value |
| TDOA | Each pair's hyperbola (the branch nearer the later site), dashed ± 1σ bands |
| Truth | Hidden until the step is answered, then a ring |

Readouts under the plot: per site SNR and σ, the fix's CEP, the crossing angle. The view is a component beside
`Spectrum` and `Autocorr`, chosen by a new `Visual` kind, with state held in the step like other instruments.

## 4. Videos

`level6-C1` interferometer; `level6-D1` triangulation and geometry; `level6-E1` least squares, ellipse and CEP;
`level6-F1` moving sensor; `level6-G1` cross-correlation to hyperbola; `level6-G2` two hyperbolas to a fix. The
`videos/` pipeline as before, numbers exported from the engine.

## 5. Engine changes

| Change | Where |
|---|---|
| `fixFromLinesKm(lines)` in km, called by `fixFromBearings` | `src/engine/detect.ts` |
| Level 6 geometry: site SNR from the scene budget, bearings with noise, law-of-sines range, crossing angle, hyperbolas, TDOA timing error and fix (least squares on range differences) | `src/engine/lab/geoloc.ts` with tests |
| `LEVEL_6`, its truth (transmitter position from the seed), values and setup | `src/engine/lab/levels/level6.ts`, `src/ui/lab/levelSetup.ts` |
| DF view instrument | `src/ui/lab/instruments/DfView.tsx` |
| Glossary: bearing, triangulation, fix, error ellipse, CEP, GDOP, interferometer, TDOA, hyperbola, cross-correlation, FDOA | `src/engine/lab/glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| Triangulation range d₁ = d·sinφ₁ | By the law of sines d₁ = d·sinφ₂ / sin(φ₂ − φ₁), the mirror of its d₂ formula |
| Curves of equal differential Doppler are "isochrones" | Isochrones are equal-TDOA curves (hyperbolas); equal-Doppler curves are isodops |
| CEP ≈ 0.75·√(a² + b²) with a, b the 50% ellipse axes | The approximation uses the 1σ standard deviations; with the 50% axes it is about 18% too large. The level uses the exact CEP |
| Brown's least squares has zero algorithm bias with zero-mean noise | The bearings enter the H matrix, so noisy angles bias the fix; the notes give that as the reason for total least squares |
| TDOA needs a baseline > λ | No such condition; TDOA accuracy depends on clock sync, signal bandwidth and SNR |

## 7. Left out

MUSIC and other subspace methods, single-site location on HF and ionospheric models, total least squares and SVD,
Foy's iterative method, the cross-ambiguity function, cepstrum processing, Kalman tracking of moving targets. They are
beyond this audience and neither the lab nor the game uses them.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `fixFromLinesKm` refactor (game tests unchanged), `geoloc.ts` with tests.
2. DF view instrument and the level skeleton (units A to E) with their texts.
3. Units F and G (moving sensor, TDOA), the questions, scoring.
4. Videos and glossary terms.
