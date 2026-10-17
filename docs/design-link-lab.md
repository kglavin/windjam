# Design: chapters and the Link lab

Status: design, not built. This note adds a chapter structure to the game and a new chapter, the Link lab: a lower-level, educational game in which the player observes an emulated radio link, characterises it from measurements, attacks it, and characterises how well each attack works. The first version covers direct-sequence spread spectrum (DSSS) and the five attacks in the course notes' section "EA against DSSS". Chaotic shift keying (CSK) follows as a later level.

Decisions taken with the user (2026-10-17): sample-level simulation; guided levels with scoring; DSSS and five attacks first; a start screen with chapter cards.

## 1. What the player should learn

By the end of the DSSS levels a player can:

1. Read a spread signal from instruments: estimate chip rate, code length, occupied bandwidth and processing gain from a spectrum and an autocorrelation, without being told them.
2. Predict and measure what broadband noise does to a DSSS link: the jammer is cut by the processing gain, `Eb/J0 = Gp / (J/S)`.
3. Show that concentrating jammer power in frequency (partial-band noise) gains almost nothing against DSSS, because despreading spreads it again; and that concentrating it in time (pulsed noise) does, turning the exponential BER curve into one that falls only linearly with J/S.
4. Show that a CW tone is spread by the correlator into noise against a long code, but lands on discrete spectral lines of a short code, so a tone aligned with a strong code line does more harm; and that many tones raise the peak-to-average power ratio enough to push a receiver front end into compression.
5. Show that pulses strong enough to saturate the front end do damage out of proportion to their average power, and that pulses timed to a repetition code's boundaries defeat majority-logic decoding.
6. Compare every measured curve with its theory curve and explain the gaps.

## 2. Corrections to the course notes the lab teaches

The lab must not repeat three loose statements in the notes; it shows the correct behaviour and says why.

| Notes say | What holds for coherent BPSK DSSS | How the lab shows it |
|---|---|---|
| Partial-band noise over fraction ρ gives `Pe = (ρ/2) exp(-ρ Eb/(N0+J0))`, and an optimised ρ makes BER linear in J/S | That expression is the noncoherent binary FSK result (the frequency-hopping case), and most texts carry a factor of 2 in the exponent: `(ρ/2) exp(-ρ Eb/(2 J0))` with N0 neglected, worst case `ρ* = 2/(Eb/J0)` giving `Pe = e⁻¹/(Eb/J0)`. For BPSK the partial-band-in-time result is `Pe = (1-ρ) Q(√(2Eb/N0)) + ρ Q(√(2ρEb/(ρN0 + J0)))`. Its worst case, `ρ* ≈ 0.709 / (Eb/J0)`, gives `Pe ≈ 0.083 / (Eb/J0)`: linear in J/S, as the notes say, with a different constant | Both curves are drawn; the measured pulsed-noise BER follows the BPSK one |
| Partial-band noise is an attack on DSSS | Against DSSS, noise confined to a fraction of the spread band in frequency is spread again by despreading and acts like broadband noise of the same total power. The ρ advantage comes from concentrating in time (pulsed noise), not frequency | The player runs partial-band and pulsed at equal average J/S and sees the difference |
| A CW tone is spread by the PN code and behaves as noise | True for a long code (period much longer than a bit). For a short code that repeats every bit, the despread tone falls on the code's spectral lines; its effect depends on which line it meets | Level 4 uses a 31-chip code; the player sweeps the tone offset and finds the worst one |

## 3. Chapters

A start screen lists the chapters as cards, each with a title, one sentence on what it teaches, and an Enter button:

1. **Sandbox map**: the hex world, links, coverage, jamming and the tools (what opens today).
2. **Missions**: the five missions and agent play.
3. **Link lab**: observe, characterise and attack an emulated link.

The header gains a **Chapters** button that returns to the start screen from anywhere. The current app's `mode` (`sandbox` or `mission`) becomes part of a top-level `chapter` state: `home | sandbox | missions | lab`. The URL carries the chapter (`?chapter=lab&level=3`) so a link opens straight into a level; `?server=` keeps opening missions in watch mode as now. Progress (levels completed, best scores) is kept in `localStorage` per browser.

## 4. The emulated link

