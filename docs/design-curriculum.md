# Design: the Link lab curriculum

The Link lab teaches electronic warfare against radio links, from radio basics to advanced jamming and electronic
support. This note is the map: what each level covers, what is built, where new source material goes, the teaching
points that connect levels, and the errors found in the source material. Each level has its own design note before it
is built.

## 1. Levels

| Level | Title | Covers | Status | Design note |
|---|---|---|---|---|
| 0 | Radio basics | Link, waves, BPSK, spectrum, mixing, dB, distance, antennas, inside a radio, noise, bit errors, J/S, jamming plain BPSK, spread spectrum preview | Built | design-level-0.md |
| 0 K | The bigger picture | K1 networks (many-to-many, hub, one-to-one, mesh) and what jamming or locating does to each; K2 what spread spectrum protects: LPD, LPI, LPE, AJ against the attacker's chain | Built | design-level-0.md |
| 1 | A quiet signal | Finding a DSSS link; chip rate, code length, processing gain, the receiver's margin | Built | design-link-lab.md |
| 2 | Processing gain | J/S, Eb/J0 = Gp − J/S, BER, breaking the link | Built | design-link-lab.md |
| 3 | Where to put the power | Partial-band and pulsed noise against DSSS; whole-bit pulses; best duty | Built | design-link-lab.md |
| 4 | Tones | Tone against long and short codes; multitone peaks (PAPR) | Built | design-link-lab.md |
| 5 | Saturation and timing | Repetition and the vote; pulses on whole bits; blinding the front end | Built | design-link-lab.md |
| 6 | Finding the transmitter | Bearings, triangulation, least-squares fix, error ellipse and CEP, geometry (GDOP), a moving sensor, TDOA; playable after level 1 | Built | design-level-6.md |
| 7 | Frequency hopping | Hop set, Gp = channels, dwell, slow and fast hopping; partial-band jamming against hopping; follower and swept jamming; time hopping; hybrid DS/FH | Built | design-level-7.md |
| 8 | Codes and synchronization | Shift registers and m-sequences; linear complexity and code reconstruction; Gold and Kasami codes; acquisition (sliding correlator) and tracking (DLL); preamble and sync jamming against payload jamming | Built | design-level-8.md |
| 9 | Jammer tactics | Power as the scarce resource: what each platform can carry and generate (soldier, UAV, vehicle, aircraft), battery energy and amplifier efficiency, J/S per watt; distance beats power; look-through; power sharing and time sharing across targets; network layouts as targets; J/S planning with propagation models (free space, two-ray, Egli) and antenna pointing | Built | design-level-9.md |
| 10 | Many users and antenna arrays | CDMA with Gold codes; blind code discovery and successive cancellation; delay-and-sum beamforming; Capon (MVDR) nulling; MUSIC direction finding; nulling as protection against jamming | In progress (step 2 of 4) | design-level-10.md |
| 11 | Urban EW | Urban propagation: multipath, shadowing (log-normal), street canyons, building loss; urban path loss models (Hata, two-slope microcell, rooftop diffraction); what multipath does to DF and TDOA (level 6); fratricide against friendly and civilian links; counter-IED jamming; electronic isolation with directional jamming | Agreed | to write |
| 12 | Mesh networks under attack | Two parts. First, getting to know mesh networking, taught like level 0 (short lessons with videos, unscored checks): every node a router, multi-hop forwarding and self-healing; sharing the channel (CSMA, TDMA, the hidden terminal, RTS/CTS); finding routes on demand (AODV) or keeping tables (OLSR); clusters and virtual backbones; ranging without GPS (time of arrival, round-trip time). Then the EW subjects, scored: carrier-sense denial by a weak jammer, jamming route control traffic, backbone and cluster-head nodes as targets and load-balanced backbones as the defence, ranging under attack, what hopping, direct sequence and authenticated preambles each defeat, denial-of-sleep | Agreed | to write |

