"""Level 6, lesson G1: Timing instead of direction.

The wave spreads from the transmitter and reaches three receivers at different times; each time difference against A
is a range difference (0.3 km per µs) and a hyperbola (exampleHyperbolas for G1); the two cross at the transmitter."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-G1")["g1"]
SITES = DATA["sites"]
DT = DATA["dt"]
HYP = DATA["hyperbolas"]
TX = DATA["target"]
C = 0.299792458  # km per µs


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Timing instead of direction")
        M = MapView()
        rx = VGroup(*[M.site(*s["p"], s["label"], side=DOWN if s["p"][1] < 0 else DR) for s in SITES])
        self.play(FadeIn(M.grid()), FadeIn(M.target(*TX)))
        self.caption("Three plain receivers, A, B and C, with accurate clocks. No directional antennas.")
        self.play(FadeIn(rx))
        r = ValueTracker(0.01)
        wave = always_redraw(lambda: M.ring(*TX, r.get_value(), WHITE, 2, 0.7))
        self.add(wave)
        pad = Scratchpad(height=4.6, width=6.2)
        self.caption("The transmitter sends. Its wave spreads at 0.3 km every microsecond (µs).")
        self.play(*pad.show())
        order = sorted(range(len(SITES)), key=lambda i: SITES[i]["range"])
        t0 = SITES[order[0]]["range"] / C
        for k, i in enumerate(order):
            s = SITES[i]
            self.play(r.animate.set_value(s["range"]), run_time=2.5 if k == 0 else 1.2, rate_func=linear)
            self.play(Indicate(rx[i], color=YELLOW))
            after = "first" if k == 0 else f"{s['range'] / C - t0:.2f} µs after A"
            self.play(FadeIn(pad.line(f"{s['label']} hears it {after}", k * 0.75, WHITE, 24)))
            if k == 0:
                self.caption("It reaches A first. The receivers do not know when it was sent, only the differences.")
        self.play(r.animate.set_value(16), run_time=0.8, rate_func=linear)
        self.remove(wave)

        dr = [C * d for d in DT]
        self.caption(f"A time difference is a range difference: 0.3 × {DT[0]:.2f} = {dr[0]:.2f} km.")
        self.play(FadeIn(pad.line(f"B: {dr[0]:.2f} km farther than A", 2.4, VIOLET, 24)))
        h1 = M.curve(HYP[0])
        self.caption(f"Every point on this curve is {dr[0]:.2f} km farther from B than from A: a hyperbola.")
        self.play(Create(h1), run_time=2)
        self.caption("One time difference puts the transmitter somewhere on the curve, as one bearing puts it on a line.")
        self.play(FadeIn(pad.line(f"C: {dr[1]:.2f} km farther than A", 3.15, VIOLET, 24)))
        h2 = M.curve(HYP[1])
        self.caption(f"C gives a second difference, {DT[1]:.2f} µs or {dr[1]:.2f} km, and a second curve.")
        self.play(Create(h2), run_time=2)
        self.caption("The two curves cross at the transmitter. This is time difference of arrival, TDOA.")
        self.play(Indicate(M.target(*TX), color=YELLOW, scale_factor=2))
        self.caption("The clocks are its weak point: 1 µs of clock error moves a curve 300 m.")
        self.rule_card(["Range difference = 0.3 km × Δt in µs: one hyperbola.",
                        "Three receivers give two hyperbolas, which cross at the transmitter."], clear=True)
