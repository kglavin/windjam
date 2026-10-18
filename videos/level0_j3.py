"""Level 0, lesson J3: Spread spectrum, a preview. Frequency hopping on a time–frequency grid, then direct sequence:
bits at 10 kbps spread by chips at 1 Mcps, T·sinc²(f·T) spectra, and back at the receiver."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

HOPS = [5, 1, 6, 3, 0, 7, 2, 4, 6, 1, 3, 5]   # channel per time slot, a secret order
NCH, NSL = 8, len(HOPS)
JAM_CH = 3
BIT_US, CHIP_US = 100.0, 1.0                 # 10 kbps, 1 Mcps
GP = BIT_US / CHIP_US


def psd_view(f, T):
    """T·sinc²(f·T), drawn with the sidelobe envelope beyond 1.5 lobes so a long pulse's thousands of thin sidelobes
    do not fill the plot; the chips' nulls at ±1 MHz stay exact."""
    x = f * T
    return pulse_psd(f, T) if abs(x) < 1.5 else T / (np.pi * x) ** 2


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Spread spectrum, a preview")

        # 1. Frequency hopping
        gx, gy, cw, ch = -5.0, -1.9, 0.8, 0.5
        cells = VGroup(*[Rectangle(width=cw, height=ch, stroke_color=GREY, stroke_width=1, stroke_opacity=0.4)
                         .move_to([gx + (t + 0.5) * cw, gy + (c + 0.5) * ch, 0]) for t in range(NSL) for c in range(NCH)])
        ax = VGroup(label("time", GREY, 20).move_to([gx + NSL * cw / 2, gy - 0.35, 0]),
                    label("channel", GREY, 20).rotate(PI / 2).move_to([gx - 0.4, gy + NCH * ch / 2, 0]))
        self.caption("Spread spectrum spreads a signal far wider than its bits need. One way: frequency hopping.")
        self.play(FadeIn(cells), FadeIn(ax))
        hops = VGroup(*[Rectangle(width=cw, height=ch, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.85)
                        .move_to([gx + (t + 0.5) * cw, gy + (c + 0.5) * ch, 0]) for t, c in enumerate(HOPS)])
        self.caption("The carrier jumps from channel to channel in a secret order.")
        self.play(LaggedStart(*[FadeIn(h) for h in hops], lag_ratio=0.25), run_time=4)
        jam = Rectangle(width=NSL * cw, height=ch, stroke_width=0, fill_color=RED, fill_opacity=0.3).move_to([gx + NSL * cw / 2, gy + (JAM_CH + 0.5) * ch, 0])
        jam_t = label("jammer", RED, 20).next_to(jam, RIGHT, buff=0.2)
        hit = VGroup(*[SurroundingRectangle(h, color=RED, buff=0.02) for t, h in enumerate(hops) if HOPS[t] == JAM_CH])
        self.caption("A jammer on one channel only catches the hops that land there.")
        self.play(FadeIn(jam), FadeIn(jam_t))
        self.play(Create(hit))
        self.hold_caption()
        self.play(FadeOut(VGroup(cells, ax, hops, jam, jam_t, hit)))

        # 2. Direct sequence
        P = Plot(-4.6, 11.0, -2.5, 5.0, (-1.5, 1.5), (-30, 25))
        fs = np.linspace(-1.5, 1.5, 3001)
        axes = VGroup(P.axes(), P.x_ticks([-1.5, -1, -0.5, 0, 0.5, 1, 1.5], fmt=lambda v: f"{v:g}".replace("-", "−")),
                      P.y_ticks([20, 0, -20], fmt=lambda v: neg(v)),
                      label("power per MHz (dB)", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT),
                      label("MHz", GREY, 20).next_to([P.x0 + P.width, P.y0, 0], DOWN, buff=0.45))
        T = ValueTracker(BIT_US)
        sig = always_redraw(lambda: P.curve(fs, [db(psd_view(f, T.get_value())) for f in fs], BLUE_C1, 3))
        rd = always_redraw(lambda: label(
            "bits: 10,000 a second" if T.get_value() > 50 else ("chips: 1,000,000 a second" if T.get_value() < 1.5 else ""),
            BLUE_C1, 24).move_to([P.px(0.85), P.py(20), 0]))
        self.caption("This lab is the other way: direct sequence. Bits at 10,000 a second make a narrow, tall spike.")
        self.play(FadeIn(axes), Create(sig), FadeIn(rd), run_time=2)
        self.caption("Each bit is multiplied by a fast secret code of chips: a million a second.")
        self.play(T.animate.set_value(CHIP_US), run_time=6, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"{GP:.0f} times wider, so {GP:.0f} times (20 dB) lower: spread out and hard to see.")
        jam = Line([P.x0, P.py(-3), 0], [P.x0 + P.width, P.py(-3), 0], color=RED, stroke_width=3)
        jam_t = label("jammer", RED, 22).next_to([P.px(1.5), P.py(-3), 0], UP, buff=0.08).align_to([P.px(1.5), 0, 0], RIGHT)
        self.caption("A jammer does not follow the code.")
        self.play(Create(jam), FadeIn(jam_t))
        self.caption("The receiver that knows the code gathers the signal back together.")
        self.play(T.animate.set_value(BIT_US), run_time=5, rate_func=rate_functions.ease_in_out_sine)
        gain = DoubleArrow([P.px(0.08), P.py(-3), 0], [P.px(0.08), P.py(db(BIT_US)), 0], buff=0, stroke_width=3, tip_length=0.12, color=YELLOW)
        self.caption("The signal is back on top; the jammer stays spread out.")
        self.play(GrowFromCenter(gain))
        sig.clear_updaters()
        rd.clear_updaters()

        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=3.4, width=9.0, at=[0, 0.6, 0])
        self.play(*pad.show())
        rows = [("Processing gain = chip rate ÷ bit rate", WHITE), ("= 1,000,000 ÷ 10,000 = 100 times = 20 dB", AMBER_C2),
                ("a jammer needs about that much more power", GREY)]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 1.1, c, 28), shift=DOWN * 0.15))
            self.wait(2.2)
        self.rule_card(["Level 1 starts here: find an enemy direct-sequence link", "and measure its chip rate, code and processing gain."])
