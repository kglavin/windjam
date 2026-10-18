"""Level 10, lesson D1: Example, pointing a beam. Delay-and-sum patterns of 8 elements as the look direction swings,
then 4, 8 and 16 elements at broadside (patternDb)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level10-D1")
G = D["grid"]
B = D["beams"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Pointing a beam")
        P = Plot(-6.0, 11.4, -2.4, 4.6, (-90, 90), (-50, 0))
        axes = VGroup(P.axes(), P.x_ticks([-90, -60, -30, 0, 30, 60, 90], lambda v: f"{neg(v)}°"),
                      P.y_ticks([0, -10, -20, -30, -40, -50]),
                      label("angle from broadside", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45),
                      label("dB", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        self.caption("Eight antennas in a line, half a wavelength apart. Delay each one and add them up.")
        self.play(FadeIn(axes))
        sweep = B["sweep"]
        curve = P.curve(G, sweep[4]["db"], BLUE_C1)
        look = DashedLine([P.px(0), P.y0, 0], [P.px(0), P.y0 + P.height, 0], dash_length=0.1, stroke_color=YELLOW, stroke_width=2)
        info = label("8 elements: gain 9.0 dB, beam 12.8° wide", YELLOW, 24).move_to([0, 2.85, 0])
        self.caption("Signals from the look direction add in step: a beam. Everything else adds out of step.")
        self.play(Create(curve), Create(look), FadeIn(info))
        self.caption("Change the delays and the beam swings, with nothing moving.")
        for s in sweep[5:] + sweep[::-1] + sweep[:5]:
            self.play(Transform(curve, P.curve(G, s["db"], BLUE_C1)), look.animate.move_to([P.px(s["look"]), P.y0 + P.height / 2, 0]), run_time=0.35)
        self.caption("More elements: more gain and a narrower beam.")
        for s in B["sizes"]:
            m = s["m"]
            self.play(Transform(curve, P.curve(G, s["db"], BLUE_C1)),
                      Transform(info, label(f"{m} elements: gain {10 * np.log10(m):.1f} dB, beam about {102 / m:.1f}° wide", YELLOW, 24).move_to([0, 2.85, 0])), run_time=1)
            self.wait(1.5)
        self.rule_card(["Array gain = 10 × log10(M) dB.", "Beamwidth ≈ 102° ÷ M, for half-wave spacing."], clear=True)
