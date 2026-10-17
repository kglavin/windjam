"""Level 2, lesson B1: Example, what the decoder sees.

Spectra in the engine's units (src/engine/lab/jammers.ts): signal power 1, broadband noise white at J0 = J/Rc per MHz.
Before despreading the signal is chips, T·sinc²(f·T) with T = 1 µs; after, it is bits, T = n µs, with the same
power. Its peak is then Eb = n and the jammer's level stays J0, so the two levels at the centre are the bars of the
lesson's figure and their gap is Eb/J0."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level2-B1")
N = DATA["n"]
RC = DATA["chipRateMcps"]
GP = DATA["gpDb"]
JS = DATA["jsDb"]
EB = GP - JS
J0 = 10 ** (JS / 10) / RC  # per MHz

SPAN = ValueTracker(2.0)  # MHz each side
T = ValueTracker(1 / RC)  # pulse length of the signal, µs
P = Plot(-4.8, 11.2, -2.85, 5.4, (-2, 2), (-30, 20))
BOT, TOP = P.yr


def px(f):
    s = SPAN.get_value()
    return P.x0 + (f + s) / (2 * s) * P.width


def py(d):
    return P.py(d)


def ticks(span):
    """Round tick values across ±span: the largest step that still gives at least two ticks each side."""
    step = next(s for s in (1, 0.5, 0.25, 0.1, 0.05, 0.025, 0.01) if span / s >= 2)
    k = int(span / step + 1e-9)
    return [round(i * step, 4) for i in range(-k, k + 1)]


def fmt(v):
    return f"{v:.1f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("What the decoder sees")

        # 1. Signal and jammer at the receiver
        axes = P.axes()
        x_t = always_redraw(lambda: VGroup(*[
            label(neg(f"{v:g}"), GREY, 20).move_to([px(v), P.y0 - 0.25, 0]) for v in ticks(SPAN.get_value())
        ]))
        y_t = P.y_ticks([-20, -10, 0, 10, 20])
        x_name = label("MHz", GREY, 20).move_to([P.x0 - 1.15, P.y0 - 0.25, 0])
        y_name = label("dB per MHz", GREY, 20).move_to([P.x0 - 1.35, py(-5), 0])

        def signal():
            s = SPAN.get_value()
            fs = np.linspace(-s, s, 2001)
            return VMobject(stroke_color=BLUE_C1, stroke_width=3.5).set_points_as_corners(
                [[px(f), py(db(pulse_psd(f, T.get_value()))), 0] for f in fs])

        sig = always_redraw(signal)
        jam = Line([P.x0, py(db(J0)), 0], [P.x0 + P.width, py(db(J0)), 0], color=RED, stroke_width=3.5)
        jam_fill = Rectangle(width=P.width, height=py(db(J0)) - py(BOT), stroke_width=0, fill_color=RED, fill_opacity=0.12)
        jam_fill.move_to([P.x0 + P.width / 2, (py(db(J0)) + py(BOT)) / 2, 0])
        legend = VGroup(
            VGroup(Line(ORIGIN, RIGHT * 0.5, color=BLUE_C1, stroke_width=4), label("signal", BLUE_C1, 22)).arrange(RIGHT, buff=0.15),
            VGroup(Line(ORIGIN, RIGHT * 0.5, color=RED, stroke_width=4), label("noise jammer", RED, 22)).arrange(RIGHT, buff=0.15),
        ).arrange(RIGHT, buff=0.6).move_to([0, 3.3, 0])

        self.caption("The receiver hears the signal and a noise jammer together.")
        self.play(FadeIn(axes), FadeIn(x_t), FadeIn(y_t), FadeIn(x_name), FadeIn(y_name), FadeIn(legend))
        self.play(Create(sig), run_time=2)
        self.play(FadeIn(jam_fill), Create(jam), run_time=1.5)

        js_arrow = DoubleArrow([px(0.45), py(0), 0], [px(0.45), py(db(J0)), 0], buff=0, stroke_width=3, tip_length=0.15, color=WHITE)
        js_txt = label(f"J/S = {fmt(JS)} dB", WHITE, 22).next_to(js_arrow, RIGHT, buff=0.12)
        sig_lvl = DashedLine([px(0), py(0), 0], [px(0.5), py(0), 0], color=BLUE_C1, stroke_width=1.5, dash_length=0.06)
        self.caption(f"The jammer arrives {fmt(JS)} dB stronger than the signal: J/S = {fmt(JS)} dB.")
        self.play(Create(sig_lvl), GrowFromCenter(js_arrow), FadeIn(js_txt))

        # 2. Despreading
        self.caption("The receiver multiplies everything by its code.")
        self.play(FadeOut(js_arrow), FadeOut(js_txt), FadeOut(sig_lvl))
        self.caption("The signal follows the code: its chips become bits again.")
        self.play(T.animate.set_value(N / RC), run_time=7, rate_func=rate_functions.ease_in_out_sine)
        self.caption(f"Same power, {N} times narrower, so {N} times higher: +{fmt(GP)} dB. That is Gp.")
        self.caption("The jammer does not follow the code. It stays spread, at the same level.")
        self.play(Indicate(jam, color=RED, scale_factor=1.0), Indicate(jam_fill, color=RED, scale_factor=1.0))

        # 3. The bit filter
        self.caption("Zoom in on the centre.")
        self.play(SPAN.animate.set_value(0.15), run_time=3.5, rate_func=rate_functions.ease_in_out_sine)
        bw = RC / N  # noise bandwidth of adding up one bit's chips, MHz
        window = DashedVMobject(Rectangle(width=px(bw / 2) - px(-bw / 2), height=py(TOP) - py(BOT)), num_dashes=60)
        window.set_stroke(YELLOW, 2).move_to([px(0), (py(TOP) + py(BOT)) / 2, 0])
        slice_ = Rectangle(width=px(bw / 2) - px(-bw / 2), height=py(db(J0)) - py(BOT), stroke_width=0,
                           fill_color=RED, fill_opacity=0.45).move_to([px(0), (py(db(J0)) + py(BOT)) / 2, 0])
        win_txt = label(f"{1000 * bw:.0f} kHz: the bit rate", YELLOW, 22).next_to(window, RIGHT, buff=0.15).set_y(py(TOP) - 0.3)
        self.caption(f"Adding up a bit's {N} chips keeps only a narrow band, about the bit rate wide.")
        self.play(Create(window), FadeIn(win_txt))
        self.caption(f"It keeps all of each bit's energy, but only 1/{N} of the jammer.")
        self.play(FadeIn(slice_))

        lvl_s = DashedLine([px(-0.15), py(GP), 0], [px(0.15), py(GP), 0], color=BLUE_C1, stroke_width=1.5, dash_length=0.06)
        lvl_txt = VGroup(
            label(f"signal {fmt(GP)} dB", BLUE_C1, 22).next_to([px(-0.15), py(GP), 0], RIGHT, buff=0.1).shift(UP * 0.2),
            label(f"jammer {fmt(JS)} dB", RED, 22).next_to([px(-0.15), py(db(J0)), 0], RIGHT, buff=0.1).shift(UP * 0.2),
        )
        gap = DoubleArrow([px(0.03), py(db(J0)), 0], [px(0.03), py(GP), 0], buff=0, stroke_width=3, tip_length=0.12, color=YELLOW)
        gap_txt = label(f"Eb/J0 = {fmt(EB)} dB", YELLOW, 24).next_to(gap, RIGHT, buff=0.15)
        self.caption("Compare the two levels at the centre.")
        self.play(Create(lvl_s), FadeIn(lvl_txt))
        self.caption(f"The signal is now {fmt(GP)} − {fmt(JS)} = {fmt(EB)} dB above the jammer. That gap is Eb/J0.")
        self.play(GrowFromCenter(gap), FadeIn(gap_txt))

        # 4. The bars, as in the lesson's figure
        sig.clear_updaters()
        x_t.clear_updaters()
        graph = VGroup(axes, x_t, y_t, x_name, y_name, sig, jam, jam_fill, window, win_txt, slice_, lvl_s, lvl_txt, gap, gap_txt)
        self.clear_caption()
        self.play(FadeOut(legend), graph.animate.scale(0.5).to_edge(LEFT, buff=0.4).set_y(0.9))

        base, k = -1.2, 0.2  # bar baseline and scene units per dB
        def bar(x, d, color):
            return Rectangle(width=0.7, height=max(d * k, 1e-3), stroke_width=0, fill_color=color, fill_opacity=0.9).move_to(
                [x, base + d * k / 2, 0])

        def val(x, d):
            return label(f"{'+' if d > 0 else ''}{fmt(d)} dB", WHITE, 20).move_to([x, base + d * k + 0.2, 0])

        xs = {"bs": 1.3, "bj": 2.3, "as": 4.3, "aj": 5.3}
        heads = VGroup(label("Before despreading", WHITE, 22).move_to([1.8, 3.25, 0]),
                       label("After despreading", WHITE, 22).move_to([4.8, 3.25, 0]))
        names = VGroup(*[label(t, c, 20).move_to([xs[key], base - 0.25, 0])
                         for key, t, c in (("bs", "signal", BLUE_C1), ("bj", "jammer", RED), ("as", "signal", BLUE_C1), ("aj", "jammer", RED))])
        zero = Line([0.7, base, 0], [6.0, base, 0], color=GREY, stroke_width=1.5)
        b_bs, b_bj = bar(xs["bs"], 0, BLUE_C1), bar(xs["bj"], JS, RED)
        self.caption("The lesson's figure shows the same levels as bars.")
        self.play(FadeIn(heads[0]), FadeIn(zero), FadeIn(names[:2]), FadeIn(b_bs), GrowFromEdge(b_bj, DOWN), FadeIn(val(xs["bs"], 0)), FadeIn(val(xs["bj"], JS)))
        b_as = bar(xs["as"], 0, BLUE_C1)
        b_aj = bar(xs["aj"], JS, RED)
        self.caption(f"Despreading lifts the signal by Gp = {fmt(GP)} dB and leaves the jammer where it was.")
        self.play(FadeIn(heads[1]), FadeIn(names[2:]), FadeIn(b_as), FadeIn(b_aj), FadeIn(val(xs["aj"], JS)))
        self.play(Transform(b_as, bar(xs["as"], GP, BLUE_C1)), run_time=2)
        self.play(FadeIn(val(xs["as"], GP)))
        g = VGroup(
            Line([5.85, base + JS * k, 0], [5.85, base + GP * k, 0]),
            Line([5.75, base + JS * k, 0], [5.95, base + JS * k, 0]),
            Line([5.75, base + GP * k, 0], [5.95, base + GP * k, 0]),
        ).set_stroke(YELLOW, 2.5)
        formula = label(f"Eb/J0 = Gp − J/S = {fmt(GP)} − {fmt(JS)} = {fmt(EB)} dB", YELLOW, 26).move_to([3.5, -2.1, 0])
        self.play(Create(g), Write(formula), run_time=1.5)
        self.wait(3)
        self.rule_card(["Eb/J0 = Gp − J/S, in dB.", "Despreading lifts the signal by Gp and leaves the jammer."], clear=True)
