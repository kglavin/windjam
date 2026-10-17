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
