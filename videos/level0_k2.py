"""Level 0, lesson K2: What spread spectrum protects. The attacker's steps (detect, intercept, locate, read, jam) and
the defence against each (LPD, LPI, LPE, AJ); then why low probability of detection is not zero: averaging longer
smooths the noise until a signal below it shows."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

STEPS = ["Detect", "Intercept", "Locate", "Read", "Jam"]
XS = [-5.2, -2.6, 0.0, 2.6, 5.2]
Y_ATT, Y_DEF, Y_LAB = 2.3, 0.6, -1.0


def box(text, x, y, color, w=2.2):
    b = RoundedRectangle(width=w, height=0.8, corner_radius=0.12, stroke_color=color, stroke_width=2.5).move_to([x, y, 0])
    return VGroup(b, label(text, color, 24).move_to(b))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("What spread spectrum protects")
        att = VGroup(*[box(s, x, Y_ATT, RED) for s, x in zip(STEPS, XS)])
        arrows = VGroup(*[Arrow([XS[i] + 1.1, Y_ATT, 0], [XS[i + 1] - 1.1, Y_ATT, 0], buff=0.05, stroke_width=3, color=GREY,
                                max_tip_length_to_length_ratio=0.35) for i in range(4)])
        head = label("the attacker's steps", RED, 22).next_to(att, UP, buff=0.2)
        self.caption("An attacker works in steps: detect, intercept, locate, read, jam.")
        self.play(FadeIn(head), LaggedStart(*[FadeIn(b) for b in att], lag_ratio=0.25), FadeIn(arrows))
        self.caption("Each step has its own defence. Stop one step and the steps after it get harder.")

        defs = [
            ("LPD", 0, 0, "Low probability of detection: too low and wide to notice."),
            ("LPI", 1, 2, "Low probability of intercept: hard to measure and to locate."),
            ("LPE", 3, 3, "Low probability of exploitation: the message cannot be read."),
            ("AJ", 4, 4, "Anti-jam: the processing gain makes a jammer need far more power."),
        ]
        dboxes = VGroup()
        for name, i, j, say in defs:
            x = (XS[i] + XS[j]) / 2
            w = 2.2 + (XS[j] - XS[i])
            b = box(name, x, Y_DEF, GREEN_C3, w)
            dboxes.add(b)
            self.caption(say)
            self.play(FadeIn(b, shift=UP * 0.2))
        dhead = label("the defence", GREEN_C3, 22).next_to(dboxes, DOWN, buff=0.15)
        self.play(FadeIn(dhead))

        labs = [("level 1", 0, 0), ("levels 1 and 6", 1, 2), ("level 8", 3, 3), ("levels 2 to 5", 4, 4)]
        lrow = VGroup(*[label(t, GREY, 22).move_to([(XS[i] + XS[j]) / 2, Y_LAB - 0.3, 0]) for t, i, j in labs])
        self.caption("Where the lab practises each step.")
        self.play(FadeOut(dhead), LaggedStart(*[FadeIn(l) for l in lrow], lag_ratio=0.25))
        self.caption("LPE needs encryption. A spreading code is not a cipher (level 8).")
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # LPD is not zero: averaging.
        rng = np.random.default_rng(7)
        f = np.linspace(-5, 5, 161)
        z = rng.standard_normal(len(f))
        hump = np.array([0.35 * (1.0 if abs(x) < 1e-9 else (np.sin(np.pi * x) / (np.pi * x)) ** 2) for x in f])
        P = Plot(-5.5, 11.0, -2.4, 4.6, (-5, 5), (0, 2.6))
        n = ValueTracker(1)
        axes = VGroup(P.axes(), P.x_ticks([-4, -2, 0, 2, 4]),
                      label("frequency (MHz)", GREY, 20).next_to([0, P.y0, 0], DOWN, buff=0.45),
                      label("power", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        trace = always_redraw(lambda: P.curve(f, 1.0 + hump + z * 0.45 / np.sqrt(n.get_value()), BLUE_C1, 2.5))
        read = always_redraw(lambda: label(f"looks averaged: {n.get_value():.0f}", YELLOW, 24)
                             .move_to([P.x0 + P.width - 2.0, P.y0 + P.height + 0.25, 0]))
        self.caption("A spread signal can sit below the noise. One look at the spectrum shows only noise.")
        self.play(FadeIn(axes), FadeIn(trace), FadeIn(read))
        self.wait(1)
        self.caption("Average many looks and the noise smooths out, but the signal stays.")
        self.play(n.animate.set_value(400), run_time=7, rate_func=lambda t: t ** 2)
        self.caption("The hump appears. LPD makes detection hard, not impossible: listening longer, or getting closer, still finds it.")
        self.rule_card(["Detect, intercept, locate, read, jam: LPD, LPI, LPE and AJ, one defence for each step.",
                        "Hard to detect is not impossible to detect."], clear=True)
