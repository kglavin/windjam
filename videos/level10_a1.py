"""Level 10, lesson A1: Example, codes sharing a band. Three users' Gold codes add up on the air; despreading with user
1's code pulls its bits out and leaves the others small. Then the BER against the number of users (berCdma, the
lesson's users at their offsets) beside the rule Gp ÷ (K − 1)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level10-A1")
CODES = D["codes"][:3]
BITS = [[1, -1], [-1, -1], [1, 1]]
COLS = [BLUE_C1, AMBER_C2, GREEN_C3]
U = 0.19
X0 = -5.2


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Many users in one band")
        rows = VGroup()
        for u in range(3):
            chips = [BITS[u][b] * c for b in range(2) for c in CODES[u]]
            rows.add(VGroup(label(f"user {u + 1}", COLS[u], 20).move_to([X0 - 0.75, 2.6 - u * 0.9, 0]),
                            chip_wave(chips, X0, U, 2.6 - u * 0.9, 0.25, COLS[u], 2)))
        self.caption("Three users, each with its own code, send at the same time in the same band.")
        self.play(LaggedStart(*[FadeIn(r) for r in rows], lag_ratio=0.3))
        total = [sum(BITS[u][b] * CODES[u][i] for u in range(3)) for b in range(2) for i in range(31)]
        air = VGroup(label("on the air", WHITE, 20).move_to([X0 - 0.75, -0.2, 0]), chip_wave([t / 3 for t in total], X0, U, -0.2, 0.3, WHITE, 2))
        self.caption("On the air they simply add up.")
        moving = [r[1].copy() for r in rows]
        self.play(*[m.animate.move_to(air[1]).set_opacity(0.3) for m in moving], run_time=1.2)
        self.play(*[FadeOut(m) for m in moving], FadeIn(air), run_time=0.6)
        pad = Scratchpad(height=1.9, width=11.0, at=[0, -1.95, 0])
        self.play(*pad.show())
        dot = [sum(CODES[u][i] * CODES[0][i] for i in range(31)) for u in range(3)]
        self.caption("Multiply by user 1's code and add up each bit: user 1's chips all line up.")
        self.play(FadeIn(pad.line(f"user 1: {BITS[0][0] * dot[0]:+d} and {BITS[0][1] * dot[0]:+d}: its bits, at full strength", 0, BLUE_C1, 22)))
        self.play(FadeIn(pad.line(f"users 2 and 3 add only {BITS[1][0] * dot[1]:+d} and {BITS[2][0] * dot[2]:+d}: small leftovers", 0.65, GREY, 22)))
        self.caption("The others do not vanish. Each leaves a little, about its power cut by the processing gain.")
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        P = Plot(-5.6, 9.0, -2.4, 4.6, (2, 10), (-6, 0))
        pts = [p for p in D["berVsUsers"] if p["ber"] > 1e-6]
        axes = VGroup(P.axes(), P.x_ticks([2, 4, 6, 8, 10]),
                      VGroup(*[label(ber_tick(e), GREY, 18).next_to([P.x0, P.py(e), 0], LEFT, buff=0.12) for e in range(-6, 1, 2)]),
                      label("users sharing the band", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45),
                      label("BER", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        rule = P.curve(np.linspace(2.5, 10, 100), [np.log10(max(ber_bpsk(31 / (k - 1)), 1e-9)) for k in np.linspace(2.5, 10, 100)], GREY, 2)
        meas = VGroup(*[Dot([P.px(p["k"]), P.py(np.log10(p["ber"])), 0], color=BLUE_C1, radius=0.08) for p in pts])
        goal = DashedLine([P.x0, P.py(-2), 0], [P.x0 + P.width, P.py(-2), 0], dash_length=0.12, stroke_color=RED, stroke_width=2)
        self.caption("Each user sees the others as noise: SINR ≈ Gp ÷ (K − 1) (grey).")
        self.play(FadeIn(axes), Create(rule), Create(goal))
        self.caption("Real codes at real offsets (blue) do worse than the rule here: each extra user costs everyone.")
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in meas], lag_ratio=0.2))
        self.rule_card(["SINR ≈ Gp ÷ (K − 1). Users that fit a BER of 0.01: about 1 + Gp ÷ 2.7.", "Every extra user is a little more noise for all the others."], clear=True)
