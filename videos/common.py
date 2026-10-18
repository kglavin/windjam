"""Shared look for the lesson explainer videos (docs/design-lesson-videos.md): the app's colours, captions held
long enough to read, labels, brackets and the scratchpad panel."""
import json
from pathlib import Path

import numpy as np

from manim import *

# The figure colours in src/styles.css (.inst-svg .c1/.c2/.c3) and the instrument background.
BLUE_C1 = "#60a5fa"
AMBER_C2 = "#f59e0b"
GREEN_C3 = "#34d399"
RED = "#f87171"        # jammer (.vis-bar-jam)
YELLOW = "#facc15"     # the Eb/J0 gap (.vis-gap)
GREY = "#94a3b8"
PANEL = "#111a2e"

config.background_color = "#0b1220"

READ_WPS = 2.5      # caption reading speed, words per second
MIN_CAPTION_S = 3.0


def load_data(video_id):
    """JSON written by videos/data/<id>.ts from the app's engine, so the curves match what the player sees."""
    return json.loads((Path(__file__).parent / "data" / f"{video_id}.json").read_text())


def label(text, color=WHITE, size=26):
    return Text(text, font_size=size, color=color)


def neg(v):
    """A number with a true minus sign."""
    return str(v).replace("-", "−")


def bracket(x1, x2, y, direction=DOWN, color=WHITE):
    """A bar with end ticks pointing back at the thing it measures (no LaTeX)."""
    t = -0.12 * direction[1]
    return VGroup(
        Line([x1, y, 0], [x2, y, 0]),
        Line([x1, y, 0], [x1, y + t, 0]),
        Line([x2, y, 0], [x2, y + t, 0]),
    ).set_stroke(color, 2.5)


def chip_wave(values, x0, unit, y, amp, color, width=4):
    """A chip row: one value per chip, each `unit` wide, drawn as a step wave around y."""
    pts = []
    for k, v in enumerate(values):
        pts += [[x0 + k * unit, y + v * amp, 0], [x0 + (k + 1) * unit, y + v * amp, 0]]
    return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(pts)


def chip_bars(values, x0, unit, y, amp, color, opacity=0.8, frac=0.6):
    """One bar per chip from y, height value × amp, frac of a chip wide: the chips before they are added up."""
    return VGroup(*[
        Rectangle(width=unit * frac, height=max(abs(v) * amp, 1e-3), stroke_width=0, fill_color=color, fill_opacity=opacity)
        .move_to([x0 + (k + 0.5) * unit, y + v * amp / 2, 0])
        for k, v in enumerate(values)
    ])


def stack_targets(bars, values, x, y, amp, width=0.3):
    """Where each bar goes when the chips are added head to tail at x: the stack ends at y + sum × amp."""
    out = []
    level = 0.0
    for bar, v in zip(bars, values):
        out.append(bar.copy().stretch_to_fit_width(width).stretch_to_fit_height(max(abs(v) * amp, 1e-3))
                   .move_to([x, y + (level + v / 2) * amp, 0]))
        level += v
    return out


def pulse_psd(f, T):
    """Power spectral density per MHz of random ±1 pulses T µs long with power 1: T·sinc²(f·T). Peak T, first
    nulls at ±1/T, area 1 for every T."""
    x = f * T
    return T * (1.0 if abs(x) < 1e-12 else (np.sin(np.pi * x) / (np.pi * x)) ** 2)


def db(v, floor=1e-12):
    return 10 * np.log10(max(v, floor))


def ber_bpsk(eb_j0):
    """BPSK bit error rate Q(√(2·Eb/J0)) for Eb/J0 as a ratio, as theory.ts berBpsk."""
    from scipy.special import erfc
    return 0.5 * erfc(np.sqrt(max(eb_j0, 0.0)))


def sci(v, digits=2):
    """A probability as the lessons print it: 0.0081, 0.0000049."""
    if v >= 0.001:
        return f"{v:.{digits}g}"
    return f"{v:.{-int(np.floor(np.log10(v))) + digits - 1}f}"


