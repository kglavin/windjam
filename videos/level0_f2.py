"""Level 0, lesson F2: Antennas. A dipole's power pattern is sin²θ from its axis (peak 1.64 times isotropic, 2.15 dBi),
the same all round in the horizontal plane. A directional antenna focuses into a beam. The pattern is the same for
transmit and receive."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

R = 1.0  # scene units for isotropic power


def polar(center, fn, color, n=360, width=3, scale=R):
    """A power pattern drawn with radius ∝ power, angle φ from the +x axis."""
    pts = [[center[0] + scale * fn(p) * np.cos(p), center[1] + scale * fn(p) * np.sin(p), 0] for p in np.linspace(0, 2 * np.pi, n)]
    return VMobject(stroke_color=color, stroke_width=width).set_points_as_corners(pts + [pts[0]])


def beam(p, gain=10.0, n=8):
    """A directional pattern along +x: main lobe of the given gain, small side and back lobes."""
    return gain * ((1 + np.cos(p)) / 2) ** n + 0.15


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Antennas")

        # 1. Dipole, side view and top view
        side = np.array([-3.4, 0.4, 0])
        top = np.array([3.4, 0.4, 0])
        iso_s = DashedVMobject(Circle(radius=R).move_to(side), num_dashes=40).set_stroke(GREY, 1.5)
        iso_t = DashedVMobject(Circle(radius=R).move_to(top), num_dashes=40).set_stroke(GREY, 1.5)
        rod = Line(side + UP * 0.45, side + DOWN * 0.45, color=WHITE, stroke_width=6)
        dip_side = polar(side, lambda p: 1.64 * np.cos(p) ** 2, BLUE_C1)   # axis vertical: sin² from the axis = cos² from horizontal
        dip_top = polar(top, lambda p: 1.64, BLUE_C1)
        heads = VGroup(label("side view", GREY, 22).move_to(side + UP * 2.6), label("seen from above", GREY, 22).move_to(top + UP * 2.6))
        iso_t_l = label("equal in every direction (0 dBi)", GREY, 18).next_to(iso_t, DOWN, buff=1.0)
        self.caption("An antenna's pattern shows how strongly it sends, and hears, in each direction.")
        self.play(FadeIn(heads), Create(iso_s), Create(iso_t), FadeIn(iso_t_l), FadeIn(rod))
        self.caption("A simple dipole sends nothing along its own rod, up and down here, and most sideways.")
        self.play(Create(dip_side), run_time=2)
        self.caption("Seen from above it is the same all round: no direction is favoured.")
        self.play(Create(dip_top), run_time=2)
        gain_t = label("sideways: 1.64 times, about 2 dBi", BLUE_C1, 22).move_to(side + DOWN * 1.6)
        self.caption("The power kept from up and down goes sideways.")
        self.caption("That is about 2 dB more than sending equally everywhere: about 2 dBi.")
        self.play(FadeIn(gain_t))
        self.hold_caption()
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # 2. A directional antenna
        c = np.array([-2.2, 0.2, 0])
        iso = DashedVMobject(Circle(radius=0.5).move_to(c), num_dashes=30).set_stroke(GREY, 1.5)
        bm = polar(c, lambda p: beam(p) * 0.5, AMBER_C2)
        ant = VGroup(Line(c + LEFT * 0.4, c + RIGHT * 0.4, color=WHITE, stroke_width=5),
                     *[Line(c + RIGHT * x + UP * 0.25, c + RIGHT * x + DOWN * 0.25, color=WHITE, stroke_width=3) for x in (-0.3, -0.1, 0.1, 0.3)])
        bt = label("in the beam: 10 times, 10 dBi", AMBER_C2, 22).move_to(c + RIGHT * 4.2 + UP * 0.9)
        st = label("to the side: much less", GREY, 22).move_to(c + UP * 1.6 + LEFT * 0.2)
        self.caption("A directional antenna, such as a Yagi or a dish, focuses its power into a beam.")
        self.play(FadeIn(ant), Create(iso))
        self.play(Create(bm), run_time=2)
        self.play(FadeIn(bt), FadeIn(st))
        self.caption("Bigger antennas make narrower beams: 10 dBi for a small Yagi, 30 dBi or more for a dish.")
        self.caption("The pattern is the same both ways: it sends and hears best in the same direction.")
        self.hold_caption()
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # 3. What that does in the field
        tx = np.array([-5.0, 1.2, 0])
        rx = np.array([3.5, 1.2, 0])
        icp = np.array([-1.0, -2.0, 0])
        jam = np.array([3.5, -2.0, 0])
        dots = VGroup(*[VGroup(Dot(p, radius=0.12, color=col), label(t, col, 20).next_to(p, d, buff=0.15))
                        for p, t, col, d in ((tx, "transmitter", BLUE_C1, LEFT), (rx, "receiver", BLUE_C1, RIGHT),
                                             (icp, "intercept", GREEN_C3, DOWN), (jam, "jammer", RED, RIGHT))])
        tx_beam = polar(tx, lambda p: beam(p, 10, 14) * 0.45, BLUE_C1, width=2.5)
        self.caption("Pointed at its receiver, a transmitter puts little power toward an intercept off to the side.")
        self.play(FadeIn(dots))
        self.play(Create(tx_beam), run_time=2)
        weak = DashedLine(tx, icp, color=GREEN_C3, stroke_width=2)
        weak_t = label("outside the beam: far weaker", GREEN_C3, 20).next_to(weak.get_center(), LEFT, buff=0.2)
        self.play(Create(weak), FadeIn(weak_t))
        self.caption("You have to get into the beam, or much closer, to hear it.")
        rx_beam = polar(rx, lambda p: beam(p + np.pi, 10, 14) * 0.45, BLUE_C1, width=2.5)
        self.caption("The receiver can point its own beam back at the transmitter.")
        self.play(Create(rx_beam), run_time=2)
        jl = DashedLine(jam, rx, color=RED, stroke_width=2)
        jl_t = label("+10 dBi toward the transmitter,\n−10 dBi toward the jammer:\nJ/S 20 dB lower", RED, 20).next_to(jam, UP, buff=0.4).shift(RIGHT * 0.8)
        self.caption("Then a jammer off to the side is heard through the weak edge of the pattern.")
        self.play(Create(jl), FadeIn(jl_t))
        self.caption("That difference in antenna gain comes straight off the jammer's J/S.")
        self.rule_card(["A dipole sends all round: about 2 dBi.", "A beam focuses the power: 10 dBi or more.", "From the side a beam is harder to hear and harder to jam."], clear=True)
