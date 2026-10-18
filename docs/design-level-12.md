# Design: Link lab level 12, Mesh networks under attack

Levels 1 to 11 attack one link, or a hub and its spokes. A mesh has no hub: every radio relays for its neighbours, and
traffic finds another path when one breaks (level 0 K1). It is held together by short control messages and a shared
channel, and those are its weak points (teaching point T9). The level comes in two parts. Part 1 teaches how a mesh
works, as level 0 teaches radio: short lessons with videos and unscored checks. Part 2 attacks it, scored.

Source: "From mesh networking to tactical military radio networks" (two tutorials, pasted 2026-10-18; the second
pasted again in full to its quiz, which gave UWB ranging and location-claim checking). Used as a source, not copied; section 6 lists its errors. Sensor node hardware, embedded
operating systems and energy harvesting are left out (design-curriculum.md section 2).

## 1. Decisions

D1. **Two parts in one level.** Part 1 (units A to E) is lessons only, each with a video and at most one unscored
check, as level 0 (design-level-0.md D1). Part 2 (units F to K) has worked examples, practice and scored enemy tasks,
as levels 1 to 11. The score is part 2's: 100, pass mark 60.

D2. **One mesh model.** Nodes on the level 6 map, 1 W radios 2 m above the ground at 300 MHz, two-ray paths (the scene's
model, as level 9's networks). A link exists both ways when the received signal is at or above the sensitivity
(−95 dBm). Routes are fewest hops. A new module `mesh.ts`: links, shortest paths, the parts a network falls into,
cut nodes, a backbone, flooding costs, the MAC sums, ranging and battery life.

D3. **Sharing the channel.** CSMA: listen, and send only when the received power is below the clear-channel threshold
(−85 dBm), else back off. TDMA: fixed slots, needs a common clock, lets radios sleep. The hidden terminal: two radios
that both reach a third but not each other. RTS/CTS: the RTS carries T_CTS + T_DATA + T_ACK + 3·SIFS, the CTS
T_DATA + T_ACK + 2·SIFS; whoever hears either stays quiet that long (the NAV).

D4. **Routes and their cost.** On demand (AODV): a route request floods the mesh, each radio sending it once (N
transmissions), and the reply returns along the path. Kept tables (OLSR): HELLO beacons between neighbours, topology
floods from every radio (about N², not exponential), cut down by multipoint relays. A link is dropped after a set
number of missed HELLOs.

D5. **Backbones.** A connected dominating set: a connected group of radios that every other radio touches. Built here
from a spanning tree's inner nodes. Only backbone radios relay floods. A load-balanced backbone rotates the role.

D6. **The attacks, each with its sum.**
- Carrier-sense denial: CSMA radios stay silent wherever the jammer's power is above the clear-channel threshold.
  That needs no J/S at all, so a weak jammer silences a link that spreading protects from data jamming.
- The overhead: HELLOs and route requests are short. A jammer that hits only them at a duty d pays 10·log10(1 ÷ d) dB
  less average power, and the links drop after the missed-HELLO count.
- The backbone: jam a cut node, or the backbone node between two groups, and the mesh splits.
- Ranging: TOA and RTT, and UWB pulses for sub-metre range. A repeater can only add delay: each microsecond adds 150 m
  to an RTT range. Jamming the direct path makes the receiver lock on a later copy (level 11).
- Position claims: the radios that hear a node must be in range of where it says it is; successive reports must not
  imply more than the platform's top speed; a round-trip range bounds the true distance from above.
- Denial of sleep: fake frames wake a radio and drain its battery. An authenticated preamble lets it check a frame
  cheaply and drop it before waking the processor.

D7. **What each defence defeats.** Hopping, direct sequence and authenticated preambles against each attack: a table
the player fills in unit J, checked against the engine's sums.

## 2. Units

Part 1, getting to know mesh networks (unscored):

| Unit | Lesson | What it teaches | Check |
|---|---|---|---|
| A | A1 Every radio a router | Multi-hop forwarding; no hub; self-healing: HELLOs, route error, a new path; a mesh that moves is a MANET | A message crosses 4 links: 3 relays |
| B | B1 Sharing the channel | CSMA: listen, back off; TDMA: slots, a clock, sleep | 10 slots of 2 ms: a radio sends every 20 ms |
| B | B2 The hidden terminal | Two radios that cannot hear each other collide at a third; RTS/CTS and the NAV | CTS NAV from DATA, ACK, SIFS |
| C | C1 Routes on demand | AODV: request flood, reply, route error, expanding ring | 30 radios: one flood, 30 sends |
| C | C2 Routes kept ready | OLSR: HELLOs, topology floods, multipoint relays; N² without them; movement and the choice between on-demand and kept routes; link lifetime | 2.7 km range, closing at 30 m/s: 180 s linked |
| D | D1 Clusters and backbones | Cluster heads and gateways; a connected dominating set; rotating the role | A backbone of 6: a flood costs 7 sends |
| E | E1 Ranging without GPS | TOA needs a common clock; RTT does not; c = 300 m per µs; DSSS chips and UWB pulses set the resolution | RTT and turnaround to metres |

Part 2, mesh networks under attack (scored):

| Unit | Steps | Teaches | Scored | Video |
|---|---|---|---|---|
| F Carrier-sense denial | F1 example, F2 practice, F3 enemy | A jammer above the clear-channel threshold silences CSMA radios, needing no J/S; the radius against the radius for data jamming | 15: the silenced radius, and how many times the power data jamming would need at that radius | The quiet zone round a weak jammer |
| G The overhead as target | G1 example, G2 enemy | HELLO and route request jamming; the duty and the power it saves; when links drop | 10: the duty, the dB saved, the time until the links drop | – |
| H The backbone as target | H1 example, H2 enemy | Cut nodes and backbone nodes; splitting the mesh; the load-balanced defence | 20: place the jammer to cut the most radios off the gateway; full points within 3 tries, half after | One jammer on a backbone node |
| I Ranging under attack | I1 example, I2 enemy, I3 lesson, I4 enemy | A repeater's delay adds range; it cannot subtract; jamming the direct path. Checking a claimed position: neighbours in range, speed, a ranged distance as an upper bound | 20: the range the victim measures and its error (10); a claim's speed and how far beyond its reach it moved (10) | – |
| J What each defence defeats | J1 lesson, J2 enemy | Hopping, direct sequence, authenticated preambles against each attack; denial of sleep and battery life | 15: battery life under fake frames, without and with an authenticated preamble | Fake frames draining a battery |
| K Check | K1 questions | Three questions | 20 | – |

Total 100, pass mark 60. The enemy mesh, jammer power and numbers come from the level seed.

## 3. Instruments

| Instrument | Shows |
|---|---|
| Mesh map | The level 6 map with the mesh's radios and links; the gateway; the backbone; a jammer placed by click, the radios it silences and the links it breaks; the radios cut off |
| MAC timeline | RTS, CTS, DATA and ACK on a time line for sender, receiver and a neighbour, with the NAV bars |

## 4. Videos

Part 1: `level12-A1`, `B1`, `B2`, `C1`, `C2`, `D1`, `E1`. Part 2: `level12-F1`, `H1`, `J1`. Numbers exported from the
engine as before.

## 5. Engine changes

| Change | Where |
|---|---|
| Mesh links from the two-ray budget, shortest paths, parts and cut nodes, a backbone from a spanning tree, multipoint relays and flood costs, the NAV sums, hidden terminals, the silenced radius and the data-jamming radius, links broken by a jammer, HELLO timing, link lifetime, TOA and RTT, UWB pulse range, position-claim checks (neighbours, speed, range bound), battery life under fake frames | `src/engine/lab/mesh.ts` with tests |
| `LEVEL_12`, truth, values, setup; instruments | `levels/level12.ts`, `src/ui/lab/` |
| Glossary: MANET, multi-hop, self-healing, CSMA, TDMA, hidden terminal, RTS/CTS, NAV, AODV, OLSR, HELLO, multipoint relay, cluster head, connected dominating set, TOA, RTT, UWB, distance bounding, carrier-sense denial, denial of sleep, authenticated preamble | `glossary.ts` |

## 6. Corrections to the source notes

| Notes say | Correct |
|---|---|
| NAV = T_RTS + T_CTS + T_DATA + T_ACK + 3·SIFS | The RTS carries T_CTS + T_DATA + T_ACK + 3·SIFS; the CTS carries T_DATA + T_ACK + 2·SIFS |
| Control traffic grows exponentially with density | One flood costs one transmission per node; every node flooding costs about N², not exponential |
| FHSS renders narrow-band jamming ineffective | It defeats a fixed tone; partial-band noise is the strongest attack on hopping (level 7) |
| Authentication preambles drop bad frames at the RF front end before baseband processing | Checking a preamble needs the signal digitised and correlated; it saves waking the processor and the upper layers |
| Multi-hop cuts transmit power because path loss is non-linear | True for radiated power per hop; each hop adds receive and processing energy and delay |
| 802.15.4 uses DSSS (as protection) | 32 chips per 4 bits, about 9 dB of processing gain: no anti-jam margin to speak of |
| UWB under 802.15.4a employs CSS and sub-nanosecond pulses | 802.15.4a defines two separate radios: UWB impulse radio, and chirp spread spectrum, which is not UWB |
| Bluetooth and BLE: a master with up to seven active slaves in a piconet | That is classic Bluetooth; BLE connects differently |

## 7. Left out

Sensor node hardware, embedded operating systems, energy harvesting, 6LoWPAN, DSR and DSDV beyond a mention, routing
security beyond spoofed frames, and any real tactical radio's waveform.

## 8. Build order

Each step is reviewed before the next.

1. Engine: `mesh.ts` with tests.
2. Mesh map and MAC timeline, part 1 (units A to E).
3. Part 2 (units F to K), scoring.
4. Videos and glossary terms.