class Plot:
    """A plain plot frame (no LaTeX): x from x0 over width, y from y0 over height, mapping data ranges xr and yr."""

    def __init__(self, x0, width, y0, height, xr, yr):
        self.x0, self.width, self.y0, self.height = x0, width, y0, height
        self.xr, self.yr = xr, yr

    def px(self, x):
        return self.x0 + (x - self.xr[0]) / (self.xr[1] - self.xr[0]) * self.width

    def py(self, y):
        y = min(max(y, self.yr[0]), self.yr[1])
        return self.y0 + (y - self.yr[0]) / (self.yr[1] - self.yr[0]) * self.height

    def axes(self):
        return VGroup(
            Line([self.x0, self.y0, 0], [self.x0 + self.width, self.y0, 0]),
            Line([self.x0, self.y0, 0], [self.x0, self.y0 + self.height, 0]),
        ).set_stroke(GREY, 2)

    def x_ticks(self, values, fmt=neg):
        return VGroup(*[label(fmt(v), GREY, 20).move_to([self.px(v), self.y0 - 0.25, 0]) for v in values])

    def y_ticks(self, values, fmt=neg):
        return VGroup(*[label(fmt(v), GREY, 20).next_to([self.x0, self.py(v), 0], LEFT, buff=0.12) for v in values])

    def curve(self, xs, ys, color, width=3):
        return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(
            [[self.px(x), self.py(y), 0] for x, y in zip(xs, ys)])


def copy_timeline(count, x0, width, y, per_bit=3, h=0.42):
    """Copies of bits on a time line: one box per copy, and above each bit's copies a bracket and 'bit k'.
    Returns (boxes, bit_marks, copy_width)."""
    w = width / count
    boxes = VGroup(*[Rectangle(width=w, height=h, stroke_color=GREY, stroke_width=1.5).move_to([x0 + (i + 0.5) * w, y, 0])
                     for i in range(count)])
    marks = VGroup()
    for b in range(count // per_bit):
        br = bracket(x0 + b * per_bit * w + 0.04, x0 + (b + 1) * per_bit * w - 0.04, y + h / 2 + 0.12, UP, GREY)
        marks.add(VGroup(br, label(f"bit {b + 1}", GREY, 18).next_to(br, UP, buff=0.05)))
    return boxes, marks, w


SUPER = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")


def ber_tick(exp):
    """A BER axis label for 10^exp: 0.1, 0.01, 0.001, then 10⁻⁴ and smaller."""
    return {0: "1", -1: "0.1", -2: "0.01", -3: "0.001"}.get(exp, "10" + str(exp).translate(SUPER))


def ber_waterfall(P, color=BLUE_C1):
    """BPSK BER against Eb/J0 on a Plot whose x range is dB and y range is log10(BER): axes, ticks, names, curve."""
    xs = np.linspace(P.xr[0], P.xr[1], 400)
    ys = [np.log10(max(ber_bpsk(10 ** (x / 10)), 1e-30)) for x in xs]
    lo, hi = int(np.ceil(P.yr[0])), int(np.floor(P.yr[1]))
    return VGroup(
        P.axes(),
        P.x_ticks(range(int(np.ceil(P.xr[0] / 4) * 4), int(P.xr[1]) + 1, 4)),
        VGroup(*[label(ber_tick(e), GREY, 18).next_to([P.x0, P.py(e), 0], LEFT, buff=0.12) for e in range(lo, hi + 1)]),
        label("Eb/J0 (dB)", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45),
        label("BER", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT),
        P.curve(xs, ys, color, 3),
    )


def ber_point(P, eb_db):
    """Scene point on the waterfall at Eb/J0 in dB."""
    return np.array([P.px(eb_db), P.py(np.log10(ber_bpsk(10 ** (eb_db / 10)))), 0])


class LessonScene(Scene):
    """A scene with a caption line at the bottom. Each caption stays up until it can be read."""

    cap = None

    def hold_caption(self):
        if self.cap is not None:
            left = self.cap_need - (self.renderer.time - self.cap_start)
            if left > 0:
                self.wait(left)

    def caption(self, text):
        self.hold_caption()
        new = label(text, size=28)
        if new.width > 13.4:  # keep long captions inside the frame
            new.scale_to_fit_width(13.4)
        new.to_edge(DOWN, buff=0.3)
        if self.cap is None:
            self.play(FadeIn(new, shift=UP * 0.2), run_time=0.6)
        else:
            self.play(FadeOut(self.cap, shift=UP * 0.2), FadeIn(new, shift=UP * 0.2), run_time=0.6)
        self.cap = new
        self.cap_start = self.renderer.time
        self.cap_need = max(MIN_CAPTION_S, len(text.split()) / READ_WPS + 1.0)

    def clear_caption(self):
        self.hold_caption()
        if self.cap is not None:
            self.play(FadeOut(self.cap))
        self.cap = None

    def title_card(self, text):
        title = label(text, size=48)
        self.play(Write(title), run_time=1.2)
        self.wait(0.8)
        self.play(FadeOut(title))

    def rule_card(self, lines, hold=5, clear=False):
        """The lesson's rule at the end, then fade everything. clear: fade the scene first and centre the rule,
        for scenes whose figure reaches the bottom of the frame."""
        self.clear_caption()
        rule = VGroup(*[label(t, WHITE, 32 if clear else 28) for t in lines]).arrange(DOWN, buff=0.2)
        if rule.width > 13.4:  # keep long rules inside the frame
            rule.scale_to_fit_width(13.4)
        if clear:
            self.play(*[FadeOut(m) for m in self.mobjects])
        else:
            rule.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(rule, shift=UP * 0.2))
        self.wait(hold)
        self.play(*[FadeOut(m) for m in self.mobjects])


