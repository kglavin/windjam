# Design: Link lab level 9, Jammer tactics

Levels 2 to 8 ask whether a jammer can break a link. Level 9 asks what it costs, and how to spend it. Power is the
jammer's scarcest resource (teaching point T8): it has to be carried or generated where the jammer is, an amplifier
turns only part of it into radio power, and a battery runs out. So distance, timing and choice of target matter more
than raw power. The level ends with a planning task that brings platform, power, position and time on target
together.

Sources: "Jamming strategies and J/S models" (pasted 2026-10-18) for look-through, power and time sharing and the
J/S models; "Tactical network architectures" for networks as targets; the user's note on power (2026-10-18) for the
platforms. Used as sources, not copied; section 6 lists their errors.

## 1. Decisions

D1. **The lab's own link budget.** J/S comes from the scene (`scene.ts`): transmitter, receiver and jammer stations,
free-space or two-ray paths, antenna gains, obstacles. Level 9 lets the player move the jammer and set its power,
as level 1 let them move the intercept.

D2. **Platforms as numbers.** Four platforms, each with an RF power it can produce, an amplifier efficiency, an energy
store and a height: soldier (battery), small UAV (battery, height), vehicle (generator), aircraft (engine-driven, high).
The figures are round, plausible values stated as the lab's, not any real system's. DC power = RF power ÷ efficiency;
time on air = energy ÷ DC power.

D3. **Distance beats power.** Near the ground (two-ray), halving the jammer's distance to the receiver gives 12 dB, the
same as 16 times the power; in free space 6 dB, or 4 times. The Egli model is shown for planning; its frequency term
cancels in J/S because jammer and link share the frequency.

D4. **Look-through.** A jammer cannot hear the link while it transmits. It stops for a short look every so often to
check the target is still there, and loses that share of its jamming time. The lesson computes the J/S lost and the
time a target that changes frequency goes unjammed.

D5. **Sharing across targets.** One jammer, several links. Power sharing splits the power across them at once
(10·log10 k dB less each); time sharing jams one at a time (each sees pulsed jamming at duty 1/k, level 3). By level
3's best duty (0.7 ÷ average Eb/J0), time sharing wins when a link's Eb/J0 under the full jammer is above about 0.7
(−1.5 dB), power sharing below; the engine computes both with the lab's theory.

D6. **Networks as targets.** Level 0 K1's layouts on a map: a hub and its outstations, a shared net. Each link's J/S is
computed at its receiver from the jammer's position and power. Jamming near the hub breaks every inbound link; a net
needs the channel covered near every member (teaching point T4).

D7. **Teaching shape as levels 1 to 8.** Worked example, practice, then the enemy (scored), in plain words, with videos
and glossary marks.

## 2. Units

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| A Power is scarce | A1 example, A2 practice, A3 enemy | Platforms: what each can carry and generate; amplifier efficiency; DC power and time on air; J/S per watt | 15: the DC power and time on air of a given platform | Four platforms, their power and endurance |
| B Distance beats power | B1 example, B2 practice, B3 enemy | 12 dB per halving near the ground, 6 dB in free space; a directional jammer antenna; Egli, and why f² cancels | 15: move a small jammer until J/S reaches a goal at the enemy receiver | The same J/S from a big jammer far and a small one near |
| C Look-through | C1 example, C2 practice | Stop to listen; the share of jamming lost; reacting to a link that moves | – | – |
| D Sharing across targets | D1 example, D2 practice, D3 enemy | Power sharing against time sharing; which suits strong links and which weak ones | 20: choose the targets and power or time sharing, one commit; full points for the most links any plan breaks, half for one fewer | One jammer, three links, two ways to share |
| E Networks as targets | E1 example, E2 enemy | Hub and spoke, shared net; where to stand; links denied per watt | 20: place the 10 W pack so every link into the hub breaks; full points within 3 placements, half after | Jamming near the hub cuts every spoke |
| F Planning | F1 lesson, F2 enemy | Platform, power, position and time on target together | 10: the duty that makes the pack's battery last the mission (5), and the average J/S it costs (5) | – |
| G Check | G1 questions | Three questions | 20 | – |

Total 100, pass mark 60. The enemy geometry, link margins and mission times come from the level seed.

## 3. Instruments

| Instrument | Shows |
|---|---|
| Link scene | The existing scene with the jammer movable and its power editable; J/S at the enemy receiver |
| Platform card | Platform, RF power, efficiency, DC power, energy, time on air |
| Sharing panel | The targets, each link's J/S and BER under power sharing and time sharing |
| Network map | Level 6's map with the network's nodes and links; each link green or red as denied; the jammer placed by click |

## 4. Videos

`level9-A1` platforms and endurance; `level9-B1` distance against power; `level9-D1` power sharing against time
sharing; `level9-E1` the hub as the target. Numbers exported from the engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Platforms, DC power, time on air, J/S per watt; look-through; power and time sharing with BER per target; network denial from a jammer position; Egli path loss | `src/engine/lab/tactics.ts` with tests |
| A step that completes when the scene's J/S reaches a goal | `src/engine/lab/levels/types.ts`, `src/ui/lab/LevelView.tsx` |
| `LEVEL_9`, truth, values, setup | `src/engine/lab/levels/level9.ts`, `src/ui/lab/levelSetup.ts` |
| Platform card, sharing panel, network map | `src/ui/lab/instruments/` |
| Glossary: power amplifier efficiency, duty, look-through, power sharing, time sharing, Egli model, stand-off and stand-in jamming | `src/engine/lab/glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| Egli J/S with an f² term | Jammer and target share the frequency, so f² cancels out of J/S |
| Partial-band noise overwhelms with less total power than broadband | True against hopping and coded links (level 7); against direct sequence it gains essentially nothing (level 3) |
| Attacking one node's receiver disrupts command across the unit | It cuts off that node; jamming the shared band near all the members disrupts the net (unit E) |

## 7. Left out

Burn-through range for radar, airborne stand-off geometry beyond line of sight, real systems' power figures, and
jammer self-protection.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `tactics.ts` with tests.
2. The J/S goal step, platform card and units A to C.
3. Sharing panel, network map, units D to G, scoring.
4. Videos and glossary terms.
