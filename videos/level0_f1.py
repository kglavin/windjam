"""Level 0, lesson F1: Spreading loss. Free space falls 6 dB per doubling of distance; near the ground (two-ray)
12 dB per doubling."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

SRC = np.array([-5.6, 0.4, 0])
D1 = 3.0   # scene units to the first receiver
H1 = 0.6   # half-height of the beam there


def grid(n, size, center, color):
    """An n × n grid of squares, side size, as seen face on."""
    s = size / n
    return VGroup(*[Square(side_length=s, stroke_color=color, stroke_width=2, fill_color=color, fill_opacity=0.25)
                    .move_to(center + np.array([(i - (n - 1) / 2) * s, (j - (n - 1) / 2) * s, 0]))
                    for i in range(n) for j in range(n)])


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Distance")

        # 1. The spreading beam
        src = Dot(SRC, radius=0.1, color=BLUE_C1)
        src_t = label("transmitter", BLUE_C1, 20).next_to(src, DOWN, buff=0.15)
        edge = VGroup(Line(SRC, SRC + np.array([2.4 * D1, 2.4 * H1, 0])), Line(SRC, SRC + np.array([2.4 * D1, -2.4 * H1, 0]))).set_stroke(GREY, 2)
        r = ValueTracker(0.3)
        front = always_redraw(lambda: Arc(radius=r.get_value(), start_angle=-np.arctan(H1 / D1), angle=2 * np.arctan(H1 / D1), arc_center=SRC).set_stroke(BLUE_C1, 4))
        self.caption("A radio wave spreads out as it travels, like the skin of a growing balloon.")
        self.play(FadeIn(src), FadeIn(src_t), Create(edge))
        self.add(front)
        self.play(r.animate.set_value(2.3 * D1), run_time=4, rate_func=linear)
        front.clear_updaters()
        self.play(FadeOut(front))

        x1, x2 = SRC[0] + D1, SRC[0] + 2 * D1
        bar1 = Line([x1, SRC[1] - H1, 0], [x1, SRC[1] + H1, 0], color=AMBER_C2, stroke_width=6)
        bar2 = Line([x2, SRC[1] - 2 * H1, 0], [x2, SRC[1] + 2 * H1, 0], color=AMBER_C2, stroke_width=6)
        l1 = label("distance d", WHITE, 20).next_to(bar1, DOWN, buff=0.2)
        l2 = label("distance 2d", WHITE, 20).next_to(bar2, DOWN, buff=0.2)
        g1 = grid(1, 1.0, np.array([x2 + 2.2, 1.9, 0]), AMBER_C2)
        g2 = grid(2, 2.0, np.array([x2 + 2.2, -0.9, 0]), AMBER_C2)
        g1t = label("at d: all of it here", WHITE, 20).next_to(g1, RIGHT, buff=0.25)
        g2t = label("at 2d: spread over 4", WHITE, 20).next_to(g2, RIGHT, buff=0.25)
        self.caption("The same power covers a bigger area the further it goes.")
        self.play(Create(bar1), FadeIn(l1), FadeIn(g1), FadeIn(g1t))
        self.caption("Twice as far it is twice as wide and twice as tall: 4 times the area.")
        self.play(Create(bar2), FadeIn(l2), FadeIn(g2), FadeIn(g2t))
        q = label("each spot gets a quarter: 6 dB less", AMBER_C2, 24).move_to([x2 + 2.2, -2.4, 0])
        self.caption("A receiver there gets a quarter of the power: 6 dB less.")
        self.play(FadeIn(q))
        self.hold_caption()
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # 2. dB per doubling
        P = Plot(-4.4, 9.2, -2.5, 5.2, (0, 3), (-38, 2))
        dists = [1, 2, 4, 8]
        axes = VGroup(P.axes(),
                      VGroup(*[label(f"{d} km", GREY, 20).move_to([P.px(np.log2(d)), P.y0 - 0.3, 0]) for d in dists]),
                      P.y_ticks([0, -12, -24, -36], fmt=lambda v: neg(v)),
                      label("power at the receiver (dB)", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT),
                      label("distance, doubling each step", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.6))
        self.caption("On a dB scale every doubling of distance is the same step down.")
        self.play(FadeIn(axes))
        fs = [(np.log2(d), -6 * np.log2(d)) for d in dists]
        tr = [(np.log2(d), -12 * np.log2(d)) for d in dists]
        fs_l = P.curve([x for x, _ in fs], [y for _, y in fs], BLUE_C1, 4)
        fs_d = VGroup(*[Dot([P.px(x), P.py(y), 0], radius=0.07, color=BLUE_C1) for x, y in fs])
        fs_t = label("open space: −6 dB per doubling", BLUE_C1, 24).next_to([P.px(3), P.py(-18), 0], LEFT, buff=0.2).shift(UP * 0.35)
        self.caption("In open space: −6 dB for every doubling.")
        self.play(Create(fs_l), FadeIn(fs_d), FadeIn(fs_t), run_time=2)
        steps = VGroup(*[label("−6", BLUE_C1, 18).next_to([P.px(x + 0.5), P.py(y - 3), 0], UP, buff=0.12) for x, y in fs[:-1]])
        self.play(FadeIn(steps))
        tr_l = P.curve([x for x, _ in tr], [y for _, y in tr], AMBER_C2, 4)
        tr_d = VGroup(*[Dot([P.px(x), P.py(y), 0], radius=0.07, color=AMBER_C2) for x, y in tr])
        tr_t = label("near the ground: −12 dB per doubling", AMBER_C2, 24).next_to([P.px(3), P.py(-36), 0], LEFT, buff=0.25)
        self.caption("Near the ground a reflected path partly cancels the direct one: −12 dB per doubling.")
        self.play(Create(tr_l), FadeIn(tr_d), FadeIn(tr_t), run_time=2)

        # 3. Why it matters in the lab
        dot = Dot([P.px(3), P.py(-18), 0], radius=0.12, color=GREEN_C3)
        dot_t = label("intercept receiver", GREEN_C3, 20).next_to(dot, RIGHT, buff=0.15)
        self.caption("That is why distance matters in the lab. Move your intercept closer...")
        self.play(FadeIn(dot), FadeIn(dot_t))
        self.play(dot.animate.move_to([P.px(0), P.py(0), 0]), dot_t.animate.next_to([P.px(0), P.py(0), 0], RIGHT, buff=0.3).shift(UP * 0.3), run_time=3)
        self.caption("...and the enemy signal is 18 dB stronger at an eighth of the distance.")
        self.rule_card(["Twice the distance: 6 dB less in open space,", "12 dB less near the ground."], clear=True)