class Scratchpad:
    """The worked calculation panel on the right; line(i) places text on row i."""

    def __init__(self, height=5.4, width=6.2, at=None):
        """Top right by default; at: centre the panel there instead (a scratchpad with no figure beside it)."""
        self.panel = RoundedRectangle(width=width, height=height, corner_radius=0.15, stroke_color=GREY,
                                      stroke_width=1.5, fill_color=PANEL, fill_opacity=1)
        if at is None:
            self.panel.to_corner(UR, buff=0.4)
        else:
            self.panel.move_to(at)
        self.title = (label("Scratchpad", GREY, 24).next_to(self.panel.get_top(), DOWN, buff=0.25)
                      .align_to(self.panel, LEFT).shift(RIGHT * 0.35))

    def show(self):
        return [FadeIn(self.panel), FadeIn(self.title)]

    def line(self, text, i, color=WHITE, size=26):
        return (label(text, color, size).align_to(self.panel, LEFT).shift(RIGHT * 0.35)
                .set_y(self.panel.get_top()[1] - 0.95 - i * 0.6))

    def note_below(self, text):
        return label(text, GREY, 24).next_to(self.panel, DOWN, buff=0.3).set_x(0)


VIOLET = "#a78bfa"     # TDOA hyperbolas (.df-hyperbola)


