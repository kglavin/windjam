"""Level 7, lesson F1: The swept jammer. A fixed partial band of 2 channels, a link that learns to avoid them
(adaptive hopping), and a sweep 2 channels wide that reaches every channel. BERs from fhTheoryBer (J/S 0 dB)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level7-F1")
L = DATA["link"]
HOPS = DATA["hops"]
BER = DATA["ber"]
N, DW = L["channels"], L["dwellMs"]
T_END = len(HOPS) * DW
W = HopWaterfall(-4.9, 6.9, -2.5, 5.4, N, T_END)
SWEEP_MS, WIDTH = 37, 2
FIXED = (6, 8)  # the fixed partial band's channels


def swept(c, t):
    p = ((t / SWEEP_MS) % 1) * N
    return ((c - p) % N) < WIDTH


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The swept jammer")
        tiles = VGroup(*[W.tile(h["c"], h["t"], DW) for h in HOPS])
        self.play(FadeIn(W.frame()), FadeIn(tiles))
        pad = Scratchpad(height=4.4, width=4.3, at=[4.85, 0.9, 0])
        self.play(*pad.show())

        band = W.rows(*FIXED, RED, 0.35)
        hit = [i for i, h in enumerate(HOPS) if FIXED[0] <= h["c"] < FIXED[1]]
        self.caption("A fixed partial band: 2 channels of the 16, at J/S 0 dB.")
        self.play(FadeIn(band))
        self.bring_to_front(tiles)
        self.play(*[tiles[i].animate.set_fill("#ff3b3b") for i in hit])
        self.play(FadeIn(pad.line("fixed, 2 channels:", 0, WHITE, 20)), FadeIn(pad.line(f"BER {BER['two0']:.3f}", 0.7, YELLOW, 20)))

        # Adaptive hopping: the link notices and stops using the jammed channels.
        moved = VGroup(*[W.tile((h["c"] + 2) % N if FIXED[0] <= h["c"] < FIXED[1] else h["c"], h["t"], DW) for h in HOPS])
        self.caption("A link that notices two jammed channels can stop using them: adaptive hopping.")
        self.play(Transform(tiles, moved), run_time=1.5)
        self.play(FadeIn(pad.line("adaptive link: no hits", 1.5, GREEN_C3, 20)))
        self.play(FadeOut(band))

        # The sweep reaches every channel.
        slices = VGroup()
        for i in range(160):
            t = (i + 0.5) / 160 * T_END
            p = ((t / SWEEP_MS) % 1) * N
            for k in range(WIDTH):
                c = int(np.floor(p + k)) % N
                slices.add(Rectangle(width=W.width / 160 + 0.01, height=W.height / N, stroke_width=0, fill_color=RED, fill_opacity=0.35)
                           .move_to([W.tx(t), W.ty(c + 0.5), 0]))
        self.caption("A sweep is a partial band that moves: 2 channels wide, sliding across the band and starting over.")
        self.play(LaggedStart(*[FadeIn(s) for s in slices], lag_ratio=0.01), run_time=4)
        self.bring_to_front(tiles)
        hit2 = [i for i, h in enumerate(HOPS) if swept(h["c"] if not FIXED[0] <= h["c"] < FIXED[1] else (h["c"] + 2) % N, h["t"] + DW / 2)]
        self.caption("It reaches every channel, so the adaptive link cannot hide from it.")
        self.play(*[tiles[i].animate.set_fill("#ff3b3b") for i in hit2])
        self.play(FadeIn(pad.line("sweep, 2 channels wide:", 2.3, WHITE, 20)), FadeIn(pad.line(f"BER {BER['sweep0']:.3f}", 3.0, YELLOW, 20)))
        self.caption("Each channel is jammed 2 ÷ 16 of the time: the same share, so about the same BER.")
        self.rule_card(["A sweep w channels wide covers each channel w ÷ N of the time.",
                        "Same BER as a fixed partial band, and no channel is safe."], clear=True)
