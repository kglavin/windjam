"""Level 7, lesson C1: Example, squeeze the noise into a few channels. The same jammer (J/S −3 dB) over all 16
channels, then in one: the hops that land there break. Then the contrast with direct sequence (level 3). BERs from
fhTheoryBer."""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level7-C1")
L = DATA["link"]
HOPS = DATA["hops"]
BER = DATA["ber"]
N, DW = L["channels"], L["dwellMs"]
W = HopWaterfall(-4.9, 6.9, -2.5, 5.4, N, len(HOPS) * DW)
JAM = Counter(h["c"] for h in HOPS).most_common(1)[0][0]  # a channel several of these hops use


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Squeeze the noise into a few channels")
        tiles = VGroup(*[W.tile(h["c"], h["t"], DW) for h in HOPS])
        self.play(FadeIn(W.frame()), FadeIn(tiles))
        pad = Scratchpad(height=4.4, width=4.3, at=[4.85, 0.9, 0])
        self.play(*pad.show())

        spread = W.rows(0, N, RED, 0.12)
        self.caption("A jammer at J/S −3 dB spreads its power over all 16 channels.")
        self.play(FadeIn(spread))
        self.play(FadeIn(pad.line("spread: 1/16 per channel", 0, WHITE, 20)))
        self.caption("Each hop meets only 1/16 of it: Eb/J0 of 32, about 1 wrong bit in 10 million.")
        self.play(FadeIn(pad.line("BER ≈ 0.0000001", 0.7, GREY, 20)))

        one = W.rows(JAM, JAM + 1, RED, 0.6)
        self.caption("Now squeeze the same power into one channel: 16 times stronger there.")
        self.play(ReplacementTransform(spread, one), run_time=1.5)
        self.bring_to_front(tiles)
        hit = [i for i, h in enumerate(HOPS) if h["c"] == JAM]
        self.caption("Most hops miss it and come through clean.")
        self.wait(1)
        self.caption("The ones that land there meet Eb/J0 of 2: 18% of their bits are wrong.")
        self.play(*[tiles[i].animate.set_fill("#ff3b3b") for i in hit], *[Circumscribe(tiles[i], color=YELLOW) for i in hit])
        times = round(BER['oneM3'] / BER['bbnM3'], -4)
        rows = [("one channel: 1 hop in 16", WHITE), (f"BER = 0.18 ÷ 16 = {BER['oneM3']:.3f}", YELLOW),
                (f"about {times:,.0f} times", GREEN_C3), ("the broadband BER", GREEN_C3)]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, 1.55 + i * 0.7, c, 20)))
        self.caption("The best number of channels is about 2 × J/S as a ratio: here 2 × 0.5 = 1.")
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # The contrast: direct sequence spreads the block back out.
        P = Plot(-6.0, 5.2, -1.6, 3.6, (-2, 2), (0, 1.3))
        Q = Plot(1.0, 5.2, -1.6, 3.6, (-2, 2), (0, 1.3))
        fs = np.linspace(-2, 2, 300)
        sig = [0.35 * pulse_psd(f, 1) for f in fs]
        blk = Rectangle(width=P.px(0.25) - P.px(-0.25), height=P.py(1.1) - P.py(0), stroke_width=0, fill_color=RED, fill_opacity=0.6).move_to(
            [P.px(0), (P.py(1.1) + P.py(0)) / 2, 0])
        left = VGroup(P.axes(), P.curve(fs, sig, BLUE_C1, 3), blk, label("direct sequence: before despreading", GREY, 20).next_to([P.px(0), P.y0 + P.height, 0], UP, buff=0.1))
        narrow = [1.2 * pulse_psd(f, 6) / 6 for f in fs]
        flat = Rectangle(width=Q.px(2) - Q.px(-2), height=Q.py(0.1) - Q.py(0), stroke_width=0, fill_color=RED, fill_opacity=0.6).move_to(
            [Q.px(0), (Q.py(0.1) + Q.py(0)) / 2, 0])
        right = VGroup(Q.axes(), Q.curve(fs, narrow, BLUE_C1, 3), flat, label("after despreading", GREY, 20).next_to([Q.px(0), Q.y0 + Q.height, 0], UP, buff=0.1))
        self.caption("Against direct sequence it is the opposite (level 3).")
        self.play(FadeIn(left))
        self.caption("Despreading gathers the signal and spreads the jammer's block thin, wherever it sat.")
        self.play(TransformFromCopy(left, right), run_time=2)
        self.caption("So squeezing noise gains nothing against direct sequence, and almost everything against hopping.")
        self.rule_card(["Against hopping, jam about 2 × J/S (as a ratio) channels.",
                        "The BER then falls only as 1 ÷ Eb/J0, not exponentially."], clear=True)
