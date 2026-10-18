"""Level 6, lesson C1: Example, how sharp is a bearing.

An interferometer turns the extra path d × sin θ into a phase difference; noise makes the bearing wobble, and the
lab's rule σ = 20° ÷ √SNR (bearingSigmaDeg, never below 2°) sets the wedge. σ values come from the engine."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-C1")["c1"]
SNRS = DATA["snrs"]
A = np.array([-3.0, -1.8, 0])
B = np.array([0.0, -1.8, 0])
MID = (A + B) / 2
SP = 1.3  # wavefront spacing on screen


def antenna(at, name):
    return VGroup(Line(at, at + UP * 0.45, stroke_width=4, color=AMBER_C2), Dot(at, color=AMBER_C2, radius=0.07),
                  label(name, AMBER_C2, 24).next_to(at, DOWN, buff=0.15))


def fronts(theta_deg, n=6, start=1):
    """Wavefront lines from a source at bearing theta, the nearest one `start` spacings beyond B."""
    t = np.radians(theta_deg)
    u = np.array([np.sin(t), np.cos(t), 0])   # toward the source
    v = np.array([np.cos(t), -np.sin(t), 0])  # along a front
    g = VGroup()
    for j in range(start, start + n):
        c = B + u * j * SP + (MID - B) - u * np.dot(MID - B, u)
        g.add(Line(c - v * 3.4, c + v * 3.4, stroke_color=BLUE_C1, stroke_width=3))
    return g, u


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("How sharp is a bearing?")
        north = VGroup(Arrow(MID + UP * 2.9, MID + UP * 3.7, buff=0, color=GREY, stroke_width=3), label("north", GREY, 20))
        north[1].next_to(north[0], RIGHT, buff=0.1)
        ants = VGroup(antenna(A, "A"), antenna(B, "B"))
        span = bracket(A[0], B[0], -2.55, DOWN, GREY)
        dlab = label("d = 3 m, half a wavelength at 50 MHz", GREY, 20).next_to(span, DOWN, buff=0.08)
        self.caption("An interferometer: two antennas a short way apart, both listening.")
        self.play(FadeIn(ants), FadeIn(north), FadeIn(span), FadeIn(dlab))

        # Straight ahead: both at once.
        f0, u0 = fronts(0)
        self.caption("A wave from straight ahead reaches both antennas at the same moment.")
        self.play(FadeIn(f0))
        self.play(f0.animate.shift(-u0 * SP), run_time=1.5, rate_func=linear)
        self.play(f0.animate.shift(-u0 * SP), run_time=1.5, rate_func=linear)
        self.play(FadeOut(f0))

        # From 30 degrees: B first.
        f1, u1 = fronts(30, start=2)
        src = Arrow(MID + u1 * 3.2, MID + u1 * 2.2, buff=0, color=BLUE_C1, stroke_width=4)
        theta = label("θ = 30°", BLUE_C1, 22).next_to(src, RIGHT, buff=0.1)
        self.caption("From 30° east of north, the wave reaches B first.")
        self.play(FadeIn(f1), GrowArrow(src), FadeIn(theta))
        self.play(f1.animate.shift(-u1 * SP), run_time=1.5, rate_func=linear)
        self.play(f1.animate.shift(-u1 * SP), run_time=1.5, rate_func=linear)
        extra_len = np.dot(B - A, u1)
        extra = Line(A, A + u1 * extra_len, stroke_color=AMBER_C2, stroke_width=6)
        elab = label("d × sin θ", AMBER_C2, 22).next_to(extra.get_center(), LEFT, buff=0.15)
        self.caption("A still has this extra path to go: d × sin θ.")
        self.play(Create(extra), FadeIn(elab))

        # The phase difference: two traces, B a quarter cycle ahead.
        P = Plot(-6.3, 3.4, 1.6, 1.1, (0, 2), (-1.1, 1.1))
        xs = np.linspace(0, 2, 200)
        trA = P.curve(xs, [np.sin(2 * np.pi * x) for x in xs], AMBER_C2)
        trB = P.curve(xs, [np.sin(2 * np.pi * x + np.pi / 2) for x in xs], BLUE_C1)
        tl = VGroup(label("B, blue, is a quarter cycle ahead of A", GREY, 18).next_to([-4.6, P.y0, 0], DOWN, buff=0.12))
        heard = label("what each antenna hears", GREY, 20).next_to([-4.6, P.y0 + 1.1, 0], UP, buff=0.1)
        self.caption("So A hears the wave a little later: a phase difference between the antennas.")
        self.play(Create(trA), Create(trB), FadeIn(tl), FadeIn(heard))
        self.caption("Δφ = 2π × d × sin θ ÷ λ. Here 2π × 3 × 0.5 ÷ 6 = π/2, a quarter cycle.")
        self.caption("Measure Δφ, solve for θ: that is the bearing. A spacing of λ/2 or less keeps it unique.")
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # Noise: the wedge against SNR.
        M = MapView()
        site = (0, 0)
        brg = np.degrees(np.arctan2(2, 10))
        self.play(FadeIn(M.grid()), FadeIn(M.site(*site, "site")))
        ray = M.ray(*site, brg)
        self.caption("Noise makes the measured phase wobble, so the bearing wobbles too.")
        self.play(Create(ray))
        pad = Scratchpad(height=4.6, width=6.2)
        self.play(*pad.show())
        self.play(FadeIn(pad.line("σ = 20° ÷ √SNR, never below 2°", 0, YELLOW)))
        self.caption("The lab's rule: σ = 20° ÷ √SNR, with SNR as a ratio, and never below 2°.")
        says = {
            20: "At 20 dB σ is 2°. The wedge is ± 2σ: the true bearing lies inside it 95 times in 100.",
            13: "At 13 dB the wedge widens.",
            10: "At 10 dB, σ is 6.3°: at 10 km that is 1.1 km sideways.",
            4: "At 4 dB the wedge is ± 25°: a weak signal gives a poor bearing.",
        }
        wedge = None
        for i, s in enumerate(SNRS):
            ratio = 10 ** (s["snr"] / 10)
            row = pad.line(f"{s['snr']} dB = {ratio:.3g} → σ = 20 ÷ {np.sqrt(ratio):.2f} = {s['sigma']:.1f}°", 1 + i * 0.85, WHITE, 24)
            w = M.wedge(*site, brg, s["sigma"])
            self.caption(says.get(s["snr"], f"At {s['snr']} dB σ is {s['sigma']:.1f}°."))
            if wedge is None:
                self.play(FadeIn(w), FadeIn(row))
                wedge = w
            else:
                self.play(Transform(wedge, w), FadeIn(row))
        self.caption("And one bearing is only a direction: the transmitter could be anywhere along the line.")
        self.rule_card(["σ = 20° ÷ √SNR, SNR as a ratio, never below 2°.", "One bearing gives a direction, not a distance."], clear=True)
