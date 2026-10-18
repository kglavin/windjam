"""Level 0, lesson J1: Jammer to signal ratio. A power ladder in dBm: each transmitter's power down its path loss to
what arrives at the receiver; J/S is the gap. Open-space loss, 6 dB less per halving of distance."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

LO, HI = -80, 50
K = 5.6 / (HI - LO)     # scene units per dB
BASE = -2.75
SX, JX = -1.6, 1.8      # the two columns
S_TX, S_LOSS = 40, 110  # signal: 10 W, path loss
J_TX, J_LOSS = 30, 90   # jammer: 1 W, path loss


def y(dbm):
    return BASE + (dbm - LO) * K


def dbm(v):
    return f"{v:+d} dBm".replace("+0", "0").replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Jammer to signal ratio")
        axis = Line([-4.6, y(LO), 0], [-4.6, y(HI), 0], color=GREY, stroke_width=2)
        ticks = VGroup(*[VGroup(Line([-4.72, y(v), 0], [-4.48, y(v), 0], color=GREY, stroke_width=2),
                                label(dbm(v), GREY, 18).next_to([-4.75, y(v), 0], LEFT, buff=0.1)) for v in range(-80, 51, 20)])
        name = label("power (dBm)", GREY, 20).move_to([-5.6, y(HI) + 0.3, 0])
        self.caption("A jammer transmits on purpose to drown out a link.")
        self.play(Create(axis), FadeIn(ticks), FadeIn(name))

        def column(x, tx, loss, color, who):
            top = Dot([x, y(tx), 0], radius=0.09, color=color)
            top_t = label(f"{who}: {dbm(tx)}", color, 22).next_to(top, UP, buff=0.12)
            arr = Arrow([x, y(tx), 0], [x, y(tx - loss), 0], buff=0, stroke_width=4, tip_length=0.18, color=color)
            arr_t = label(f"path loss −{loss} dB", color, 20).next_to(arr, RIGHT, buff=0.15)
            bot = Line([x - 0.6, y(tx - loss), 0], [x + 0.6, y(tx - loss), 0], color=color, stroke_width=5)
            bot_t = label(f"arrives: {dbm(tx - loss)}", color, 22).next_to(bot, DOWN, buff=0.12)
            return top, top_t, arr, arr_t, bot, bot_t

        s = column(SX, S_TX, S_LOSS, BLUE_C1, "transmitter, 10 W")
        j = column(JX, J_TX, J_LOSS, RED, "jammer, 1 W")
        self.caption("What counts is what arrives at the enemy receiver. Start from each transmitter's power.")
        self.play(FadeIn(s[0]), FadeIn(s[1]), FadeIn(j[0]), FadeIn(j[1]))
        self.caption("Subtract each one's path loss. The transmitter is far away; the jammer is closer.")
        self.play(GrowArrow(s[2]), FadeIn(s[3]), run_time=1.5)
        self.play(FadeIn(s[4]), FadeIn(s[5]))
        self.play(GrowArrow(j[2]), FadeIn(j[3]), run_time=1.5)
        self.play(FadeIn(j[4]), FadeIn(j[5]))

        S, J = S_TX - S_LOSS, J_TX - J_LOSS
        guide = DashedLine([SX + 0.6, y(S), 0], [JX + 1.6, y(S), 0], color=BLUE_C1, stroke_width=1.5, dash_length=0.07)
        gap = DoubleArrow([JX + 1.6, y(S), 0], [JX + 1.6, y(J), 0], buff=0, stroke_width=3, tip_length=0.12, color=YELLOW)
        gap_t = label(f"J/S = {J} − ({S}) = +{J - S} dB".replace("-", "−"), YELLOW, 24).next_to(gap, RIGHT, buff=0.15)
        self.caption("J/S compares them in dB: J − S.")
        self.play(Create(guide), GrowFromCenter(gap), FadeIn(gap_t))
        self.caption("The weaker jammer wins by 10 dB, because it is much closer.")

        # Closer still
        J2 = J + 6
        self.caption("Halve the jammer's distance: 6 dB less path loss in open space.")
        new_arr = Arrow([JX, y(J_TX), 0], [JX, y(J2), 0], buff=0, stroke_width=4, tip_length=0.18, color=RED)
        new_bot = Line([JX - 0.6, y(J2), 0], [JX + 0.6, y(J2), 0], color=RED, stroke_width=5)
        new_gap = DoubleArrow([JX + 1.6, y(S), 0], [JX + 1.6, y(J2), 0], buff=0, stroke_width=3, tip_length=0.12, color=YELLOW)
        self.play(Transform(j[2], new_arr), Transform(j[4], new_bot), Transform(gap, new_gap),
                  Transform(j[3], label(f"path loss −{J_LOSS - 6} dB", RED, 20).next_to(new_arr, RIGHT, buff=0.15)),
                  Transform(j[5], label(f"arrives: {dbm(J2)}", RED, 22).next_to(new_bot, DOWN, buff=0.12)),
                  Transform(gap_t, label(f"J/S = +{J2 - S} dB", YELLOW, 24).next_to(new_gap, RIGHT, buff=0.15)), run_time=2)
        self.caption("Against an ordinary digital link about J/S = 0 dB is enough. Spread spectrum changes that.")
        self.rule_card(["J/S = jammer power − signal power, both where they arrive, in dB.", "Distance matters as much as transmitter power."], clear=True)
