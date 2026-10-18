"""Level 8, lesson B1: Example, 10 chips give away 31. Berlekamp–Massey on 10 captured chips of the example code finds
the register (5 stages, taps 5 and 3) and predicts the other 21 exactly; 6 chips fit a wrong register."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level8-B1")
BITS = D["bits"]
X0, W = -6.4, 0.41


def row(values, y, color, start=0):
    return VGroup(*[label(str(b), color, 24).move_to([X0 + (start + i) * W, y, 0]) for i, b in enumerate(values)])


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Rebuilding a code")
        name_a = label("the code", GREY, 20).move_to([X0 + 0.2, 2.7, 0], aligned_edge=LEFT)
        actual = row(BITS, 2.2, GREY)
        self.caption("The enemy sends its code. You do not know the register, only what you hear.")
        self.play(FadeIn(name_a), FadeIn(actual))
        r10 = D["rebuild10"]
        cap = SurroundingRectangle(VGroup(*actual[:10]), color=AMBER_C2, buff=0.08)
        self.caption("Capture 10 chips in a row: twice the register length.")
        self.play(Create(cap), *[a.animate.set_color(AMBER_C2) for a in actual[:10]])
        bm = VGroup(RoundedRectangle(width=4.6, height=1.0, corner_radius=0.12, stroke_color=YELLOW), label("Berlekamp–Massey", YELLOW, 26)).move_to([-3.6, 0.6, 0])
        found = label(f"shortest register: {r10['length']} stages, taps {' and '.join(map(str, r10['taps']))}", GREEN_C3, 26).move_to([2.6, 0.6, 0])
        self.caption("Berlekamp–Massey finds the shortest register that makes those chips.")
        self.play(FadeIn(bm), TransformFromCopy(VGroup(*actual[:10]), bm[1].copy().set_opacity(0)))
        self.play(FadeIn(found, shift=RIGHT * 0.2))
        name_p = label("its prediction", GREY, 20).move_to([X0 + 0.2, -0.5, 0], aligned_edge=LEFT)
        pred = row(r10["predicted"], -1.0, GREEN_C3, start=10)
        self.caption("Run that register on: it predicts the other 21 chips of the period.")
        self.play(FadeIn(name_p), LaggedStart(*[FadeIn(p, shift=DOWN * 0.15) for p in pred], lag_ratio=0.1), run_time=3)
        marks = VGroup(*[label("✓", GREEN_C3, 20).move_to([X0 + (10 + i) * W, -1.5, 0]) for i, p in enumerate(r10["predicted"]) if p == BITS[10 + i]])
        self.caption("Every one matches, and every period after. The whole code is known.")
        self.play(FadeIn(marks))
        self.wait(1)

        r6 = D["rebuild6"]
        self.caption("With only 6 chips, more than one register fits, and the shortest is the wrong one.")
        self.play(FadeOut(pred), FadeOut(marks), FadeOut(found), Transform(cap, SurroundingRectangle(VGroup(*actual[:6]), color=AMBER_C2, buff=0.08)),
                  *[a.animate.set_color(GREY) for a in actual[6:10]])
        pred6 = VGroup(*[label(str(b), GREEN_C3 if b == BITS[6 + i] else RED, 24).move_to([X0 + (6 + i) * W, -1.0, 0]) for i, b in enumerate(r6["predicted"])])
        wrong = sum(1 for i, b in enumerate(r6["predicted"]) if b != BITS[6 + i])
        self.play(LaggedStart(*[FadeIn(p) for p in pred6], lag_ratio=0.08), run_time=2)
        self.caption(f"Its prediction gets {wrong} of the next {len(r6['predicted'])} chips wrong. 2n chips are always enough; fewer can fool you.")
        self.rule_card(["An m-sequence of n stages is rebuilt from 2n chips.", "A spreading code alone is not a cipher."], clear=True)
