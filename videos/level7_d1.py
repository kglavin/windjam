"""Level 7, lesson D1: Example, one hit hop against three votes. Slow hopping loses a burst of bits on each hit hop;
fast hopping sends each bit on 3 hops and votes, so one hit copy is outvoted. BERs from fhTheoryBer (J/S −3 dB, one
channel jammed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level7-D1")
BER = DATA["ber"]
L = DATA["link"]
JAM = 5
BITS = 8


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("One hit hop against three votes")
        pad = Scratchpad(height=5.2, width=4.3, at=[4.85, 0.5, 0])

        # Slow hopping: hops of 125 bits; one is hit.
        x0, w, y = -6.2, 8.2, 2.6
        hw = w / 8
        blocks = VGroup(*[Rectangle(width=hw - 0.06, height=0.55, stroke_color=BLUE_C1, stroke_width=2, fill_color=BLUE_C1, fill_opacity=0.25)
                          .move_to([x0 + (i + 0.5) * hw, y, 0]) for i in range(8)])
        name = label(f"slow hopping: {L['bitsPerHop']} bits on each hop", GREY, 22).next_to(blocks, UP, buff=0.15).align_to(blocks, LEFT)
        self.caption(f"Slow hopping sends many bits on each hop: {L['bitsPerHop']} in each {L['dwellMs']} ms dwell.")
        self.play(FadeIn(blocks), FadeIn(name))
        rng = np.random.default_rng(4)
        hit = blocks[5]
        ticks = VGroup(*[Line([hit.get_left()[0] + 0.05 + k * (hw - 0.16) / 40, y - 0.25, 0], [hit.get_left()[0] + 0.05 + k * (hw - 0.16) / 40, y + 0.25, 0],
                              stroke_color=RED, stroke_width=2) for k in range(40) if rng.random() < 0.18])
        self.caption("The jammer's one channel catches 1 hop in 16, and 18% of its bits come out wrong: a burst.")
        self.play(hit.animate.set_fill(RED, 0.35).set_stroke(RED), Create(ticks))
        self.play(*pad.show())
        self.play(FadeIn(pad.line("slow:", 0, WHITE, 22)), FadeIn(pad.line(f"BER = 0.18 ÷ 16 = {BER['oneM3']:.3f}", 0.7, YELLOW, 22)))

        # Fast hopping: each bit on 3 hops, voted.
        W = HopWaterfall(-6.2, 8.2, -2.6, 3.2, 16, BITS * 3)
        chans = list(rng.integers(0, 16, BITS * 3))
        chans = [c if c != JAM else (c + 3) % 16 for c in chans]
        chans[3 * 3 + 1] = JAM  # bit 4's second copy lands on the jammed channel
        frame = Rectangle(width=W.width, height=W.height, stroke_color=GREY, stroke_width=1.5).move_to([W.x0 + W.width / 2, W.y0 + W.height / 2, 0])
        row = W.rows(JAM, JAM + 1, RED, 0.3)
        tiles = VGroup(*[W.tile(c, k, 1) for k, c in enumerate(chans)])
        seps = VGroup(*[DashedLine([W.tx(3 * b), W.y0, 0], [W.tx(3 * b), W.y0 + W.height, 0], dash_length=0.08, stroke_color=GREY, stroke_width=1)
                        for b in range(1, BITS)])
        bl = VGroup(*[label(f"bit {b + 1}", GREY, 18).move_to([W.tx(3 * b + 1.5), W.y0 + W.height + 0.2, 0]) for b in range(BITS)])
        fname = label("fast hopping: each bit on 3 hops", GREY, 22).next_to(frame, UP, buff=0.45).align_to(frame, LEFT)
        self.caption("Fast hopping sends each bit 3 times, on 3 hops, on 3 different channels.")
        self.play(FadeIn(frame), FadeIn(row), FadeIn(fname), FadeIn(seps), FadeIn(bl))
        self.play(LaggedStart(*[FadeIn(t, scale=0.6) for t in tiles], lag_ratio=0.15), run_time=3)
        k = 3 * 3 + 1
        self.caption("The same jammed channel catches one copy of bit 4.")
        self.play(tiles[k].animate.set_fill("#ff3b3b"), Circumscribe(tiles[k], color=YELLOW))
        votes = VGroup(*[label("kept", GREEN_C3, 18).move_to([W.tx(3 * b + 1.5), W.y0 - 0.25, 0]) for b in range(BITS)])
        self.caption("The receiver takes a vote. Two clean copies outvote the broken one, and bit 4 is kept.")
        self.play(FadeIn(votes))
        self.play(FadeIn(pad.line("fast, vote of 3:", 1.6, WHITE, 22)), FadeIn(pad.line(f"each copy wrong {BER['oneM3']:.3f}", 2.3, WHITE, 22)))
        self.caption("A bit is lost only when two of its three copies are hit: about 3p².")
        self.play(FadeIn(pad.line(f"3 × {BER['oneM3']:.3f}² ≈ {BER['fastOneM3']:.4f}", 3.0, YELLOW, 22)))
        self.play(FadeIn(pad.line(f"{BER['oneM3'] / BER['fastOneM3']:.0f} times fewer errors", 3.8, GREEN_C3, 22)))
        self.caption("Spreading wider does not help the jammer: one channel is still its best against the vote.")
        self.rule_card(["Fast hopping with a vote turns a partial-band jammer's p", "into about 3p²."], clear=True)