One transmitter, one receiver, complex baseband, no geography. A level fixes these hidden parameters (drawn from the level's seed within ranges):

| Parameter | Range | Notes |
|---|---|---|
| Code | m-sequence of length N = 31, 63, 127 or 255 (LFSR, known primitive taps) | short code: one period per bit; long code: period spans many bits |
| Chip rate Rc | 0.5 to 5 Mcps | sets the spread bandwidth, about 2 Rc null to null |
| Data rate Rb | Rc / Gp | Gp = Rc / Rb, the processing gain |
| Repetition r | 1, 3 or 5 | each bit sent r times, majority-logic decoding |
| Carrier offset | 0 to a few kHz | so the spectrum is not trivially centred |
| Eb/N0 | 6 to 12 dB | the clean link's margin |

Signal model: samples per chip `s = 4` (configurable), rectangular chips, BPSK on the chips, additive white Gaussian noise. The receiver knows the code and timing (a friendly receiver, perfectly synchronised) and decides each bit by integrate-and-dump over its chips. Synchronisation loss is out of scope in the DSSS levels; it is the subject of the CSK level.

Front end: before despreading the receiver applies a soft limiter (Rapp model, smoothness p = 2) whose output saturates at a level set by the receiver's 1 dB compression point, and an ADC clip at full scale. Below compression it is transparent; high-peak jammers drive it into compression, suppressing the signal along with them.

## 5. Attacks

The player picks a jammer and its parameters and sets the J/S ratio (jammer to signal power, average, at the receiver input) with a slider. Each is generated at sample level and added before the front end.

| Attack | Parameters | Expected effect (theory curve) |
|---|---|---|
| Broadband noise (BBN) | covers the spread band | `Pb = Q(√(2Eb/(N0+J0)))` with `J0 = PJ / Wss`, i.e. `Eb/J0 = Gp / (J/S)` |
| Partial-band noise (frequency) | fraction ρ of the spread band, centre | about the BBN curve at equal total power (section 2) |
| Pulsed noise (time) | duty ρ, period, optional alignment to bit or repetition boundaries | the BPSK partial-band-in-time formula; worst case linear in J/S; plus saturation when peak power exceeds compression |
| Single-tone CW | frequency offset from carrier, phase | long code: Gaussian approximation `J/(Gp·S)`; short code: depends on the code line at that offset |
| Multitone | number of tones q, spacing, phases | PAPR rises with q; compression when the peak reaches the front end's limit |

## 6. Instruments

What the player has to observe and measure with:

1. **Spectrum analyser**: Welch PSD of the received samples, with a marker and a cursor readout; resolution bandwidth selectable.
2. **Time trace**: I and Q, and envelope, over a selectable span.
3. **Autocorrelation**: of the received samples (the player's way to find chip duration from the width of the main peak and the code period from the spacing of peaks).
4. **Correlator output**: histogram of integrate-and-dump outputs per bit (two clusters on a clean link, merging under attack), and an eye-style plot.
5. **BER meter**: bits sent, errors, BER with a 95% confidence interval; runs until a set number of errors or bits.
6. **Curve plotter**: BER against J/S (or Eb/N0) for the runs made, with theory curves overlaid and the player's prediction points.

## 7. A level

Every level runs through five stages, shown as steps in a side panel:

1. **Observe**: instruments on a clean link. The level's text says what to look for.
2. **Characterise**: a card the player fills in (chip rate, code length, occupied bandwidth, processing gain, repetition if the level has it). Scored against the hidden truth with tolerances (chip rate ±5%, bandwidth ±10%, code length exact, Gp ±1 dB). The truth is revealed after submission.
3. **Predict**: before each attack run the player predicts the BER at a chosen J/S (a number or a point on the plot). Predictions are scored by how close they land on a log scale.
4. **Attack**: run the level's attacks, change parameters, sweep J/S.
5. **Measure and debrief**: the curve plot, the theory overlay, and the level's questions (for example "at equal average power, which did more harm, partial-band or pulsed, and why?"), answered by choice. The debrief shows the score and the one-paragraph explanation.

Score per level: characterisation (40), predictions (30), questions (30). A level is complete at 60.

Attack efficiency, shown in every debrief: the J/S each attack needed to reach BER 1e-1 (the jammer's goal used elsewhere in Windjam), relative to broadband noise.

## 8. The DSSS levels

| Level | Link | Attacks | Teaches |
|---|---|---|---|
| 1. A quiet signal | long code, no repetition | none | find chip rate, code length, bandwidth, Gp from instruments |
| 2. Processing gain | as 1 | BBN | measured BER against `Gp/(J/S)`; a 10 dB increase in Gp moves the curve 10 dB |
| 3. Where to put the power | as 1 | BBN, partial-band, pulsed | frequency concentration does nothing, time concentration does; the worst-case ρ |
| 4. Tones | short code (N = 31), then a long code | single tone at swept offsets, multitone | line spectrum of a short code; PAPR and compression |
| 5. Saturation and timing | long code, repetition r = 3 | pulsed with high peak, pulsed aligned to repetition boundaries | front-end saturation; majority logic defeated by timing |
| 6 (later). Chaos | CSK link | low-power tone, low-level noise | synchronisation of a chaotic decoder fails at power levels a DSSS link ignores |

## 9. Engine

New code under `src/engine/lab/`, pure TypeScript with tests, no React and no game state:

| Module | Contents |
|---|---|
| `pn.ts` | LFSR m-sequence generator for N = 31 to 255, primitive taps table; periodic autocorrelation |
| `signal.ts` | complex sample buffers (Float32Array pairs), BPSK chip modulation, carrier offset, AWGN at a given Eb/N0 |
| `dsss.ts` | transmitter (bits, repetition, spreading) and receiver (front end, despreading, integrate-and-dump, majority logic), returning decisions and correlator outputs |
| `jammers.ts` | BBN, partial-band, pulsed (with alignment), CW tone, multitone, each as a sample generator scaled to a J/S |
| `frontend.ts` | Rapp soft limiter and ADC clip |
| `measure.ts` | FFT (radix-2), Welch PSD, autocorrelation via FFT, BER counting with Wilson confidence intervals, correlator histograms |
| `theory.ts` | `Q()`, BPSK in AWGN, BBN with processing gain, partial-band-in-time (BPSK) and its worst case, the noncoherent BFSK form from the notes for comparison, tone Gaussian approximation, a short-code tone estimate from the code's line spectrum |
| `levels.ts` | level definitions: hidden parameter ranges, allowed attacks, texts, questions, tolerances, scoring |

Runs happen in a Web Worker so the page stays responsive; a run of 10,000 bits at Gp = 127, r = 1, s = 4 is about 5 million samples, a fraction of a second.

The existing link-budget code (`ew.ts`, `budget.ts`) is not changed. Where both describe the same thing (processing gain, the BBN curve), a test checks they agree, so the map game and the lab never contradict each other.

## 10. Interface

`src/ui/chapters/Home.tsx` (the start screen) and `src/ui/lab/`: `LabChapter.tsx` (level select and layout), `StagePanel.tsx` (the five stages, the characterisation card, predictions, questions, score), and one component per instrument. Plots use the existing SVG approach of `SequenceChart.tsx` and `ProfileChart.tsx`; no new chart library.

## 11. Work packages

Each is sized for one agent, with its own tests, following the conventions in the hierarchical-agents design note (Part 6), including `npm test` and at most two build agents at a time.

| Package | Size | Depends on |
|---|---|---|
| LL-1 Chapters: `Home.tsx`, the `chapter` state, URL handling, Chapters button | S | none |
| LL-2 `pn.ts` with autocorrelation tests (m-sequence two-valued autocorrelation) | S | none |
| LL-3 `signal.ts`, `frontend.ts` | S | none |
| LL-4 `dsss.ts`: transmit and receive; a clean link's BER matches `Q(√(2Eb/N0))` within the confidence interval | M | LL-2, LL-3 |
| LL-5 `measure.ts`: FFT, Welch, autocorrelation, BER intervals | M | LL-3 |
| LL-6 `theory.ts` with tests against tabulated values | S | none |
| LL-7 `jammers.ts`; each attack's measured BER against its theory curve at three J/S points | M | LL-4, LL-5, LL-6 |
| LL-8 Worker wrapper and run protocol (start, progress, cancel, results) | S | LL-4, LL-7 |
| LL-9 Instruments: spectrum, trace, autocorrelation, correlator histogram, BER meter, curve plotter | L | LL-5, LL-8 |
| LL-10 `levels.ts` and `StagePanel.tsx`: stages, card, predictions, questions, scoring, progress | M | LL-1, LL-9 |
| LL-11 Levels 1 to 5 content and their texts; a playthrough check of each | M | LL-10 |
| LL-12 CSK level | L | LL-11 |

## 12. Open questions

Q1. Should the lab ever let the receiver lose code synchronisation in the DSSS levels (a jammer that breaks acquisition), or keep that for the CSK level? The design keeps the receiver synchronised.
Q2. Should missions and the lab connect (a lab result unlocking a jammer mode in the map game), or stay separate chapters? The design keeps them separate.
Q3. Agent play in the lab: the same server pattern could let an agent run the lab and be scored, which would test whether the briefs teach. Not in scope now.
