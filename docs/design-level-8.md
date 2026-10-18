# Design: Link lab level 8, Codes and synchronization

Levels 1 to 5 take the code as given: the enemy receiver knows it and is locked to it. Level 8 opens both up. Where
does the code come from (a shift register), how much of it does an attacker need to rebuild it, and how does a
receiver find the code's timing in the first place? That last step, synchronization, is the link's weak point: a
receiver that never locks despreads nothing, so a jammer that breaks the lock breaks the whole message for a fraction
of the energy (teaching points T6 and T8).

Source: "Shift registers, PN codes and synchronization" (pasted 2026-10-18). Used as a source, not copied; section 6
lists its errors.

## 1. Decisions

D1. **The lab's own codes.** The m-sequences the lab already uses (`pn.ts`, Fibonacci shift registers of degree 5 to
7) are the codes taught. A register of n stages repeats every 2^n − 1 chips; level 1's measured code length gives the
register length.

D2. **Code reconstruction by Berlekamp–Massey.** An m-sequence of degree n has linear complexity n: 2n consecutive chips
fix the register and its taps, and every later chip follows. The engine runs Berlekamp–Massey on captured chips and the
level shows the rebuilt register predicting the chips that come next. This is why a spreading code is not a cipher;
nonlinear or cipher-driven generators (named, not built) are the answer.

D3. **Gold codes as a lesson.** A preferred pair of m-sequences, added chip by chip at every offset, gives N + 2 codes
whose cross-correlations take only three small values. They let many links share a band (level 10 builds on it).
Lesson and check only.

D4. **A receiver that must acquire.** A new engine module `sync.ts`: a packet is a preamble of P code periods, then the
payload. The receiver searches the code phases one cell at a time (a sliding correlator), one code period per cell, and
locks when a cell's correlation passes a threshold set for a false-alarm rate. A missed preamble or a false lock loses
the whole packet. Runs count packets lost (packet error rate) as well as bits; theory (detection and false-alarm
probabilities per cell, and the serial search through the preamble) is computed alongside.

D5. **Tracking as a lesson.** Once locked, a delay-locked loop keeps the timing with early and late correlators; its
S-curve is shown, not simulated.

D6. **Sync jamming against payload jamming.** The same jammer, on only during the preamble or on for the whole packet.
Jamming the preamble needs the correlation per cell (n chips) to fail, but only for P periods; the energy per packet
lost is compared with payload jamming. This is the level's scored attack and connects to level 9's power budget.

D7. **Teaching shape as levels 1 to 7.** Worked example, practice (unscored, try another), then the enemy (scored), in
plain words, with videos and glossary marks.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Shift registers | A1 example, A2 practice, A3 enemy | A register of n stages and its taps; period 2^n − 1; balance and the two-valued autocorrelation (level 1 D1's peaks); register length from the measured code length | 15: register length and period of the enemy code | Bits stepping through a 5-stage register, the sequence coming out |
| B Rebuilding a code | B1 example, B2 practice, B3 enemy | Linear complexity; 2n chips are enough; Berlekamp–Massey finds the taps; why spreading is not encryption | 15: how many chips you need, and the taps the rebuild finds | The rebuilt register predicting the next chips |
| C Gold codes | C1 lesson | Preferred pairs; N + 2 codes; three cross-correlation values; many users in one band | – | – |
| D Acquisition | D1 example, D2 practice, D3 enemy | The sliding correlator; cells and dwell; threshold, detection and false alarm; mean search time; preamble length | 20: phases to search (5), the time to search them (5), the right phase's correlation peak at the enemy's SNR (10) | The correlator sliding cell by cell until it locks |
| E Tracking | E1 lesson | Early, prompt and late correlators; the S-curve; how lock is kept and lost | – | The S-curve pulling the timing back |
| F Jamming the sync | F1 example, F2 practice, F3 enemy | Jam the preamble only: no lock, no packet; packets lost per unit of jammer energy against payload jamming | 30: preamble length in chips (5); J/S ≈ 10·log10(2n ÷ 9.6) (5); jam the preamble only and lose half the packets within 3 runs (20) | Same energy, two timings: preamble against payload |
| G Check | G1 questions | Three questions | 20 | – |

Total 100, pass mark 60. The enemy code (degree 5 to 7), its taps, preamble length and SNR come from the level seed.

## 3. Instruments

| Instrument | Shows |
|---|---|
| Shift register | The stages, the taps, the feedback adding up, the chips coming out; step by step or running |
| Rebuild | Captured chips; the register Berlekamp–Massey finds; its next chips against the real ones |
| Packet timeline | Preamble and payload; the jammer's on-time; the receiver's search cells and the cell where it locked; packets lost after a run |

## 4. Videos

`level8-A1` the shift register; `level8-B1` rebuilding from 2n chips; `level8-D1` the sliding correlator;
`level8-E1` the S-curve; `level8-F1` jamming the sync. Numbers exported from the engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Register stepping for the instrument; Berlekamp–Massey; Gold pairs and their cross-correlations | `src/engine/lab/pn.ts` with tests |
| Packet acquisition and payload: serial search, threshold, lock or loss; jammer on preamble, payload or both; packet and bit counts; theory | `src/engine/lab/sync.ts` with tests |
| Run plans for packet runs in the run box | `src/engine/lab/berRun.ts` |
| `LEVEL_8`, truth, values, setup | `src/engine/lab/levels/level8.ts`, `src/ui/lab/levelSetup.ts` |
| Shift register, rebuild and packet timeline instruments | `src/ui/lab/instruments/` |
| Glossary: shift register, m-sequence, linear complexity, Berlekamp–Massey, Gold code, acquisition, sliding correlator, false alarm, delay-locked loop, sync jamming | `src/engine/lab/glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| PN sequences are the cryptographic engine | m-sequences are not cryptographic: 2n chips rebuild them (unit B). Protection comes from nonlinear or cipher-driven generators |
| An m-sequence's linear complexity is 2n | It is n; Berlekamp–Massey needs 2n observed chips to rebuild it |

## 7. Left out

Kasami codes beyond a mention, parallel and FFT acquisition, carrier frequency search, Costas loops, and the
nonlinear generators themselves.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `pn.ts` additions and `sync.ts` with tests.
2. The shift register, rebuild and Gold instruments, units A to C.
3. Packet runs in the run box with a packet-loss goal, the packet timeline, units D to G, scoring.
4. Videos and glossary terms.
