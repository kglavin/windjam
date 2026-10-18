"""Level 6, lesson G2: Example, Δt from a cross-correlation.

A and B capture the example link (1 Mcps, its 31-chip code times data bits); B hears every chip 7 µs later. Sliding
B against A, the cross-correlation (xcorrExample, from the engine) peaks where the chips line up; the peak's lag is
the time difference, and 0.3 km per µs turns it into the range difference and its hyperbola."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-G2")["g2"]
CODE = DATA["code"]
PTS = DATA["points"]
PEAK = DATA["peakUs"]
DELAY = int(round(PEAK * DATA["chipRateMcps"]))  # chips
BITS = [1, -1, -1, 1, -1, 1, 1, -1, 1, -1]
U = 0.22            # screen width of one chip
X0 = -6.0           # window's left edge
WIN = 12.0          # window width
YA, YB = 2.85, 1.85
C = 0.299792458


def w(k):
    """The transmitted chips: the code times the data bit."""
    return CODE[k % len(CODE)] * BITS[(k // len(CODE)) % len(BITS)]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Δt from a cross-correlation")
        n = int(WIN / U)
        row_a = chip_wave([w(k) for k in range(n)], X0, U, YA, 0.28, AMBER_C2, 3)
        # B's capture: b[k] = w(k − DELAY), drawn at chip k, then slid left by the lag.
        ks = range(-60, 120)
        row_b = chip_wave([w(k - DELAY) for k in ks], X0 + ks[0] * U, U, YB, 0.28, BLUE_C1, 3)
        masks = VGroup(*[Rectangle(width=4, height=2.4, stroke_width=0, fill_color=config.background_color, fill_opacity=1)
                         .move_to([x, (YA + YB) / 2, 0]) for x in (X0 - 2, X0 + WIN + 2)])
        names = VGroup(label("A", AMBER_C2, 26).move_to([X0 - 0.4, YA, 0]), label("B", BLUE_C1, 26).move_to([X0 - 0.4, YB, 0]))
        self.caption("Sites A and B record the same signal. B is farther away, so it hears every chip a little later.")
        self.play(Create(row_a), Create(row_b), run_time=1.5)
        masks.set_z_index(10)
        names.set_z_index(11)
        self.add(masks, names)
        self.wait(1)

        P = Plot(X0, WIN, -2.75, 2.6, (PTS[0][0], PTS[-1][0]), (0, 1))
        axes = VGroup(P.axes(), P.x_ticks([-40, -20, 0, 20, 40]), P.y_ticks([0, 1], lambda v: f"{v:g}"),
                      label("lag (µs)", GREY, 20).next_to([X0 + WIN, P.y0, 0], UP, buff=0.1).shift(LEFT * 0.4),
                      label("how alike", GREY, 20).next_to([X0, P.y0 + P.height, 0], UP, buff=0.1))
        self.caption("Cross-correlation slides B past A and measures how alike they are at each lag.")
        self.play(FadeIn(axes))
        lag = ValueTracker(PTS[0][0])
        row_b.shift(-PTS[0][0] * U * RIGHT)
        last = [PTS[0][0]]

        def slide(m):
            m.shift((last[0] - lag.get_value()) * U * RIGHT)
            last[0] = lag.get_value()

        row_b.add_updater(slide)
        curve = always_redraw(lambda: P.curve([p[0] for p in PTS if p[0] <= lag.get_value() + 1e-9] or [PTS[0][0]],
                                              [p[1] for p in PTS if p[0] <= lag.get_value() + 1e-9] or [PTS[0][1]], BLUE_C1, 3))
        cursor = always_redraw(lambda: DashedLine([P.px(lag.get_value()), P.y0, 0], [P.px(lag.get_value()), P.y0 + P.height, 0],
                                                  dash_length=0.08, stroke_color=YELLOW, stroke_width=1.5))
        read = always_redraw(lambda: label(f"lag {lag.get_value():+.1f} µs", YELLOW, 22).move_to([X0 + WIN - 1.0, P.y0 + P.height + 0.25, 0]))
        self.add(curve, cursor, read)
        self.caption("Off the right lag the chips disagree as often as they agree, and the sum stays near zero.")
        self.play(lag.animate.set_value(0), run_time=5, rate_func=linear)
        self.caption("Near the right lag the chips start to line up.")
        self.play(lag.animate.set_value(PEAK), run_time=3, rate_func=linear)
        self.caption(f"At +{PEAK:g} µs every chip of B sits under the same chip of A: the peak.")
        self.play(Indicate(row_a, color=YELLOW, scale_factor=1.0), Indicate(row_b, color=YELLOW, scale_factor=1.0))
        self.wait(1.5)
        self.play(lag.animate.set_value(PTS[-1][0]), run_time=4, rate_func=linear)
        row_b.remove_updater(slide)
        mark = VGroup(DashedLine([P.px(PEAK), P.y0, 0], [P.px(PEAK), P.y0 + P.height, 0], dash_length=0.08, stroke_color=GREEN_C3),
                      label(f"peak +{PEAK:g} µs", GREEN_C3, 22).next_to([P.px(PEAK), P.y0 + P.height, 0], RIGHT, buff=0.1).shift(DOWN * 0.2))
        self.caption("The peak is two chips wide at its base. More chips and a stronger signal pin down its top.")
        self.play(FadeIn(mark), FadeOut(cursor), FadeOut(read))
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # From the peak to the hyperbola.
        M = MapView()
        sites = VGroup(*[M.site(*s["p"], s["label"]) for s in DATA["sites"]])
        self.play(FadeIn(M.grid()), FadeIn(sites))
        pad = Scratchpad(height=3.8, width=6.2)
        self.play(*pad.show())
        dr = 0.3 * PEAK
        rows = [
            (f"peak at +{PEAK:.1f} µs", WHITE),
            (f"B heard each chip {PEAK:.1f} µs after A", WHITE),
            (f"range difference = 0.3 × {PEAK:.1f} = {dr:.1f} km", YELLOW),
            (f"B is {dr:.1f} km farther than A", VIOLET),
        ]
        self.caption("A positive lag means the second site, B, heard it later: B is farther away.")
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.8, c, 24), shift=DOWN * 0.15))
            self.wait(1.2)
        self.caption(f"Every point {dr:.1f} km farther from B than from A lies on this hyperbola.")
        self.play(Create(M.curve(DATA["hyperbola"])), run_time=2)
        self.caption("The transmitter is on it. A third site would give the second curve.")
        self.play(FadeIn(M.target(*DATA["target"])))
        self.rule_card(["Δt is the lag of the peak.", "Range difference = 0.3 km × Δt in µs; a positive lag: the second site is farther."], clear=True)
