"""Level 0, lesson D2: From the air to 0 MHz. A mixer multiplies by a local oscillator: cos a · cos b holds the
difference and the sum, ½[cos(a − b) + cos(a + b)]; a filter keeps the difference. 140 MHz with a 138 MHz LO gives a
2 MHz IF; I and Q mixers take it to 0, where the lab's spectra are drawn."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

RF, LO = 140.0, 138.0     # MHz
X0, W = -4.6, 11.0
ROWS = {"signal": 2.6, "LO": 1.4, "product": 0.15, "filtered": -1.2}
A = 0.42


def row(y, fn, color, n=1400, width=2.5):
    ts = np.linspace(0, 1, n)
    return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners([[X0 + t * W, y + A * fn(t), 0] for t in ts])


def hump(P, centre, f_lo, f_hi, height=1.0, color=BLUE_C1):
    fs = np.linspace(f_lo, f_hi, 600)
    return P.curve(fs, [height * pulse_psd(f - centre, 1.0) for f in fs], color, 3)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("From the air to 0 MHz")

        # 1. A mixer in time: multiply, then keep the slow part
        fa, fb = 20, 18  # cycles across the window, standing in for 140 and 138 MHz
        names = {k: label(t, c, 20).move_to([X0 - 1.25, ROWS[k], 0]) for k, t, c in (
            ("signal", "received\nsignal", BLUE_C1), ("LO", "local\noscillator", GREEN_C3), ("product", "signal × LO", WHITE),
            ("filtered", "after the\nfilter", AMBER_C2))}
        sig = row(ROWS["signal"], lambda t: np.cos(2 * np.pi * fa * t), BLUE_C1)
        lo = row(ROWS["LO"], lambda t: np.cos(2 * np.pi * fb * t), GREEN_C3)
        prod = row(ROWS["product"], lambda t: 2 * np.cos(2 * np.pi * fa * t) * np.cos(2 * np.pi * fb * t), WHITE, width=2)
        slow = row(ROWS["filtered"], lambda t: np.cos(2 * np.pi * (fa - fb) * t), AMBER_C2, width=3.5)
        self.caption(f"The enemy link may arrive at {RF:.0f} MHz. Receivers shift it down before working on it.")
        self.play(FadeIn(names["signal"]), Create(sig), run_time=2)
        self.caption("A mixer multiplies it by a steady wave from a local oscillator, a little lower in frequency.")
        self.play(FadeIn(names["LO"]), Create(lo), run_time=2)
        self.caption("The product holds two waves: the difference of the two frequencies and their sum.")
        self.play(FadeIn(names["product"]), Create(prod), run_time=3)
        env = row(ROWS["product"], lambda t: np.cos(2 * np.pi * (fa - fb) * t), AMBER_C2, width=2).set_stroke(opacity=0.6)
        self.play(Create(env), run_time=2)
        self.caption("A filter keeps the slow difference. Same signal, same shape, moved down in frequency.")
        self.play(FadeIn(names["filtered"]), TransformFromCopy(env, slow), run_time=2)
        self.hold_caption()
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # 2. In the spectrum: 140 MHz with a 138 MHz LO
        P = Plot(-5.2, 11.6, -2.3, 4.6, (0, 300), (0, 1.3))
        axes = VGroup(P.axes(), P.x_ticks([0, 50, 100, 150, 200, 250, 300], fmt=str),
                      label("MHz", GREY, 20).next_to([P.x0 + P.width, P.y0, 0], DOWN, buff=0.45))
        rf = Line([P.px(RF), P.py(0), 0], [P.px(RF), P.py(1.0), 0], color=BLUE_C1, stroke_width=6)
        rf_t = label(f"signal: {RF:.0f} MHz, 2 MHz wide", BLUE_C1, 22).next_to(rf, RIGHT, buff=0.2).shift(UP * 0.6)
        lo_s = Line([P.px(LO), P.py(0), 0], [P.px(LO), P.py(1.2), 0], color=GREEN_C3, stroke_width=3)
        lo_t = label(f"LO: {LO:.0f} MHz", GREEN_C3, 22).next_to(lo_s, LEFT, buff=0.2).shift(UP * 1.1)
        self.caption(f"In the spectrum: the signal at {RF:.0f} MHz, the oscillator at {LO:.0f} MHz.")
        self.play(FadeIn(axes), GrowFromEdge(rf, DOWN), FadeIn(rf_t))
        self.play(GrowFromEdge(lo_s, DOWN), FadeIn(lo_t))
        dif = Line([P.px(RF - LO), P.py(0), 0], [P.px(RF - LO), P.py(0.5), 0], color=AMBER_C2, stroke_width=6)
        sm = Line([P.px(RF + LO), P.py(0), 0], [P.px(RF + LO), P.py(0.5), 0], color=GREY, stroke_width=6)
        dif_t = label(f"{RF:.0f} − {LO:.0f} = {RF - LO:.0f} MHz", AMBER_C2, 22).next_to(dif, UP, buff=0.1).shift(RIGHT * 1.3)
        sm_t = label(f"{RF:.0f} + {LO:.0f} = {RF + LO:.0f} MHz", GREY, 22).next_to(sm, UP, buff=0.1).shift(LEFT * 0.6)
        self.caption("Out of the mixer come the difference and the sum.")
        self.play(TransformFromCopy(rf, dif), TransformFromCopy(rf, sm), FadeIn(dif_t), FadeIn(sm_t), run_time=2)
        filt = Rectangle(width=P.px(20) - P.px(0), height=P.height, stroke_color=YELLOW, stroke_width=2,
                         fill_color=YELLOW, fill_opacity=0.1).move_to([P.px(10), P.y0 + P.height / 2, 0])
        self.caption(f"A filter keeps the {RF - LO:.0f} MHz copy, the intermediate frequency (IF), and throws the sum away.")
        self.play(FadeIn(filt), sm.animate.set_opacity(0.2), sm_t.animate.set_opacity(0.2))
        self.hold_caption()
        self.play(*[FadeOut(m) for m in (axes, rf, rf_t, lo_s, lo_t, dif, sm, dif_t, sm_t, filt)])

        # 3. Zoom: the IF, then I and Q to 0
        Z = Plot(-5.2, 11.6, -2.3, 4.6, (-4, 4), (0, 1.3))
        zax = VGroup(Z.axes(), Z.x_ticks(range(-4, 5)), label("MHz", GREY, 20).next_to([Z.x0 + Z.width, Z.y0, 0], DOWN, buff=0.45))
        c = ValueTracker(RF - LO)
        h = always_redraw(lambda: hump(Z, c.get_value(), -4, 4))
        ct = always_redraw(lambda: label(f"centre {c.get_value():.1f} MHz", BLUE_C1, 22).move_to([Z.px(c.get_value()), Z.py(1.12), 0]))
        self.caption(f"Up close the hump is unchanged: still 2 MHz wide, now centred on {RF - LO:.0f} MHz.")
        self.play(FadeIn(zax), Create(h), FadeIn(ct))
        self.caption("Some receivers stop here, at a low IF.")
        self.caption("That keeps the signal away from 0 Hz, where hardware adds its own offsets.")
        self.caption("Others use two mixers 90° apart, called I and Q, and shift all the way to 0.")
        self.play(c.animate.set_value(0), run_time=4, rate_func=rate_functions.ease_in_out_sine)
        h.clear_updaters()
        ct.clear_updaters()
        below = label("below the carrier", GREY, 20).move_to([Z.px(-2.5), Z.py(0.4), 0])
        above = label("above the carrier", GREY, 20).move_to([Z.px(2.5), Z.py(0.4), 0])
        car = DashedLine([Z.px(0), Z.y0, 0], [Z.px(0), Z.py(1.25), 0], color=WHITE, stroke_width=1.5, dash_length=0.07)
        self.caption("Now 0 MHz is the carrier: −1 MHz is 1 MHz below it, +1 MHz above.")
        self.play(Create(car), FadeIn(below), FadeIn(above))
        self.caption("The lab's spectra are drawn this way.")
        self.caption("Then an analog-to-digital converter (ADC) turns it into numbers, and software (DSP) does the rest.")
        self.rule_card(["A mixer moves a signal in frequency without changing its shape.", "On the lab's spectra, 0 MHz is the carrier."], clear=True)
