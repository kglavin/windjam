"""Level 0, lesson E1: Decibels. A power ladder: dB on the left, times on the right."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

LX = -2.0                      # the ladder's line
K = 0.165                      # scene units per dB


def y_of(db, base):
    return base + db * K


# The rule-of-thumb values the lesson uses (3 dB is taken as exactly 2 times).
TIMES = {-10: "0.1 ×", -7: "0.2 ×", -3: "0.5 ×", 0: "1 ×", 3: "2 ×", 10: "10 ×", 13: "20 ×", 20: "100 ×"}


def times(db):
    return TIMES[db]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Decibels without fear")
        self.caption("Radio powers range from kilowatts down to less than a picowatt.")
        span = VGroup(label("1 kW = 1,000 W", AMBER_C2, 30), label("1 pW = 0.000 000 000 001 W", BLUE_C1, 30)).arrange(DOWN, buff=0.5)
        self.play(FadeIn(span))
        self.caption("Decibels turn the multiplying into adding: dB = 10 × log10(power ratio).")
        self.play(FadeOut(span))

        base = -0.65
        line = Line([LX, y_of(-10, base) - 0.2, 0], [LX, y_of(20, base) + 0.2, 0], color=GREY, stroke_width=2)
        marks = [-10, -7, -3, 0, 3, 10, 13, 20]
        ticks = VGroup(*[VGroup(Line([LX - 0.12, y_of(d, base), 0], [LX + 0.12, y_of(d, base), 0], color=GREY, stroke_width=2),
                                label(f"{d:+d} dB".replace("+0", "0").replace("-", "−"), WHITE, 22).next_to([LX - 0.15, y_of(d, base), 0], LEFT, buff=0.15),
                                label(times(d), AMBER_C2, 22).next_to([LX + 0.15, y_of(d, base), 0], RIGHT, buff=0.15))
                         for d in marks])
        self.play(Create(line), FadeIn(ticks[3]))

        def step(a, b, color, text):
            arr = Arrow([LX + 1.6, y_of(a, base), 0], [LX + 1.6, y_of(b, base), 0], buff=0, stroke_width=4, tip_length=0.15, color=color)
            return VGroup(arr, label(text, color, 22).next_to(arr, RIGHT, buff=0.2))

        self.caption("Remember four. +3 dB doubles the power.")
        s1 = step(0, 3, GREEN_C3, "+3 dB: × 2")
        self.play(GrowArrow(s1[0]), FadeIn(s1[1]), FadeIn(ticks[4]))
        self.caption("−3 dB halves it.")
        s2 = step(0, -3, RED, "−3 dB: × 0.5")
        self.play(GrowArrow(s2[0]), FadeIn(s2[1]), FadeIn(ticks[2]))
        self.caption("+10 dB is 10 times. −10 dB is a tenth.")
        self.play(FadeOut(s1), FadeOut(s2))
        s3 = step(0, 10, GREEN_C3, "+10 dB: × 10")
        s4 = step(0, -10, RED, "−10 dB: × 0.1")
        self.play(GrowArrow(s3[0]), FadeIn(s3[1]), GrowArrow(s4[0]), FadeIn(s4[1]), FadeIn(ticks[5]), FadeIn(ticks[0]))
        self.hold_caption()
        self.play(FadeOut(s3), FadeOut(s4))

        # Worked examples
        self.caption("Build the rest from those. +13 dB: first +10, then +3.")
        a1 = step(0, 10, GREEN_C3, "+10: × 10")
        a2 = Arrow([LX + 3.6, y_of(10, base), 0], [LX + 3.6, y_of(13, base), 0], buff=0, stroke_width=4, tip_length=0.15, color=GREEN_C3)
        a2t = label("+3: × 2", GREEN_C3, 22).next_to(a2, RIGHT, buff=0.2)
        self.play(GrowArrow(a1[0]), FadeIn(a1[1]))
        self.play(GrowArrow(a2), FadeIn(a2t), FadeIn(ticks[6]))
        self.caption("10 × 2 = 20 times.")
        self.play(Indicate(ticks[6][2], color=AMBER_C2))
        self.play(FadeOut(VGroup(a1, a2, a2t)))
        self.caption("−7 dB: first −10, then +3. 0.1 × 2 = 0.2 times.")
        b1 = step(0, -10, RED, "−10: × 0.1")
        b2 = Arrow([LX + 3.6, y_of(-10, base), 0], [LX + 3.6, y_of(-7, base), 0], buff=0, stroke_width=4, tip_length=0.15, color=GREEN_C3)
        b2t = label("+3: × 2", GREEN_C3, 22).next_to(b2, RIGHT, buff=0.2)
        self.play(GrowArrow(b1[0]), FadeIn(b1[1]))
        self.play(GrowArrow(b2), FadeIn(b2t), FadeIn(ticks[1]))
        self.play(Indicate(ticks[1][2], color=AMBER_C2))
        self.hold_caption()
        self.play(FadeOut(VGroup(b1, b2, b2t)), FadeIn(ticks[7]))
        self.caption("+20 dB = +10 and +10: 10 × 10 = 100 times.")
        self.play(Indicate(ticks[7][2], color=AMBER_C2))

        # dBm
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        rows = VGroup(*[VGroup(label(a, WHITE, 30), label("=", GREY, 30), label(b, AMBER_C2, 30)).arrange(RIGHT, buff=0.4)
                        for a, b in (("+30 dBm", "1 W"), ("0 dBm", "1 mW"), ("−30 dBm", "1 µW"), ("−114 dBm", "about 4 × 10⁻¹⁵ W"))])
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.4).move_to([0, 0.6, 0])
        self.caption("dBm is an amount of power, compared with 1 milliwatt.")
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.2) for r in rows[:3]], lag_ratio=0.4))
        self.caption("Each 30 dB is a thousand times. dB is a ratio; dBm is a power.")
        self.play(FadeIn(rows[3], shift=RIGHT * 0.2))
        self.rule_card(["+3 dB doubles, +10 dB is ten times.", "Add dB instead of multiplying."])
