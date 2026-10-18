"""Level 6, lesson E1: Example, the fix and its error.

The lesson's three noisy bearings (exampleBearings, seed 6), the triangle they make, the least-squares fix with its
1σ ellipse and CEP (fixFromBearings), and the transmitter, all from the engine."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-E1")["e1"]
SITES = DATA["sites"]
BRG = DATA["bearings"]
FIX = DATA["fix"]
TX = DATA["target"]
ZOOM = ((-1.0, 4.0), (6.5, 11.5))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The fix and its error")
        M = MapView()
        self.play(FadeIn(M.grid()))
        sites = VGroup(*[M.site(*s["p"], f"{s['label']}, σ {s['sigma']}°", side=DOWN if s["p"][1] < 0 else DR) for s in SITES])
        self.caption("Three sites hear the transmitter. The nearer and stronger, the sharper the bearing.")
        self.play(FadeIn(sites))
        for i, s in enumerate(SITES):
            w = M.wedge(*s["p"], BRG[i], s["sigma"])
            self.play(FadeIn(w), Create(M.ray(*s["p"], BRG[i])), run_time=1.2)
        self.caption("Each bearing has its own error, so the three lines miss each other a little.")
        (x0, x1), (y0, y1) = ZOOM
        box = Rectangle(width=(x1 - x0) * M.s, height=(y1 - y0) * M.s, stroke_color=YELLOW, stroke_width=2).move_to(M.p((x0 + x1) / 2, (y0 + y1) / 2))
        self.play(Create(box))
        self.caption("Close up: 5 km across.")
        self.play(*[FadeOut(m) for m in self.mobjects if m is not self.cap])

        Z = MapView(xr=ZOOM[0], yr=ZOOM[1])
        rays = VGroup(*[Z.ray(*s["p"], BRG[i], width=3) for i, s in enumerate(SITES)])
        names = VGroup(*[label(s["label"].split()[0], BLUE_C1, 20).move_to(Z.p(*Z.ray_end(*s["p"], BRG[i])) + [0, -0.25, 0]) for i, s in enumerate(SITES)])
        self.play(FadeIn(Z.grid(step=1)), Create(rays), FadeIn(names))
        tri = Polygon(*[Z.p(*c) for c in DATA["triangle"]], stroke_width=0, fill_color=YELLOW, fill_opacity=0.35)
        self.caption("Together they make a small triangle: the error triangle.")
        self.play(FadeIn(tri))
        pad = Scratchpad(height=4.8, width=6.2)
        self.play(*pad.show())
        fix = Z.cross(FIX["x"], FIX["y"])
        self.caption("The least-squares fix is the point that fits all three lines best.")
        self.play(Create(fix), FadeIn(pad.line(f"fix: x {FIX['x']:.1f}, y {FIX['y']:.1f} km", 0, GREEN_C3, 24)))
        self.caption("Each line counts by how sharp it is where it passes: its σ times its range.")
        ell = Z.ellipse(FIX["x"], FIX["y"], FIX["a"], FIX["b"], FIX["angle"])
        self.caption("Around the fix, the 1σ error ellipse: long where the lines run nearly together.")
        self.play(Create(ell), FadeIn(pad.line(f"1σ ellipse: a = {FIX['a']:.2f}, b = {FIX['b']:.2f} km", 0.85, GREEN_C3, 24)))
        approx = 0.75 * np.hypot(FIX["a"], FIX["b"])
        cep = Z.circle(FIX["x"], FIX["y"], FIX["cep"])
        self.caption("CEP sums it up in one number: the circle that holds the transmitter half the time.")
        self.play(Create(cep))
        self.play(FadeIn(pad.line("CEP ≈ 0.75 × √(a² + b²)", 1.7, YELLOW, 24)))
        self.play(FadeIn(pad.line(f"= 0.75 × √({FIX['a']:.2f}² + {FIX['b']:.2f}²) = {approx:.2f} km", 2.55, YELLOW, 24)))
        self.play(FadeIn(pad.line(f"exact CEP: {FIX['cep']:.2f} km", 3.4, GREY, 24)))
        self.wait(2)
        miss = np.hypot(FIX["x"] - TX[0], FIX["y"] - TX[1])
        self.caption(f"The transmitter is {miss:.2f} km from the fix: inside the CEP circle, as it is about half the time.")
        self.play(FadeIn(Z.target(*TX)))
        self.rule_card(["CEP ≈ 0.75 × √(a² + b²), a and b the 1σ half-axes.",
                        "More sites, sharper bearings and steeper crossings shrink it."], clear=True)
