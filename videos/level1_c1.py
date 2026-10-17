"""Level 1, lesson C1: Example, reading the chip rate. The spectrum is the app's (videos/data/level1-C1.ts)."""
import math
import sys
from pathlib import Path

import numpy as np
from scipy.special import sici

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level1-C1")
SPEC = sorted(zip(DATA["mhz"], DATA["db"]))
OFF = DATA["envOffset"]
TOP = DATA["top"]
RC = DATA["chipRateMcps"]

# Spectrum plot. SPAN (MHz each side) and YBOT (dB) change when zooming out to show the side humps.
SPAN = ValueTracker(2)
YBOT = ValueTracker(TOP - 40)
X0 = -4.8
XW = 11.2
PY0 = -2.85
PH = 3.2

# One-chip panel, t = -1 .. 1 µs
TU = 2.6
CX = -2.6
BASE = 1.55
AMP = 1.0

# Fraction of a chip's power inside |f| < F
_FG = np.linspace(0, 8, 8001)
_CUM = np.concatenate([[0], np.cumsum(np.sinc(_FG[1:]) ** 2 + np.sinc(_FG[:-1]) ** 2) * (_FG[1] - _FG[0]) / 2]) * 2


def power_within(F):
    return float(np.interp(F, _FG, _CUM))


def px(f):
    s = SPAN.get_value()
    return X0 + (f + s) / (2 * s) * XW


def py(db):
    b = YBOT.get_value()
    return PY0 + (max(db, b) - b) / (TOP - b) * PH


def sinc(x):
    return 1.0 if abs(x) < 1e-9 else math.sin(math.pi * x) / (math.pi * x)


def env_db(f):
    return 10 * math.log10(max(sinc(f / RC) ** 2, 1e-9)) + OFF


def si(x):
    return np.sign(x) * sici(np.abs(x))[0]


def chip_from(F, t):
    """A 1 µs chip rebuilt from its frequencies up to F MHz."""
    return (si(2 * np.pi * F * (t + 0.5)) - si(2 * np.pi * F * (t - 0.5))) / np.pi


def tx(t):
    return CX + t * TU


