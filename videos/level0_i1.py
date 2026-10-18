"""Level 0, lesson I1: Bit errors. Each received bit is ±1 plus Gaussian noise of sd 1/√(2·Eb/N0); the receiver
decides by the sign. BER = Q(√(2·Eb/N0)), the curve the later levels use."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

NB = 160
_rng = np.random.default_rng(7)
BITS = _rng.choice([-1, 1], NB)
NOISE = _rng.normal(0, 1, NB)

DP = Plot(-6.4, 6.6, -1.9, 4.6, (0, NB), (-3.2, 3.2))   # received values
WP = Plot(-3.4, 8.6, -2.2, 5.0, (-2, 12), (-7, 0))     # BER against Eb/N0, after the dots are gone


def sd(eb_db):
    return 1 / np.sqrt(2 * 10 ** (eb_db / 10))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Bit errors")
        eb = ValueTracker(12.0)

        frame = VGroup(DP.axes(), DP.y_ticks([-1, 0, 1], fmt=lambda v: f"{v:+d}".replace("+0", "0").replace("-", "−")),
                       label("received value of each bit", GREY, 20).move_to([DP.x0, DP.y0 + DP.height + 0.25, 0], aligned_edge=LEFT),
                       label("bits", GREY, 20).next_to([DP.x0 + DP.width, DP.y0, 0], DOWN, buff=0.2).align_to([DP.x0 + DP.width, 0, 0], RIGHT))
        thr = DashedLine([DP.x0, DP.py(0), 0], [DP.x0 + DP.width, DP.py(0), 0], color=WHITE, stroke_width=1.5, dash_length=0.08)
        thr_t = label("decide: above 0 is +1, below is −1", WHITE, 18).next_to([DP.x0 + DP.width, DP.py(0), 0], UP, buff=0.05).align_to([DP.x0 + DP.width, 0, 0], RIGHT)

        def dots():
            s = sd(eb.get_value())
            g = VGroup()
            for i in range(NB):
                v = BITS[i] + s * NOISE[i]
                ok = (v > 0) == (BITS[i] > 0)
                g.add(Dot([DP.px(i + 0.5), DP.py(v), 0], radius=0.035, color=GREEN_C3 if ok else RED))
            return g

        def count():
            s = sd(eb.get_value())
            wrong = int(np.sum(np.sign(BITS + s * NOISE) != BITS))
            return label(f"wrong: {wrong} of {NB}", RED if wrong else GREEN_C3, 22).move_to([DP.x0 + DP.width / 2, DP.y0 - 0.45, 0])

        d = always_redraw(dots)
        c = always_redraw(count)
        self.caption("A digital receiver decides, bit by bit, whether it got a +1 or a −1.")
        self.play(FadeIn(frame), Create(thr), FadeIn(thr_t))
        self.play(FadeIn(d), FadeIn(c))
        self.caption("With little noise every bit lands well on its own side.")
        self.caption("More noise pushes some over the line: those bits come out wrong.")
        self.play(eb.animate.set_value(3.0), run_time=6, rate_func=linear)
        self.caption("The bit error rate, BER, is the fraction it gets wrong: 0.01 is 1 bit in 100.")

        # The curve
        wf = ber_waterfall(WP)
        wf[3].become(label("Eb/N0 (dB)", GREY, 20).next_to([WP.x0 + WP.width / 2, WP.y0, 0], DOWN, buff=0.45))
        cur = always_redraw(lambda: Dot(ber_point(WP, eb.get_value()), radius=0.08, color=WHITE))
        self.caption("The measure that matters is Eb/N0: the energy in one bit over the noise.")
        d.clear_updaters()
        c.clear_updaters()
        self.play(FadeOut(VGroup(frame, thr, thr_t, d, c)))
        self.play(FadeIn(wf), FadeIn(cur))
        self.caption("BER falls fast as Eb/N0 rises: every couple of dB cuts the errors by a large factor.")
        self.play(eb.animate.set_value(10.0), run_time=5, rate_func=linear)
        steep = SurroundingRectangle(VGroup(Dot(ber_point(WP, 6)), Dot(ber_point(WP, 10))), color=AMBER_C2, buff=0.25)
        steep_t = label("the cliff", AMBER_C2, 24).next_to(steep, UP, buff=0.1)
        self.caption("So a digital link is either fine or broken, with a short step between: the cliff.")
        self.play(Create(steep), FadeIn(steep_t))
        self.caption("A jammer only has to push the link over the edge.")
        self.play(eb.animate.set_value(0.0), run_time=4, rate_func=rate_functions.ease_in_sine)
        cur.clear_updaters()
        self.rule_card(["BER is the fraction of bits that come out wrong.", "It falls steeply as Eb/N0 rises: the cliff."], clear=True)
