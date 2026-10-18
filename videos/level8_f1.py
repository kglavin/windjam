"""Level 8, lesson F1: Example, jam the preamble, lose the packet. The same J/S (8 dB) on the preamble only: the
search never locks (searchTrace with the preamble jammed); packet losses and energies from packetErrorRate and
jammerEnergy."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level8-F1")
S = D["search"]
K = D["packets"]
X0, W = -6.2, 12.4


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Jam the sync")
        total = K["preambleChips"] + K["payloadChips"]
        px = lambda c: X0 + c / total * W
        pre = Rectangle(width=px(K["preambleChips"]) - X0, height=0.6, stroke_width=0, fill_color=AMBER_C2, fill_opacity=0.9).move_to([(X0 + px(K["preambleChips"])) / 2, 2.6, 0])
        pay = Rectangle(width=X0 + W - px(K["preambleChips"]), height=0.6, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.8).move_to([(px(K["preambleChips"]) + X0 + W) / 2, 2.6, 0])
        names = VGroup(label(f"preamble: {K['preambleChips']} chips", AMBER_C2, 20).next_to(pre, UP, buff=0.12).align_to(pre, LEFT),
                       label(f"payload: 500 bits, {K['payloadChips']:,} chips", BLUE_C1, 20).next_to(pay, UP, buff=0.12).align_to(pay, RIGHT))
        self.caption("A packet: a short preamble for the search, then the payload.")
        self.play(FadeIn(pre), FadeIn(pay), FadeIn(names))
        jam = Rectangle(width=pre.width, height=1.0, stroke_width=0, fill_color=RED, fill_opacity=0.35).move_to(pre)
        self.caption("Jam only the preamble, at J/S 8 dB.")
        self.play(FadeIn(jam))

        P = Plot(-6.2, 9.0, -2.6, 3.4, (0, S["n"]), (-2.5, 6))
        z = S["jammed"]["z"]
        bw = P.width / S["n"] * 0.75
        bars = VGroup(*[Rectangle(width=bw, height=max(abs(P.py(v) - P.py(0)), 0.01), stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.9)
                        .move_to([P.px(i + 0.5), (P.py(v) + P.py(0)) / 2, 0]) for i, v in enumerate(z)])
        thr = DashedLine([P.x0, P.py(S["threshold"]), 0], [P.x0 + P.width, P.py(S["threshold"]), 0], dash_length=0.12, stroke_color=RED, stroke_width=2.5)
        base = Line([P.x0, P.py(0), 0], [P.x0 + P.width, P.py(0), 0], stroke_color=GREY, stroke_width=1)
        self.caption(f"The jammer pulls the right phase's peak down from {S['mean']:.2f} to about {S['jammed']['mean']:.2f}, under the threshold.")
        self.play(FadeIn(base), Create(thr))
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN if z[i] >= 0 else UP) for i, b in enumerate(bars)], lag_ratio=0.15), run_time=4)
        k = S["jammed"]["k"]
        self.play(bars[k].animate.set_fill(AMBER_C2), Circumscribe(bars[k], color=YELLOW))
        self.caption("The right phase came round, but stayed under the threshold. No lock: the whole packet is lost.")
        self.play(pay.animate.set_fill(GREY, 0.4))
        self.clear_caption()
        self.play(*[FadeOut(m) for m in [bars, thr, base]])

        pad = Scratchpad(height=3.6, width=9.0, at=[0, -1.2, 0])
        self.play(*pad.show())
        rows = [(f"preamble only: {100 * K['perPre']:.0f}% of packets lost", AMBER_C2),
                (f"payload only, same J/S: {100 * K['perPay']:.0f}% lost", BLUE_C1),
                (f"but the payload jammer is on {K['energyRatio']:.0f} times as long", YELLOW),
                (f"so it spends {K['energyRatio']:.0f} times the energy", YELLOW)]
        self.caption("Compare with jamming the payload at the same J/S.")
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.7, c, 24)))
            self.wait(1)
        self.caption("Breaking the search costs a fraction of the energy: sync is the link's weak point.")
        self.rule_card(["Jam the preamble: J/S ≈ 10 × log10(2n ÷ 9.6) dB loses most packets,", "for a fraction of the energy of jamming the payload."], clear=True)
