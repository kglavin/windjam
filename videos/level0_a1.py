"""Level 0, lesson A1: The radio link. Transmitter, path, receiver; the antenna; the lab's four stations."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403


def antenna(pos, color):
    """A mast with a V on top, its tip at pos + 0.6 up."""
    p = np.array(pos)
    return VGroup(
        Line(p, p + UP * 0.6),
        Line(p + UP * 0.6, p + UP * 0.85 + LEFT * 0.2),
        Line(p + UP * 0.6, p + UP * 0.85 + RIGHT * 0.2),
    ).set_stroke(color, 4)


def station(name, pos, color):
    box = RoundedRectangle(width=2.2, height=1.0, corner_radius=0.12, stroke_color=color, stroke_width=2.5)
    box.move_to(pos)
    return VGroup(box, label(name, color, 24).move_to(pos), antenna(box.get_top(), color))


def ripples(src, t, color, direction=RIGHT, spread=0.28, reach=8.0, count=6):
    """Arcs moving away from src: the wave travelling along the path."""
    g = VGroup()
    ang = np.arctan2(direction[1], direction[0])
    for k in range(count):
        r = ((t * 1.5 + k * reach / count) % reach) + 0.2
        g.add(Arc(radius=r, start_angle=ang - spread, angle=2 * spread, arc_center=src)
              .set_stroke(color, 3, opacity=max(0.0, 1 - r / reach)))
    return g


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The radio link")
        t = ValueTracker(0)

        tx = station("Transmitter", [-5, 0, 0], BLUE_C1)
        rx = station("Receiver", [5, 0, 0], BLUE_C1)
        tx_tip = tx[2][0].get_end()
        rx_tip = rx[2][0].get_end()
        path_t = label("path, through the air", GREY, 22).move_to([0, -0.9, 0])
        self.caption("Every radio link has three parts.")
        self.play(FadeIn(tx), FadeIn(rx))
        waves = always_redraw(lambda: ripples(tx_tip, t.get_value(), BLUE_C1, reach=9.6))
        self.caption("The transmitter turns a message into a radio wave.")
        msg = label("message", WHITE, 22).next_to(tx, LEFT, buff=0.3)
        self.play(FadeIn(msg, shift=RIGHT * 0.3))
        self.play(msg.animate.move_to(tx[0]).set_opacity(0), run_time=1)
        self.add(waves)
        self.play(t.animate.set_value(3), FadeIn(path_t), run_time=3, rate_func=linear)
        self.caption("The wave travels along a path through the air.")
        self.play(t.animate.set_value(6), run_time=3, rate_func=linear)
        self.caption("The receiver catches a little of it and turns it back into the message.")
        out = label("message", WHITE, 22).move_to(rx[0]).set_opacity(0)
        self.play(t.animate.set_value(8), out.animate.next_to(rx, DOWN, buff=0.3).set_opacity(1), run_time=2, rate_func=linear)

        # The antenna
        self.caption("The antenna is the bridge between wires and air.")
        ring = Circle(radius=0.75, color=YELLOW, stroke_width=3).move_to(tx[2].get_center())
        self.play(Create(ring), t.animate.set_value(10), run_time=2, rate_func=linear)
        self.caption("At the transmitter it turns a current in a wire into a radio wave.")
        self.play(t.animate.set_value(13), run_time=3, rate_func=linear)
        self.play(ring.animate.move_to(rx[2].get_center()))
        self.caption("At the receiver it turns the wave back into a small current.")
        self.play(t.animate.set_value(16), run_time=3, rate_func=linear)
        self.play(FadeOut(ring), FadeOut(msg), FadeOut(out), FadeOut(path_t))
        waves.clear_updaters()
        self.play(FadeOut(waves))

        # The lab's four stations
        self.caption("In this lab you will see four stations.")
        self.play(tx.animate.move_to([-4.5, 1.6, 0]), rx.animate.move_to([3.5, 1.6, 0]))
        link = Arrow([-3.3, 1.6, 0], [2.3, 1.6, 0], buff=0, stroke_width=3, color=BLUE_C1)
        link_t = label("the enemy link", BLUE_C1, 20).next_to(link, UP, buff=0.1)
        self.caption("An enemy transmitter and its receiver.")
        self.play(GrowArrow(link), FadeIn(link_t))
        jam = station("Jammer", [3.5, -1.8, 0], RED)
        jam_a = Arrow([3.5, -1.2, 0], [3.5, 0.95, 0], buff=0, stroke_width=3, color=RED)
        self.caption("A jammer that tries to drown the link out at the receiver.")
        self.play(FadeIn(jam), GrowArrow(jam_a))
        icp = station("Intercept", [-4.5, -1.8, 0], GREEN_C3)
        icp_a = DashedLine([-4.5, 0.95, 0], [-4.5, -1.2, 0], stroke_width=3, color=GREEN_C3)
        you = label("you", GREEN_C3, 20).next_to(icp, LEFT, buff=0.2)
        self.caption("And your own intercept receiver, which listens in.")
        self.play(FadeIn(icp), Create(icp_a), FadeIn(you))
        self.caption("Transmitter, path, receiver: the rest of the lab builds on these.")
        self.hold_caption()
        self.wait(1)
        self.play(*[FadeOut(m) for m in self.mobjects])
