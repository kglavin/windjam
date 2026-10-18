"""Level 11, lesson A1: Blocked, reflected, close together. A clear path in open country, then a town: the direct path
blocked, copies over the rooftops, round a corner and off a wall, and friendly and civilian radios close by."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403



class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Why towns are different")
        a, b = np.array([-4.5, 0.6, 0]), np.array([4.5, 0.6, 0])
        ground = Line([-6.5, -0.2, 0], [6.5, -0.2, 0], stroke_color=GREY, stroke_width=2)
        tx = VGroup(Dot(a, color=BLUE_C1), label("transmitter", BLUE_C1, 22).next_to(a, UP))
        rx = VGroup(Dot(b, color=BLUE_C1), label("receiver", BLUE_C1, 22).next_to(b, UP))
        path = Line(a, b, stroke_color=GREEN_C3, stroke_width=4)
        self.caption("In open country a signal has a clear path and loses a known amount with distance.")
        self.play(FadeIn(ground), FadeIn(tx), FadeIn(rx))
        self.play(Create(path))
        rule = label("12 dB per doubling near the ground (level 0, F1)", GREEN_C3, 26).move_to([0, -1.2, 0])
        self.play(FadeIn(rule))
        self.wait(2)
        self.play(*[FadeOut(m) for m in (ground, tx, rx, path, rule)])

        T = TownView()
        etx, erx = (0.48, 1.6), (1.44, 0.64)
        self.caption("A town: blocks of buildings with streets between them.")
        self.play(FadeIn(T.blocks()))
        nodes = VGroup(T.radio(*etx, "enemy transmitter", RED, UR), T.radio(*erx, "enemy receiver", RED, DR))
        self.play(FadeIn(nodes))
        direct = DashedLine(T.p(*etx), T.p(*erx), dash_length=0.1, stroke_color=GREY, stroke_width=2)
        mid = (np.array(T.p(*etx)) + np.array(T.p(*erx))) / 2
        cross = VGroup(Line(mid + [-0.18, -0.18, 0], mid + [0.18, 0.18, 0]), Line(mid + [-0.18, 0.18, 0], mid + [0.18, -0.18, 0])).set_stroke(RED, 5)
        self.caption("The direct path is usually blocked.")
        self.play(Create(direct), FadeIn(cross))
        roof = DashedVMobject(ArcBetweenPoints(T.p(*etx), T.p(*erx), angle=-0.9, stroke_color=BLUE_C1, stroke_width=3), num_dashes=30)
        corner = VMobject(stroke_color=GREEN_C3, stroke_width=3).set_points_as_corners([T.p(*etx), T.p(1.44, 1.6), T.p(*erx)])
        wall = (0.64, 0.48)
        bounce = VMobject(stroke_color=VIOLET, stroke_width=3).set_points_as_corners([T.p(*etx), T.p(*wall), T.p(*erx)])
        legend = VGroup(label("over the rooftops", BLUE_C1, 24), label("round a corner", GREEN_C3, 24), label("off a wall", VIOLET, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to([3.9, 1.6, 0])
        self.caption("The signal gets through over rooftops, round corners and off walls.")
        self.play(Create(roof), FadeIn(legend[0]))
        self.play(Create(corner), FadeIn(legend[1]))
        self.play(Create(bounce), FadeIn(legend[2]))
        note = VGroup(label("each copy: its own loss", WHITE, 24), label("and its own delay", WHITE, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to([3.9, -0.4, 0])
        self.caption("So it loses more, the loss changes street by street, and copies arrive at different times.")
        self.play(FadeIn(note))
        self.play(*[FadeOut(m) for m in (roof, corner, bounce, direct, cross, legend, note)])
        others = VGroup(T.radio(1.76, 0.96, "friendly patrol", BLUE_C1, UR), T.radio(1.12, 0.32, "friendly post", BLUE_C1, DL),
                        T.radio(1.6, 0.32, "taxi radio", VIOLET, DR))
        self.caption("Enemy, friendly and civilian radios share the same streets.")
        self.play(FadeIn(others))
        rings = VGroup(*[Circle(radius=r, stroke_color=AMBER_C2, stroke_width=2, stroke_opacity=0.7).move_to(T.p(*erx)) for r in (0.5, 1.0, 1.5)])
        self.caption("A jammer aimed at one hits the others unless it is placed and pointed with care.")
        self.play(Create(rings), run_time=1.5)
        self.wait(1)
        self.rule_card(["In town: more loss, changing street by street,", "copies by several paths, and friends close to every target."], clear=True)
