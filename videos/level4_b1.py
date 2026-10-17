"""Level 4, lesson B1: Example, the code turns the tone into noise.

Engine units as in level2_b1.py: signal power 1, broadband noise white at J0 = J/Rc per MHz. The tone has power J
at fTc cycles per chip; multiplied by a long code it becomes J·sinc²(f − fTc) per MHz, so at the centre it sits at
J0·sinc²(fTc), the long-code theory's Gaussian approximation (berToneLongCode). The tone's spike before despreading
is drawn as that shape with a very long pulse, which morphs into the chip-length one."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level4-B1")
N = DATA["n"]
RC = DATA["chipRateMcps"]
JS = DATA["jsDb"]
FT = DATA["fTc"] * RC          # tone offset, MHz
J = 10 ** (JS / 10)
J0 = J / RC
GP = 10 * np.log10(N)
SHORT = DATA["shortCode"]
LONG = DATA["longCode"]

# Code rows: three bits
X0, XW = -4.8, 11.2
U = XW / (3 * N)
A = 0.25
ROW1, ROW2, ROW3 = 1.9, 0.7, -0.5

TOPP = Plot(-4.8, 11.2, 0.75, 2.45, (-2, 2), (-20, 30))
BOTP = Plot(-4.8, 11.2, -2.85, 2.45, (-2, 2), (-20, 30))
FS = np.linspace(-2, 2, 2001)
SPIKE_T = 5000.0  # µs: a pulse this long draws as a clean spike (its nulls fall on the 2 kHz grid)


def fmt(v, d=1):
    return f"{v:.{d}f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The code turns the tone into noise")

        # 1. Short code and long code
        names = VGroup(label("short code", GREEN_C3, 20).move_to([X0 - 1.25, ROW1, 0]),
                       label("long code", GREEN_C3, 20).move_to([X0 - 1.25, ROW2, 0]))
        short_row = chip_wave(SHORT * 3, X0, U, ROW1, A, GREEN_C3, width=2.5)
        long_row = chip_wave(LONG, X0, U, ROW2, A, GREEN_C3, width=2.5)
        bounds = VGroup(*[DashedLine([X0 + k * N * U, ROW2 - 0.45, 0], [X0 + k * N * U, ROW1 + 0.45, 0], color=GREY,
                                     stroke_width=1.2, dash_length=0.06) for k in (1, 2)])
        bit_t = VGroup(*[label(f"bit {k + 1}", GREY, 18).move_to([X0 + (k + 0.5) * N * U, ROW1 + 0.6, 0]) for k in range(3)])
        self.caption(f"Most links in this lab use a short code: the same {N} chips for every bit.")
        self.play(FadeIn(names[0]), FadeIn(bit_t), FadeIn(bounds), Create(short_row), run_time=2)
        same = VGroup(*[SurroundingRectangle(Line([X0 + k * N * U, ROW1, 0], [X0 + (k + 1) * N * U, ROW1, 0]), buff=0.32, color=GREEN_C3, stroke_width=1.5) for k in range(3)])
        self.play(LaggedStart(*[Create(r) for r in same], lag_ratio=0.3))
        self.play(FadeOut(same))
        self.caption("Some links use a long code: much longer than a bit, so every bit gets a different stretch.")
        self.play(FadeIn(names[1]), Create(long_row), run_time=2)

        # 2. A tone times the long code
        tone_vals = np.cos(2 * np.pi * DATA["fTc"] * (np.arange(3 * N * 8) / 8 + 1 / 16))
        tone_pts = [[X0 + k / 8 * U, ROW1 + A * v, 0] for k, v in enumerate(tone_vals)]
        tone_row = VMobject(stroke_color=AMBER_C2, stroke_width=3).set_points_smoothly(tone_pts)
        tone_name = label("tone", AMBER_C2, 20).move_to([X0 - 1.25, ROW1, 0])
        prod = [v * LONG[int(k // 8)] for k, v in enumerate(tone_vals)]
        prod_pts = []
        for k, v in enumerate(prod):
            x = X0 + k / 8 * U
            prod_pts += [[x, ROW3 + A * v, 0], [x + U / 8, ROW3 + A * v, 0]]
        prod_row = VMobject(stroke_color=RED, stroke_width=2.5).set_points_as_corners(prod_pts)
        prod_name = label("tone × code", RED, 20).move_to([X0 - 1.25, ROW3, 0])
        self.caption("A tone jammer sends one steady frequency.")
        self.play(FadeOut(short_row), FadeOut(names[0]), FadeIn(tone_name), Create(tone_row), run_time=2)
        self.caption("The receiver multiplies everything it hears by the code, the tone too.")
        sweep = Line([X0, ROW3 - 0.5, 0], [X0, ROW1 + 0.5, 0], color=WHITE, stroke_width=2)
        self.play(FadeIn(prod_name), FadeIn(sweep))
        self.play(Create(prod_row), sweep.animate.set_x(X0 + XW), run_time=4, rate_func=linear)
        self.play(FadeOut(sweep))
        self.caption("The code keeps flipping the tone at random. What comes out looks like noise.")
        self.hold_caption()
        self.play(FadeOut(VGroup(tone_row, tone_name, long_row, names[1], prod_row, prod_name, bounds, bit_t)))

        # 3. Spectra: broadband noise and the tone, before and after despreading
        a = ValueTracker(0)

        def frame(P, title):
            return VGroup(P.axes(), P.x_ticks(range(-2, 3)), P.y_ticks([-20, 0, 20]),
                          label(title, RED, 22).move_to([P.px(2) - 0.1, P.py(26), 0], aligned_edge=RIGHT),
                          label("dB per MHz", GREY, 18).move_to([P.x0 - 1.3, P.py(5), 0]))

        top = frame(TOPP, "broadband noise")
        bot = frame(BOTP, f"a tone at +{FT * 1000:.0f} kHz")
        mhz_t = label("MHz", GREY, 20).move_to([TOPP.x0 - 1.15, BOTP.y0 - 0.25, 0])

        def signal(P):
            return always_redraw(lambda: P.curve(FS, [db(pulse_psd(f, (N / RC) ** a.get_value())) for f in FS], BLUE_C1, 3))

        def jam(P, values):
            def make():
                ys = [db(v) for v in values(a.get_value())]
                pts = [[P.px(-2), P.py(-100), 0]] + [[P.px(f), P.py(y), 0] for f, y in zip(FS, ys)] + [[P.px(2), P.py(-100), 0]]
                return VGroup(Polygon(*pts, stroke_width=0, fill_color=RED, fill_opacity=0.15), P.curve(FS, ys, RED, 3))
            return always_redraw(make)

        bbn = lambda _a: np.full_like(FS, J0)  # noqa: E731
        tone = lambda _a: np.array([J * pulse_psd(f - FT, SPIKE_T ** (1 - _a) / RC) for f in FS])  # noqa: E731
        s_top, s_bot = signal(TOPP), signal(BOTP)
        j_top, j_bot = jam(TOPP, bbn), jam(BOTP, tone)
        self.caption(f"Two jammers with the same power, J/S = {fmt(JS, 0)} dB: broadband noise and a tone.")
        self.play(FadeIn(top), FadeIn(bot), FadeIn(mhz_t))
        self.play(Create(s_top), Create(s_bot), run_time=1.5)
        self.play(FadeIn(j_top), FadeIn(j_bot), run_time=1.5)
        tone_t = label("all its power on one frequency", RED, 20).next_to([BOTP.px(FT), BOTP.py(22), 0], LEFT, buff=0.15)
        self.caption("The tone is one tall spike.")
        self.play(FadeIn(tone_t))
        self.caption("Despread: the signal collapses into its peak, and the code smears the tone over the band.")
        self.play(FadeOut(tone_t))
        self.play(a.animate.set_value(1), run_time=8, rate_func=rate_functions.ease_in_out_sine)
        for m in (s_top, s_bot, j_top, j_bot):
            m.clear_updaters()
        self.caption("The tone now looks just like noise.")

        lv_b, lv_t = J0, J0 * np.sinc(DATA["fTc"]) ** 2
        dots = VGroup(Dot([TOPP.px(0), TOPP.py(db(lv_b)), 0], radius=0.07, color=WHITE),
                      Dot([BOTP.px(0), BOTP.py(db(lv_t)), 0], radius=0.07, color=WHITE))
        lv_txt = VGroup(label(f"{fmt(db(lv_b))} dB", WHITE, 22).next_to(dots[0], LEFT, buff=0.15).shift(DOWN * 0.22),
                        label(f"{fmt(db(lv_t))} dB", WHITE, 22).next_to(dots[1], LEFT, buff=0.15).shift(DOWN * 0.22))
        self.caption("At the centre, where each bit is decided, both sit at about the same level.")
        self.play(FadeIn(dots), FadeIn(lv_txt))
        res = VGroup(
            label(f"BER {DATA['berBbn']:.2g}", YELLOW, 24).move_to([TOPP.px(2) - 0.1, TOPP.py(19), 0], aligned_edge=RIGHT),
            label(f"BER {DATA['berTone']:.2g}", YELLOW, 24).move_to([BOTP.px(2) - 0.1, BOTP.py(19), 0], aligned_edge=RIGHT),
        )
        self.caption("So the tone does about what broadband noise of the same power does.")
        self.play(LaggedStart(*[FadeIn(r, shift=LEFT * 0.2) for r in res], lag_ratio=0.5))
        self.rule_card(["Against a long code, a tone does about what", "broadband noise of the same power does."], clear=True)
