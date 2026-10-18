# Design: Link lab level 10, Many users and antenna arrays

Levels 1 to 9 had one enemy link and one antenna at each end. Level 10 adds both kinds of "many". Many users share a
band by giving each its own code (CDMA, built on level 8's Gold codes), which brings the near-far problem and the cure,
successive cancellation, and lets an attacker find an unknown short code without being told it. Many antenna elements
make an array: it can point a beam, put a null on a jammer (teaching point T5: nulling is protection), and find the
directions of several emitters at once (MUSIC, taking level 6 further).

Source: "Blind CDMA code discovery and beamforming" (pasted 2026-10-18). Used as a source, not copied; section 6
lists its errors.

## 1. Decisions

D1. **CDMA on the lab's Gold codes.** K users, each spreading with a 31-chip Gold code (`pn.ts`), each at its own power
and its own chip offset, as on a real uplink: aligned, two codes of one Gold family cross-correlate at only −1/31, so
offsets are what make users interfere. Despreading one user leaves the others as interference, cut by the code's
cross-correlation: equal powers give SINR ≈ Gp ÷ (K − 1) when noise is small, the rule for codes that look random to
each other. Each other user adds its previous and current bit times two partial correlations, so the exact BER averages
over those bits (up to 10 users) and differs from the rule user by user, often worse; the panel shows it. A new module
`cdma.ts` simulates the chip streams and gives both.

D2. **Near-far and successive cancellation.** A strong user 20 dB above a weak one buries it. Successive interference
cancellation decodes the strongest, rebuilds its chips, subtracts them and decodes the next. The engine runs both and
counts bit errors.

D3. **Finding an unknown short code.** Cut the received chips into code-length pieces. The data bits flip each piece's
sign, but the code is the same in every piece, so it is the main eigenvector of the pieces' covariance, even below the
noise if enough pieces are averaged. Only a short code works: a long code never repeats within the capture
(correction 2).

D4. **Arrays on a line.** A uniform linear array of M elements half a wavelength apart (the level 6 interferometer
extended). Delay-and-sum points a beam: gain 10·log10 M toward the look direction, beamwidth about 102° ÷ M. Capon
(MVDR) weights keep the look direction and minimise everything else, which puts a null on a jammer; its depth is the
J/S the array takes away. MUSIC splits the covariance into signal and noise parts and finds up to M − 1 emitters'
directions as sharp peaks.

D5. **One linear algebra core.** A Hermitian eigendecomposition (Jacobi on the real 2M × 2M form) and a complex solve
serve MVDR, MUSIC and the blind code estimate. `linalg.ts` with tests.

D6. **Teaching shape as levels 1 to 9.** Worked example, practice, then the enemy (scored), plain words, videos and
glossary marks.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Many users in one band | A1 example, A2 practice, A3 enemy | CDMA: each user its code; the others as interference; SINR ≈ Gp ÷ (K − 1); how many users fit | 15: SINR with K users, and the most users for a BER goal | Codes adding up in one band, one pulled out |
| B Near and far | B1 example, B2 enemy | A strong user buries a weak one; power control; successive cancellation | 15: the weak user's SINR before and after cancelling the strong one | Decode, subtract, decode |
| C Finding an unknown code | C1 example, C2 enemy | Pieces of one code period; the main eigenvector; how many pieces below the noise; why a long code defeats it | 10: the pieces needed, read from the discovery instrument | The code emerging from noise as pieces add up |
| D Arrays and beams | D1 example, D2 practice, D3 enemy | Steering; delay-and-sum; gain and beamwidth against M | 15: array gain and beamwidth for the enemy's array | A beam swinging across |
| E Nulling | E1 example, E2 enemy | Capon/MVDR; the null on a jammer; null depth as J/S lost; an M-element array nulls up to M − 1 jammers | 15: the J/S your jammer loses to the null; how many jammers beat the array | The null following the jammer |
| F Many directions at once | F1 example, F2 enemy | MUSIC: signal and noise parts; peaks at the emitters; up to M − 1 | 10: the emitters' directions from the spectrum | Peaks sharpening as snapshots add up |
| G Check | G1 questions | Three questions | 20 | – |

Total 100, pass mark 60.

## 3. Instruments

| Instrument | Shows |
|---|---|
| CDMA panel | Users, powers and codes; each user's despread SINR and BER; cancellation order |
| Code discovery | The estimated code against the true one, chip by chip, as pieces are averaged |
| Beam pattern | Gain against angle (polar or linear), the look direction, jammers and nulls |
| MUSIC spectrum | Pseudo-spectrum against angle with the true directions marked |

## 4. Videos

`level10-A1` CDMA; `level10-B1` successive cancellation; `level10-C1` code discovery; `level10-D1` beams;
`level10-E1` nulling. Numbers exported from the engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Hermitian eigendecomposition, complex solve | `src/engine/lab/linalg.ts` with tests |
| ULA steering, covariance from snapshots, delay-and-sum and MVDR patterns, output SINR, MUSIC | `src/engine/lab/array.ts` with tests |
| Multi-user chips with Gold codes, despreading, SIC, theory; blind code estimate from pieces | `src/engine/lab/cdma.ts` with tests |
| `LEVEL_10`, truth, values, setup; instruments | `levels/level10.ts`, `src/ui/lab/` |
| Glossary: CDMA, multiple-access interference, near-far, successive cancellation, array, beamforming, null, MVDR, MUSIC | `glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| Delay-and-multiply beamformer | Delay-and-sum |
| Single-code discovery from repetition periods | Only for a short code, which repeats within the observation; a long code does not |
| MUSIC reveals the directions of CDMA users | An M-element array separates at most M − 1 emitters by direction; more users than that need code-subspace separation as well |

## 7. Left out

Asynchronous CDMA and its partial correlations, multi-user detection beyond SIC, 2-D arrays, wideband beamforming,
coherent sources (spatial smoothing), and ESPRIT.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `linalg.ts`, `array.ts`, `cdma.ts` with tests.
2. CDMA panel, code discovery, units A to C.
3. Beam pattern, MUSIC spectrum, units D to G, scoring.
4. Videos and glossary terms.
