"""Level 0, lesson J2: Jamming an ordinary BPSK link. No spreading: the jammer's noise shares the signal's band, so
Eb/J0 = S/J and BER = Q(√(2·S/J)). Received bits are ±1 plus noise of sd √(J/(2S)). Then the same J/S against a
spread link with Gp 20 dB: Eb/J0 = Gp − J/S."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

NB = 160
_rng = np.random.default_rng(9)
BITS = _rng.choice([-1, 1], NB)
NOISE = _rng.normal(0, 1, NB)
GP = 20.0

DP = Plot(-6.3, 6.4, -1.9, 4.1, (0, NB), (-3.5, 3.5))
FP = Plot(1.6, 5.0, -1.9, 4.1, (-3, 3), (-25, 15))


def fmt(v):
    return f"{v:+.0f}".replace("+0", "0").replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Jamming an ordinary link")
        js = ValueTracker(-10.0)
        gp = ValueTracker(0.0)   # 0 for plain BPSK, GP once spread

        def eb():
            return gp.get_value() - js.get_value()

        frame = VGroup(DP.axes(), DP.y_ticks([-1, 0, 1], fmt=lambda v: f"{v:+d}".replace("+0", "0").replace("-", "−")),
                       label("received value of each bit", GREY, 20).move_to([DP.x0, DP.y0 + DP.height + 0.25, 0], aligned_edge=LEFT))
        thr = DashedLine([DP.x0, DP.py(0), 0], [DP.x0 + DP.width, DP.py(0), 0], color=WHITE, stroke_width=1.5, dash_length=0.08)

        def dots():
            s = 1 / np.sqrt(2 * 10 ** (eb() / 10))
            return VGroup(*[Dot([DP.px(i + 0.5), DP.py(BITS[i] + s * NOISE[i]), 0], radius=0.035,
                                color=GREEN_C3 if (BITS[i] + s * NOISE[i] > 0) == (BITS[i] > 0) else RED) for i in range(NB)])

        fs = np.linspace(-3, 3, 600)
        spec = VGroup(FP.axes(), FP.x_ticks([-2, 0, 2]), label("spectrum (dB)", GREY, 20).move_to([FP.x0, FP.y0 + FP.height + 0.25, 0], aligned_edge=LEFT))
        sig = FP.curve(fs, [db(pulse_psd(f, 1.0)) for f in fs], BLUE_C1, 3)
        jam = always_redraw(lambda: Line([FP.x0, FP.py(js.get_value()), 0], [FP.x0 + FP.width, FP.py(js.get_value()), 0], color=RED, stroke_width=3))
        rd = always_redraw(lambda: VGroup(
            label(f"J/S {fmt(js.get_value())} dB", RED, 24),
            label(f"Eb/J0 {fmt(eb())} dB", WHITE, 24),
            label(f"BER {sci(max(ber_bpsk(10 ** (eb() / 10)), 1e-9))}", YELLOW, 24),
        ).arrange(RIGHT, buff=0.6).move_to([0, 3.4, 0]))
        d = always_redraw(dots)

        self.caption("An ordinary BPSK link: each bit sent on its own, no spreading.")
        self.play(FadeIn(frame), Create(thr), FadeIn(spec), Create(sig))
        self.caption("A noise jammer puts its noise on the same frequencies.")
        self.play(FadeIn(d), FadeIn(jam), FadeIn(rd))
        self.caption("Weak jamming, J/S −10 dB: the bits stay on their own side.")
        self.caption("Here Eb/J0 is simply S/J. Turn the jammer up to the signal's own power, J/S 0 dB...")
        self.play(js.animate.set_value(0), run_time=5, rate_func=linear)
        self.caption("...about 8 bits in 100 come out wrong. The link is broken.")
        self.caption("Stronger still, and it gets worse fast. J/S +10 dB: a third of the bits are wrong.")
        self.play(js.animate.set_value(10), run_time=4, rate_func=linear)

        tag = label(f"spread spectrum, Gp {GP:.0f} dB", BLUE_C1, 24).move_to([0, 2.95, 0])
        self.caption(f"Now spread the same link with a processing gain of {GP:.0f} dB, and keep the jammer at +10 dB.")
        jam.clear_updaters()
        self.play(FadeIn(tag), FadeOut(VGroup(spec, sig, jam)))  # the spread signal's spectrum would be another picture
        self.play(gp.animate.set_value(GP), run_time=4, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"Eb/J0 = Gp − J/S = {GP:.0f} − 10 = 10 dB: a few errors in a million. That is what spreading buys.")
        for m in (d, rd):
            m.clear_updaters()
        self.rule_card(["Against plain BPSK a jammer needs about J/S = 0 dB.", "Against spread spectrum it needs about Gp more."], clear=True)
