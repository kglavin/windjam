"""Level 10, lesson E1: Example, a null on the jammer. MVDR patterns of 8 elements as a jammer moves: the null follows
it (jammerSuppressionDb with 35 dB channel matching). Then 7 spread jammers nulled, and an 8th too many."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level10-E1")
G = D["grid"]
NL = D["nulls"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("A null on the jammer")
        P = Plot(-6.0, 11.4, -2.4, 4.6, (-90, 90), (-50, 0))
        axes = VGroup(P.axes(), P.x_ticks([-90, -60, -30, 0, 30, 60, 90], lambda v: f"{neg(v)}°"), P.y_ticks([0, -10, -20, -30, -40, -50]),
                      label("angle from broadside", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45))
        das = P.curve(G, NL["das"], GREY, 2)
        self.caption("A plain beam at broadside lets a jammer through its side lobes (grey).")
        self.play(FadeIn(axes), Create(das))
        s0 = NL["sweep"][7]
        curve = P.curve(G, s0["db"], BLUE_C1)
        jam = DashedLine([P.px(s0["jam"]), P.y0, 0], [P.px(s0["jam"]), P.y0 + P.height, 0], dash_length=0.1, stroke_color=RED, stroke_width=2.5)
        info = label(f"jammer at {s0['jam']}°: suppressed {-s0['supp']:.0f} dB", RED, 24).move_to([0, 2.85, 0])
        self.caption("MVDR keeps the look direction at full strength and lets through as little else as it can: a deep null on the jammer.")
        self.play(Create(curve), Create(jam), FadeIn(info))
        self.caption("Move the jammer and the null follows it.")
        for s in NL["sweep"]:
            self.play(Transform(curve, P.curve(G, s["db"], BLUE_C1)), jam.animate.move_to([P.px(s["jam"]), P.y0 + P.height / 2, 0]),
                      Transform(info, label(f"jammer at {neg(s['jam'])}°: suppressed {-s['supp']:.0f} dB", RED, 24).move_to([0, 2.85, 0])), run_time=0.5)
        self.caption("With channels matched to 35 dB, each null takes about 35 + 10 × log10(8) = 44 dB off J/S.")
        self.wait(1)
        self.play(FadeOut(jam), FadeOut(das))
        for m in NL["many"]:
            jams = VGroup(*[DashedLine([P.px(j), P.y0, 0], [P.px(j), P.y0 + P.height, 0], dash_length=0.1, stroke_color=RED, stroke_width=2) for j in m["jams"]])
            self.caption(f"{m['k']} jammers from spread directions: the worst is suppressed {-m['worst']:.0f} dB.")
            self.play(Transform(curve, P.curve(G, m["db"], BLUE_C1)), FadeIn(jams),
                      Transform(info, label(f"{m['k']} jammers: worst suppressed {-m['worst']:.0f} dB", RED, 24).move_to([0, 2.85, 0])), run_time=1.2)
            self.wait(1.5)
            self.play(FadeOut(jams))
        self.rule_card(["M elements null up to M − 1 jammers; past that the nulls collapse.", "To beat an adaptive array, come from M directions."], clear=True)
