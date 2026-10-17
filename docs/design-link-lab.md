# Design: chapters and the Link lab

Status: design, not built. Reviewed 2026-10-17 (section 13). This note adds a chapter structure to the game and a new chapter, the Link lab: a lower-level, educational game in which the player observes an emulated radio link, characterises it from measurements, attacks it, and characterises how well each attack works. The first version covers direct-sequence spread spectrum (DSSS) and the five attacks in the course notes' section "EA against DSSS". Chaotic shift keying (CSK) follows as a later level.

Decisions taken with the user (2026-10-17): sample-level simulation; guided levels with scoring; DSSS and five attacks first; a start screen with chapter cards; review decisions D1 to D4 (section 13).

## 1. What the player should learn

By the end of the DSSS levels a player can:

1. Read a spread signal from instruments: estimate chip rate, occupied bandwidth, code length, bit period, repetition and processing gain from a spectrum, an autocorrelation and a fluctuation display, without being told them.
2. Predict and measure what broadband noise does to a DSSS link: the jammer is cut by the processing gain, `Eb/J0 = Gp / (J/S)`.
3. Show that concentrating jammer power in frequency (partial-band noise) gains almost nothing against DSSS, because despreading spreads it again; and that concentrating it in time (pulsed noise) does, provided each pulse covers whole bits, turning the exponential BER curve into one that falls only linearly with J/S.
4. Show that a CW tone is spread by the correlator into noise against a long code, but lands on discrete spectral lines of a short code, so a tone aligned with a strong code line does more harm; that a tone in quadrature with the carrier does nothing to coherent BPSK; and that many tones raise the peak-to-average power ratio enough to push a receiver front end into compression.
5. Show that pulses strong enough to saturate the front end do damage out of proportion to their average power, and that pulses timed to a repetition code's boundaries defeat majority-logic decoding.
6. Compare every measured curve with its theory curve and explain the gaps.

## 2. Corrections to the course notes the lab teaches

The lab models coherent BPSK chips (D1). It must not repeat three loose statements in the notes; it shows the correct behaviour and says why.

| Notes say | What holds | How the lab shows it |
|---|---|---|
| Partial-band noise over fraction ρ gives `Pe = (ρ/2) exp(-ρ Eb/(N0+J0))`, and an optimised ρ makes BER linear in J/S | That expression is the partial-band result for a noncoherent modulation (the frequency-hopping case): DPSK as written; noncoherent BFSK, which the map game uses, carries a factor of 2 in the exponent, `(ρ/2) exp(-ρ Eb/(2 J0))` with N0 neglected, worst case `ρ* = 2/(Eb/J0)` giving `Pe = e⁻¹/(Eb/J0)`. For coherent BPSK the partial-band-in-time result is `Pe = (1-ρ) Q(√(2Eb/N0)) + ρ Q(√(2ρEb/(ρN0 + J0)))`, valid when each pulse covers whole bits. Its worst case, `ρ* ≈ 0.709 / (Eb/J0)`, gives `Pe ≈ 0.083 / (Eb/J0)`: linear in J/S, as the notes say, with a different constant | Both curves are drawn; the measured pulsed-noise BER follows the BPSK one |
| Partial-band noise is an attack on DSSS | Against DSSS, noise confined to a fraction of the spread band in frequency is spread again by despreading and acts like broadband noise of the same total power. The ρ advantage comes from concentrating in time (pulsed noise), not frequency | The player runs partial-band and pulsed at equal average J/S and sees the difference |
| A CW tone is spread by the PN code and behaves as noise | True for a long code (period much longer than a bit). For a short code that repeats every bit, the despread tone falls on the code's spectral lines; its effect depends on which line it meets, and for coherent BPSK on its phase relative to the carrier | Level 4 uses a 31-chip code; the player sweeps the tone offset and finds the worst one |

The map game (`budget.ts`) uses noncoherent BFSK for every waveform. For the same Eb/(N0+J0) the lab's BPSK link needs about 4 dB less at BER 1e-3. The level 2 debrief says why.

## 3. Chapters

A start screen lists the chapters as cards, each with a title, one sentence on what it teaches, and an Enter button:

1. **Sandbox map**: the hex world, links, coverage, jamming and the tools (what opens today).
2. **Missions**: the five missions and agent play.
3. **Link lab**: observe, characterise and attack an emulated link.

