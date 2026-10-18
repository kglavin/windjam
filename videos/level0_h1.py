"""Level 0, lesson H1: Noise and SNR. Thermal noise kT = −174 dBm/Hz, so −114 dBm in 1 MHz, growing 10 dB per ten
times the bandwidth. The signal is a hump 1 MHz wide; SNR compares its power with the noise in that band."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

FLOOR = -114.0  # dBm per MHz
P = Plot(-4.8, 11.2, -2.6, 5.2, (-8, 8), (-135, -90))
FS = np.linspace(-8, 8, 1601)
RIPPLE = np.random.default_rng(11).normal(0, 1.2, len(FS))   # the noise floor's grass, in dB


def sinc2(f):
    return np.sinc(f) ** 2


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Noise and SNR")
        axes = VGroup(P.axes(), P.x_ticks([-8, -4, 0, 4, 8]), P.y_ticks([-130, -114, -100], fmt=lambda v: neg(v)),
                      label("dBm per MHz", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT),
                      label("MHz", GREY, 20).next_to([P.x0 + P.width, P.y0, 0], DOWN, buff=0.45))
        floor = P.curve(FS, FLOOR + RIPPLE, GREY, 2)
        self.caption("Every receiver hears noise: a random hiss made by heat in its own parts and in the air.")
        self.play(FadeIn(axes), Create(floor), run_time=2)
        ft = label("noise floor: −114 dBm in each MHz", GREY, 22).move_to([P.px(4), P.py(FLOOR) + 0.45, 0])
        self.caption("It sets a floor. At room temperature: about −114 dBm in every 1 MHz of band.")
        self.play(FadeIn(ft))

        # Bandwidth
        bw = ValueTracker(1.0)
        win = always_redraw(lambda: Rectangle(width=P.px(bw.get_value() / 2) - P.px(-bw.get_value() / 2), height=P.height, stroke_color=YELLOW,
                                              stroke_width=2, fill_color=YELLOW, fill_opacity=0.08).move_to([P.px(0), P.y0 + P.height / 2, 0]))
        rd = always_redraw(lambda: label(f"listening to {bw.get_value():.1f} MHz: noise {FLOOR + 10 * np.log10(bw.get_value()):.0f} dBm".replace("-", "−"),
                                         YELLOW, 24).move_to([P.px(0), P.y0 + P.height + 0.25, 0]))
        self.caption("The wider the band a receiver listens to, the more noise it hears.")
        self.play(FadeOut(ft), FadeIn(win), FadeIn(rd))
        self.caption("10 times wider, 10 times the noise: +10 dB.")
        self.play(bw.animate.set_value(10.0), run_time=5, rate_func=rate_functions.ease_in_out_sine)
        self.play(bw.animate.set_value(1.0), run_time=2)
        win.clear_updaters()
        rd.clear_updaters()
        self.play(FadeOut(win), FadeOut(rd))

        # SNR
        snr = ValueTracker(10.0)

        def total():
            sig = FLOOR + snr.get_value() + 10 * np.log10(np.maximum(sinc2(FS), 1e-9))
            return P.curve(FS, 10 * np.log10(10 ** (sig / 10) + 10 ** ((FLOOR + RIPPLE) / 10)), BLUE_C1, 3)

        sig = always_redraw(total)
        snr_t = always_redraw(lambda: label(f"SNR {snr.get_value():+.0f} dB".replace("-", "−"), BLUE_C1, 26).move_to([P.px(4.5), P.py(-97), 0]))
        self.caption("A signal 1 MHz wide. SNR compares its power with the noise in its band, in dB.")
        self.play(FadeOut(floor), FadeIn(sig), FadeIn(snr_t))
        self.caption("+10 dB: the signal is 10 times stronger than the noise. It stands out.")
        self.caption("0 dB: equal.")
        self.play(snr.animate.set_value(0), run_time=3)
        self.caption("−10 dB: 10 times weaker. It is buried in the noise.")
        self.play(snr.animate.set_value(-10), run_time=3)
        self.caption("A spread-spectrum signal is built to sit down there. The later levels show how its receiver still gets it.")
        for m in (sig, snr_t):
            m.clear_updaters()
        self.rule_card(["Noise floor: about −114 dBm per MHz,", "10 dB more for ten times the band.", "SNR = signal power − noise power, in dB."], clear=True)
