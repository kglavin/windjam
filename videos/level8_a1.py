"""Level 8, lesson A1: Example, a 5-stage register. The example code's register (taps 5 and 3) steps: bits shift, the
last stage comes out as a chip, the taps' sum goes in at the front; after 31 steps it is back where it started.
Steps from registerSteps."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level8-A1")
R = D["register"]
STEPS = R["steps"]
DEG, TAPS = R["degree"], R["taps"]
BOX, X0, Y = 1.0, -3.2, 1.2


def cx(i):
    return X0 + i * BOX + BOX / 2


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("A shift register")
        boxes = VGroup(*[Square(BOX * 0.9, stroke_color=AMBER_C2 if (i + 1) in TAPS else GREY, stroke_width=4 if (i + 1) in TAPS else 2).move_to([cx(i), Y, 0])
                         for i in range(DEG)])
        nums = VGroup(*[label(str(i + 1), GREY, 18).move_to([cx(i), Y - 0.65, 0]) for i in range(DEG)])
        adder = Circle(radius=0.28, stroke_color=AMBER_C2).move_to([X0 - 0.9, Y + 1.3, 0])
        plus = label("+", AMBER_C2, 30).move_to(adder)
        wires = VGroup(*[Line([cx(t - 1), Y + BOX * 0.45, 0], [cx(t - 1), Y + 1.3, 0]) for t in TAPS],
                       Line([X0 - 0.62, Y + 1.3, 0], [cx(max(TAPS) - 1), Y + 1.3, 0]),
                       Line([X0 - 0.9, Y + 1.02, 0], [X0 - 0.9, Y, 0]), Arrow([X0 - 0.9, Y, 0], [X0 + 0.05, Y, 0], buff=0, stroke_width=3),
                       Arrow([X0 + DEG * BOX - 0.05, Y, 0], [X0 + DEG * BOX + 0.9, Y, 0], buff=0, stroke_width=3)).set_color(AMBER_C2)
        out_l = label("chips out", GREY, 22).move_to([X0 + DEG * BOX + 1.6, Y, 0])
        self.caption("A shift register: 5 stages, each holding a 0 or a 1.")
        self.play(FadeIn(boxes), FadeIn(nums))
        bits = VGroup(*[label(str(b), WHITE, 34).move_to([cx(i), Y, 0]) for i, b in enumerate(STEPS[0]["stages"])])
        self.play(FadeIn(bits))
        self.caption("Stages 5 and 3 are the taps. Their sum, counted modulo 2 (1 + 1 = 0), feeds back to the front.")
        self.play(Create(wires), FadeIn(adder), FadeIn(plus), FadeIn(out_l))

        chip_row = VGroup()
        counter = label("step 0", YELLOW, 24).move_to([X0 + 2.0, Y + 2.2, 0])
        self.add(counter)

        def step(k, rt):
            s, nxt = STEPS[k], STEPS[k + 1]
            new = VGroup(*[label(str(b), WHITE, 34).move_to([cx(i), Y, 0]) for i, b in enumerate(nxt["stages"])])
            chip = label(str(s["out"]), BLUE_C1, 22).move_to([-6.3 + (k % 31) * 0.4, -1.4, 0])
            chip_row.add(chip)
            fb = label(str(s["feedback"]), YELLOW, 26).move_to(adder.get_center() + UP * 0.55)
            self.play(FadeIn(fb, shift=DOWN * 0.1), run_time=rt * 0.3)
            self.play(Transform(bits, new), FadeIn(chip, shift=DOWN * 0.3), FadeOut(fb),
                      Transform(counter, label(f"step {k + 1}", YELLOW, 24).move_to(counter)), run_time=rt * 0.7)

        self.caption("Each step: every bit moves one stage along, stage 5 comes out as a chip, the sum comes in at stage 1.")
        for k in range(4):
            step(k, 1.4)
        self.caption("Step by step the chips come out: the code.")
        for k in range(4, 10):
            step(k, 0.6)
        for k in range(10, 31):
            step(k, 0.25)
        self.caption("After 31 steps the register holds exactly what it started with, so the chips repeat.")
        self.play(Indicate(bits, color=YELLOW))
        self.caption("5 bits have 32 patterns. All zeros would stay all zeros, so it never comes up: 2^5 − 1 = 31.")
        ones = sum(s["out"] for s in STEPS[:31])
        self.caption(f"In one period: {ones} ones and {31 - ones} zeros, almost balanced, like noise.")
        self.rule_card(["A register of n stages, with the right taps, repeats every 2^n − 1 chips.", "Its code is called an m-sequence."], clear=True)