The header gains a **Chapters** button that returns to the start screen from anywhere. The current app's `mode` (`sandbox` or `mission`) becomes part of a top-level `chapter` state: `home | sandbox | missions | lab`.

URL handling: `?server=` takes precedence and opens missions in watch mode, as now. Otherwise `?chapter=` selects the chapter and, for the lab, `?level=` the level (`?chapter=lab&level=3`). Returning to the start screen does not end a running mission or lab run: chapter state is held for the session, so entering the chapter again resumes it. Progress (levels completed, best scores) is kept in `localStorage` per browser.

## 4. The emulated link

The lab does not use the hex map. It shows one link as a simple scene, and the player varies the physical assumptions there. The work of the chapter is at the signal level: RF measurement, the spreading code, and attacks on it.

### 4.1 The scene

An SVG drawing of three stations on a flat plane: transmitter, receiver and jammer, each an icon with its antenna, joined by labelled paths (Tx→Rx, J→Rx). The player drags the stations or types positions, and sets:

| Parameter | Range | Notes |
|---|---|---|
| Distances | from the positions, 0.1 to 100 km | shown on each path |
| Frequency | 30 to 3000 MHz | |
| Transmitter and jammer power | 0.1 W to 1 kW | |
| Antenna heights | 1 to 100 m | used by two-ray and the obstacle |
| Antenna gains | omni, or directional at the receiver pointed at the transmitter | the jammer then sits in a sidelobe unless it is in line |
| Path model, per path | free space, two-ray, or either plus one knife-edge obstacle (height and position on the path) | |
| Receiver noise figure and environment | 2 to 15 dB; rural or urban man-made noise | |

From these the scene computes S, J and N at the receiver input, and from them Eb/N0, J/S and Eb/J0 after processing gain. A budget ladder beside the drawing shows each term in dB, so the player sees how the geometry becomes the numbers the signal-level simulation runs on. It reuses the map-free functions in `rf.ts` (`fsplDb`, `twoRayLossDb`, `knifeEdgeLossDb`, `noiseFloorDbm`, `manMadeNoiseFigureDb`).

A level sets which scene parameters the player may change. Levels about the code fix the scene and let the player sweep jammer power; levels about the J/S equation free the positions and powers.

### 4.2 The signal

Complex baseband between the scene's transmitter and receiver. A level fixes these hidden parameters (drawn from the level's seed within ranges):

| Parameter | Range | Notes |
|---|---|---|
| Code | short: m-sequence of length N = 31, 63, 127 or 255, one period per bit (Gp = N). Long: m-sequence of degree 15 to 17 (N = 32,767 to 131,071), Gp 16 to 256 | LFSR with known primitive taps; a long code's period spans many bits |
| Chip rate Rc | 0.5 to 5 Mcps | sets the spread bandwidth, about 2 Rc null to null |
| Data rate Rb | Rc / Gp | Gp = Rc / Rb, the processing gain |
| Repetition r | 1, 3 or 5 | each bit sent r times, majority-logic decoding |
| Preamble | 32 code periods, data fixed at +1 | sent at the start of every transmission, as real links do for acquisition |
| Carrier offset | 0 to a few kHz | so the spectrum is not trivially centred |
| Eb/N0 | from the scene; levels choose scenes giving 6 to 12 dB | the clean link's margin |

What the instruments can show (D4). Under random data the autocorrelation's peaks at the code period average to zero, because adjacent bits flip sign at random. They show during the preamble, which gives the code length and the preamble's end, and so the timing of the first data bit. For a short code, a fluctuation display (the variance of autocorrelations taken over short windows) also peaks at the code period under data. Repetition shows as a nonzero mean autocorrelation at lags k·N for k < r, of height (r−k)/r, because repeated bits are equal. For a long code the bit rate cannot be seen without the code: the level card gives it, as intelligence on the service would, and the player computes Gp from the measured chip rate.

Signal model: rectangular chips, BPSK on the chips, additive white Gaussian noise. The receiver knows the code and timing (a friendly receiver, perfectly synchronised) and decides each bit by integrate-and-dump over its chips. Synchronisation loss is out of scope in the DSSS levels; it is the subject of the CSK level.

Two simulation rates (D2):

