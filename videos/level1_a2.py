"""Level 1, lesson A2: Spreading makes the signal wide and low.

The spectra are the analytic power spectral density of random ±1 pulses of length T µs, T·sinc²(f·T): peak T,
first nulls at ±1/T, total power 1 for every T. That is the smooth shape the app's figure measures."""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level1-A2")
BITS = DATA["bits"]
N = DATA["chipsPerBit"]
SENT = DATA["sent"]

# Signal rows: 28 µs
X0 = -4.6
U = 11.0 / len(SENT)
A = 0.28
ROW_OFF = 2.95  # without the code
ROW_ON = 1.95   # with the code

# Spectrum: ±2 MHz, linear power per MHz 0 .. N + 0.5, or dB -40 .. 10
LIN = Plot(-4.8, 11.2, -2.85, 4.0, (-2, 2), (0, N + 0.5))
DB = Plot(-4.8, 11.2, -2.85, 4.0, (-2, 2), (-40, 10))
NOISE = 2.0  # the receiver's noise, in the same units
FS = np.linspace(-2, 2, 1601)


def psd(f, T):
    x = f * T
    return T * (1.0 if abs(x) < 1e-9 else (math.sin(math.pi * x) / (math.pi * x)) ** 2)


def y_at(v, m):
    """Scene y for a power v: linear (m = 0) or dB (m = 1), blended while the axis changes."""
    lin = LIN.py(v)
    db = DB.py(10 * math.log10(max(v, 1e-6)))
    return (1 - m) * lin + m * db


