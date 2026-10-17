"""Level 1, lesson A1: Bits become chips. The bits and code are the app figure's (videos/data/level1-A1.ts)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level1-A1")
BITS = DATA["bits"]
CODE = DATA["code"]  # one code period
N = len(CODE)

X0 = -4.6
U = 11.0 / (len(BITS) * N)  # scene units per microsecond
A = 0.55
ROW_Y = {"bits": 2.0, "code": 0.0, "sent": -2.0}


def step_wave(values, dur, x_start, y, color, width=5):
    pts = []
    x = x_start
    for v in values:
        pts.append([x, y + v * A, 0])
        x += dur * U
        pts.append([x, y + v * A, 0])
    return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(pts)


def bit_x(i):
    return X0 + i * N * U


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Bits become chips")

        # Zero lines and row labels
        axes = VGroup(*[
            DashedLine([X0, y, 0], [X0 + len(BITS) * N * U, y, 0], stroke_width=1.5, color=GREY, dash_length=0.08)
            for y in ROW_Y.values()
        ]).set_opacity(0.5)
        names = {"bits": label("Bits", BLUE_C1), "code": label("Code", GREEN_C3), "sent": label("Sent", AMBER_C2)}
        for k, m in names.items():
            m.move_to([X0 - 1.25, ROW_Y[k], 0])

        # 1. The bits
        self.caption("A radio link sends bits.")
        bits = step_wave(BITS, N, X0, ROW_Y["bits"], BLUE_C1)
        bit_vals = VGroup(*[
            label("+1" if b > 0 else "−1", BLUE_C1, 24).move_to([bit_x(i) + N * U / 2, ROW_Y["bits"] + A + 0.3, 0])
            for i, b in enumerate(BITS)
        ])
        self.play(FadeIn(axes[0]), FadeIn(names["bits"]), Create(bits), run_time=2)
        self.play(LaggedStart(*[FadeIn(v, shift=DOWN * 0.15) for v in bit_vals], lag_ratio=0.3))

        bit_brace = bracket(bit_x(0), bit_x(1), ROW_Y["bits"] - A - 0.3, color=BLUE_C1)
        bit_brace_txt = label(f"{N} µs", BLUE_C1, 22).next_to(bit_brace, DOWN, buff=0.08)
        self.caption(f"Each bit lasts {N} µs.")
        self.play(GrowFromCenter(bit_brace), FadeIn(bit_brace_txt))
        self.hold_caption()
        self.play(FadeOut(bit_brace), FadeOut(bit_brace_txt))

        # 2. The code: one period under the first bit, chip by chip
        self.caption("Spread spectrum multiplies every bit by a fast pattern: the code.")
        code0 = step_wave(CODE, 1, bit_x(0), ROW_Y["code"], GREEN_C3)
        self.play(FadeIn(axes[1]), FadeIn(names["code"]), Create(code0), run_time=2)

        self.caption(f"It has {N} short pulses called chips. Each lasts 1 µs.")
        nums = VGroup(*[
            label(str(k + 1), GREEN_C3, 20).move_to([bit_x(0) + (k + 0.5) * U, ROW_Y["code"] + A + 0.25, 0])
            for k in range(N)
        ])
        chip_boxes = [
            Rectangle(width=U, height=2 * A + 0.2, stroke_width=0, fill_color=GREEN_C3, fill_opacity=0.25)
            .move_to([bit_x(0) + (k + 0.5) * U, ROW_Y["code"], 0])
            for k in range(N)
        ]
        for k in range(N):
            self.play(FadeIn(chip_boxes[k]), FadeIn(nums[k]), run_time=0.35)
            self.play(FadeOut(chip_boxes[k]), run_time=0.2)
        chip_brace = bracket(bit_x(0), bit_x(0) + U, ROW_Y["code"] - A - 0.3, color=GREEN_C3)
        chip_brace_txt = label("1 µs", GREEN_C3, 22).next_to(chip_brace, DOWN, buff=0.08)
        self.play(GrowFromCenter(chip_brace), FadeIn(chip_brace_txt))
        self.hold_caption()
        self.play(FadeOut(chip_brace), FadeOut(chip_brace_txt), FadeOut(nums))

        # 3. The code repeats for every bit
        self.caption("The same code repeats for every bit.")
        codes = [code0]
        for i in range(1, len(BITS)):
            c = code0.copy()
            self.play(c.animate.shift(RIGHT * (bit_x(i) - bit_x(0))), run_time=0.7)
            codes.append(c)

        # 4. Sent = bit x code, one bit at a time
        self.caption("What the transmitter sends: bit × code.")
        self.play(FadeIn(axes[2]), FadeIn(names["sent"]))
        col_h = ROW_Y["bits"] - ROW_Y["sent"] + 2 * A + 0.9
        sent = []
        prev_col = None
        for i, b in enumerate(BITS):
            col = Rectangle(width=N * U, height=col_h, stroke_color=WHITE, stroke_width=1.5,
                            fill_color=WHITE, fill_opacity=0.06)
            col.move_to([bit_x(i) + N * U / 2, (ROW_Y["bits"] + ROW_Y["sent"]) / 2 + 0.25, 0])
            if prev_col is None:
                self.play(FadeIn(col))
                prev_col = col
            else:
                self.play(Transform(prev_col, col), run_time=0.6)

            s = codes[i].copy()
            if i == 0:
                self.caption("A +1 bit sends the code as it is.")
            if i == 1:
                self.caption("A −1 bit sends it upside down.")
            self.play(s.animate.shift(DOWN * (ROW_Y["code"] - ROW_Y["sent"])).set_color(AMBER_C2), run_time=1.2)
            if b < 0:
                self.play(Rotate(s, PI, axis=RIGHT, about_point=[bit_x(i) + N * U / 2, ROW_Y["sent"], 0]), run_time=1.1)
            sent.append(s)
            self.wait(0.6)
        # One continuous wave, so the edges between bits are drawn too
        sent_wave = step_wave([b * c for b in BITS for c in CODE], 1, X0, ROW_Y["sent"], AMBER_C2)
        self.hold_caption()
        self.play(FadeOut(prev_col), FadeIn(sent_wave), *[FadeOut(m) for m in sent], run_time=0.6)

        # 5. Count the chips
        total = len(BITS) * N
        self.caption("Count what was sent.")
        tracker = ValueTracker(0)
        pos = [X0 - 1.25, ROW_Y["sent"] - 0.6, 0]
        counter = always_redraw(lambda: label(f"{int(tracker.get_value())} chips", AMBER_C2, 28).move_to(pos))
        sweep = Line([X0, ROW_Y["sent"] - A - 0.15, 0], [X0, ROW_Y["sent"] + A + 0.15, 0], color=WHITE, stroke_width=3)
        sweep.add_updater(lambda m: m.set_x(X0 + tracker.get_value() * U))
        self.play(FadeIn(counter), FadeIn(sweep))
        self.play(tracker.animate.set_value(total), run_time=4, rate_func=linear)
        self.play(FadeOut(sweep))
        self.caption(f"{len(BITS)} bits became {total} chips: {N} chips for every bit.")

        # 6. Chips are N times faster than bits
        b_brace = bracket(bit_x(3), bit_x(4), ROW_Y["bits"] + A + 0.3, UP, BLUE_C1)
        b_txt = label(f"one bit: {N} µs", BLUE_C1, 22).next_to(b_brace, UP, buff=0.08)
        c_brace = bracket(bit_x(3), bit_x(3) + U, ROW_Y["sent"] - A - 0.3, color=AMBER_C2)
        c_txt = label("one chip: 1 µs", AMBER_C2, 22).next_to(c_brace, DOWN, buff=0.08)
        self.hold_caption()
        self.play(FadeOut(bit_vals[3]), GrowFromCenter(b_brace), FadeIn(b_txt), GrowFromCenter(c_brace), FadeIn(c_txt))
        self.caption(f"Chips go by {N} times faster than bits.")
        self.hold_caption()
        self.wait(2)
        self.play(*[FadeOut(m) for m in self.mobjects])