1. BER runs use one complex sample per chip, the output of an ideal chip-matched filter. Noise and broadband jamming are drawn per chip. Tone and partial-band jammers are generated as their chip-matched-filter outputs: a tone at offset f contributes `A·sinc(f·Tc)·exp(j(2πf(k+½)Tc + φ))` at chip k, and band-limited noise is drawn with the spectrum the chip filter passes, folded into one chip rate.
2. Instrument captures, and BER runs whose jammer peak reaches the front end's compression point, use s = 4 samples per chip (configurable), because the limiter acts on the waveform.

Front end: before despreading the receiver applies a soft limiter (Rapp model, smoothness p = 2) whose output saturates at a level set by the receiver's 1 dB compression point, and an ADC clip at full scale. Below compression it is transparent; high-peak jammers drive it into compression, suppressing the signal along with them.

## 5. Attacks

The player picks a jammer and its parameters. The J/S ratio (jammer to signal power, average, at the receiver input) comes from the scene: the player changes it by moving the jammer or changing its power, and a sweep steps jammer power with the geometry fixed. Each attack is generated at sample level and added before the front end. Every run reports both average and peak J/S.

| Attack | Parameters | Expected effect (theory curve) |
|---|---|---|
| Broadband noise (BBN) | covers the spread band | `Pb = Q(√(2Eb/(N0+J0)))` with `J0 = PJ / Wss`, i.e. `Eb/J0 = Gp / (J/S)` |
| Partial-band noise (frequency) | fraction ρ of the spread band, centre | about the BBN curve at equal total power (section 2); against a short code, a band narrowed toward a tone behaves like a tone |
| Pulsed noise (time) | duty ρ, pulse duration, optional alignment to bit or repetition boundaries | the BPSK partial-band-in-time formula when each pulse covers whole bits; pulses much shorter than a bit average out in the integrate-and-dump and act like BBN; plus saturation when peak power exceeds compression |
| Single-tone CW | frequency offset from carrier, phase | long code: Gaussian approximation `J/(Gp·S)`; short code: depends on the code line at that offset. Phase is randomised per run and the theory is the phase average; at zero offset the player may set phase, and a quadrature tone does nothing |
| Multitone | number of tones q, spacing, phases | PAPR rises with q; compression when the peak reaches the front end's limit |

Alignment uses the player's own timing estimate from the characterisation card (D3), not the hidden truth. A wrong estimate shows as an attack that does less than its theory.

## 6. Instruments

What the player has to observe and measure with:

1. **Spectrum analyser**: Welch PSD of the received samples, with a marker and a cursor readout; resolution bandwidth selectable.
2. **Time trace**: I and Q, and envelope, over a selectable span.
3. **Autocorrelation**: of the received samples over a chosen window (preamble or data). Chip duration from the width of the main peak, code period from the spacing of peaks in the preamble, repetition from the peaks at multiples of the code period under data.
4. **Fluctuation display**: variance of windowed autocorrelations against lag; peaks at a short code's period under random data.
5. **Correlator output**: histogram of integrate-and-dump outputs per bit (two clusters on a clean link, merging under attack), and an eye-style plot.
6. **BER meter**: bits sent, errors, BER with a 95% Wilson confidence interval. A run stops at 100 errors, 10⁶ bits or its time bound, whichever comes first; the player can stop it earlier.
7. **Curve plotter**: BER against J/S (or Eb/N0) for the runs made, with theory curves overlaid and the player's prediction points.

## 7. A level

Every level runs through five stages, shown as steps in a side panel:

1. **Observe**: instruments on a clean link. The level's text says what to look for.
2. **Characterise**: a card the player fills in: chip rate, occupied bandwidth, code length, bit period, start of the first data bit, repetition, processing gain (fields the level does not use are hidden; a long-code level gives the bit rate). Scored against the hidden truth with tolerances: chip rate ±5%, bandwidth ±10%, code length and repetition exact, bit period ±2%, first-bit time ±1 chip, Gp ±1 dB. The truth is revealed after submission; the player's estimates, not the truth, drive aligned attacks.
3. **Predict**: before each attack run the player predicts the BER at a chosen J/S (a number or a point on the plot). Each prediction is scored against the measured BER of the run that follows: 10 points inside its 95% interval, 2 fewer per factor of 2 outside, down to 0.
4. **Attack**: run the level's attacks, change parameters, sweep J/S.
5. **Measure and debrief**: the curve plot, the theory overlay, and the level's questions (for example "at equal average power, which did more harm, partial-band or pulsed, and why?"), answered by choice. The debrief shows the score and the one-paragraph explanation.

