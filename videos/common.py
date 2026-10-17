"""Shared look for the lesson explainer videos (docs/design-lesson-videos.md): the app's colours, captions held
long enough to read, labels, brackets and the scratchpad panel."""
import json
from pathlib import Path

from manim import *

# The figure colours in src/styles.css (.inst-svg .c1/.c2/.c3) and the instrument background.
BLUE_C1 = "#60a5fa"
AMBER_C2 = "#f59e0b"
GREEN_C3 = "#34d399"
RED = "#f87171"
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
        new = label(text, size=28).to_edge(DOWN, buff=0.3)
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

    def rule_card(self, lines, hold=5):
        """The lesson's rule at the end, then fade everything."""
        self.clear_caption()
        rule = VGroup(*[label(t, WHITE, 28) for t in lines]).arrange(DOWN, buff=0.15).to_edge(DOWN, buff=0.35)
        self.play(FadeIn(rule, shift=UP * 0.2))
        self.wait(hold)
        self.play(*[FadeOut(m) for m in self.mobjects])


class Scratchpad:
    """The worked calculation panel on the right; line(i) places text on row i."""

    def __init__(self, height=5.4, width=6.2):
        self.panel = RoundedRectangle(width=width, height=height, corner_radius=0.15, stroke_color=GREY,
                                      stroke_width=1.5, fill_color=PANEL, fill_opacity=1).to_corner(UR, buff=0.4)
        self.title = (label("Scratchpad", GREY, 24).next_to(self.panel.get_top(), DOWN, buff=0.25)
                      .align_to(self.panel, LEFT).shift(RIGHT * 0.35))

    def show(self):
        return [FadeIn(self.panel), FadeIn(self.title)]

    def line(self, text, i, color=WHITE, size=26):
        return (label(text, color, size).align_to(self.panel, LEFT).shift(RIGHT * 0.35)
                .set_y(self.panel.get_top()[1] - 0.95 - i * 0.6))

    def note_below(self, text):
        return label(text, GREY, 24).next_to(self.panel, DOWN, buff=0.3).set_x(0)
