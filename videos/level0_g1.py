"""Level 0, lesson G1: Inside a radio. Transmit and receive chains as blocks, and the power level after each one: a
typical set of numbers (0 dBm out of the DAC, a 48 dB power amplifier, 110 dB of path, a 25 dB LNA, a 30 dB IF amp)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

TY, RY = 2.1, -1.0        # the two rows
XS = [-4.3, -2.4, -0.5, 1.4, 3.3]
ANT_X = 5.6
BW, BH = 1.6, 0.85


def block(text, x, y, color):
    box = RoundedRectangle(width=BW, height=BH, corner_radius=0.1, stroke_color=color, stroke_width=2).move_to([x, y, 0])
    return VGroup(box, label(text, color, 17).move_to([x, y, 0]))


def antenna(x, y, color, up=True):
    s = 1 if up else -1
    return VGroup(Line([x, y, 0], [x, y + s * 0.6, 0]), Line([x, y + s * 0.6, 0], [x - 0.2, y + s * 0.85, 0]),
                  Line([x, y + s * 0.6, 0], [x + 0.2, y + s * 0.85, 0])).set_stroke(color, 4)


def lvl(v):
    return f"{v:+d} dBm".replace("+0", "0").replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Inside a radio")

        # Transmitter row, left to right
        tx_names = ["DSP:\ncode, BPSK", "DAC", "mixer", "filter", "power\namplifier"]
        tx_lv = [0, 0, -7, -8, 40]
        tx = [block(t, x, TY, BLUE_C1) for t, x in zip(tx_names, XS)]
        tx_ant = antenna(ANT_X, TY - 0.1, BLUE_C1)
        tx_arrows = [Arrow([XS[i] + BW / 2, TY, 0], [XS[i + 1] - BW / 2, TY, 0], buff=0.05, stroke_width=2.5, tip_length=0.12, color=GREY) for i in range(4)]
        tx_arrows.append(Arrow([XS[4] + BW / 2, TY, 0], [ANT_X, TY, 0], buff=0.05, stroke_width=2.5, tip_length=0.12, color=GREY))
        lo_t = block("LO", XS[2], TY + 1.15, GREEN_C3)
        lo_t_a = Arrow([XS[2], TY + 1.15 - BH / 2, 0], [XS[2], TY + BH / 2, 0], buff=0.03, stroke_width=2.5, tip_length=0.1, color=GREEN_C3)
        bits_in = label("bits", WHITE, 20).next_to(tx[0], LEFT, buff=0.3)
        tx_head = label("transmitter", BLUE_C1, 24).move_to([XS[0] - 1.6, TY + 1.15, 0])

        self.caption("Inside a transmitter: software (DSP) codes the bits and makes the BPSK signal.")
        self.play(FadeIn(tx_head), FadeIn(bits_in), FadeIn(tx[0]))
        self.caption("A DAC turns the numbers into a voltage. A mixer moves it up to the radio frequency.")
        self.play(GrowArrow(tx_arrows[0]), FadeIn(tx[1]), GrowArrow(tx_arrows[1]), FadeIn(tx[2]), FadeIn(lo_t), GrowArrow(lo_t_a))
        self.caption("A filter keeps only the wanted band. The power amplifier makes it strong. The antenna sends it.")
        self.play(GrowArrow(tx_arrows[2]), FadeIn(tx[3]), GrowArrow(tx_arrows[3]), FadeIn(tx[4]), GrowArrow(tx_arrows[4]), FadeIn(tx_ant))

        tx_tags = [label(lvl(v), AMBER_C2, 17).next_to(b, DOWN, buff=0.1) for v, b in zip(tx_lv, tx)]
        self.caption("Follow the power: about 0 dBm from the DAC, +40 dBm (10 W) out of the power amplifier.")
        self.play(LaggedStart(*[FadeIn(t) for t in tx_tags], lag_ratio=0.3), run_time=2)

        # The path
        rx_ant = antenna(ANT_X, RY + 0.1, BLUE_C1, up=False)
        path = Arrow([ANT_X, TY - 0.2, 0], [ANT_X, RY + 0.2, 0], buff=0, stroke_width=3, tip_length=0.15, color=GREY)
        path_t = label("path loss\n−110 dB", GREY, 18).next_to(path, RIGHT, buff=0.15)
        arrive = label(lvl(40 - 110), AMBER_C2, 17).next_to(rx_ant, RIGHT, buff=0.15).shift(DOWN * 0.3)
        self.caption("Over the path it loses 110 dB.")
        self.play(GrowArrow(path), FadeIn(path_t), FadeIn(rx_ant))
        self.caption("−70 dBm reaches the receiving antenna: a ten-billionth of a milliwatt.")
        self.play(FadeIn(arrive))

        # Receiver row, right to left
        rx_names = ["filter", "LNA", "mixer", "IF filter,\namplifier", "ADC"]
        rx_xs = list(reversed(XS))
        rx_lv = [-71, -46, -53, -24, -24]
        rx = [block(t, x, RY, AMBER_C2 if False else BLUE_C1) for t, x in zip(rx_names, rx_xs)]
        rx_arrows = [Arrow([ANT_X, RY, 0], [rx_xs[0] + BW / 2, RY, 0], buff=0.05, stroke_width=2.5, tip_length=0.12, color=GREY)]
        rx_arrows += [Arrow([rx_xs[i] - BW / 2, RY, 0], [rx_xs[i + 1] + BW / 2, RY, 0], buff=0.05, stroke_width=2.5, tip_length=0.12, color=GREY) for i in range(4)]
        lo_r = block("LO", rx_xs[2], RY - 1.15, GREEN_C3)
        lo_r_a = Arrow([rx_xs[2], RY - 1.15 + BH / 2, 0], [rx_xs[2], RY - BH / 2, 0], buff=0.03, stroke_width=2.5, tip_length=0.1, color=GREEN_C3)
        dsp = block("DSP:\ndespread,\ndecide", rx_xs[4] - 1.9, RY, BLUE_C1)
        dsp_a = Arrow([rx_xs[4] - BW / 2, RY, 0], [rx_xs[4] - 1.9 + BW / 2, RY, 0], buff=0.05, stroke_width=2.5, tip_length=0.12, color=GREY)
        rx_head = label("receiver", BLUE_C1, 24).move_to([XS[0] - 1.6, RY - 1.15, 0])
        self.caption("Inside the receiver, in reverse order.")
        self.caption("A front-end filter keeps the band and blocks strong signals outside it.")
        self.play(FadeIn(rx_head), GrowArrow(rx_arrows[0]), FadeIn(rx[0]))
        self.caption("A low-noise amplifier (LNA) lifts the weak signal while adding as little noise as it can.")
        self.play(GrowArrow(rx_arrows[1]), FadeIn(rx[1]))
        self.caption("A mixer moves it down to the IF or to 0. A filter and more amplifiers ready it for the ADC.")
        self.play(GrowArrow(rx_arrows[2]), FadeIn(rx[2]), FadeIn(lo_r), GrowArrow(lo_r_a), GrowArrow(rx_arrows[3]), FadeIn(rx[3]))
        self.caption("The ADC turns it into numbers. DSP software despreads and decides each bit.")
        self.play(GrowArrow(rx_arrows[4]), FadeIn(rx[4]), GrowArrow(dsp_a), FadeIn(dsp))
        rx_tags = [label(lvl(v), AMBER_C2, 17).next_to(b, UP, buff=0.1) for v, b in zip(rx_lv, rx)]
        self.caption("The amplifiers bring −70 dBm back up to a level the ADC can measure.")
        self.play(LaggedStart(*[FadeIn(t) for t in rx_tags], lag_ratio=0.3), run_time=2)
        self.caption("A signal too strong for the front end overloads it. Level 5 uses that.")
        self.play(Indicate(rx[1], color=RED, scale_factor=1.1))
        self.rule_card(["Transmit: DSP, DAC, mixer up, filter, amplifier, antenna.", "Receive: antenna, filter, LNA, mixer down, filter, ADC, DSP."], clear=True)