Score per level: characterisation (40), predictions (30, the mean prediction score scaled), questions (30). A level is complete at 60.

Attack efficiency, shown in every debrief: the average J/S and the peak J/S each attack needed to reach BER 1e-1 (the jammer's goal used elsewhere in Windjam), relative to broadband noise, and what that means in the scene: the greatest jammer-to-receiver distance at which the attack reaches 1e-1 with the scene's jammer power.

## 8. The DSSS levels

| Level | Link | Attacks | Teaches |
|---|---|---|---|
| 1. A quiet signal | short code (N = 63), no repetition | none | chip rate and bandwidth from spectrum and autocorrelation; code length from the preamble and the fluctuation display; Gp = N |
| 2. Processing gain | long code, bit rate given; two links with Gp 10 dB apart; jammer position and power free | BBN | J/S from the scene (distances, powers, path models); measured BER against `Gp/(J/S)`; a 10 dB increase in Gp moves the curve 10 dB and shortens the jammer's effective range; why the lab's BPSK curve sits 4 dB left of the map game's |
| 3. Where to put the power | long code, no repetition | BBN, partial-band, pulsed with pulse duration from well under to over a bit | frequency concentration does nothing; time concentration works when pulses cover whole bits; the worst-case ρ |
| 4. Tones | short code (N = 31), then a long code | single tone at swept offsets, multitone | line spectrum of a short code; tone phase; PAPR and compression |
| 5. Saturation and timing | short code (N = 63), repetition r = 3 | pulsed with high peak, pulsed aligned to repetition groups | repetition from the autocorrelation; front-end saturation; majority logic defeated by timing |
| 6 (later). Chaos | CSK link | low-power tone, low-level noise | synchronisation of a chaotic decoder fails at power levels a DSSS link ignores |

## 9. Engine

New code under `src/engine/lab/`, pure TypeScript with tests, no React and no game state:

| Module | Contents |
|---|---|
| `scene.ts` | the scene's stations and paths; S, J, N, Eb/N0, J/S and the budget ladder terms, from `rf.ts`; the jammer distance that gives a target J/S |
| `pn.ts` | LFSR m-sequence generator for degrees 5 to 17, primitive taps table; periodic autocorrelation |
| `signal.ts` | complex sample buffers (Float32Array pairs), BPSK chip modulation at one sample per chip and oversampled, preamble, carrier offset, AWGN at a given Eb/N0 |
| `dsss.ts` | transmitter (preamble, bits, repetition, spreading) and receiver (front end, despreading, integrate-and-dump, majority logic), returning decisions and correlator outputs |
| `jammers.ts` | BBN, partial-band, pulsed (with alignment to a supplied timing estimate), CW tone, multitone, each as a sample generator scaled to a J/S, in the chip domain and oversampled |
| `frontend.ts` | Rapp soft limiter and ADC clip |
| `measure.ts` | FFT (radix-2), Welch PSD, autocorrelation via FFT, windowed autocorrelation fluctuation, BER counting with Wilson confidence intervals, correlator histograms |
| `theory.ts` | `Q()`, BPSK in AWGN, BBN with processing gain, partial-band-in-time (BPSK) and its worst case, the noncoherent forms from the notes for comparison, tone Gaussian approximation (phase averaged), a short-code tone estimate from the code's line spectrum |
| `levels.ts` | level definitions: hidden parameter ranges, allowed attacks, texts, questions, tolerances, scoring |

Runs happen in a Web Worker so the page stays responsive. A BER point to 1e-3 with 100 errors is about 10⁵ bits: at Gp 255 and one sample per chip, about 2.6×10⁷ samples, around a second. Runs at s = 4 take four times as long; the run's time bound caps them.

The existing link-budget code (`rf.ts`, `ew.ts`, `budget.ts`) is not changed; `scene.ts` calls `rf.ts` and never the map. A test checks the lab's Gp against `processingGainDb` for the same chip and data rates. BER curves differ by design (section 2).

Non-functional requirements:

1. Determinism: every run is seeded from the level seed and the run number; the same inputs give the same result. Scoring and tests depend on it.
2. Time bound: a run stops after 10 s on the dev container at default settings, reports progress at least once a second, and can be cancelled.
3. Tests: fixed seeds; stochastic checks assert that theory lies inside the measured confidence interval, never against point values; per-test timeouts of 30 s; run with `npm test`.

## 10. Interface

`src/ui/chapters/Home.tsx` (the start screen) and `src/ui/lab/`: `LabChapter.tsx` (level select and layout), `LinkScene.tsx` (the scene drawing, its controls and the budget ladder), `StagePanel.tsx` (the five stages, the characterisation card, predictions, questions, score), and one component per instrument. The map's Scope (`scope.ts`) is analytic (band segments, no samples), so the lab's instruments are new; they follow the SVG approach of `ScopeTool.tsx`, `SequenceChart.tsx` and `ProfileChart.tsx`. No new chart library.

## 11. Work packages

Each is sized for one agent, with its own tests, following the conventions in the hierarchical-agents design note (Part 6), including `npm test` and at most two build agents at a time.

| Package | Size | Depends on |
|---|---|---|
| LL-1 Chapters: `Home.tsx`, the `chapter` state, URL handling and precedence, Chapters button | S | none |
| LL-2 `pn.ts` with autocorrelation tests (m-sequence two-valued autocorrelation), degrees 5 to 17 | S | none |
| LL-3 `signal.ts` (chip domain and oversampled, preamble), `frontend.ts` | M | none |
| LL-4 `dsss.ts`: transmit and receive; a clean link's BER interval contains `Q(√(2Eb/N0))` | M | LL-2, LL-3 |
| LL-5 `measure.ts`: FFT, Welch, autocorrelation, fluctuation, BER intervals | M | LL-3 |
| LL-6 `theory.ts` with tests against tabulated values | S | none |
| LL-7 `jammers.ts`; each attack's measured BER interval contains its theory at three J/S points | M | LL-4, LL-5, LL-6 |
| LL-8 Worker wrapper and run protocol (start, progress, cancel, time bound, results) | S | LL-4, LL-7 |
| LL-9 Instruments: spectrum, trace, autocorrelation, fluctuation, correlator histogram, BER meter, curve plotter | L | LL-5, LL-8 |
| LL-13 `scene.ts`: budget from positions, powers, gains and path models; tests against `fsplDb` and `twoRayLossDb` | S | none |
| LL-14 `LinkScene.tsx`: drawing, dragging, controls, budget ladder | M | LL-13 |
| LL-10 `levels.ts` and `StagePanel.tsx`: stages, card, predictions, questions, scoring, progress | M | LL-1, LL-9, LL-14 |
| LL-11 Levels 1 to 5 content and their texts; a playthrough check of each | M | LL-10 |
| LL-12 CSK level | L | LL-11 |

## 12. Open questions

Q1. Should the lab ever let the receiver lose code synchronisation in the DSSS levels (a jammer that breaks acquisition), or keep that for the CSK level? The design keeps the receiver synchronised.
Q2. Should missions and the lab connect (a lab result unlocking a jammer mode in the map game), or stay separate chapters? The design keeps them separate.
Q3. Agent play in the lab: the same server pattern could let an agent run the lab and be scored, which would test whether the briefs teach. Not in scope now.

## 13. Review (2026-10-17)

Decisions:

D1. Coherent BPSK chips. The lab's BER differs from the map game's noncoherent BFSK by about 4 dB at 1e-3; the two are tested to agree on processing gain only.
D2. BER runs at one sample per chip with chip-matched jammer models; captures and compression runs oversampled.
D3. Bit period, first-bit time and repetition are characterisation outputs, and timed attacks align to the player's estimate.
D4. Every transmission starts with an unmodulated preamble; a fluctuation display shows a short code's period under data; level 1 uses a short code, long codes start at level 2 with the bit rate given.
D5. No hex map. The lab draws one link as a scene whose physical assumptions the player varies; J/S and Eb/N0 come from that scene through `rf.ts`.

Risks:

R1. Stochastic tests flake if written against point values. Mitigated by the test rule in section 9.
R2. The map game and the lab show different BER for the same Eb/N0. Accepted; the level 2 debrief explains it.
R3. The DSSS receiver assumes perfect sync, so the CSK level needs new receiver code, not a parameter change. LL-12 is sized L.
