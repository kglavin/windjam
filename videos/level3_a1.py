"""Level 3, lesson A1: Three ways to spend the same power.

Two views of one jammer, each normalised so broadband noise is 1: power against time (average 1) and power per unit
of band against frequency across the link's band (area 1). Squeezing into a fraction of the band or of the time
keeps the area and raises the height by 1 ÷ that fraction."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level3-A1")
RHO = DATA["rho"]
DUTY = DATA["duty"]
TOPH = 1 / min(RHO, DUTY) + 1

TP = Plot(-4.6, 7.9, 0.9, 2.3, (0, 100), (0, TOPH))       # time, µs
FP = Plot(-4.6, 7.9, -2.2, 2.3, (-0.5, 0.5), (0, TOPH))   # frequency across the band, × chip rate
PERIOD = 20  # µs between pulses, as the lesson's figure


def time_blocks(duty):
    """Pulses of length duty × PERIOD, height 1 ÷ duty: the average stays 1."""
    return [(k * PERIOD, k * PERIOD + duty * PERIOD) for k in range(int(100 / PERIOD))], 1 / duty


class LessonVideo(LessonScene):
    def construct(self):
        band = ValueTracker(1.0)  # fraction of the band
        on = ValueTracker(1.0)    # fraction of the time
        self.title_card("Three ways to spend the same power")

        def frame(P, xt, title):
            return VGroup(P.axes(), P.x_ticks(xt, fmt=lambda v: f"{v:g}".replace("-", "−")), P.y_ticks([1, 4, 10], fmt=str),
                          label(title, GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))

        tf = frame(TP, range(0, 101, 20), "power over time (µs)")
        ff = frame(FP, [-0.5, 0, 0.5], "power across the link's band (frequency)")
        one_t = DashedLine([TP.x0, TP.py(1), 0], [TP.x0 + TP.width, TP.py(1), 0], color=GREY, stroke_width=1.2, dash_length=0.08)
        one_f = DashedLine([FP.x0, FP.py(1), 0], [FP.x0 + FP.width, FP.py(1), 0], color=GREY, stroke_width=1.2, dash_length=0.08)

        def time_shape():
            d = on.get_value()
            g = VGroup()
            for k in range(int(100 / PERIOD)):
                x0 = k * PERIOD
                g.add(Rectangle(width=TP.px(x0 + d * PERIOD) - TP.px(x0), height=TP.py(1 / d) - TP.py(0), stroke_color=RED,
                                stroke_width=2, fill_color=RED, fill_opacity=0.35)
                      .move_to([(TP.px(x0) + TP.px(x0 + d * PERIOD)) / 2, (TP.py(1 / d) + TP.py(0)) / 2, 0]))
            return g

        def freq_shape():
            r = band.get_value()
            return Rectangle(width=FP.px(r / 2) - FP.px(-r / 2), height=FP.py(1 / r) - FP.py(0), stroke_color=RED,
                             stroke_width=2, fill_color=RED, fill_opacity=0.35).move_to([FP.px(0), (FP.py(1 / r) + FP.py(0)) / 2, 0])

        ts = always_redraw(time_shape)
        fs = always_redraw(freq_shape)
        RX = 3.75
        rd = always_redraw(lambda: VGroup(
            label(f"on {on.get_value():.0%} of the time", WHITE, 22),
            label(f"in {band.get_value():.0%} of the band", WHITE, 22),
            label(f"{1 / (on.get_value() * band.get_value()):.1f} × stronger", RED, 22),
            label("average power: 1", GREEN_C3, 22),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.18).move_to([RX, 0.5, 0], aligned_edge=LEFT))

        # 1. Broadband
        self.caption("A jammer has a fixed average power. Here are two views of it.")
        self.play(FadeIn(tf), FadeIn(ff), FadeIn(one_t), FadeIn(one_f))
        self.caption("Broadband noise: spread over the whole band, on all the time.")
        self.play(FadeIn(ts), FadeIn(fs), FadeIn(rd))

        # 2. Partial band
        self.caption(f"Partial-band noise squeezes it into {RHO:.0%} of the band.")
        self.play(band.animate.set_value(RHO), run_time=4, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"Same area, {1 / RHO:.0f} times narrower, so {1 / RHO:.0f} times stronger there. Still on all the time.")
        self.play(band.animate.set_value(1), run_time=2)

        # 3. Pulsed
        self.caption(f"Pulsed noise squeezes it into short bursts, on {DUTY:.0%} of the time.")
        self.play(on.animate.set_value(DUTY), run_time=4, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"Same energy in {DUTY:.0%} of the time, so {1 / DUTY:.0f} times stronger while it is on.")
        self.caption("Across the band, on average, it looks just like broadband noise.")
        self.play(Indicate(fs, color=RED, scale_factor=1.0))

        for m in (ts, fs, rd):
            m.clear_updaters()
        self.rule_card(["Same power squeezed into a fraction of the band or the time", "is stronger there by 1 ÷ that fraction."], clear=True)
