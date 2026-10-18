"""Level 12, lesson B2: The hidden terminal. A and C reach B but not each other and collide there; with RTS/CTS, C
hears B's CTS and keeps quiet for the NAV it announces (navCtsUs)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

F = load_data("level12-B2")["frames"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The hidden terminal")
        pa, pb, pc = np.array([-4, 1.4, 0]), np.array([0, 1.4, 0]), np.array([4, 1.4, 0])
        rings = VGroup(*[Circle(radius=4.4, stroke_color=c, stroke_width=1.5, stroke_opacity=0.5).move_to(p) for p, c in ((pa, BLUE_C1), (pc, VIOLET))])
        dots = VGroup(*[VGroup(Dot(p, radius=0.12, color=GREEN_C3), label(n, WHITE, 26).next_to(p, UP)) for p, n in ((pa, "A"), (pb, "B"), (pc, "C"))])
        self.caption("A and C are both in range of B, but not of each other.")
        self.play(FadeIn(dots), Create(rings))
        self.caption("A sends to B. C listens, hears nothing from A, and sends too.")
        ma, mc = Arrow(pa, pb, buff=0.2, color=BLUE_C1), Arrow(pc, pb, buff=0.2, color=VIOLET)
        self.play(GrowArrow(ma), GrowArrow(mc))
        boom = Star(7, outer_radius=0.45, color=RED, fill_opacity=0.8).move_to(pb)
        self.caption("Both arrive at B at once. Both are lost. A and C are hidden terminals.")
        self.play(FadeIn(boom, scale=0.5))
        self.wait(1)
        self.play(*[FadeOut(m) for m in (ma, mc, boom, rings)], dots.animate.shift(UP * 0.8).scale(0.8))
        X0, W, T = -4.6, 10.8, 2400.0
        rows = {"A": 0.9, "B": 0.0, "C": -0.9, "D": -1.8}
        heads = VGroup(*[label(t, WHITE, 20).move_to([-5.8, y, 0]) for t, y in (("A", 0.9), ("B", 0.0), ("C hears B", -0.9), ("D hears A", -1.8))])

        def bar(row, t0, t1, color, text):
            r = Rectangle(width=max((t1 - t0) / T * W, 0.05), height=0.5, stroke_width=0, fill_color=color, fill_opacity=0.9).move_to([X0 + (t0 + t1) / 2 / T * W, rows[row], 0])
            return VGroup(r, label(text, "#0b1220", 18).move_to(r)) if r.width > 0.7 else VGroup(r, label(text, color, 18).next_to(r, UP, buff=0.05))

        t_cts = F["rtsUs"] + F["sifsUs"]
        t_data = t_cts + F["ctsUs"] + F["sifsUs"]
        t_ack = t_data + F["dataUs"] + F["sifsUs"]
        self.caption("The cure: a short handshake first. A sends a request to send, RTS.")
        self.play(FadeIn(heads))
        self.play(FadeIn(bar("A", 0, F["rtsUs"], BLUE_C1, "RTS")))
        self.play(FadeIn(bar("D", F["rtsUs"], F["rtsUs"] + F["navRts"], AMBER_C2, f"NAV {F['navRts']} µs")))
        self.caption("B answers clear to send, CTS. C cannot hear A, but it hears B.")
        self.play(FadeIn(bar("B", t_cts, t_cts + F["ctsUs"], BLUE_C1, "CTS")))
        self.play(FadeIn(bar("C", t_cts + F["ctsUs"], t_cts + F["ctsUs"] + F["navCts"], AMBER_C2, f"NAV {F['navCts']} µs")))
        self.caption("Each frame says how long the rest lasts. Whoever hears it keeps quiet that long: the NAV.")
        self.play(FadeIn(bar("A", t_data, t_data + F["dataUs"], BLUE_C1, "DATA")), FadeIn(bar("B", t_ack, t_ack + F["ackUs"], BLUE_C1, "ACK")))
        sums = VGroup(label(f"RTS: CTS + DATA + ACK + 3 SIFS = {F['navRts']} µs", WHITE, 22),
                      label(f"CTS: DATA + ACK + 2 SIFS = {F['navCts']} µs", WHITE, 22)).arrange(DOWN, buff=0.15).move_to([0, -2.75, 0])
        self.play(FadeIn(sums))
        self.wait(2)
        self.rule_card(["Hidden terminals collide at the radio between them.", "RTS/CTS tells everyone in range of either end to keep quiet."], clear=True)
