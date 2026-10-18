"""Level 11, lesson D1: Many copies, fades and wrong bearings. The level along 30 m of street with one path and with a
rake of 2 (fadingTrack), then a bearing taken off a wall (reflectionBearingErrorDeg)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level11-D1")
F = D["fading"]
B = D["bearing"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Fades and wrong bearings")
        P = Plot(-5.6, 11.6, -2.2, 4.6, (0, 30), (-30, 10))
        axes = VGroup(P.axes(), P.x_ticks([0, 10, 20, 30]), P.y_ticks([10, 0, -10, -20, -30]),
                      label("metres along the street", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45),
                      label("dB against the average", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        lines = VGroup(*[DashedLine([P.x0, P.py(v), 0], [P.x0 + P.width, P.py(v), 0], dash_length=0.1, stroke_color=YELLOW, stroke_width=1.5) for v in (-10, -20)])
        self.caption("In a street, copies off the walls add up or cancel, spot by spot.")
        self.play(FadeIn(axes), FadeIn(lines))
        c = P.curve(F["m"], F["one"], BLUE_C1, 2.5)
        info = label(f"one path: more than 10 dB down {100 * F['p1']:.1f}% of the time", BLUE_C1, 24).move_to([0, 3.0, 0])
        self.play(Create(c), run_time=3)
        self.caption("No direct path: 10 dB down 1 time in 10, 20 dB down 1 time in 100.")
        self.play(FadeIn(info))
        self.caption("A rake despreads copies a chip or more apart, and adds them up.")
        self.play(Transform(c, P.curve(F["m"], F["two"], GREEN_C3, 2.5)),
                  Transform(info, label(f"rake of 2 paths: {100 * F['p2']:.1f}%, about 1 time in 60", GREEN_C3, 24).move_to([0, 3.0, 0])), run_time=2)
        self.caption("A deep fade now needs both copies low at once.")
        self.wait(1)
        self.play(*[FadeOut(m) for m in (axes, lines, c, info)])

        T = TownView()
        site, tx, wall = B["site"], B["tx"], B["wall"]
        s, t, w = (site["xKm"], site["yKm"]), (tx["xKm"], tx["yKm"]), (wall["xKm"], wall["yKm"])
        self.play(FadeIn(T.blocks()))
        nodes = VGroup(T.radio(*s, "DF site", AMBER_C2, DR), T.radio(*t, "transmitter", RED, UR))
        mid = ((s[0] + t[0]) / 2, (s[1] + t[1]) / 2)
        bldg = Rectangle(width=0.36 * T.s, height=0.3 * T.s, stroke_width=0, fill_color=GREY, fill_opacity=0.75).move_to(T.p(*mid))
        wall_m = Line(T.p(w[0] + 0.12, w[1] - 0.1), T.p(w[0] - 0.08, w[1] + 0.12), stroke_color=WHITE, stroke_width=6)
        self.caption("A DF site takes a bearing on a transmitter. A tall block hides the direct path.")
        self.play(FadeIn(nodes), FadeIn(bldg))
        bounce = VMobject(stroke_color=VIOLET, stroke_width=3).set_points_as_corners([T.p(*t), T.p(*w), T.p(*s)])
        self.caption("The signal reaches the site off a wall.")
        self.play(FadeIn(wall_m), Create(bounce), run_time=2)
        ray = Line(T.p(*s), T.p(s[0] + 1.6 * np.sin(np.radians(B["toWall"])), s[1] + 1.6 * np.cos(np.radians(B["toWall"]))), stroke_color=BLUE_C1, stroke_width=3)
        true = DashedLine(T.p(*s), T.p(*t), dash_length=0.1, stroke_color=GREY, stroke_width=2)
        self.caption("The site points where the signal arrives from: the wall, not the transmitter.")
        self.play(Create(ray))
        self.play(Create(true))
        r = 0.9
        arc = Arc(radius=r, start_angle=np.radians(90 - B["toTx"]), angle=-np.radians(B["toWall"] - B["toTx"]), arc_center=T.p(*s), stroke_color=YELLOW, stroke_width=3)
        sh = B["shown"]
        calc = VGroup(label(f"to the wall: {sh['toWall']}°", BLUE_C1, 24), label(f"to the transmitter: {sh['toTx']}°", GREY, 24),
                      label(f"error: {sh['error']}°", YELLOW, 28)).arrange(DOWN, aligned_edge=LEFT, buff=0.2).move_to([3.9, 1.0, 0])
        self.caption("The error is the angle between them. A fix built on it lands near the wall.")
        self.play(Create(arc), FadeIn(calc))
        self.caption("For TDOA, the copies smear the correlation peak.")
        self.wait(1)
        self.rule_card(["One path fades 10 dB 1 time in 10, 20 dB 1 time in 100.", "A rake makes deep fades rarer.", "A bearing off a wall points at the wall."], clear=True)