def mhz(v):
    return f"{v:+.1f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        freq = ValueTracker(0)
        self.title_card("Reading the chip rate")

        # 1. The spectrum and its envelope
        axis_x = Line([X0, PY0, 0], [X0 + XW, PY0, 0], color=GREY, stroke_width=2)
        axis_y = Line([X0, PY0, 0], [X0, PY0 + PH, 0], color=GREY, stroke_width=2)

        def x_ticks():
            s = SPAN.get_value()
            step = 1 if s <= 3 else 2
            k = int(s // step)
            return VGroup(*[label(neg(v * step), GREY, 20).move_to([px(v * step), PY0 - 0.25, 0]) for v in range(-k, k + 1)])

        def y_ticks():
            b = YBOT.get_value()
            return VGroup(*[label(neg(v), GREY, 20).move_to([X0 - 0.3, py(v), 0])
                            for v in range(int(TOP), int(b) - 1, -20) if v >= b - 0.5])
        xt = always_redraw(x_ticks)
        yt = always_redraw(y_ticks)
        x_title = label("MHz", GREY, 20).move_to([X0 - 1.15, PY0 - 0.25, 0])
        y_title = label("power (dB)", AMBER_C2, 22).move_to([X0 - 1.4, PY0 + PH / 2, 0])
        zero = DashedLine([X0 + XW / 2, PY0, 0], [X0 + XW / 2, PY0 + PH, 0], color=GREY, stroke_width=1, dash_length=0.08).set_opacity(0.4)
        plot = VGroup(axis_x, axis_y, xt, yt, x_title, y_title, zero)

        spec = VMobject(stroke_color=AMBER_C2, stroke_width=2.5).set_points_as_corners(
            [[px(f), py(d), 0] for f, d in SPEC])
        env = DashedVMobject(
            VMobject().set_points_as_corners([[px(f), py(env_db(f)), 0] for f in np.linspace(-2, 2, 801)]),
            num_dashes=120).set_stroke(WHITE, 2.5)

        intro = label(f"The {DATA['n']}-chip example link: {RC:g} million chips per second", GREY, 26).move_to([0, 2.2, 0])
        self.caption("A spectrum shows how much power is at each frequency.")
        self.play(FadeIn(intro), FadeIn(plot))
        self.play(Create(spec), run_time=3, rate_func=linear)

        bumps = Rectangle(width=0.8 * XW / 4, height=1.0, stroke_color=WHITE, stroke_width=1.5)
        bumps.move_to([px(0), py(env_db(0)) - 0.2, 0])
        self.caption("The fine bumps come from the pattern of the code.")
        self.play(Create(bumps))
        self.wait(1)
        self.play(FadeOut(bumps))
        self.caption("What matters is the overall shape: the dashed envelope.")
        self.play(Create(env), spec.animate.set_stroke(opacity=0.45), run_time=2.5)
        self.caption("One wide hump that falls to zero on both sides.")

        # 2. Why: one chip against a test wave
        self.hold_caption()
        self.play(FadeOut(intro))
        self.caption("Why does it fall to zero? Look at one chip, 1 µs long.")
        chip = VMobject(stroke_color=BLUE_C1, stroke_width=4).set_points_as_corners([
            [tx(-1), BASE, 0], [tx(-0.5), BASE, 0], [tx(-0.5), BASE + AMP, 0],
            [tx(0.5), BASE + AMP, 0], [tx(0.5), BASE, 0], [tx(1), BASE, 0]])
        chip_name = label("One chip", BLUE_C1, 24).move_to([X0 - 1.15, BASE + AMP / 2, 0])
        chip_len = bracket(tx(-0.5), tx(0.5), BASE + AMP + 0.2, UP, BLUE_C1)
        chip_len_txt = label("1 µs", BLUE_C1, 22).next_to(chip_len, UP, buff=0.08)
        self.play(FadeIn(chip_name), Create(chip), FadeIn(chip_len), FadeIn(chip_len_txt))

        def wave_pts(t0, t1, n=160):
            f = freq.get_value()
            return [[tx(t), BASE + AMP * math.cos(2 * math.pi * f * t), 0] for t in np.linspace(t0, t1, n)]

        test_in = always_redraw(lambda: VMobject(stroke_color=GREEN_C3, stroke_width=3.5).set_points_smoothly(wave_pts(-0.5, 0.5)))
        test_out = always_redraw(lambda: VGroup(
            VMobject().set_points_smoothly(wave_pts(-1, -0.5, 80)),
            VMobject().set_points_smoothly(wave_pts(0.5, 1, 80)),
        ).set_stroke(GREEN_C3, 2, opacity=0.3))

        def area():
            f = freq.get_value()
            ts = np.linspace(-0.5, 0.5, 121)
            dt = ts[1] - ts[0]
            bars = VGroup()
            for t in ts[:-1] + dt / 2:
                v = math.cos(2 * math.pi * f * t)
                bars.add(Rectangle(width=dt * TU, height=max(abs(v) * AMP, 1e-3), stroke_width=0,
                                   fill_color=GREEN_C3 if v >= 0 else RED, fill_opacity=0.45)
                         .move_to([tx(t), BASE + v * AMP / 2, 0]))
            return bars
        shade = always_redraw(area)

        RX = 2.2
        f_txt = always_redraw(lambda: label(f"test wave: {freq.get_value():.2f} MHz", GREEN_C3, 24)
                              .move_to([RX, 3.15, 0], aligned_edge=LEFT))
        cyc_txt = always_redraw(lambda: label(f"cycles in the chip: {freq.get_value():.2f}", WHITE, 24)
                                .move_to([RX, 2.6, 0], aligned_edge=LEFT))
        sum_name = label("sum over the chip", WHITE, 24).move_to([RX, 2.05, 0], aligned_edge=LEFT)
        BZ, BW = RX + 0.9, 3.0  # meter zero and full length
        meter_axis = VGroup(
            Line([BZ - 0.8, 1.5, 0], [BZ + BW, 1.5, 0], color=GREY, stroke_width=1.5),
            Line([BZ, 1.35, 0], [BZ, 1.65, 0], color=GREY, stroke_width=2),
            label("0", GREY, 18).move_to([BZ, 1.15, 0]),
        )

        def meter():
            s = sinc(freq.get_value())
            return Rectangle(width=max(abs(s) * BW, 1e-3), height=0.26, stroke_width=0,
                             fill_color=GREEN_C3 if s >= 0 else RED, fill_opacity=0.9).move_to([BZ + s * BW / 2, 1.5, 0])
        bar = always_redraw(meter)
        dot = always_redraw(lambda: Dot([px(freq.get_value()), py(env_db(freq.get_value())), 0], radius=0.08, color=WHITE))

        self.caption("Multiply the chip by a test wave, then add up.")
        self.play(FadeIn(test_out), Create(test_in), FadeIn(shade), FadeIn(f_txt), FadeIn(cyc_txt))
        self.play(FadeIn(sum_name), FadeIn(meter_axis), FadeIn(bar), FadeIn(dot))
        self.caption("At 0 MHz the wave is flat. All plus: the top of the hump.")

        self.caption("At 0.5 MHz, half a cycle fits. Still mostly plus.")
        self.play(freq.animate.set_value(0.5), run_time=4, rate_func=linear)
        self.caption("At 1 MHz, one whole cycle fits. Plus and minus cancel.")
        self.play(freq.animate.set_value(1.0), run_time=4, rate_func=rate_functions.ease_out_sine)
        null_r = Circle(radius=0.22, color=WHITE, stroke_width=2.5).move_to([px(1), py(-1000), 0])
        self.caption("The sum is zero. That is the null.")
        self.play(Create(null_r))
        self.caption("Past it, they only partly cancel: a smaller side hump.")
        self.play(freq.animate.set_value(1.5), run_time=3.5, rate_func=linear)
        self.caption("At 2 MHz, two whole cycles fit. Zero again.")
        self.play(freq.animate.set_value(2.0), run_time=3.5, rate_func=linear)
        self.hold_caption()
        self.play(freq.animate.set_value(1.0), run_time=1.5)
        null_l = null_r.copy().move_to([px(-1), py(-1000), 0])
        self.caption("Negative frequencies mirror this. The first nulls are at ± 1 MHz.")
        self.play(TransformFromCopy(null_r, null_l))
        self.caption("One cycle per chip: the null is at 1 ÷ chip length, the chip rate.")

        for m in (test_in, test_out, shade, f_txt, cyc_txt, bar, dot):
            m.clear_updaters()
        self.hold_caption()
        self.play(FadeOut(VGroup(test_in, test_out, shade, f_txt, cyc_txt, sum_name, meter_axis, bar, dot, null_r, null_l)))

        # 3. Side humps: where they come from and how little power they hold
        env_live = always_redraw(lambda: VMobject(stroke_color=WHITE, stroke_width=2.5).set_points_as_corners(
            [[px(f), py(env_db(f)), 0] for f in np.linspace(-SPAN.get_value(), SPAN.get_value(), 1201)]))
        self.add(env_live)
        self.remove(env)
        self.caption("Zoom out: the side humps keep going, smaller and smaller.")
        self.play(FadeOut(spec), run_time=0.6)
        self.play(SPAN.animate.set_value(6), YBOT.animate.set_value(TOP - 60), run_time=4)

        band = ValueTracker(1.0)

        def band_fill():
            F = band.get_value()
            pts = ([[px(-F), py(-1000), 0]] + [[px(f), py(env_db(f)), 0] for f in np.linspace(-F, F, 600)]
                   + [[px(F), py(-1000), 0]])
            return Polygon(*pts, stroke_width=0, fill_color=AMBER_C2, fill_opacity=0.4)
        fill = always_redraw(band_fill)
        edges = always_redraw(lambda: VGroup(*[
            DashedLine([px(s * band.get_value()), PY0, 0], [px(s * band.get_value()), PY0 + PH, 0],
                       color=AMBER_C2, stroke_width=1.5, dash_length=0.07)
            for s in (-1, 1)]))
        rebuilt = always_redraw(lambda: VMobject(stroke_color=AMBER_C2, stroke_width=4).set_points_smoothly(
            [[tx(t), BASE + AMP * chip_from(band.get_value(), t), 0] for t in np.linspace(-1, 1, 400)]))
        used_txt = always_redraw(lambda: label(f"frequencies used: up to {band.get_value():.1f} MHz", AMBER_C2, 24)
                                 .move_to([RX, 2.9, 0], aligned_edge=LEFT))
        pow_txt = always_redraw(lambda: label(f"power included: {round(100 * power_within(band.get_value()))}%", WHITE, 24)
                                .move_to([RX, 2.35, 0], aligned_edge=LEFT))

        self.caption("They come from the chip's sharp edges.")
        self.play(chip.animate.set_stroke(width=2, opacity=0.5), Indicate(chip_len_txt, color=BLUE_C1, scale_factor=1.0))
        self.caption("Rebuild the chip from the main hump's frequencies only.")
        self.play(FadeIn(fill), FadeIn(edges), FadeIn(used_txt), FadeIn(pow_txt))
        self.play(Create(rebuilt), run_time=1.5)
        self.caption("It comes out rounded, but already holds 90% of the power.")
        self.caption("Add the side humps and the edges get sharp.")
        self.play(band.animate.set_value(6), run_time=7, rate_func=linear)
        self.caption("The side humps only add the last 10% of the power.")
        self.caption("On a dB scale they look big. They hold little power.")
        self.caption("Most power is in the main hump. Null to null, its width is the bandwidth.")
        self.play(band.animate.set_value(1), run_time=2)

        for m in (fill, edges, rebuilt, used_txt, pow_txt):
            m.clear_updaters()
        self.hold_caption()
        self.play(FadeOut(VGroup(fill, edges, rebuilt, used_txt, pow_txt, chip, chip_name, chip_len, chip_len_txt)))
        self.play(SPAN.animate.set_value(2), YBOT.animate.set_value(TOP - 40), run_time=3)
        self.play(FadeIn(spec), FadeIn(env), FadeOut(env_live))

        # 4. Measure the nulls
        self.caption("Find the deepest dip on each side of the main hump: the nulls.")
        marks = VGroup(*[
            DashedLine([px(f), PY0, 0], [px(f), PY0 + PH + 0.1, 0], color=WHITE, stroke_width=1.5, dash_length=0.06)
            for f in (-RC, RC)
        ])
        null_lbls = VGroup(*[label(f"{mhz(f)} MHz", WHITE, 22).move_to([px(f), PY0 + PH + 0.35, 0]) for f in (-RC, RC)])
        self.play(LaggedStart(*[AnimationGroup(Create(m), FadeIn(l)) for m, l in zip(marks, null_lbls)], lag_ratio=0.5))
        bw_arrow = DoubleArrow([px(-RC), py(TOP - 30), 0], [px(RC), py(TOP - 30), 0], buff=0, stroke_width=3, tip_length=0.15, color=BLUE_C1)
        bw_txt = label("null-to-null bandwidth", BLUE_C1, 22).next_to(bw_arrow, DOWN, buff=0.08)
        self.caption("The distance between them is the null-to-null bandwidth.")
        self.play(GrowFromCenter(bw_arrow), FadeIn(bw_txt))

        # 5. Scratchpad
        xt.clear_updaters()
        yt.clear_updaters()
        graph = VGroup(plot, spec, env, marks, null_lbls, bw_arrow, bw_txt)
        self.clear_caption()
        self.play(graph.animate.scale(0.5).to_edge(LEFT, buff=0.4).set_y(0.9))
        pad = Scratchpad(height=5.6, width=6.7)  # wide enough for the null-to-null line
        self.play(*pad.show())

        bw = 2 * RC
        l1 = pad.line(f"Left null = {mhz(-RC)} MHz", 0)
        l2 = pad.line(f"Right null = {mhz(RC)} MHz", 1)
        self.play(TransformFromCopy(null_lbls[0], l1), run_time=1.2)
        self.play(TransformFromCopy(null_lbls[1], l2), run_time=1.2)
        self.wait(1.5)
        l3 = pad.line("Null-to-null bandwidth = right − left", 2.2)
        l4 = pad.line(f"= {RC:.1f} − ({mhz(-RC)}) = {bw:.1f} MHz", 3.2, BLUE_C1)
        self.play(Write(l3), run_time=1.5)
        self.wait(1.5)
        self.play(FadeIn(l4, shift=DOWN * 0.15))
        self.wait(2.5)
        l5 = pad.line("Chip rate = null-to-null bandwidth ÷ 2", 4.4)
        l6 = pad.line(f"= {bw:.1f} ÷ 2 = {RC:.1f} Mcps", 5.4, AMBER_C2)
        box = SurroundingRectangle(l6, color=AMBER_C2, buff=0.12, corner_radius=0.08)
        self.play(Write(l5), run_time=1.2)
        self.wait(1.5)
        self.play(FadeIn(l6, shift=DOWN * 0.15))
        self.play(Create(box))
        self.wait(2)
        l7 = pad.note_below(f"Each chip lasts 1 ÷ {RC:g} Mcps = {1 / RC:g} µs.")
        self.play(FadeIn(l7))
        self.wait(3)
        self.play(FadeOut(l7))
        self.rule_card(["The nulls sit at ± the chip rate.", "Each chip lasts 1 ÷ chip rate."])