class MapView:
    """Level 6's DF map (src/ui/lab/instruments/DfView.tsx): km with x east and y north, drawn `height` units tall with
    its centre at `center`. Lines and curves are clipped to the map."""

    def __init__(self, center=(-3.2, 0.35, 0), height=6.2, xr=(-10, 10), yr=(-4, 16)):
        self.xr, self.yr = xr, yr
        self.s = height / (yr[1] - yr[0])
        self.c = np.array(center, dtype=float)

    def p(self, x, y):
        return self.c + np.array([(x - (self.xr[0] + self.xr[1]) / 2) * self.s, (y - (self.yr[0] + self.yr[1]) / 2) * self.s, 0])

    def inside(self, x, y):
        return self.xr[0] <= x <= self.xr[1] and self.yr[0] <= y <= self.yr[1]

    def grid(self, step=2):
        g = VGroup()
        for v in range(int(np.ceil(self.xr[0] / step) * step), int(self.xr[1]) + 1, step):
            g.add(Line(self.p(v, self.yr[0]), self.p(v, self.yr[1]), stroke_width=0.6, stroke_color=GREY, stroke_opacity=0.35))
        for v in range(int(np.ceil(self.yr[0] / step) * step), int(self.yr[1]) + 1, step):
            g.add(Line(self.p(self.xr[0], v), self.p(self.xr[1], v), stroke_width=0.6, stroke_color=GREY, stroke_opacity=0.35))
        g.add(Rectangle(width=(self.xr[1] - self.xr[0]) * self.s, height=(self.yr[1] - self.yr[0]) * self.s,
                        stroke_color=GREY, stroke_width=1.2).move_to(self.p((self.xr[0] + self.xr[1]) / 2, (self.yr[0] + self.yr[1]) / 2)))
        if self.yr[0] <= 0 <= self.yr[1]:
            g.add(DashedLine(self.p(self.xr[0], 0), self.p(self.xr[1], 0), dash_length=0.12, stroke_color=GREY, stroke_width=2))
            g.add(label("front line", GREY, 16).next_to(self.p(self.xr[1], 0), UP, buff=0.05).shift(LEFT * 0.75))
        g.add(label("N ↑", GREY, 18).next_to(self.p(self.xr[0], self.yr[1]), DR, buff=0.1))
        g.add(label(f"{step} km grid", GREY, 16).next_to(self.p(self.xr[0], self.yr[0]), DOWN, buff=0.1, aligned_edge=LEFT))
        return g

    def site(self, x, y, name, color=AMBER_C2, side=DR):
        dot = Dot(self.p(x, y), radius=0.08, color=color)
        return VGroup(dot, label(name, color, 20).next_to(dot, side, buff=0.06))

    def target(self, x, y, color=RED):
        return Circle(radius=0.14, stroke_color=color, stroke_width=3).move_to(self.p(x, y))

    def _clip(self, x, y, deg):
        """How far (km) a ray from (x, y) on bearing deg runs before it leaves the map."""
        r = np.radians(deg)
        dx, dy = np.sin(r), np.cos(r)
        t = 60.0
        for lo, hi, o, d in ((self.xr[0], self.xr[1], x, dx), (self.yr[0], self.yr[1], y, dy)):
            if abs(d) > 1e-12:
                t = min(t, max((lo - o) / d, (hi - o) / d))
        return max(t, 0.0)

    def ray_end(self, x, y, deg, km=None):
        r = np.radians(deg)
        t = self._clip(x, y, deg) if km is None else km
        return x + t * np.sin(r), y + t * np.cos(r)

    def ray(self, x, y, deg, color=BLUE_C1, width=2.5, km=None):
        """The bearing line from (x, y), only the part on the map (the site may be off it, as in a close-up)."""
        r = np.radians(deg)
        dx, dy = np.sin(r), np.cos(r)
        t0, t1 = 0.0, 80.0 if km is None else km
        for lo, hi, o, d in ((self.xr[0], self.xr[1], x, dx), (self.yr[0], self.yr[1], y, dy)):
            if abs(d) < 1e-12:
                if not lo <= o <= hi:
                    return VMobject()
                continue
            ta, tb = (lo - o) / d, (hi - o) / d
            t0, t1 = max(t0, min(ta, tb)), min(t1, max(ta, tb))
        if t0 >= t1:
            return VMobject()
        return Line(self.p(x + t0 * dx, y + t0 * dy), self.p(x + t1 * dx, y + t1 * dy), stroke_color=color, stroke_width=width)

    def wedge(self, x, y, deg, sigma, color=BLUE_C1, opacity=0.18):
        """The ± 2σ wedge, as a fan of points along the map's edge."""
        pts = [self.p(x, y)]
        for d in np.linspace(deg - 2 * sigma, deg + 2 * sigma, 24):
            pts.append(self.p(*self.ray_end(x, y, d)))
        return Polygon(*pts, stroke_width=0, fill_color=color, fill_opacity=opacity)

    def ellipse(self, x, y, a, b, angle, color=GREEN_C3, width=3):
        return (Ellipse(width=max(2 * a * self.s, 0.02), height=max(2 * b * self.s, 0.02), stroke_color=color, stroke_width=width)
                .rotate(angle).move_to(self.p(x, y)))

    def circle(self, x, y, r, color=GREEN_C3):
        return DashedVMobject(Circle(radius=r * self.s, stroke_color=color, stroke_width=2).move_to(self.p(x, y)), num_dashes=30)

    def cross(self, x, y, color=GREEN_C3, size=0.12):
        c = self.p(x, y)
        return VGroup(Line(c + [-size, -size, 0], c + [size, size, 0]), Line(c + [-size, size, 0], c + [size, -size, 0])).set_stroke(color, 3)

    def ring(self, x, y, r, color=WHITE, width=2, opacity=0.6):
        """A circle of radius r km round (x, y), only the parts inside the map."""
        runs, cur = [], []
        for t in np.linspace(0, 2 * np.pi, 241):
            px, py = x + r * np.cos(t), y + r * np.sin(t)
            if self.inside(px, py):
                cur.append(self.p(px, py))
            elif cur:
                runs.append(cur)
                cur = []
        if cur:
            runs.append(cur)
        return VGroup(*[VMobject(stroke_color=color, stroke_width=width, stroke_opacity=opacity).set_points_as_corners(run)
                        for run in runs if len(run) > 1])

    def curve(self, pts, color=VIOLET, width=3):
        """A curve through pts, only the parts on the map: each stretch inside it drawn on its own."""
        runs, cur = [], []
        for x, y in pts:
            if self.inside(x, y):
                cur.append(self.p(x, y))
            elif cur:
                runs.append(cur)
                cur = []
        if cur:
            runs.append(cur)
        return VGroup(*[VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(r) for r in runs if len(r) > 1])


