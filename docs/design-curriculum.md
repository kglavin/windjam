# Design: the Link lab curriculum

The Link lab teaches electronic warfare against radio links, from radio basics to advanced jamming and electronic
support. This note is the map: what each level covers, what is built, where new source material goes, the teaching
points that connect levels, and the errors found in the source material. Each level has its own design note before it
is built.

## 1. Levels

| Level | Title | Covers | Status | Design note |
|---|---|---|---|---|
| 0 | Radio basics | Link, waves, BPSK, spectrum, mixing, dB, distance, antennas, inside a radio, noise, bit errors, J/S, jamming plain BPSK, spread spectrum preview | Built | design-level-0.md |
| 0 K | The bigger picture | K1 networks (many-to-many, hub, one-to-one, mesh) and what jamming or locating does to each; K2 what spread spectrum protects: LPD, LPI, LPE, AJ against the attacker's chain | Agreed | design-level-0.md (to add) |
| 1 | A quiet signal | Finding a DSSS link; chip rate, code length, processing gain, the receiver's margin | Built | design-link-lab.md |
| 2 | Processing gain | J/S, Eb/J0 = Gp − J/S, BER, breaking the link | Built | design-link-lab.md |
| 3 | Where to put the power | Partial-band and pulsed noise against DSSS; whole-bit pulses; best duty | Built | design-link-lab.md |
| 4 | Tones | Tone against long and short codes; multitone peaks (PAPR) | Built | design-link-lab.md |
| 5 | Saturation and timing | Repetition and the vote; pulses on whole bits; blinding the front end | Built | design-link-lab.md |
| 6 | Finding the transmitter | Bearings, triangulation, least-squares fix, error ellipse and CEP, geometry (GDOP), a moving sensor, TDOA; playable after level 1 | In progress (step 1 of 4) | design-level-6.md |
| 7 | Frequency hopping | Hop set, Gp = channels, dwell, slow and fast hopping; partial-band jamming against hopping; follower and swept jamming; time hopping; hybrid DS/FH | Agreed | to write |
| 8 | Codes and synchronization | Shift registers and m-sequences; linear complexity and code reconstruction; Gold and Kasami codes; acquisition (sliding correlator) and tracking (DLL); preamble and sync jamming against payload jamming | Agreed | to write |
| 9 | Jammer tactics | Look-through; power sharing and time sharing across targets; network layouts as targets; J/S planning with propagation models (free space, two-ray, Egli) and antenna pointing | Agreed | to write |
| 10 | Many users and antenna arrays | CDMA with Gold codes; blind code discovery and successive cancellation; delay-and-sum beamforming; Capon (MVDR) nulling; MUSIC direction finding; nulling as protection against jamming | Agreed | to write |

Build order: level 6, level 0 unit K, level 7, level 8, level 9, level 10. Levels 7 to 10 each need engine work: a
hop-level link and a time–frequency instrument (7), a receiver that can lose and regain code lock (8), jammer
scheduling across targets (9), multi-element arrays (10).

## 2. Where source material goes

| Source (pasted 2026-10-17 and 18) | Goes to |
|---|---|
| Radio Communications Demystified, Parts I to III | Level 0 (design-level-0.md section 4 lists its errors) |
| EW Target Location Methods (Poisel, summary) | Level 6; MUSIC to level 10 (design-level-6.md section 6) |
| Tactical network architectures | Level 0 K1; level 9 (networks as targets) |
| Spread spectrum security taxonomy (LPD, LPI, LPE, AJ) | Level 0 K2; referenced from levels 1, 6, 7 |
| Core anti-jam waveforms (DSSS, FHSS, THSS, hybrid) | Levels 1–5 (DSSS), level 7 (the rest), level 0 J3 and K2 (overview) |
| Shift registers, PN codes, synchronization | Level 8 |
| Jamming strategies and J/S models | Levels 2–5 (noise, tone, multitone, pulsed, front end); level 7 (follower, swept); level 8 (smart jamming); level 9 (look-through, sharing, J/S models) |
| Blind CDMA code discovery, beamforming | Level 10 |

## 3. Teaching points that connect levels

T1. **Partial-band jamming depends on the waveform.** Against DSSS, despreading spreads a partial-band jammer back out
and it gains almost nothing (level 3). Against frequency hopping the jammed fraction of hops is hit at full strength
and the best partial band beats broadband noise by far (level 7). Level 3's rule should then say "against direct
sequence"; that edit waits for level 7.

T2. **A follower jammer is a timing and distance problem.** It must hear a hop, retune and reach the receiver before
the dwell ends; its extra path (jammer to receiver against transmitter to receiver) eats the time. Level 7 uses level
6's geometry.

T3. **The attacker's chain and the defender's answers.** Detect (LPD), intercept, measure and locate (LPI), read
(LPE), jam (AJ). Level 0 K2 frames it; level 1 and 6 practise the first steps, levels 2–5 and 7 the last.

T4. **The hub is the target.** In a hub-and-spoke network the hub's receiver cuts every spoke; finding it (level 6)
and jamming it (levels 2–5, 9) is worth more than any spoke.

T5. **Nulling is protection.** An adaptive array that puts a null on the jammer lowers J/S by the null's depth: level 0
F2's antenna pattern taken to its end (level 10), and the defence to level 9's tactics.

T6. **Sync is the weak point.** The preamble that lets a receiver lock on (level 1 D1) is the cheapest thing to jam
(level 8): without lock nothing despreads.

## 4. Corrections to the source material

Level 0's and level 6's sources are corrected in their own notes. The rest:

| Source | Says | Correct |
|---|---|---|
| Networks | Attacking one node's receiver disrupts command across the unit | It cuts off that node; jamming the shared band near all the members disrupts the net |
| Networks | PSTN as a radio target | The public telephone network is wired; only its radio links can be jammed |
| Security taxonomy | Energy detectors cannot discern DSSS below the noise | They can, given enough integration time or by getting closer (level 1 B1); LPD makes detection harder, not impossible |
| Waveforms | Time hopping defeats radiometric energy integrators by concentrating energy into bursts | Bursts make a signal easier to see with a burst or peak detector; low average power only helps against long-averaging detectors. Time hopping's anti-jam value is that a jammer must cover all time or guess the slots; UWB uses it mainly for multiple access |
| Waveforms | FHSS Gp = W_ss / W_channel | Holds against broadband noise; against partial-band or follower jamming protection depends on hop rate and coding across hops |
| PN codes | PN sequences are the cryptographic engine | m-sequences are not cryptographic (the same text shows they can be rebuilt); protection comes from nonlinear or cipher-driven generators |
| PN codes | An m-sequence's linear complexity is 2n | It is n; Berlekamp–Massey needs 2n observed chips to rebuild it |
| Jamming strategies | Egli J/S with an f² term | Jammer and target share the frequency, so f² cancels out of J/S |
| Jamming strategies | Partial-band noise overwhelms with less total power than broadband | True against hopping and coded links; against DSSS it gains essentially nothing (level 3) |
| CDMA and arrays | Delay-and-multiply beamformer | Delay-and-sum |
| CDMA and arrays | Single-code discovery from repetition periods | Only for a short code, which repeats within the observation; a long code does not |
| CDMA and arrays | MUSIC reveals the directions of CDMA users | An M-element array separates at most M − 1 emitters by direction; more users than that need code-subspace separation as well |
