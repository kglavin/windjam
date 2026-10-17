"""Level 1, lesson D1: Example, reading the code length. The curve is the app's (videos/data/level1-D1.ts)."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level1-D1")
CODE = DATA["code"]
LAGS = DATA["lagUs"]  # 0 .. 100 µs
MAG = DATA["mag"]
RC = DATA["chipRateMcps"]
N = len(CODE)
PERIOD = N / RC  # µs

# Signal rows: a window of two code periods
W = 2 * N
X0 = -4.8
XW = 11.2
U = XW / W
A = 0.28
SIG_Y = 2.85
STRIP_Y = 2.25
COPY_Y = 1.65

# Autocorrelation plot, 0 .. 100 µs
PU = XW / 100
PY0 = -2.85
PH = 3.2


def px(lag):
    return X0 + lag * PU


def py(m):
    return PY0 + m * PH


def code_at(t):
    return CODE[math.floor(t) % N]


def cuts(lag):
    """Segment edges in the window: chip edges of the signal and of the copy delayed by lag."""
    f = lag % 1
    pts = {0.0, float(W)}
    for k in range(W + 1):
        for c in (k, k + f):
            if 0 < c < W:
                pts.add(round(c, 6))
    return sorted(pts)


def copy_edges(lag):
    f = lag % 1
    return [0.0] + [k + f for k in range(W + 1) if 0 < k + f < W] + [float(W)]


def wave(edges, value, y, color, width=4):
    pts = []
    for a, b in zip(edges, edges[1:]):
        v = value((a + b) / 2)
        pts += [[X0 + a * U, y + v * A, 0], [X0 + b * U, y + v * A, 0]]
    return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(pts)


def mag_at(lag):
    i = lag / DATA["usPerSample"]
    k = min(int(i), len(MAG) - 2)
    return MAG[k] + (MAG[k + 1] - MAG[k]) * (i - k)


class LessonVideo(LessonScene):
    def construct(self):
        lag = ValueTracker(0)
        self.title_card("Reading the code length")

        # 1. The preamble: the code over and over
        sig_name = label("Signal", BLUE_C1, 24).move_to([X0 - 1.15, SIG_Y, 0])
        signal = wave(list(range(W + 1)), code_at, SIG_Y, BLUE_C1)
        sig_starts = VGroup(*[
            Line([X0 + t * U, SIG_Y + A + 0.05, 0], [X0 + t * U, SIG_Y + A + 0.3, 0], color=WHITE, stroke_width=3)
            for t in (0, N)
        ])
        self.caption("Every transmission starts with a preamble: the code, over and over.")
        self.play(FadeIn(sig_name), Create(signal), run_time=3)
        boxes = VGroup(*[
            Rectangle(width=N * U, height=2 * A + 0.2, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.15)
            .move_to([X0 + (k + 0.5) * N * U, SIG_Y, 0])
            for k in range(2)
        ])
        self.play(FadeIn(boxes[0]), FadeIn(sig_starts[0]))
        self.play(FadeOut(boxes[0]), FadeIn(boxes[1]), FadeIn(sig_starts[1]))
        self.play(FadeOut(boxes[1]))
        self.caption("So the signal looks like itself again after one code length.")

        # 2. A delayed copy and the plot
        copy_name = label("Delayed copy", GREEN_C3, 24).move_to([X0 - 1.15, COPY_Y, 0])
        copy = always_redraw(lambda: wave(copy_edges(lag.get_value()), lambda t: code_at(t - lag.get_value()), COPY_Y, GREEN_C3))
        copy_starts = always_redraw(lambda: VGroup(*[
            Line([X0 + t * U, COPY_Y - A - 0.05, 0], [X0 + t * U, COPY_Y - A - 0.3, 0], color=WHITE, stroke_width=3)
            for t in (lag.get_value() % N, lag.get_value() % N + N) if t <= W
        ]))

        def strip():
            l = lag.get_value()
            e = cuts(l)
            return VGroup(*[
                Rectangle(width=(b - a) * U, height=0.16, stroke_width=0,
                          fill_color=GREEN_C3 if code_at((a + b) / 2) == code_at((a + b) / 2 - l) else RED,
                          fill_opacity=0.85)
                .move_to([X0 + (a + b) / 2 * U, STRIP_Y, 0])
                for a, b in zip(e, e[1:])
            ])
        match = always_redraw(strip)
        match_name = label("Match", GREY, 20).move_to([X0 - 1.15, STRIP_Y, 0])

        self.caption("Autocorrelation compares the signal with a delayed copy of itself.")
        self.play(FadeIn(copy_name), FadeIn(copy), FadeIn(copy_starts), run_time=1.2)
        self.play(FadeIn(match_name), FadeIn(match))

        axis_x = Line([px(0), py(0), 0], [px(100), py(0), 0], color=GREY, stroke_width=2)
        axis_y = Line([px(0), py(0), 0], [px(0), py(1.05), 0], color=GREY, stroke_width=2)
        one_line = DashedLine([px(0), py(1), 0], [px(100), py(1), 0], color=GREY, stroke_width=1, dash_length=0.08).set_opacity(0.4)
        xt = VGroup(*[label(str(v), GREY, 20).move_to([px(v), py(0) - 0.25, 0]) for v in range(0, 101, 20)])
        yt = VGroup(label("0", GREY, 20).move_to([px(0) - 0.25, py(0), 0]), label("1", GREY, 20).move_to([px(0) - 0.25, py(1), 0]))
        x_title = label("delay (µs)", GREY, 20).move_to([X0 - 1.15, py(0) - 0.25, 0])
        y_title = label("how alike", AMBER_C2, 22).move_to([X0 - 1.15, py(0.5), 0])
        plot = VGroup(axis_x, axis_y, one_line, xt, yt, x_title, y_title)

        def trace():
            l = lag.get_value()
            pts = [[px(t), py(m), 0] for t, m in zip(LAGS, MAG) if t <= l]
            pts.append([px(l), py(mag_at(l)), 0])
            if len(pts) < 2:
                pts.append(pts[0])
            return VMobject(stroke_color=AMBER_C2, stroke_width=3).set_points_as_corners(pts)
        curve = always_redraw(trace)
        dot = always_redraw(lambda: Dot([px(lag.get_value()), py(mag_at(lag.get_value())), 0], radius=0.07, color=AMBER_C2))
        readout = always_redraw(lambda: label(f"delay {lag.get_value():.1f} µs", WHITE, 22).move_to([px(100) - 1.0, py(1) + 0.3, 0]))

        self.play(FadeIn(plot), FadeIn(curve), FadeIn(dot), FadeIn(readout))
        self.caption("No delay: every chip matches. That is 1 on the plot.")

        # 3. Slide the copy
        self.caption("Delay the copy by one chip and the chips stop lining up.")
        self.play(lag.animate.set_value(1), run_time=3, rate_func=linear)
        self.caption("About half match and half do not. They cancel: near 0.")
        self.play(lag.animate.set_value(6), run_time=3.5, rate_func=linear)
        self.caption("Keep sliding.")
        self.play(lag.animate.set_value(PERIOD - 3), run_time=5, rate_func=linear)
        self.caption("After one code length the copy lines up again.")
        self.play(lag.animate.set_value(PERIOD), run_time=3.5, rate_func=rate_functions.ease_out_sine)
        self.caption("It happens again after every code length.")
        self.play(lag.animate.set_value(100), run_time=8, rate_func=linear)

        # Freeze the trace and clear the rows
        for m in (curve, dot, readout, copy, copy_starts, match):
            m.clear_updaters()
        self.hold_caption()
        self.play(FadeOut(VGroup(signal, sig_name, sig_starts, copy, copy_name, copy_starts, match, match_name, dot, readout)))

        # 4. Measure: peak positions and spacing
        peaks = [k * PERIOD for k in range(4)]
        p = [f"{t:g}" for t in peaks]
        self.caption("The first peak is always at 0: no delay.")
        self.play(Indicate(yt[1], color=AMBER_C2), Flash([px(0), py(mag_at(0)), 0], color=AMBER_C2))
        marks = VGroup(*[
            DashedLine([px(t), py(0), 0], [px(t), py(mag_at(t)), 0], color=WHITE, stroke_width=1.5, dash_length=0.06)
            for t in peaks[1:]
        ])
        peak_lbls = VGroup(*[label(f"{s} µs", WHITE, 22).move_to([px(t), py(1) + 0.3, 0]) for t, s in zip(peaks[1:], p[1:])])
        self.caption(f"The next peaks are at {p[1]} µs, {p[2]} µs and {p[3]} µs.")
        self.play(LaggedStart(*[AnimationGroup(Create(m), FadeIn(l)) for m, l in zip(marks, peak_lbls)], lag_ratio=0.5))

        gaps = VGroup()
        for a, b in zip(peaks, peaks[1:]):
            arr = DoubleArrow([px(a), py(0.55), 0], [px(b), py(0.55), 0], buff=0, stroke_width=3, tip_length=0.15, color=BLUE_C1)
            gaps.add(VGroup(arr, label(f"{p[1]} µs", BLUE_C1, 22).next_to(arr, UP, buff=0.08)))
        self.caption(f"The spacing between peaks is the code period: {p[1]} µs.")
        self.play(LaggedStart(*[GrowFromCenter(g) for g in gaps], lag_ratio=0.4))

        # 5. Scratchpad
        graph = VGroup(plot, curve, marks, peak_lbls, gaps)
        self.clear_caption()
        self.play(graph.animate.scale(0.5).to_edge(LEFT, buff=0.4).set_y(0.9))
        pad = Scratchpad(height=5.2)
        self.play(*pad.show())

        l1 = pad.line(f"Code period = {p[1]} µs", 0, BLUE_C1, 28)
        self.play(TransformFromCopy(gaps[0][1], l1), run_time=1.2)
        self.wait(1.5)
        l2 = pad.line(f"Chip rate = {RC:g} Mcps", 1, WHITE, 28)
        note = label("measured from the spectrum in C1", GREY, 20).next_to(l2, DOWN, buff=0.1).align_to(l2, LEFT)
        self.play(FadeIn(l2, shift=LEFT * 0.2), FadeIn(note))
        self.wait(2.5)
        l3 = pad.line("Code length = period × chip rate", 2.5, WHITE, 28)
        self.play(Write(l3), run_time=1.5)
        self.wait(2)
        l4 = pad.line(f"= {p[1]} µs × {RC:g} Mcps", 3.5, WHITE, 28)
        self.play(FadeIn(l4, shift=DOWN * 0.15))
        self.wait(1.5)
        unit = pad.note_below("1 Mcps = 1 million chips per second = 1 chip per µs")
        self.play(FadeIn(unit))
        self.wait(4)
        l5 = pad.line(f"= {p[1]} µs × {RC:g} chip per µs", 4.5, WHITE, 28)
        self.play(FadeIn(l5, shift=DOWN * 0.15))
        self.wait(2)
        l6 = pad.line(f"= {N} chips", 5.5, AMBER_C2, 28)
        box = SurroundingRectangle(l6, color=AMBER_C2, buff=0.12, corner_radius=0.08)
        self.play(FadeIn(l6, shift=DOWN * 0.15))
        self.play(Create(box))
        self.wait(2)
        self.play(FadeOut(unit))
        self.rule_card(["Peaks repeat every code period.", "Chips in the code = period × chip rate."])
