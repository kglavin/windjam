"""Level 6, lesson D1: Example, two bearings cross.

Two sites 4 km apart; the law of sines turns the baseline and two angles into a range; then the transmitter moves
north and the crossing narrows, and the 1σ error ellipse (expectedBearingFix, σ 2.5°) stretches along the lines."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-D1")["d1"]
SITES = DATA["sites"]
SIGMA = DATA["sigma"]
SWEEP = DATA["sweep"]
END = 22  # the transmitter at 13 km: the stretched ellipse still fits on the map


def at(t):
    """The sweep entry at fractional index t, interpolated."""
    i = int(np.clip(np.floor(t), 0, len(SWEEP) - 2))
    f = float(np.clip(t - i, 0, 1))
    a, b = SWEEP[i], SWEEP[i + 1]
    mix = {k: a[k] + f * (b[k] - a[k]) for k in ("y", "crossing", "a", "b", "cep")}
    mix["angle"] = a["angle"]
    return mix


def bearing(site, y):
    return np.degrees(np.arctan2(0 - site[0], y - site[1])) % 360


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Two bearings cross")
        M = MapView()
        s1, s2 = SITES
        self.play(FadeIn(M.grid()), FadeIn(M.site(*s1, "S1", side=DL)), FadeIn(M.site(*s2, "S2")))
        work = []  # the triangle part, faded before the sweep
        t = ValueTracker(4)  # the transmitter at y = 4 km

        def tx():
            return at(t.get_value())["y"]

        rays = always_redraw(lambda: VGroup(*[M.ray(*s, bearing(s, tx())) for s in SITES]))
        target = always_redraw(lambda: M.target(0, tx()))
        self.caption("Two sites 4 km apart each take a bearing. The lines cross at the transmitter.")
        self.play(Create(rays), FadeIn(target))

        # The triangle and the law of sines, at y = 4 km.
        y0 = 4.0
        alpha = 90 - bearing(s1, y0)
        gamma = 180 - 2 * alpha
        tri = Polygon(M.p(*s1), M.p(*s2), M.p(0, y0), stroke_color=WHITE, stroke_width=2, fill_color=WHITE, fill_opacity=0.06)
        names = VGroup(
            label("α", YELLOW, 24).move_to(M.p(*s1) + [0.42, 0.18, 0]),
            label("β", YELLOW, 24).move_to(M.p(*s2) + [-0.42, 0.18, 0]),
            label("γ", YELLOW, 24).move_to(M.p(0, y0) + [0, -0.45, 0]),
            label("d", GREY, 22).move_to(M.p(0, 0) + [0, -0.25, 0]),
        )
        self.caption("S1, S2 and the transmitter make a triangle. The side between the sites is the baseline, d.")
        self.play(FadeIn(tri), FadeIn(names))
        pad = Scratchpad(height=4.6, width=6.2)
        self.play(*pad.show())
        rows = [
            ("d = 4 km", WHITE),
            (f"α = β = {alpha:.1f}°", WHITE),
            (f"γ = 180 − {alpha:.1f} − {alpha:.1f} = {gamma:.1f}°", WHITE),
            ("range from S1 = d × sin β ÷ sin γ", YELLOW),
            (f"= 4 × {np.sin(np.radians(alpha)):.3f} ÷ {np.sin(np.radians(gamma)):.3f} = "
             f"{4 * np.sin(np.radians(alpha)) / np.sin(np.radians(gamma)):.2f} km", YELLOW),
        ]
        self.caption("The law of sines turns the baseline and the two angles into the ranges.")
        work += [tri, names, pad.panel, pad.title]
        for i, (txt, c) in enumerate(rows):
            row = pad.line(txt, i * 0.8, c, 24)
            work.append(row)
            self.play(FadeIn(row, shift=DOWN * 0.15))
            self.wait(1.6)
        self.caption(f"γ is also the angle the two bearings cross at: here {gamma:.0f}°.")
        self.clear_caption()
        self.play(*[FadeOut(m) for m in work])

        # The sweep: wedges, ellipse and the crossing.
        wedges = always_redraw(lambda: VGroup(*[M.wedge(*s, bearing(s, tx()), SIGMA) for s in SITES]))
        ell = always_redraw(lambda: M.ellipse(0, tx(), at(t.get_value())["a"], at(t.get_value())["b"], at(t.get_value())["angle"]))
        pad2 = Scratchpad(height=3.6, width=6.2)
        read = always_redraw(lambda: VGroup(
            pad2.line(f"transmitter {at(t.get_value())['y']:.1f} km north", 0, WHITE, 24),
            pad2.line(f"crossing {at(t.get_value())['crossing']:.0f}°", 0.85, YELLOW, 26),
            pad2.line(f"1σ ellipse {at(t.get_value())['a']:.2f} × {at(t.get_value())['b']:.2f} km", 1.7, GREEN_C3, 24),
            pad2.line(f"CEP {at(t.get_value())['cep']:.2f} km", 2.55, GREEN_C3, 24),
        ))
        self.caption(f"Each bearing has an error, σ {SIGMA}° here. The wedges show ± 2σ.")
        self.play(FadeIn(wedges), *pad2.show(), FadeIn(read), FadeIn(ell))
        self.caption("Close in, the lines cross at 90°. The error area is small and round.")
        self.play(t.animate.set_value(0), run_time=2)
        self.caption("As the transmitter moves away, the crossing narrows.")
        self.play(t.animate.set_value(16), run_time=6, rate_func=linear)
        self.caption("Each bearing's error slides the crossing along the other line, so the ellipse stretches.")
        self.play(t.animate.set_value(END), run_time=5, rate_func=linear)
        self.caption(f"At {at(END)['crossing']:.0f}° the error area is kilometres long and thin: geometric dilution of precision, GDOP.")
        self.rule_card(["Crossings near 90° give the smallest error.", "Below about 30° the error stretches along the lines."], clear=True)
