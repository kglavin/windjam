"""Level 3, lesson B1: Example, a quarter of the band.

Spectra in the engine's units (src/engine/lab/jammers.ts): signal power 1, J/S counted within ±Rc/2. Broadband
noise is white at J0 = J/Rc per MHz and stays white when multiplied by the code. The partial-band jammer puts J
into ρ·Rc at J/(ρ·Rc) per MHz; multiplying by the code convolves it with the chip spectrum sinc²(f), which at the
centre gives J0 × the mean of sinc² over the band, the weight berPartialBandDsss uses."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level3-B1")
N = DATA["n"]
RC = DATA["chipRateMcps"]
JS = DATA["jsDb"]
RHO = DATA["rho"]
J0 = 10 ** (JS / 10) / RC
GP = 10 * np.log10(N)

TOPP = Plot(-4.8, 11.2, 0.75, 2.45, (-2, 2), (-20, 30))
BOTP = Plot(-4.8, 11.2, -2.85, 2.45, (-2, 2), (-20, 30))
FS = np.linspace(-2, 2, 1601)
DF = FS[1] - FS[0]

# The partial-band jammer before and after despreading, per MHz.
PB_BEFORE = np.where(np.abs(FS) <= RHO * RC / 2 + 1e-9, J0 / RHO, 0.0)
_U = np.arange(-RHO * RC / 2, RHO * RC / 2 + 1e-9, DF / 4)
PB_AFTER = np.array([(J0 / RHO) * np.sum(np.sinc((f - _U) / RC) ** 2) * (DF / 4) / RC for f in FS])


def fmt(v, d=1):
    return f"{v:.{d}f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        a = ValueTracker(0)  # 0 before despreading, 1 after
        self.title_card("A quarter of the band")

        def frame(P, title):
            return VGroup(P.axes(), P.x_ticks(range(-2, 3)), P.y_ticks([-20, 0, 20]),
                          label(title, RED, 22).move_to([P.px(2) - 0.1, P.py(26), 0], aligned_edge=RIGHT),
                          label("dB per MHz", GREY, 18).move_to([P.x0 - 1.3, P.py(5), 0]))

        top = frame(TOPP, "broadband noise")
        bot = frame(BOTP, "a quarter of the band")
        names = VGroup(label("MHz", GREY, 20).move_to([TOPP.x0 - 1.15, BOTP.y0 - 0.25, 0]))

        def signal(P):
            def make():
                T = (N / RC) ** a.get_value()
                return P.curve(FS, [db(pulse_psd(f, T)) for f in FS], BLUE_C1, 3)
            return always_redraw(make)

        def jammer(P, before, after):
            def make():
                v = (1 - a.get_value()) * before + a.get_value() * after
                ys = [db(x) for x in v]
                line = P.curve(FS, ys, RED, 3)
                pts = [[P.px(-2), P.py(-100), 0]] + [[P.px(f), P.py(y), 0] for f, y in zip(FS, ys)] + [[P.px(2), P.py(-100), 0]]
                return VGroup(Polygon(*pts, stroke_width=0, fill_color=RED, fill_opacity=0.15), line)
            return always_redraw(make)

        bbn = np.full_like(FS, J0)
        s_top, s_bot = signal(TOPP), signal(BOTP)
        j_top, j_bot = jammer(TOPP, bbn, bbn), jammer(BOTP, PB_BEFORE, PB_AFTER)

        self.caption(f"Two noise jammers with the same power: J/S = {fmt(JS, 0)} dB each.")
        self.play(FadeIn(top), FadeIn(bot), FadeIn(names))
        self.play(Create(s_top), Create(s_bot), run_time=1.5)
        self.play(FadeIn(j_top), FadeIn(j_bot), run_time=1.5)
        self.caption("Broadband noise spreads its power over the whole band.")
        self.play(Indicate(top[3], color=RED))
        k = round(1 / RHO)
        bw = bracket(BOTP.px(-RHO * RC / 2), BOTP.px(RHO * RC / 2), BOTP.py(db(J0 / RHO)) + 0.12, UP, RED)
        bw_t = label(f"{RHO * RC:g} MHz, {fmt(db(J0 / RHO), 0)} dB", RED, 20).next_to(bw, UP, buff=0.05)
        self.caption(f"The other squeezes it into a quarter of the band: {k} times ({fmt(db(k), 0)} dB) stronger there.")
        self.play(FadeIn(bw), FadeIn(bw_t))

        # Despreading
        self.caption("The receiver multiplies everything by its code.")
        self.play(FadeOut(bw), FadeOut(bw_t))
        self.caption("The signal collapses into its narrow peak. The code spreads the squeezed jammer back out.")
        self.play(a.animate.set_value(1), run_time=8, rate_func=rate_functions.ease_in_out_sine)
        for m in (s_top, s_bot, j_top, j_bot):
            m.clear_updaters()
        self.caption("Broadband noise was already spread. It stays as it was.")

        # Levels at the centre
        lv_b = J0
        lv_p = J0 * DATA["weight"]
        dots = VGroup(Dot([TOPP.px(0), TOPP.py(db(lv_b)), 0], radius=0.07, color=WHITE),
                      Dot([BOTP.px(0), BOTP.py(db(lv_p)), 0], radius=0.07, color=WHITE))
        lv_txt = VGroup(
            label(f"{fmt(db(lv_b))} dB", WHITE, 22).next_to(dots[0], LEFT, buff=0.15).shift(DOWN * 0.22),
            label(f"{fmt(db(lv_p))} dB", WHITE, 22).next_to(dots[1], LEFT, buff=0.15).shift(DOWN * 0.22),
        )
        self.caption("At the centre, where each bit is decided, both end up at about the same level.")
        self.play(FadeIn(dots), FadeIn(lv_txt))

        res = VGroup(
            label(f"Eb/J0 = {fmt(GP)} − {fmt(db(lv_b))} = {fmt(GP - db(lv_b))} dB   BER {DATA['berBbn']:.2g}", YELLOW, 22)
            .move_to([TOPP.px(2) - 0.1, TOPP.py(19), 0], aligned_edge=RIGHT),
            label(f"Eb/J0 = {fmt(GP)} − {fmt(db(lv_p))} = {fmt(GP - db(lv_p))} dB   BER {DATA['berPartial']:.2g}", YELLOW, 22)
            .move_to([BOTP.px(2) - 0.1, BOTP.py(19), 0], aligned_edge=RIGHT),
        )
        self.caption("So they do about the same damage.")
        self.play(LaggedStart(*[FadeIn(r, shift=LEFT * 0.2) for r in res], lag_ratio=0.5))
        self.caption("Despreading undoes the squeeze, just as it spreads broadband noise.")
        self.rule_card(["Squeezing noise into part of the band", "does not help against spread spectrum."], clear=True)
