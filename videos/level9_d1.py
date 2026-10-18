"""Level 9, lesson D1: Example, one jammer, three links. Power sharing, time sharing over all three, and time sharing
over the two it can break (shareOutcome on the example links, Eb/J0 1, 3 and 6 dB under the whole jammer)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level9-D1")
T = D["targets"]
PLANS = D["plans"]
YS = [1.6, 0.3, -1.0]
JX = -5.0
LX = -1.0


def ber_txt(v):
    return "almost 0" if v < 1e-5 else f"{v:.2g}"


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("One jammer, three links")
        jam = VGroup(Circle(radius=0.45, stroke_color=RED, fill_color=RED, fill_opacity=0.25), label("J", RED, 30)).move_to([JX, YS[1], 0])
        links = VGroup(*[VGroup(RoundedRectangle(width=2.6, height=0.8, corner_radius=0.12, stroke_color=BLUE_C1),
                                label(f"{t['name']}: {t['ebJ0']} dB", BLUE_C1, 22)).move_to([LX, y, 0]) for t, y in zip(T, YS)])
        head = label("Eb/J0 under the whole jammer", GREY, 20).next_to(links, UP, buff=0.25)
        goal = label("goal: BER 0.01", GREY, 22).move_to([3.6, 2.6, 0])
        self.caption("One jammer, three enemy links. The goal for each: a BER of 0.01.")
        self.play(FadeIn(jam), FadeIn(links), FadeIn(head), FadeIn(goal))
        results = VGroup()

        def show(p, text):
            nonlocal results
            outs = VGroup()
            for i, (o, y) in enumerate(zip(p["out"], YS)):
                col = RED if o["denied"] else GREY
                mark = "broken" if o["denied"] else ("not jammed" if i not in p["chosen"] else "holds")
                outs.add(label(f"BER {ber_txt(o['ber'])}: {mark}", col, 22).move_to([3.6, y, 0]))
            self.play(FadeOut(results), FadeIn(outs))
            results = outs
            self.caption(text)

        thin = VGroup(*[Arrow(jam.get_right(), [LX - 1.35, y, 0], buff=0.1, stroke_width=2, color=RED) for y in YS])
        self.caption("Power sharing: a third of the power to each, all the time. Each gets 4.8 dB less.")
        self.play(GrowArrow(thin[0]), GrowArrow(thin[1]), GrowArrow(thin[2]))
        show(PLANS[0], "None reaches the goal: a third of the power is too weak for every one.")
        self.play(FadeOut(thin))
        beam = Arrow(jam.get_right(), [LX - 1.35, YS[0], 0], buff=0.1, stroke_width=7, color=RED)
        self.caption("Time sharing: all the power on one link at a time, each for a third of the time.")
        self.play(GrowArrow(beam))
        self.play(Transform(beam, Arrow(jam.get_right(), [LX - 1.35, YS[1], 0], buff=0.1, stroke_width=7, color=RED)), run_time=0.6)
        self.play(Transform(beam, Arrow(jam.get_right(), [LX - 1.35, YS[2], 0], buff=0.1, stroke_width=7, color=RED)), run_time=0.6)
        show(PLANS[1], "Bursts at full power break Alpha. Charlie, the strongest, wastes a third of the jammer.")
        self.play(Transform(beam, Arrow(jam.get_right(), [LX - 1.35, YS[0], 0], buff=0.1, stroke_width=7, color=RED)), run_time=0.6)
        self.play(Transform(beam, Arrow(jam.get_right(), [LX - 1.35, YS[1], 0], buff=0.1, stroke_width=7, color=RED)), run_time=0.6)
        self.caption("So leave Charlie alone. Time sharing over Alpha and Bravo: half the time each.")
        show(PLANS[2], "Two links broken: the best plan.")
        self.rule_card(["Spend the jammer only on links it can break.", "Time sharing beats power sharing when the links have margin."], clear=True)
