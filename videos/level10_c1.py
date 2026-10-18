"""Level 10, lesson C1: Example, a code out of the noise. The estimate of the example code (31 chips, −6 dB per chip)
as more code-length pieces are averaged (discoverCode): wrong chips red, right ones green."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level10-C1")["discover"]
CODE = D["code"]
STEPS = D["steps"]


def chips_row(est, y):
    flip = 1 if sum(1 for e, c in zip(est, CODE) if e == c) >= 16 else -1
    return VGroup(*[Square(0.34, stroke_width=0, fill_color=GREEN_C3 if e * flip == c else RED, fill_opacity=0.85)
                    .move_to([-5.7 + i * 0.38, y, 0]) for i, (e, c) in enumerate(zip(est, CODE))])


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Finding an unknown code")
        self.caption("You capture a station whose code you do not know. Its chips are 6 dB below the noise.")
        noise = VGroup(*[Line([-6, y, 0], [6, y, 0]) for y in []])
        pieces = VGroup(*[Rectangle(width=1.1, height=0.4, stroke_color=GREY).move_to([-5.4 + i * 1.2, 2.6, 0]) for i in range(10)])
        self.play(LaggedStart(*[FadeIn(p) for p in pieces], lag_ratio=0.1), FadeIn(noise))
        self.caption("Cut what you hear into pieces one code period long. Every piece holds the same code, flipped by its bit, plus noise.")
        self.wait(1)
        self.caption("Average how each chip goes with every other: noise averages away, the code's pattern stays.")
        name = label("estimate (green = right chip)", GREY, 20).move_to([-0.2, 1.5, 0])
        row = chips_row(STEPS[0]["estimate"], 0.9)
        count = label(f"{STEPS[0]['pieces']} pieces: {STEPS[0]['agree']} of 31 right", YELLOW, 26).move_to([0, -0.2, 0])
        self.play(FadeIn(name), FadeIn(row), FadeIn(count))
        for s in STEPS[1:5]:
            self.play(Transform(row, chips_row(s["estimate"], 0.9)), Transform(count, label(f"{s['pieces']} pieces: {s['agree']} of 31 right", YELLOW, 26).move_to([0, -0.2, 0])), run_time=1.2)
            self.wait(0.6)
        self.caption("From 20 pieces on, every chip is right: the code, found blind.")
        self.wait(1)
        self.caption("A long code never repeats within the capture, so there are no matching pieces to average.")
        self.rule_card(["A short code can be found by averaging code-length pieces;", "the weaker the signal, the more pieces. A long code cannot."], clear=True)
