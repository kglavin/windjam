"""Level 11, lesson E1: Example, the beam on the target. The example town (EXAMPLE_TOWN): J/S at each radio with an omni
jammer, then with the 60° beam on the enemy receiver (exampleJs)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

I = load_data("level11-E1")["isolation"]
RX = I["receivers"]
AT = (I["at"]["xKm"], I["at"]["yKm"])
SIDES = [UR, DR, UL, DL]


def ok(i, v):
    return float(v) >= 3 if not RX[i]["friendly"] else float(v) <= 0


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The beam on the target")
        T = TownView()
        self.play(FadeIn(T.blocks()))
        cols = [RED if not r["friendly"] else (VIOLET if r["name"].startswith("taxi") else BLUE_C1) for r in RX]
        radios = VGroup(*[T.radio(r["xKm"], r["yKm"], r["name"], cols[i], SIDES[i]) for i, r in enumerate(RX)])
        self.caption("An enemy receiver, two friendly radios and a taxi radio, a few hundred metres apart.")
        self.play(FadeIn(radios))
        goal = VGroup(label("Jammer: 20 W (43 dBm)", AMBER_C2, 24), label("Goal: enemy J/S 3 dB or more,", WHITE, 24),
                      label("every other radio 0 dB or less", WHITE, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to([3.9, 2.4, 0])
        self.caption("Each radio has its own signal, so its own J/S. Friendlies must stay below a tolerance.")
        self.play(FadeIn(goal))

        def js_labels(vals):
            return VGroup(*[label(f"J/S {neg(v)} dB", GREEN_C3 if ok(i, v) else RED, 20)
                            .next_to(radios[i][1], DOWN, buff=0.06).align_to(radios[i][1], LEFT) for i, v in enumerate(vals)])

        jam = T.jammer(*AT)
        rings = VGroup(*[Circle(radius=r, stroke_color=AMBER_C2, stroke_width=2, stroke_opacity=0.6).move_to(T.p(*AT)) for r in (0.4, 0.9, 1.4)])
        js = js_labels(I["omni"])
        self.caption(f"An omni antenna here: the enemy gets {I['omni'][0]} dB, but every friendly is jammed too.")
        self.play(FadeIn(jam), Create(rings))
        self.play(FadeIn(js))
        note = label("omni: fratricide", RED, 26).move_to([3.9, 0.6, 0])
        self.play(FadeIn(note))
        self.wait(1.5)
        beam = T.wedge(*AT, I["beamDeg"], I["halfBeamDeg"])
        spec = VGroup(label("Beam 60° wide, 10 dBi", AMBER_C2, 24), label("side lobes 25 dB down", AMBER_C2, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to([3.9, 0.4, 0])
        self.caption("A directional antenna: full gain in the beam, 25 dB less in the side lobes.")
        self.play(FadeOut(rings), FadeOut(note), FadeIn(beam), FadeIn(spec))
        self.caption(f"The enemy rises 10 dB to {I['beam'][0]} dB. The others fall 15 dB, into the side lobes. All clear.")
        self.play(Transform(js, js_labels(I["beam"])), run_time=1.5)
        self.wait(2)
        self.rule_card(["Each radio has its own J/S.", "A beam on the enemy, the others in its side lobes: jam the one, spare the rest."], clear=True)
