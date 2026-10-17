"""Level 3, lesson D1: Example, long pulses or short ones.

Both jammers are on duty·100% of the time at J/S averaged, so while on a chip's noise has power J/(S·duty), sd
√(J/S / duty) in signal-chip units. One bit's chips are added up: signal n, noise the sum of the chips' noise. The
noise draw is fixed (SEED) and was picked as typical: the short pulses leave the bit right, the long pulse breaks it,
as it does about 22 times in 100."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level3-D1")
N = DATA["n"]
JS = DATA["jsDb"]
DUTY = DATA["duty"]
LONG_P = DATA["longPeriodChips"]
SHORT_P = DATA["shortPeriodChips"]
BITS_SHOWN = LONG_P // N           # bits in one long-pulse period
HIT_BIT = 3                        # the bit the long pulse covers, and the one we look inside
SHORT_OFF = 5                      # where the short pulses start, in chips
SD = np.sqrt(10 ** (JS / 10) / DUTY)
SEED = 321

_rng = np.random.default_rng(SEED)
SHORT_HITS = [c - HIT_BIT * N for c in range(SHORT_OFF, LONG_P, SHORT_P) if HIT_BIT * N <= c < (HIT_BIT + 1) * N]
SHORT_NOISE = dict(zip(SHORT_HITS, _rng.normal(0, SD, len(SHORT_HITS))))
LONG_NOISE = _rng.normal(0, SD, N)

# Timeline: one long-pulse period
TX0, TW = -4.8, 11.2
TU = TW / LONG_P
BITS_Y, LONG_Y, SHORT_Y = 3.2, 2.3, 1.45
# Inside one bit
CX0, CU = -4.8, 0.25
ZERO_Y = -1.2
SC = 0.04                          # scene units per signal-chip unit
SIG_X, NOI_X, SUM_X = 3.9, 4.8, 5.7


def fmt(v, d=1):
    return f"{'+' if v >= 0 else '−'}{abs(v):.{d}f}"


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Long pulses or short ones")

        # 1. The timeline
        boxes = VGroup(*[
            Rectangle(width=N * TU, height=0.45, stroke_color=GREY, stroke_width=1.5).move_to([TX0 + (i + 0.5) * N * TU, BITS_Y, 0])
            for i in range(BITS_SHOWN)
        ])
        box_t = VGroup(*[label(f"bit {i + 1}", GREY, 18).move_to(b) for i, b in enumerate(boxes)])
        long_pulse = Rectangle(width=N * TU, height=0.55, stroke_width=0, fill_color=RED, fill_opacity=0.85).move_to(
            [TX0 + (HIT_BIT + 0.5) * N * TU, LONG_Y, 0])
        short_pulses = VGroup(*[
            Rectangle(width=TU, height=0.55, stroke_width=0, fill_color=RED, fill_opacity=0.9).move_to([TX0 + (c + 0.5) * TU, SHORT_Y, 0])
            for c in range(SHORT_OFF, LONG_P, SHORT_P)
        ])
        base = VGroup(*[Line([TX0, y - 0.275, 0], [TX0 + TW, y - 0.275, 0], color=GREY, stroke_width=1) for y in (LONG_Y, SHORT_Y)])
        names = VGroup(label("one-bit pulses", RED, 20).move_to([TX0 - 1.3, LONG_Y, 0]),
                       label("one-chip pulses", RED, 20).move_to([TX0 - 1.3, SHORT_Y, 0]),
                       label("bits", GREY, 20).move_to([TX0 - 1.3, BITS_Y, 0]))
        t_ax = VGroup(label("0", GREY, 18).move_to([TX0, SHORT_Y - 0.5, 0]),
                      label(f"{LONG_P} µs", GREY, 18).move_to([TX0 + TW, SHORT_Y - 0.5, 0]))

        self.caption(f"Two jammers, both on {DUTY:.0%} of the time with the same power.")
        self.play(FadeIn(boxes), FadeIn(box_t), FadeIn(names[2]), FadeIn(t_ax))
        self.play(FadeIn(base), FadeIn(names[:2]))
        self.caption(f"One sends a pulse a whole bit long ({N} µs) every {LONG_P} µs.")
        self.play(GrowFromEdge(long_pulse, DOWN))
        self.caption(f"The other sends a pulse one chip long (1 µs) every {SHORT_P} µs.")
        self.play(LaggedStart(*[GrowFromEdge(p, DOWN) for p in short_pulses], lag_ratio=0.05), run_time=2)
        self.caption(f"Same average power, so each pulse is {1 / DUTY:.0f} times stronger than the jammer's average.")

        # 2. Inside one bit, short pulses
        hl = SurroundingRectangle(boxes[HIT_BIT], color=WHITE, buff=0.05)
        chips_end = CX0 + N * CU
        zoom = VGroup(Line(hl.get_corner(DL), [CX0, ZERO_Y + 0.1, 0]), Line(hl.get_corner(DR), [chips_end, ZERO_Y + 0.1, 0])).set_stroke(WHITE, 1, opacity=0.4)
        inside = label(f"Inside bit {HIT_BIT + 1}: {N} chips", WHITE, 22).move_to([CX0, ZERO_Y - 1.3, 0], aligned_edge=LEFT)
        zero = Line([CX0, ZERO_Y, 0], [SUM_X + 0.5, ZERO_Y, 0], color=GREY, stroke_width=1.2)
        ticks = VGroup(*[Line([CX0 + k * CU, ZERO_Y - 0.05, 0], [CX0 + k * CU, ZERO_Y + 0.05, 0], color=GREY, stroke_width=1) for k in range(N + 1)])
        self.caption(f"Look inside bit {HIT_BIT + 1}. The receiver adds up its {N} chips.")
        self.play(Create(hl), Create(zoom), FadeIn(inside), FadeIn(zero), FadeIn(ticks))

        sig = Rectangle(width=0.5, height=N * SC, stroke_width=0, fill_color=BLUE_C1, fill_opacity=0.9).move_to([SIG_X, ZERO_Y + N * SC / 2, 0])
        sig_t = label(f"signal +{N}", BLUE_C1, 20).next_to(sig, UP, buff=0.08)
        self.caption(f"The signal's chips all point the same way: they add up to {N}.")
        self.play(GrowFromEdge(sig, DOWN), FadeIn(sig_t))

        vals = [SHORT_NOISE.get(k, 0.0) for k in range(N)]
        bars = VGroup(*[
            Rectangle(width=CU * 0.6, height=max(abs(v) * SC, 1e-3), stroke_width=0, fill_color=RED, fill_opacity=0.85)
            .move_to([CX0 + (k + 0.5) * CU, ZERO_Y + v * SC / 2, 0]) for k, v in enumerate(vals)
        ])
        self.caption(f"The one-chip pulses hit {len(SHORT_HITS)} of them, hard. The other {N - len(SHORT_HITS)} chips are quiet.")
        self.play(FadeIn(bars))
        hit_idx = [k for k in range(N) if k in SHORT_NOISE]
        stack = stack_targets([bars[k] for k in hit_idx], [vals[k] for k in hit_idx], NOI_X, ZERO_Y, SC, width=0.5)
        noise_sum = sum(vals)
        self.caption("Add up the noise: the loud chips are mixed with the quiet ones.")
        self.play(*[Transform(bars[k], t) for k, t in zip(hit_idx, stack)], run_time=2)
        n_t = label(f"noise {fmt(noise_sum)}", RED, 20).next_to([NOI_X, ZERO_Y + min(0, noise_sum) * SC, 0], DOWN, buff=0.08)
        total = N + noise_sum
        tot = Rectangle(width=0.5, height=abs(total) * SC, stroke_width=0, fill_color=WHITE, fill_opacity=0.85).move_to([SUM_X, ZERO_Y + total * SC / 2, 0])
        tot_t = label(f"sum {fmt(total)}: right", GREEN_C3, 20).next_to(tot, UP, buff=0.08)
        self.play(FadeIn(n_t))
        self.caption(f"The bit still comes out right. On average this is just like broadband noise: BER {DATA['berShort']:.2g}.")
        self.play(GrowFromEdge(tot, DOWN), FadeIn(tot_t))

        # 3. The long pulse on the same bit
        self.caption("Now the one-bit pulse. It covers this whole bit.")
        self.play(FadeOut(VGroup(*[bars[k] for k in range(N)])), FadeOut(n_t), FadeOut(tot), FadeOut(tot_t),
                  Indicate(long_pulse, color=RED, scale_factor=1.05))
        lbars = VGroup(*[
            Rectangle(width=CU * 0.6, height=abs(v) * SC, stroke_width=0, fill_color=RED, fill_opacity=0.85)
            .move_to([CX0 + (k + 0.5) * CU, ZERO_Y + v * SC / 2, 0]) for k, v in enumerate(LONG_NOISE)
        ])
        self.caption(f"All {N} chips are hit. There are no quiet chips to dilute the noise.")
        self.play(LaggedStart(*[FadeIn(b) for b in lbars], lag_ratio=0.03), run_time=1.5)
        lstack = stack_targets(list(lbars), list(LONG_NOISE), NOI_X, ZERO_Y, SC, width=0.5)
        self.play(*[Transform(b, t) for b, t in zip(lbars, lstack)], run_time=2.5)
        lsum = float(LONG_NOISE.sum())
        ln_t = label(f"noise {fmt(lsum)}", RED, 20).next_to([NOI_X, ZERO_Y + min(0, lsum) * SC, 0], DOWN, buff=0.08)
        ltotal = N + lsum
        ltot = Rectangle(width=0.5, height=abs(ltotal) * SC, stroke_width=0, fill_color=WHITE, fill_opacity=0.85).move_to([SUM_X, ZERO_Y + ltotal * SC / 2, 0])
        ltot_t = label(f"sum {fmt(ltotal)}: wrong", RED, 20).move_to([SUM_X, ZERO_Y + 0.25, 0])
        self.play(FadeIn(ln_t), GrowFromEdge(ltot, UP), FadeIn(ltot_t))
        self.caption(f"Here it comes out wrong. About {DATA['berInPulse'] * 100:.0f} in 100 bits hit by a pulse do.")
        self.caption(f"The other {BITS_SHOWN - 1} bits in every {BITS_SHOWN} see no jammer at all.")
        self.play(*[Indicate(b, color=GREEN_C3, scale_factor=1.0) for i, b in enumerate(boxes) if i != HIT_BIT])

        # 4. Scratchpad
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=4.3, width=11.5, at=[0, 0.7, 0])
        self.play(*pad.show())
        ebj0 = 10 * np.log10(N) - JS
        in_pulse = ebj0 - 10 * np.log10(1 / DUTY)
        rows = [
            (f"One-chip pulses: {len(SHORT_HITS)} loud chips and {N - len(SHORT_HITS)} quiet ones in every bit", WHITE),
            (f"each bit's sum sees noise just like broadband noise: BER {DATA['berShort']:.2g}", GREY),
            (f"One-bit pulses: {BITS_SHOWN - 1} bits in {BITS_SHOWN} clean, no errors", WHITE),
            (f"1 bit in {BITS_SHOWN} hit: Eb/J0 = {ebj0:.1f} − {10 * np.log10(1 / DUTY):.0f} = {in_pulse:.1f} dB, BER {DATA['berInPulse']:.2f}".replace("-", "−"), GREY),
        ]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 1.0, c, 26), shift=DOWN * 0.15))
            self.wait(2.5)
        res = pad.line(f"Overall: {DUTY:g} × {DATA['berInPulse']:.2f} = {DATA['berLong']:.3f}, {DATA['berLong'] / DATA['berShort']:.0f} times worse", 4.4, AMBER_C2, 28)
        self.play(FadeIn(res, shift=DOWN * 0.15))
        self.play(Create(SurroundingRectangle(res, color=AMBER_C2, buff=0.12, corner_radius=0.08)))
        self.wait(2)
        self.rule_card(["A pulse must last at least one whole bit,", "or the receiver averages it away."])
