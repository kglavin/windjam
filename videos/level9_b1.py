"""Level 9, lesson B1: Example, a small jammer close in. Near the ground J/S goes with 40·log10 of distance: a 10 W
pack reaches a 200 W vehicle's J/S at 20 km by standing at 20 ÷ 20^(1/4) = 9.5 km."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

PACK_DB = 10 * np.log10(10 / 200)
PACK_KM = 20 / 20 ** 0.25


def js(km, offset):
    return offset + 40 * np.log10(20 / km)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Distance beats power")
        P = Plot(-6.0, 7.6, -2.6, 4.8, (2, 30), (-25, 25))
        xs = np.linspace(2.5, 30, 200)
        axes = VGroup(P.axes(), P.x_ticks([5, 10, 15, 20, 25, 30]), P.y_ticks([-20, -10, 0, 10, 20]),
                      label("jammer to receiver (km)", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.5),
                      label("J/S (dB, relative)", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        goal = DashedLine([P.x0, P.py(0), 0], [P.x0 + P.width, P.py(0), 0], dash_length=0.12, stroke_color=RED, stroke_width=2)
        veh = P.curve(xs, [js(x, 0) for x in xs], BLUE_C1)
        pack = P.curve(xs, [js(x, PACK_DB) for x in xs], AMBER_C2)
        self.caption("A 200 W vehicle jammer gets the J/S it needs from 20 km (the red line).")
        self.play(FadeIn(axes), Create(goal), Create(veh))
        self.play(FadeIn(Dot([P.px(20), P.py(0), 0], color=BLUE_C1)), FadeIn(label("vehicle, 200 W", BLUE_C1, 22).next_to([P.px(20), P.py(0), 0], UR, buff=0.1)))
        self.caption("A 10 W pack is 20 times weaker: 13 dB lower everywhere.")
        self.play(Create(pack))
        d = ValueTracker(20)
        dot = always_redraw(lambda: Dot([P.px(d.get_value()), P.py(js(d.get_value(), PACK_DB)), 0], color=AMBER_C2, radius=0.1))
        read = always_redraw(lambda: label(f"pack at {d.get_value():.1f} km: J/S {js(d.get_value(), PACK_DB):+.1f} dB", AMBER_C2, 24).move_to([4.6, 2.4, 0]))
        self.play(FadeIn(dot), FadeIn(read))
        self.caption("Near the ground, every halving of the distance gives 12 dB: the same as 16 times the power.")
        self.play(d.animate.set_value(PACK_KM), run_time=5)
        pad = Scratchpad(height=2.6, width=5.0, at=[4.45, -0.9, 0])
        self.play(*pad.show())
        rows = [("13 dB = 40 × log10(ratio)", WHITE), ("ratio = 10^(13 ÷ 40) = 2.1", YELLOW), (f"20 ÷ 2.1 = {PACK_KM:.1f} km", GREEN_C3)]
        self.caption(f"At {PACK_KM:.1f} km the pack matches the vehicle at 20 km.")
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.65, c, 22)))
        self.caption("A directional antenna adds its gain too: 10 dBi is worth 10 times the power, if it points at the receiver.")
        self.rule_card(["Near the ground, J/S changes by 40 × log10 of the distance ratio.", "Halving the distance is worth 16 times the power."], clear=True)
