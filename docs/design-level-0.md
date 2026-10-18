# Design: Link lab level 0, Radio basics

Level 1 assumes vocabulary that a new recruit may not have: hertz and microseconds, bits as +1 and −1, a spectrum
plot, decibels, path loss, noise and SNR, bit error rate and J/S. Level 0 teaches those, mainly through short videos,
so a student can reach level 1 without stalling on terms. It is refresher material for anyone who already knows it.

Source material: "Radio Communications Demystified" (a three-part study guide, mostly Part I, with Part II and III for
the dB, link and jamming sections) for units A to J; the tactical network architectures and the spread spectrum
security taxonomy notes (pasted 2026-10-18) for unit K. They are used as sources, not copied: section 4 and
design-curriculum.md section 4 list their errors.

## 1. Decisions

D1. **Teach, don't test.** Every step is a lesson: a video (design-lesson-videos.md), a few short paragraphs in plain
words, and at most one check question, unscored with unlimited tries (`LessonStep.check`). No practice, apply or
question steps. Pass mark 0, so finishing the lessons passes the level.

D2. **Optional.** Level 0 appears first in the level list but nothing requires it; level 1 can be started directly.

D3. **What levels 1 to 5 use, and the radio around it.** Polarisation, radar, chaff, ADC quantisation and FM
improvement are left out. Added beyond the source, because the later levels lean on them: period = 1 ÷ frequency
(1 MHz ↔ 1 µs); the spectrum plot; mixing down from the air to 0 MHz, since every spectrum in the lab is drawn from the
carrier; the blocks inside a transmitter and a receiver with the power at each stage (the front end that level 5
overloads); antenna patterns and gain (dBi), which set both intercept and J/S; and jamming a plain BPSK link, so the
spread-spectrum levels have something to compare with.

D4. **Wiring.** `LEVEL_0` (id 0) in `src/engine/lab/levels/level0.ts`, first in `LEVELS`; `SETUPS[0]` reuses level 1's
truth and scene (no lesson shows the scene) with no values, hidden rows or card. Lessons use `visual: { kind: 'none' }`
so the video is the figure.

## 2. Units

| Unit | Lesson | What it teaches | Source | Check (unscored) |
|---|---|---|---|---|
| A | A1 The radio link | Transmitter, path, receiver; the antenna as the bridge between wires and air; the lab's four stations | I 1.2, 3.1–3.3 | Parts of a link: 3 |
| B | B1 Frequency, period and wavelength | Hz, kHz, MHz; period = 1 ÷ frequency (1 MHz → 1 µs); wavelength = speed ÷ frequency | I 2.2–2.3 | 2 MHz → 0.5 µs |
| C | C1 Putting bits on a wave | Carrier; ASK, FSK, PSK; BPSK: the phase is the bit, +1 or −1 (180°) | I 4.3, III 4 | 180° |
| D | D1 The spectrum | Power at each frequency; a tone is a spike, changing signals a hump; faster changes, wider hump; 0 MHz is the carrier | not in source | 0.5 µs pulses → ±2 MHz |
| D | D2 From the air to 0 MHz | A mixer multiplies by an LO: difference and sum; 140 − 138 = 2 MHz IF; I and Q to 0 MHz; low IF to avoid DC; then ADC and DSP | I 3.3 | 140 and 138 → 2 MHz |
| E | E1 Decibels | ±3 dB, ±10 dB; building 13 dB and −7 dB; dBm as an amount, dB as a ratio | I 7, II 2 | +20 dB → 100 times |
| F | F1 Distance | Spreading: −6 dB per doubling; near the ground −12 dB per doubling; why the lab's distances matter | I 5.2, II 4.1, III 2 | 4 times the distance → 12 dB |
| F | F2 Antennas | Patterns, same for send and hear; dBi; the dipole all round, about 2 dBi; beams of 10 to 30 dBi; a beam is hard to intercept and to jam from the side | I 3.2, II 3, III 2 | +10 and −10 dBi → 20 dB |
| F | F3 Radiated power and margin | EIRP = amplifier − cable + antenna gain (ERP 2.15 dB less); the link equation as dB bookkeeping; link margin; fade margin against reliability (Rayleigh: 10, 20, 30 dB for 90, 99, 99.9%) | Adamy-style link budget notes (pasted 2026-10-18) | +40 dBm, 2 dB, 6 dBi → +44 dBm |
| G | G1 Inside a radio | Transmit chain DSP, DAC, mixer, filter, power amplifier; receive chain filter, LNA, mixer, filter, ADC, DSP; the power at each stage; front-end overload | I 3, II 2.3, III 3 | +40 dBm − 110 dB → −70 dBm |
| H | H1 Noise and SNR | Thermal noise floor, about −114 dBm per MHz, growing with bandwidth; SNR in dB; a signal below the noise | I 6.1–6.2, II 5, III 5 | 10 MHz → −104 dBm |
| I | I1 Bit errors | Decisions with noise; BER; Eb/N0 as SNR per bit; the steep curve ("cliff") | I 6.3, II 6.3 | BER 0.001 → 1 in 1000 |
| J | J1 Jamming and J/S | J and S at the receiver; J/S as dB bookkeeping; distance | II 7.1, III 7 | −60 and −70 dBm → 10 dB |
| J | J2 Jamming an ordinary link | Plain BPSK: Eb/J0 = S/J; J/S 0 dB breaks it (BER 0.079); the same jammer against Gp 20 dB leaves 10 dB | III 7 | J/S 0 dB → Eb/J0 0 dB |
| J | J3 Spread spectrum, a preview | Hopping and direct sequence; this lab is direct sequence; processing gain = chip rate ÷ bit rate | I 8.3, III 6 | 1 Mcps, 10 kbps → 100 |
| K | K1 Networks | One-to-one, hub and spoke, shared net, mesh; what a jammer near one radio does to each; the hub sends most and is easiest to find | Tactical network architectures | Hub with 8 outstations → 8 |
| K | K2 What spread spectrum protects | The attacker's steps (detect, intercept, locate, read, jam) against LPD, LPI, LPE and AJ; where the lab practises each; averaging finds a signal below the noise | Spread spectrum security taxonomy | 10 kHz spread to 10 MHz → 1000 |

Video ids follow the lesson ids (`level0-A1` to `level0-K2`, with `level0-F3`), scenes `videos/level0_<lesson>.py`. Each runs 1 to 2
minutes.

## 3. Wording

Plain words first, the term second ("how many wiggles each second: the frequency"). One idea per paragraph. Numbers in
the texts are worked, not quoted, and match the videos. Terms that level 1 uses are introduced with the same name
(chip, bit, spectrum, SNR, Eb/N0, J/S, processing gain).

## 4. Corrections to the source

| Source says | Correct, and what level 0 says |
|---|---|
| PSK flips the phase "to mark a bit transition" (I 4.3) | That is differential PSK. In BPSK the phase is the bit: the wave as it is for +1, upside down for −1 |
| Frequency hopping is the spread-spectrum defence (I 8.3) | Both hopping and direct sequence exist; this lab is direct sequence, whose gain is code rate ÷ information rate (III 6) |
| Power amplifier "mirrors" local oscillator and mixer (I 3.4 table) | Not mirror functions; the table is not used |
| AM has "long geographic reach" (I 4.4) | Reach comes from the frequency band (medium-wave ground waves), not from AM |
| Analog quality "drops linearly" with distance (I 6.3) | Power falls with distance squared or faster; level 0 states it in dB per doubling |
| Burn-through range as a square root (II 7.1) and a fourth root (III 7) | Different jamming cases (self-screening, stand-off), not stated; radar is out of scope |
