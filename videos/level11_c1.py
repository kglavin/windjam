"""Level 11, lesson C1: Example, J/S as a spread. J/S at 300 spots in town (jsSamples, σ = 8 dB on each path): planned
at the need half the spots fail; planned at the need plus 1.28 × the spread, about 9 in 10 work."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

S = load_data("level11-C1")["shadow"]
NEED = S["need"]
rng = np.random.default_rng(4)
# Spots on the streets (multiples of 0.16 km in x or in y).
SPOTS = []
for i in range(len(S["atNeed"])):
    k, t = int(rng.integers(1, 12)) * 0.16, float(rng.uniform(0.05, 1.95))
    SPOTS.append((k, t) if i % 2 else (t, k))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("J/S as a spread")
        T = TownView(center=(-3.6, 0.35, 0), height=5.8)
        P = Plot(1.4, 5.0, -2.0, 3.0, (-30, 50), (0, 40))
        bins = np.arange(-30, 52, 4)

        def dots(vals):
            return VGroup(*[Dot(T.p(x, y), radius=0.045, color=GREEN_C3 if v >= NEED else RED) for (x, y), v in zip(SPOTS, vals)])

        def hist(vals):
            c, _ = np.histogram(vals, bins=bins)
            w = P.width / (len(bins) - 1)
            return VGroup(*[Rectangle(width=w * 0.85, height=max(P.py(n) - P.y0, 1e-3), stroke_width=0, fill_opacity=0.85,
                                      fill_color=GREEN_C3 if (bins[i] + 2) >= NEED else RED).move_to([P.px(bins[i] + 2), (P.y0 + P.py(n)) / 2, 0])
                            for i, n in enumerate(c)])

        def share(vals):
            return f"spots at or above the need: {100 * np.mean(np.array(vals) >= NEED):.0f}%"

        axes = VGroup(P.axes(), P.x_ticks([-20, 0, 20, 40]), label("J/S at a spot (dB)", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45))
        need = DashedLine([P.px(NEED), P.y0, 0], [P.px(NEED), P.y0 + P.height, 0], dash_length=0.1, stroke_color=YELLOW, stroke_width=2)
        need_l = label(f"need {NEED} dB", YELLOW, 20).next_to(need, UP, buff=0.1)
        self.caption("Two spots the same distance away can differ by many dB: a clear street, or a block in the way.")
        self.play(FadeIn(T.blocks()))
        self.play(FadeIn(axes), Create(need), FadeIn(need_l))
        d, h = dots(S["atNeed"]), hist(S["atNeed"])
        txt = label(share(S["atNeed"]), WHITE, 24).move_to([3.9, 3.1, 0])
        self.caption(f"Plan J/S at exactly the need, {NEED} dB, on average: half the spots fall short.")
        self.play(FadeIn(d, lag_ratio=0.01), FadeIn(h), FadeIn(txt), run_time=2)
        calc = VGroup(label(f"spread √(8² + 8²) = {S['spread']} dB", WHITE, 22),
                      label(f"90% margin 1.28 × {S['spread']} = {S['margin']} dB", WHITE, 22)).arrange(DOWN, aligned_edge=LEFT, buff=0.12).move_to([3.9, 2.05, 0])
        calc.scale_to_fit_width(min(calc.width, 5.6))
        self.caption("The two paths are shadowed separately, so J/S scatters by √(σJ² + σS²).")
        self.play(FadeIn(calc[0]))
        self.caption("For 90% of spots, plan 1.28 times the spread above the need.")
        self.play(FadeIn(calc[1]))
        self.caption(f"Plan for {S['planAt']} dB on average: the same spots, shifted up. About 9 in 10 now work.")
        self.play(Transform(d, dots(S["planned"])), Transform(h, hist(S["planned"])), Transform(txt, label(share(S["planned"]), WHITE, 24).move_to([3.9, 3.1, 0])), run_time=2)
        self.wait(2)
        self.rule_card(["In town, J/S scatters by √(σJ² + σS²).", "Plan 1.28 times that above the need for 90% of spots."], clear=True)
