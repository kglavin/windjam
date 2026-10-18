"""Level 7, lesson F2: Time hopping and hybrid links. Bursts in random slots: a jammer must cover all the time or
guess, a peak detector sees the bursts, a long-averaging one does not. A hybrid link: direct sequence inside each hop,
the gains multiply."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

FRAMES, SLOTS = 8, 8
X0, WIDTH, Y0 = -6.2, 12.4, 0.6


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Time hopping and hybrid links")
        rng = np.random.default_rng(11)
        slot_w = WIDTH / (FRAMES * SLOTS)
        axis = Line([X0, Y0, 0], [X0 + WIDTH, Y0, 0], stroke_color=GREY, stroke_width=2)
        frames = VGroup(*[DashedLine([X0 + f * SLOTS * slot_w, Y0, 0], [X0 + f * SLOTS * slot_w, Y0 + 2.6, 0], dash_length=0.08, stroke_color=GREY, stroke_width=1)
                          for f in range(FRAMES + 1)])
        slots = [int(rng.integers(0, SLOTS)) for _ in range(FRAMES)]
        bursts = VGroup(*[Rectangle(width=slot_w * 0.9, height=2.2, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.9)
                          .move_to([X0 + (f * SLOTS + s + 0.5) * slot_w, Y0 + 1.1, 0]) for f, s in enumerate(slots)])
        name = label("time: each frame has 8 slots, the link sends in one, chosen at random", GREY, 22).next_to(axis, DOWN, buff=0.25)
        self.caption("Time hopping sends short bursts, each in a time slot chosen at random from a frame.")
        self.play(Create(axis), FadeIn(frames), FadeIn(name))
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in bursts], lag_ratio=0.3), run_time=3)
        self.caption("A jammer has to cover all the time, or guess the slots and miss most of them.")
        guess = VGroup(*[Rectangle(width=slot_w * 0.9, height=2.4, stroke_width=0, fill_color=RED, fill_opacity=0.3)
                         .move_to([X0 + (f * SLOTS + (s + 3) % SLOTS + 0.5) * slot_w, Y0 + 1.2, 0]) for f, s in enumerate(slots)])
        self.play(FadeIn(guess))
        self.play(FadeOut(guess))

        thr = DashedLine([X0, Y0 + 1.6, 0], [X0 + WIDTH, Y0 + 1.6, 0], dash_length=0.12, stroke_color=YELLOW, stroke_width=2)
        thr_l = label("peak detector threshold", YELLOW, 20).next_to(thr, UP, buff=0.05).align_to(thr, RIGHT)
        self.caption("Hidden? Not from a detector that looks for peaks: every burst stands out.")
        self.play(Create(thr), FadeIn(thr_l))
        self.play(*[Indicate(b, color=YELLOW) for b in bursts])
        avg = Rectangle(width=WIDTH, height=2.2 / SLOTS, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.5).move_to([X0 + WIDTH / 2, Y0 + 1.1 / SLOTS, 0])
        self.caption("Only a detector that averages over a long time sees the low average and misses it.")
        self.play(FadeOut(thr), FadeOut(thr_l), ReplacementTransform(bursts.copy(), avg))
        self.wait(1.5)
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # Hybrid: direct sequence inside each hop.
        W = HopWaterfall(-4.9, 5.2, -2.4, 4.4, 16, 8)
        rng2 = np.random.default_rng(5)
        tiles = VGroup(*[W.tile(int(rng2.integers(0, 16)), k, 1) for k in range(8)])
        self.caption("A hybrid link does both: it hops, and inside each hop it spreads with a code of chips.")
        self.play(FadeIn(W.frame(ticks=())), FadeIn(tiles))
        big = tiles[3]
        code = [1, -1, -1, 1, -1, 1, 1, 1, -1, -1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, 1, 1, -1, 1, -1, 1]
        wave = chip_wave(code, 0.6, 0.2, 1.2, 0.35, AMBER_C2, 3)
        zoom = DashedLine(big.get_right(), [0.6, 1.2, 0], dash_length=0.08, stroke_color=GREY)
        self.play(Indicate(big, color=YELLOW), Create(zoom), Create(wave))
        self.play(FadeIn(label("31 chips per bit inside the hop", AMBER_C2, 22).next_to(wave, UP, buff=0.3)))
        pad = Scratchpad(height=2.4, width=6.2, at=[3.7, -1.5, 0])
        self.play(*pad.show())
        self.caption("Against broadband noise the gains multiply: chips per bit times channels.")
        self.play(FadeIn(pad.line("Gp = 31 × 16 = 496", 0, YELLOW, 24)))
        self.play(FadeIn(pad.line("= 10 × log10(496) = 27.0 dB", 0.8, YELLOW, 24)))
        self.rule_card(["Time hopping hides from averaging detectors, not from peak detectors.",
                        "A hybrid link multiplies the gains: chips per bit × channels."], clear=True)
