"""Level 0, lesson D1: The spectrum, power at each frequency. Pulses of length T have power T·sinc²(f·T) per MHz."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

TP = Plot(-6.3, 5.4, -1.6, 3.4, (0, 8), (-1.4, 1.4))     # time, µs
FP = Plot(0.6, 6.0, -1.6, 3.4, (-3, 3), (0, 1.15))       # frequency, MHz; power
SIGNS = [1, -1, -1, 1, -1, 1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, 1, 1, -1, 1]  # a fixed pattern with plenty of changes


def pulses(T):
    xs, ys = [], []
    t = 0.0
    k = 0
    while t < 8:
        v = SIGNS[k % len(SIGNS)]
        xs += [t, min(t + T, 8)]
        ys += [v, v]
        t += T
        k += 1
    return xs, ys


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The spectrum")
        tl = VGroup(TP.axes(), TP.x_ticks([0, 2, 4, 6, 8], fmt=str), label("the signal over time (µs)", GREY, 20).move_to([TP.x0, TP.y0 + TP.height + 0.3, 0], aligned_edge=LEFT))
        fl = VGroup(FP.axes(), FP.x_ticks([-3, -2, -1, 0, 1, 2, 3]), label("its spectrum: power at each frequency (MHz)", GREY, 20).move_to([FP.x0, FP.y0 + FP.height + 0.3, 0], aligned_edge=LEFT))
        self.caption("A spectrum plot shows how much power a signal has at each frequency.")
        self.play(FadeIn(tl), FadeIn(fl))

        # A tone
        ts = np.linspace(0, 8, 800)
        tone = TP.curve(ts, np.sin(2 * np.pi * 0.75 * ts), AMBER_C2, 3)
        spike = Line([FP.px(0.75), FP.py(0), 0], [FP.px(0.75), FP.py(1.1), 0], color=AMBER_C2, stroke_width=5)
        self.caption("A steady tone sits at one frequency: a single thin spike.")
        self.play(Create(tone), run_time=2)
        self.play(GrowFromEdge(spike, DOWN))
        self.wait(1)

        # Bits
        T = ValueTracker(1.0)

        def sig():
            xs, ys = pulses(T.get_value())
            return TP.curve(xs, [0.9 * y for y in ys], BLUE_C1, 3)

        def hump():
            fs = np.linspace(-3, 3, 700)
            return FP.curve(fs, [pulse_psd(f, T.get_value()) for f in fs], BLUE_C1, 3.5)

        s = always_redraw(sig)
        h = always_redraw(hump)
        self.caption("A signal that changes, such as a stream of bits, spreads over a band: a hump.")
        self.play(FadeOut(tone), FadeOut(spike))
        self.play(Create(s), Create(h), run_time=2)
        reach = always_redraw(lambda: VGroup(
            bracket(FP.px(-1 / T.get_value()), FP.px(1 / T.get_value()), FP.py(1.07), UP, BLUE_C1),
            label(f"±{1 / T.get_value():.1f} MHz", BLUE_C1, 20).next_to([FP.px(0), FP.py(1.1), 0], UP, buff=0.05),
        ))
        rd = always_redraw(lambda: label(f"pulses {T.get_value():.2f} µs long", BLUE_C1, 22).move_to([TP.x0 + TP.width / 2, TP.y0 - 0.65, 0]))
        self.caption("Pulses 1 µs long make a hump reaching 1 MHz each side of the centre.")
        self.play(FadeIn(reach), FadeIn(rd))
        self.caption("The faster it changes, the wider the hump. Pulses 0.5 µs long reach 2 MHz.")
        self.play(T.animate.set_value(0.5), run_time=5, rate_func=rate_functions.ease_in_out_sine)
        self.caption("The same power spread wider is lower at each frequency.")
        for m in (s, h, reach, rd):
            m.clear_updaters()
        self.caption("The later levels read spectra all the time: where a signal sits and how wide it is.")
        self.rule_card(["A tone is a spike. A changing signal is a hump.", "Faster changes make a wider hump: 1 ÷ pulse length."], clear=True)