class HopWaterfall:
    """Level 7's hop waterfall (src/ui/lab/instruments/Waterfall.tsx): time across, channel up, one tile per hop."""

    def __init__(self, x0, width, y0, height, channels, t_end):
        self.x0, self.width, self.y0, self.height = x0, width, y0, height
        self.n, self.t_end = channels, t_end

    def tx(self, t):
        return self.x0 + t / self.t_end * self.width

    def ty(self, c):
        """Bottom edge of channel c."""
        return self.y0 + c / self.n * self.height

    def frame(self, f0_mhz=30.0, step_mhz=0.025, time_label="time (ms)", ticks=(0, 40, 80, 120, 160)):
        g = VGroup(Rectangle(width=self.width, height=self.height, stroke_color=GREY, stroke_width=1.5)
                   .move_to([self.x0 + self.width / 2, self.y0 + self.height / 2, 0]))
        for c in range(self.n + 1):
            g.add(Line([self.x0, self.ty(c), 0], [self.x0 + self.width, self.ty(c), 0], stroke_width=0.5, stroke_color=GREY, stroke_opacity=0.3))
        g.add(label(f"{f0_mhz:.3f}", GREY, 18).next_to([self.x0, self.y0, 0], LEFT, buff=0.1))
        g.add(label(f"{f0_mhz + self.n * step_mhz:.3f} MHz", GREY, 18).next_to([self.x0, self.y0 + self.height, 0], LEFT, buff=0.1))
        for t in ticks:
            if t <= self.t_end:
                g.add(label(str(t), GREY, 18).move_to([self.tx(t), self.y0 - 0.25, 0]))
        g.add(label(time_label, GREY, 18).next_to([self.x0 + self.width, self.y0, 0], DOWN, buff=0.45).shift(LEFT * 0.6))
        return g

    def tile(self, c, t, dur, color=BLUE_C1, opacity=0.95):
        return Rectangle(width=max(dur / self.t_end * self.width - 0.03, 0.02), height=self.height / self.n * 0.86,
                         stroke_width=0, fill_color=color, fill_opacity=opacity).move_to(
            [self.tx(t + dur / 2), self.ty(c + 0.5), 0])

    def rows(self, c0, c1, color=RED, opacity=0.25):
        """A band over channels c0 to c1 (exclusive) for the whole time."""
        return Rectangle(width=self.width, height=(c1 - c0) / self.n * self.height, stroke_width=0, fill_color=color,
                         fill_opacity=opacity).move_to([self.x0 + self.width / 2, (self.ty(c0) + self.ty(c1)) / 2, 0])
