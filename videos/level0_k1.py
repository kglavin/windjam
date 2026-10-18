"""Level 0, lesson K1: Networks. One-to-one, hub and spoke, a shared net and a mesh, and what a jammer near one radio
does to each."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

Y0 = 0.5  # the diagrams' centre line


def node(pos, name="", color=BLUE_C1, r=0.13):
    d = Dot(pos, radius=r, color=color)
    return VGroup(d, label(name, color, 20).next_to(d, DOWN, buff=0.1)) if name else VGroup(d)


def link(a, b, color=GREY, width=2):
    return Line(a, b, stroke_color=color, stroke_width=width)


def jam_zone(pos, r=0.9):
    return VGroup(Circle(radius=r, stroke_width=0, fill_color=RED, fill_opacity=0.22).move_to(pos),
                  label("jammer", RED, 20).move_to(np.array(pos) + [0, r + 0.2, 0]))


def pulse(a, b, color=WHITE):
    return Dot(a, radius=0.07, color=color)


class LessonVideo(LessonScene):
    def send(self, pairs, fail=(), run_time=1.2):
        """Message dots along each (a, b); those whose index is in fail turn red and fade at the end."""
        dots = [pulse(a, b) for a, b in pairs]
        self.play(*[FadeIn(d) for d in dots], run_time=0.2)
        self.play(*[d.animate.move_to(b) for d, (a, b) in zip(dots, pairs)], run_time=run_time, rate_func=linear)
        self.play(*[d.animate.set_color(RED).scale(1.6).set_opacity(0) if i in fail else FadeOut(d) for i, d in enumerate(dots)], run_time=0.4)

    def construct(self):
        self.title_card("Networks")

        # 1. One-to-one
        a, b = np.array([-3.0, Y0, 0]), np.array([3.0, Y0, 0])
        g1 = VGroup(link(a, b), node(a, "A"), node(b, "B"))
        self.caption("One-to-one: two radios talk only to each other.")
        self.play(FadeIn(g1))
        self.send([(a, b), (b, a)])
        z = jam_zone(b)
        self.caption("A jammer near B drowns B's receiver.")
        self.play(FadeIn(z))
        self.send([(a, b), (b, a)], fail={0})
        self.caption("Messages to B are lost. B can still send to A: only one direction is cut.")
        self.send([(a, b), (b, a)], fail={0})
        self.clear_caption()
        self.play(FadeOut(g1), FadeOut(z))

        # 2. Hub and spoke
        hub = np.array([0, Y0, 0])
        spokes = [hub + 2.4 * np.array([np.cos(t), np.sin(t) * 0.85, 0]) for t in np.linspace(0, 2 * np.pi, 7)[:-1] + 0.3]
        lines = VGroup(*[link(s, hub) for s in spokes])
        g2 = VGroup(lines, *[node(s) for s in spokes], node(hub, "hub", AMBER_C2, 0.2))
        self.caption("Hub and spoke: one hub talks to many outstations.")
        self.play(FadeIn(g2))
        self.send([(s, hub) for s in spokes])
        z = jam_zone(hub, 0.8)
        self.caption("Every message to the hub arrives at one receiver. Jam near the hub...")
        self.play(FadeIn(z))
        self.send([(s, hub) for s in spokes], fail=set(range(len(spokes))))
        self.play(lines.animate.set_stroke(RED, 2))
        self.caption("...and every spoke is cut at once. One receiver, six links.")
        self.play(FadeOut(z), lines.animate.set_stroke(GREY, 2))
        self.caption("The hub also sends the most, so it is the easiest radio to find. It is usually the headquarters.")
        df = [np.array([-5.5, -2.2, 0]), np.array([5.5, -2.0, 0]), np.array([-5.8, 2.8, 0])]
        rays = VGroup(*[DashedLine(p, hub, dash_length=0.12, stroke_color=AMBER_C2, stroke_width=2.5) for p in df])
        self.play(LaggedStart(*[Create(r) for r in rays], lag_ratio=0.3))
        self.clear_caption()
        self.play(FadeOut(g2), FadeOut(rays))

        # 3. A shared net
        members = [np.array([x, y, 0]) for x, y in [(-3.2, 1.8), (-0.6, 2.3), (2.6, 1.6), (3.0, -0.9), (-2.4, -1.0)]]
        g3 = VGroup(*[node(m, n) for m, n in zip(members, "ABCDE")])
        self.caption("A shared net: everyone on one channel, one speaker at a time.")
        self.play(FadeIn(g3))
        rings = VGroup(*[Circle(radius=0.2, stroke_color=WHITE, stroke_width=2).move_to(members[0]) for _ in range(1)])
        self.play(rings.animate.scale(30).set_opacity(0), run_time=1.6)
        z = jam_zone(members[3], 0.8)
        cross = Cross(scale_factor=0.25).move_to(members[3])
        self.caption("Each member has its own receiver. Jam near D, and only D is cut off.")
        self.play(FadeIn(z))
        rings = Circle(radius=0.2, stroke_color=WHITE, stroke_width=2).move_to(members[0])
        self.play(rings.animate.scale(30).set_opacity(0), run_time=1.6)
        self.play(Create(cross))
        big = Ellipse(width=8.6, height=5.0, stroke_width=0, fill_color=RED, fill_opacity=0.18).move_to([0, 0.6, 0])
        self.caption("To break the net, the jammer has to cover the channel near all the members.")
        self.play(FadeOut(z), FadeIn(big))
        self.play(*[Create(Cross(scale_factor=0.25).move_to(m)) for i, m in enumerate(members) if i != 3])
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # 4. Mesh
        pts = {(i, j): np.array([-4.5 + 3 * i, -1.2 + 1.6 * j, 0]) for i in range(4) for j in range(3)}
        edges = [((i, j), (i + 1, j)) for i in range(3) for j in range(3)] + [((i, j), (i, j + 1)) for i in range(4) for j in range(2)]
        lines = {e: link(pts[e[0]], pts[e[1]]) for e in edges}
        g4 = VGroup(*lines.values(), *[node(p) for p in pts.values()])
        self.caption("A mesh: each radio relays for its neighbours.")
        self.play(FadeIn(g4))
        route = [(0, 1), (1, 1), (2, 1), (3, 1)]
        path = VMobject(stroke_color=GREEN_C3, stroke_width=6).set_points_as_corners([pts[k] for k in route])
        self.caption("A message from the left edge to the right edge hops from radio to radio.")
        self.play(Create(path), run_time=1.5)
        z = jam_zone(pts[(1, 1)], 0.7)
        self.caption("Jam one radio in the middle...")
        self.play(FadeIn(z), FadeOut(path))
        dead = [e for e in edges if (1, 1) in e]
        self.play(*[lines[e].animate.set_stroke(RED, 2) for e in dead])
        route2 = [(0, 1), (0, 2), (1, 2), (2, 2), (2, 1), (3, 1)]
        path2 = VMobject(stroke_color=GREEN_C3, stroke_width=6).set_points_as_corners([pts[k] for k in route2])
        self.caption("...and the traffic finds another path round it.")
        self.play(Create(path2), run_time=2)
        self.caption("The jammer has to cover many radios, or the few links that join one group to another.")
        self.rule_card(["Hub and spoke: jam near the hub and every spoke is cut.",
                        "A net needs every member covered. A mesh routes round a jammed radio."], clear=True)