Build order: level 6, level 0 unit K, level 7, level 8, level 9, level 10, level 11, level 12. Levels 7 to 12 each need
engine work: a hop-level link and a time–frequency instrument (7), a receiver that can lose and regain code lock (8),
jammer scheduling across targets (9), multi-element arrays (10), urban path models with shadowing and multipath, and
friendly receivers in the scene to count fratricide (11), a multi-node mesh with a MAC, routing and a jammer among the
nodes (12).

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
| Urban EW, propagation and operational challenges | Level 11; multipath bearing and timing errors back-referenced from level 6 |
| From mesh networking to tactical military radio networks (two tutorials) | Level 12; wireless sensor node hardware, embedded operating systems and energy harvesting left out as not about jamming or locating |

## 3. Teaching points that connect levels

T1. **Partial-band jamming depends on the waveform.** Against DSSS, despreading spreads a partial-band jammer back out
and it gains almost nothing (level 3). Against frequency hopping the jammed fraction of hops is hit at full strength
and the best partial band beats broadband noise by far (level 7). Level 3's rule now says "against direct
sequence".

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

T7. **The open-terrain models stop working in town.** Free space and two-ray (level 0 F1, the scene) give way to
shadowing and multipath (level 11); the same multipath that fades a link bends bearings and smears TDOA peaks
(level 6), and a jammer's J/S depends on which street it stands in.

T8. **Power is the jammer's scarcest resource.** It has to be carried or generated where the jammer is: a soldier's
batteries, a small UAV's payload budget, a vehicle's generator, an aircraft's engine-driven supply. A power amplifier
turns a fraction of its supply into radio power, so watts out cost more watts of battery, and battery energy limits
time on air. Every level's efficiency question is a power question: distance beats power (halving the distance gives
6 dB in open space and 12 dB near the ground, the same as 4 or 16 times the power; level 0 F1, level 2); a pulsed jammer
at the best duty (level 3) or a jammer on the sync (level 8) denies more per watt; a small jammer carried close, on a
UAV or left near the target, can beat a large one far away (level 9). Intercept and DF receivers need little power but
must move for geometry (level 6). Level 9 brings it together as a budget: platform, power, time on target.

T9. **Attack the network's overhead, not its data.** The cheapest targets in a mesh are the short messages that keep it
working: a preamble (level 8), a route request or HELLO beacon, a CSMA channel made to look busy, a cluster head or
backbone node. Each carries little traffic but everything depends on it (level 12, building on levels 8 and 9).

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
| Urban EW | The modified Hata model adds the a(h_m) correction for dense cores | a(h_m), the mobile antenna height correction, is part of the original Hata model (with a large-city form); COST-231 Hata is the extension, to 2 GHz |
| Urban EW | Dense-urban Hata path loss exponents n ≥ 4 | Hata's distance slope is (44.9 − 6.55·log h_b)/10, about 3.5 for a 30 m base antenna |
| Urban EW | Walfisch–Bertoni for antennas at or below rooftop height | Walfisch–Bertoni assumes the base antenna above the rooftops; below-rooftop cases are the street-canyon and COST-231 Walfisch–Ikegami domain |
| Mesh tutorials | NAV = T_RTS + T_CTS + T_DATA + T_ACK + 3·SIFS | The RTS carries T_CTS + T_DATA + T_ACK + 3·SIFS; the CTS carries T_DATA + T_ACK + 2·SIFS |
| Mesh tutorials | Control traffic grows exponentially with density | One flood costs a transmission per node; every node flooding costs about N², not exponential |
| Mesh tutorials | FHSS renders narrow-band jamming ineffective | It defeats a fixed tone; partial-band noise is the strongest attack on hopping (level 7) |
| Mesh tutorials | Authentication preambles drop bad frames at the RF front end before baseband processing | Checking a preamble needs the signal digitised and correlated; it saves waking the processor and the upper layers |
| Mesh tutorials | Multi-hop cuts transmit power because path loss is non-linear | True for radiated power per hop; each hop adds receive and processing energy and delay |
| Mesh tutorials | 802.15.4 uses DSSS (as protection) | 32 chips per 4 bits, about 9 dB of processing gain: no anti-jam margin to speak of |
