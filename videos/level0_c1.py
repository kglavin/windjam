"""Level 0, lesson C1: Carrier and keying. ASK, FSK and PSK side by side; BPSK as +1 and −1."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

BITS = [1, 0, 1, 1, 0]
CYC = 2                       # carrier cycles per bit
X0, W = -4.2, 10.6
BW = W / len(BITS)
A = 0.38
ROWS = {"bits": 2.9, "carrier": 1.75, "ASK": 0.6, "FSK": -0.55, "PSK": -1.7}


def wave(y, fn, color, n=900):
    xs = np.linspace(0, len(BITS), n)
    return VMobject(stroke_color=color, stroke_width=3).set_points_as_corners(
        [[X0 + x * BW, y + A * fn(x), 0] for x in xs])


def bit_of(x):
    return BITS[min(int(x), len(BITS) - 1)]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Putting bits on a wave")
        names = {k: label(k if k != "bits" else "bits", GREY if k in ("bits", "carrier") else WHITE, 22).move_to([X0 - 1.2, y, 0]) for k, y in ROWS.items()}
        bounds = VGroup(*[DashedLine([X0 + i * BW, ROWS["PSK"] - 0.5, 0], [X0 + i * BW, ROWS["bits"] + 0.3, 0], color=GREY,
                                     stroke_width=1, dash_length=0.06).set_opacity(0.4) for i in range(1, len(BITS))])
        bit_t = VGroup(*[label(str(b), BLUE_C1, 30).move_to([X0 + (i + 0.5) * BW, ROWS["bits"], 0]) for i, b in enumerate(BITS)])

        carrier = wave(ROWS["carrier"], lambda x: np.sin(2 * np.pi * CYC * x), GREY)
        self.caption("A transmitter starts from a steady wave at one frequency: the carrier.")
        self.play(FadeIn(names["carrier"]), Create(carrier), run_time=2)
        self.caption("To send bits, ones and zeros, it changes the carrier.")
        self.play(FadeIn(names["bits"]), FadeIn(bit_t), FadeIn(bounds))

        ask = wave(ROWS["ASK"], lambda x: bit_of(x) * np.sin(2 * np.pi * CYC * x), AMBER_C2)
        self.caption("ASK changes the height: on for a 1, off for a 0.")
        self.play(FadeIn(names["ASK"]), Create(ask), run_time=2.5)
        fsk = wave(ROWS["FSK"], lambda x: np.sin(2 * np.pi * (CYC * 1.5 if bit_of(x) else CYC * 0.75) * x), GREEN_C3)
        self.caption("FSK changes the frequency: one note for a 1, another for a 0.")
        self.play(FadeIn(names["FSK"]), Create(fsk), run_time=2.5)
        psk = wave(ROWS["PSK"], lambda x: (1 if bit_of(x) else -1) * np.sin(2 * np.pi * CYC * x), BLUE_C1)
        self.caption("PSK changes the phase: for a 0 the wave is turned upside down.")
        self.play(FadeIn(names["PSK"]), Create(psk), run_time=2.5)

        # BPSK: the phase is the bit
        self.caption("The links in this lab use PSK with two phases: BPSK.")
        self.play(FadeOut(VGroup(ask, fsk, names["ASK"], names["FSK"])), Indicate(psk, color=BLUE_C1, scale_factor=1.0))
        pm = VGroup(*[label("+1" if b else "−1", BLUE_C1, 30).move_to([X0 + (i + 0.5) * BW, ROWS["bits"], 0]) for i, b in enumerate(BITS)])
        self.caption("Each bit is written +1 (the wave as it is) or −1 (the wave upside down).")
        self.play(Transform(bit_t, pm))
        self.play(psk.animate.move_to([psk.get_center()[0], ROWS["ASK"], 0]), names["PSK"].animate.move_to([X0 - 1.2, ROWS["ASK"], 0]))

        # Zoom on one bit: 180 degrees
        i = 1
        seg_c = wave(-1.6, lambda x: np.sin(2 * np.pi * CYC * x), GREY)
        seg_p = wave(-1.6, lambda x: -np.sin(2 * np.pi * CYC * x), BLUE_C1)
        clip = lambda m: m.pointwise_become_partial(m, i / len(BITS), (i + 1) / len(BITS))  # noqa: E731
        clip(seg_c)
        clip(seg_p)
        seg_c.set_stroke(opacity=0.6)
        both = VGroup(seg_c, seg_p).scale(1.6).move_to([0, -1.55, 0])
        t1 = label("+1: as it is", GREY, 22).next_to(both, LEFT, buff=0.4)
        t2 = label("−1: upside down, shifted 180°", BLUE_C1, 22).next_to(both, RIGHT, buff=0.4)
        self.caption("Upside down is half a cycle: a 180° shift of phase.")
        self.play(Create(seg_c), FadeIn(t1))
        self.play(TransformFromCopy(seg_c, seg_p), FadeIn(t2), run_time=1.5)
        self.caption("The phase is the bit itself. That is why the later levels draw bits as +1 and −1.")
        self.rule_card(["In BPSK each bit is the carrier's phase:", "+1 as it is, −1 turned upside down (180°)."], clear=True)
