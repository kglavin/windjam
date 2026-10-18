"""Level 8, lesson D1: Example, the sliding correlator. One example packet's search (searchTrace): one test per code
phase, the threshold for 1 false alarm in 1000, the lock; then what moving the threshold does."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

S = load_data("level8-D1")["search"]
Z = S["quiet"]["z"]
THR = S["threshold"]
N = S["n"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The sliding correlator")
        P = Plot(-6.2, 9.0, -2.4, 4.8, (0, N), (-2.5, 7))
        bw = P.width / N * 0.75
        bars = VGroup(*[Rectangle(width=bw, height=max(abs(P.py(v) - P.py(0)), 0.01), stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.9)
                        .move_to([P.px(i + 0.5), (P.py(v) + P.py(0)) / 2, 0]) for i, v in enumerate(Z)])
        axes = VGroup(P.axes(), Line([P.x0, P.py(0), 0], [P.x0 + P.width, P.py(0), 0], stroke_color=GREY, stroke_width=1),
                      label("test: one code phase per code period", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.2),
                      label("correlation, noise units", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        thr = DashedLine([P.x0, P.py(THR), 0], [P.x0 + P.width, P.py(THR), 0], dash_length=0.12, stroke_color=RED, stroke_width=2.5)
        thr_l = label(f"threshold {THR:.2f}", RED, 20).next_to([P.x0 + 0.1, P.py(THR), 0], UP, buff=0.08, aligned_edge=LEFT)
        pad = Scratchpad(height=3.6, width=3.8, at=[5.0, 1.3, 0])
        self.caption("The receiver must find where the code starts. It tries one phase at a time.")
        self.play(FadeIn(axes))
        self.caption("Each test multiplies one code period by its copy of the code and adds up.")
        self.play(Create(thr), FadeIn(thr_l))
        self.caption("Wrong phases give noise. The threshold is set so noise passes it only 1 time in 1000.")
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN if Z[i] >= 0 else UP) for i, b in enumerate(bars[:-1])], lag_ratio=0.3), run_time=4)
        self.caption(f"On the right phase the chips line up: test {len(Z)} jumps over the threshold, and the receiver locks.")
        self.play(GrowFromEdge(bars[-1].set_fill(GREEN_C3), DOWN))
        self.play(*pad.show())
        rows = [(f"√(2 × {N} × 0.398) = {S['mean']:.2f}", WHITE), (f"{S['mean']:.2f} − {THR:.2f} = {S['mean'] - THR:.2f} above", WHITE),
                (f"detected {100 * S['pd']:.0f}% of the time", GREEN_C3)]
        self.caption("At Ec/N0 = −4 dB the right phase averages √(2 × 31 × 0.398) = 4.97 in noise units.")
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.75, c, 22)))
        self.caption("Lower the threshold and wrong phases start to pass: a false lock, and the packet is lost.")
        self.play(thr.animate.shift(UP * (P.py(1.2) - P.py(THR))), thr_l.animate.shift(UP * (P.py(1.2) - P.py(THR))))
        hits = [b for i, b in enumerate(bars[:-1]) if Z[i] > 1.2]
        if hits:
            self.play(*[b.animate.set_fill(RED) for b in hits])
        self.caption("Raise it and the right phase is missed more often. The threshold trades one loss for the other.")
        self.play(*[b.animate.set_fill(BLUE_C1) for b in hits], thr.animate.shift(UP * (P.py(5.6) - P.py(1.2))), thr_l.animate.shift(UP * (P.py(5.6) - P.py(1.2))))
        self.rule_card(["Correlation peak = √(2 × n × Ec/N0), in noise units.",
                        "The preamble must last as many code periods as there are phases to search."], clear=True)