class LessonVideo(LessonScene):
    def construct(self):
        T = ValueTracker(N)       # pulse length of the blue signal, µs
        m = ValueTracker(0)       # 0 linear, 1 dB
        self.title_card("Spreading makes the signal wide and low")

        # 1. The same bits, without and with the code
        off_name = label("Without code", AMBER_C2, 22).move_to([X0 - 1.3, ROW_OFF, 0])
        on_name = label("With code", BLUE_C1, 22).move_to([X0 - 1.3, ROW_ON, 0])
        off_row = chip_wave([b for b in BITS for _ in range(N)], X0, U, ROW_OFF, A, AMBER_C2)
        on_row = chip_wave(SENT, X0, U, ROW_ON, A, BLUE_C1)
        self.caption("The same bits sent two ways: without the code, and with it.")
        self.play(FadeIn(off_name), Create(off_row), run_time=1.5)
        self.play(FadeIn(on_name), Create(on_row), run_time=1.5)
        bit_br = bracket(X0, X0 + N * U, ROW_OFF + A + 0.25, UP, AMBER_C2)
        bit_txt = label(f"one bit: {N} µs", AMBER_C2, 20).next_to(bit_br, UP, buff=0.06)
        chip_br = bracket(X0, X0 + U, ROW_ON - A - 0.25, DOWN, BLUE_C1)
        chip_txt = label("one chip: 1 µs", BLUE_C1, 20).next_to(chip_br, DOWN, buff=0.06).align_to(chip_br, LEFT)
        self.caption(f"Without the code a pulse lasts a whole bit: {N} µs. With it, a chip: 1 µs.")
        self.play(FadeIn(bit_br), FadeIn(bit_txt), FadeIn(chip_br), FadeIn(chip_txt))

        # 2. The spectrum of the long pulses
        axes = LIN.axes()
        x_t = LIN.x_ticks(range(-2, 3))
        x_name = label("MHz", GREY, 20).move_to([LIN.x0 - 1.15, LIN.y0 - 0.25, 0])
        y_lin = LIN.y_ticks([0, 1, N])
        y_name = label("power per MHz", GREY, 20).move_to([LIN.x0 - 1.35, LIN.py(N / 2), 0])

        def amber():
            return VMobject(stroke_color=AMBER_C2, stroke_width=3).set_points_as_corners(
                [[LIN.px(f), y_at(psd(f, N), m.get_value()), 0] for f in FS])

        def blue():
            return VMobject(stroke_color=BLUE_C1, stroke_width=3.5).set_points_as_corners(
                [[LIN.px(f), y_at(psd(f, T.get_value()), m.get_value()), 0] for f in FS])

        def fill(T_of, color):
            def make():
                mm = m.get_value()
                base = y_at(1e-9, mm)
                pts = [[LIN.px(-2), base, 0]] + [[LIN.px(f), y_at(psd(f, T_of()), mm), 0] for f in FS] + [[LIN.px(2), base, 0]]
                return Polygon(*pts, stroke_width=0, fill_color=color, fill_opacity=0.3)
            return make

        amber_c = always_redraw(amber)
        self.caption("This is the spectrum: how much power is at each frequency.")
        self.play(FadeIn(axes), FadeIn(x_t), FadeIn(x_name), FadeIn(y_lin), FadeIn(y_name))
        self.play(Create(amber_c), run_time=2)
        self.caption("Long pulses make a narrow, tall hump.")

        # 3. Shorten the pulses: the hump widens and drops
        blue_c = always_redraw(blue)
        RX = 2.6
        rd_T = always_redraw(lambda: label(f"pulse length: {T.get_value():.1f} µs", BLUE_C1, 22)
                             .move_to([RX, LIN.py(N) + 0.05, 0], aligned_edge=LEFT))
        rd_w = always_redraw(lambda: label(f"width, null to null: {2 / T.get_value():.2f} MHz", WHITE, 22)
                             .move_to([RX, LIN.py(N) - 0.4, 0], aligned_edge=LEFT))
        rd_h = always_redraw(lambda: label(f"height: {T.get_value():.1f}", WHITE, 22)
                             .move_to([RX, LIN.py(N) - 0.85, 0], aligned_edge=LEFT))
        rd_p = always_redraw(lambda: label(f"width × height: {2 / T.get_value() * T.get_value():.1f}", GREEN_C3, 22)
                             .move_to([RX, LIN.py(N) - 1.3, 0], aligned_edge=LEFT))
        self.caption("Now shorten the pulses, from a bit to a chip.")
        self.play(FadeIn(blue_c), FadeIn(rd_T), FadeIn(rd_w), FadeIn(rd_h))
        self.caption("Short pulses take up more frequencies than long ones.")
        self.play(T.animate.set_value(1), run_time=8, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"Chips are {N} times shorter, so the hump is {N} times wider.")

        # 4. Same power: the areas are equal
        amber_f = always_redraw(fill(lambda: N, AMBER_C2))
        blue_f = always_redraw(fill(lambda: T.get_value(), BLUE_C1))
        self.caption("Both carry the same power: the area under each hump.")
        self.play(FadeIn(amber_f), FadeIn(blue_f), FadeIn(rd_p))
        self.caption(f"Width × height stays the same. {N} times wider means {N} times lower.")
        h_br = VGroup(
            label(str(N), AMBER_C2, 22).next_to([LIN.px(0.15), LIN.py(N), 0], RIGHT, buff=0.1),
            label("1", BLUE_C1, 22).next_to([LIN.px(0.55), LIN.py(1) + 0.05, 0], UP, buff=0.05),
        )
        self.play(FadeIn(h_br))

        # 5. Below the noise
        noise = always_redraw(lambda: Rectangle(
            width=LIN.width, height=max(y_at(NOISE, m.get_value()) - y_at(1e-9, m.get_value()), 1e-3),
            stroke_width=0, fill_color=GREY, fill_opacity=0.25,
        ).move_to([LIN.x0 + LIN.width / 2, (y_at(NOISE, m.get_value()) + y_at(1e-9, m.get_value())) / 2, 0]))
        noise_txt = always_redraw(lambda: label("receiver noise", GREY, 22)
                                  .move_to([LIN.px(-1.4), y_at(NOISE, m.get_value()) + 0.2, 0]))
        self.caption("Now add the noise in an intercept receiver.")
        self.play(FadeIn(noise), FadeIn(noise_txt))
        self.caption("The tall hump stands out. The spread one sits below the noise.")
        self.caption("That is why spread spectrum is hard to see.")

        # 6. The same in dB, as the lesson's figure shows it
        y_db = DB.y_ticks([0, -20, -40])
        y_db_name = label("dB", GREY, 20).move_to([LIN.x0 - 1.15, LIN.py(N / 2), 0])
        for mob in (amber_f, blue_f, noise, noise_txt):
            mob.clear_updaters()
        self.hold_caption()
        self.play(FadeOut(h_br), FadeOut(rd_T), FadeOut(rd_w), FadeOut(rd_h), FadeOut(rd_p),
                  FadeOut(amber_f), FadeOut(blue_f), FadeOut(noise), FadeOut(noise_txt))
        self.caption("The lesson's figure shows the same spectra in dB.")
        self.play(m.animate.set_value(1), FadeOut(y_lin), FadeIn(y_db), FadeOut(y_name), FadeIn(y_db_name), run_time=3)
        w_off = bracket(DB.px(-1 / N), DB.px(1 / N), DB.py(10 * math.log10(N)) + 0.25, UP, AMBER_C2)
        w_off_t = label(f"±{1 / N:.2f} MHz", AMBER_C2, 20).next_to(w_off, UP, buff=0.06)
        w_on = bracket(DB.px(-1), DB.px(1), DB.py(-12), DOWN, BLUE_C1)
        w_on_t = label("±1 MHz", BLUE_C1, 20).next_to(w_on, DOWN, buff=0.06)
        self.caption(f"Orange runs from about −{1 / N:.2f} to +{1 / N:.2f} MHz, blue from −1 to +1 MHz.")
        self.play(FadeIn(w_off), FadeIn(w_off_t), FadeIn(w_on), FadeIn(w_on_t))

        for mob in (amber_c, blue_c):
            mob.clear_updaters()
        self.rule_card(["The width follows the chips.", f"{N} chips per bit: {N} times wider and {N} times lower."], clear=True)
