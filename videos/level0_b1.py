"""Level 0, lesson B1: Frequency, period and wavelength."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

TP = Plot(-5.0, 10.5, 0.2, 2.6, (0, 4), (-1.3, 1.3))       # time, µs
SP = Plot(-5.0, 10.5, -2.3, 1.6, (0, 3), (-1.3, 1.3))      # distance, m
C = 3e8


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Frequency, period and wavelength")
        f = ValueTracker(1.0)  # MHz

        axes = VGroup(TP.axes(), TP.x_ticks([0, 1, 2, 3, 4], fmt=str),
                      label("time (µs)", GREY, 20).next_to([TP.x0 + TP.width, TP.y0, 0], DOWN, buff=0.45).align_to([TP.x0 + TP.width, 0, 0], RIGHT))
        zero = DashedLine([TP.x0, TP.py(0), 0], [TP.x0 + TP.width, TP.py(0), 0], color=GREY, stroke_width=1, dash_length=0.08).set_opacity(0.5)
        wave = always_redraw(lambda: TP.curve(np.linspace(0, 4, 600), np.sin(2 * np.pi * f.get_value() * np.linspace(0, 4, 600)), AMBER_C2, 3.5))
        self.caption("A radio wave wiggles up and down.")
        self.play(FadeIn(axes), FadeIn(zero), Create(wave), run_time=2)
        rd = always_redraw(lambda: VGroup(
            label(f"frequency: {f.get_value():.1f} MHz", AMBER_C2, 24),
            label(f"period: {1 / f.get_value():.2f} µs", WHITE, 24),
        ).arrange(RIGHT, buff=0.8).move_to([0, 3.35, 0]))
        per = always_redraw(lambda: VGroup(
            bracket(TP.px(0.25 / f.get_value()), TP.px(1.25 / f.get_value()), TP.py(1.15), UP, WHITE),
            label("one cycle", WHITE, 18).next_to([TP.px(0.75 / f.get_value()), TP.py(1.2), 0], UP, buff=0.05),
        ))
        self.caption("Frequency is how many full cycles it makes each second, in hertz.")
        self.play(FadeIn(rd))
        units = VGroup(*[label(t, GREY, 22) for t in ("1 kHz = a thousand a second", "1 MHz = a million", "1 GHz = a billion")]).arrange(RIGHT, buff=0.7).move_to([0, -1.1, 0])
        self.play(LaggedStart(*[FadeIn(u) for u in units], lag_ratio=0.4))
        self.caption("The period is how long one cycle lasts. At 1 MHz: 1 microsecond.")
        self.play(FadeIn(per))
        self.caption("Speed it up to 2 MHz: twice the cycles, each half as long.")
        self.play(f.animate.set_value(2.0), run_time=4)
        self.caption("Period = 1 ÷ frequency: 1 ÷ 2 MHz = 0.5 µs. Every later level uses this.")
        self.play(f.animate.set_value(1.0), run_time=2)
        self.hold_caption()
        self.play(FadeOut(units))

        # Wavelength
        lam = ValueTracker(300.0)  # MHz for the space view
        sp_axes = VGroup(SP.axes(), SP.x_ticks([0, 1, 2, 3], fmt=str),
                         label("distance (m)", GREY, 20).next_to([SP.x0 + SP.width, SP.y0, 0], DOWN, buff=0.45).align_to([SP.x0 + SP.width, 0, 0], RIGHT))
        xs = np.linspace(0, 3, 900)
        sp_wave = always_redraw(lambda: SP.curve(xs, np.sin(2 * np.pi * xs / (C / (lam.get_value() * 1e6))), BLUE_C1, 3))
        sp_rd = always_redraw(lambda: label(
            f"{lam.get_value():.0f} MHz: wavelength {C / (lam.get_value() * 1e6) * 100:.0f} cm" if lam.get_value() > 400 else
            f"{lam.get_value():.0f} MHz: wavelength {C / (lam.get_value() * 1e6):.2f} m", BLUE_C1, 22).move_to([0, SP.y0 + SP.height + 0.35, 0]))
        self.caption("Radio waves travel at the speed of light: 300,000 km every second.")
        self.play(FadeIn(sp_axes), Create(sp_wave), FadeIn(sp_rd), run_time=2)
        lam_br = always_redraw(lambda: bracket(SP.px(0.25 * C / (lam.get_value() * 1e6)), SP.px(1.25 * C / (lam.get_value() * 1e6)), SP.py(1.15), UP, BLUE_C1))
        self.caption("The wavelength is how far the wave gets in one period. At 300 MHz: 1 metre.")
        self.play(FadeIn(lam_br))
        self.caption("Higher frequency, shorter wave. At 3 GHz it is 10 cm.")
        self.play(lam.animate.set_value(3000), run_time=5, rate_func=rate_functions.ease_in_out_sine)
        for m in (wave, rd, per, sp_wave, sp_rd, lam_br):
            m.clear_updaters()

        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=3.6, width=9.0, at=[0, 0.6, 0])
        self.play(*pad.show())
        rows = [("period = 1 ÷ frequency", WHITE), ("1 ÷ 1 MHz = 1 µs,   1 ÷ 2 MHz = 0.5 µs", GREY),
                ("wavelength = speed ÷ frequency", WHITE), ("300,000,000 m/s ÷ 300 MHz = 1 m", GREY)]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 1.1, c, 28), shift=DOWN * 0.15))
            self.wait(2)
        self.rule_card(["Period = 1 ÷ frequency: 1 MHz gives 1 µs.", "Higher frequency, shorter wave."])
