"""Level 7, lesson A1: Example, reading the hop set. The example link's first 32 hops (hopPreview) land on the
waterfall; the band, the channel width and the dwell give channels, hop rate and Gp."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level7-A1")
L = DATA["link"]
HOPS = DATA["hops"]
N, DW = L["channels"], L["dwellMs"]
W = HopWaterfall(-4.9, 6.9, -2.5, 5.4, N, len(HOPS) * DW)


def vbracket(x, y0, y1, color=YELLOW):
    return VGroup(Line([x, y0, 0], [x, y1, 0]), Line([x, y0, 0], [x - 0.12, y0, 0]), Line([x, y1, 0], [x - 0.12, y1, 0])).set_stroke(color, 2.5)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Reading the hop set")
        frame = W.frame()
        self.caption("A hopping link sends on one narrow channel, then jumps to another, many times a second.")
        self.play(FadeIn(frame))
        tiles = VGroup(*[W.tile(h["c"], h["t"], DW) for h in HOPS])
        self.play(LaggedStart(*[FadeIn(t, scale=0.6) for t in tiles], lag_ratio=0.5), run_time=6)
        self.caption("This is a waterfall: time across, frequency up. Each tile is one hop.")
        self.caption("The order looks random. Only the link's own receiver knows it.")

        pad = Scratchpad(height=4.4, width=4.3, at=[4.85, 0.9, 0])
        self.play(*pad.show())
        band = vbracket(W.x0 + W.width + 0.25, W.y0, W.y0 + W.height)
        self.caption("The band runs from 30.000 to 30.400 MHz: 400 kHz wide.")
        self.play(Create(band), FadeIn(pad.line("band: 400 kHz", 0, WHITE, 24)))
        row = W.rows(HOPS[0]["c"], HOPS[0]["c"] + 1, YELLOW, 0.3)
        self.caption("The tiles sit on steps 25 kHz apart: one channel each.")
        self.play(FadeIn(row), FadeIn(pad.line("channel: 25 kHz", 0.75, WHITE, 24)))
        self.play(FadeIn(pad.line(f"channels = 400 ÷ 25 = {N}", 1.5, YELLOW, 22)))
        self.play(FadeOut(row))
        first = tiles[0]
        dwell = VGroup(SurroundingRectangle(first, color=YELLOW, buff=0.05), label(f"one dwell: {DW} ms", YELLOW, 20).next_to(first, UP, buff=0.15).shift(RIGHT * 1.3))
        self.caption(f"Each tile lasts {DW} ms: the dwell. That is {1000 // DW} hops a second.")
        self.play(Create(dwell), Indicate(first, color=YELLOW), FadeIn(pad.line(f"dwell {DW} ms: {1000 // DW} hops/s", 2.25, WHITE, 24)))
        self.caption("Noise spread over the whole band gives each channel only 1/16 of it.")
        self.play(FadeIn(W.rows(0, N, RED, 0.12)))
        self.play(FadeIn(pad.line(f"Gp = {N} = {10 * np.log10(N):.1f} dB", 3.0, GREEN_C3, 26)))
        self.caption("So against broadband noise the gain is the number of channels.")
        self.rule_card(["Channels = band width ÷ channel width.", "Against broadband noise, Gp = number of channels."], clear=True)
