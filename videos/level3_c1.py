"""Level 3, lesson C1: Example, the same power in bursts. BER is the lessons' BPSK theory, Q(√(2·Eb/J0))."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level3-C1")
GP, JS, EB, ON = DATA["gpDb"], DATA["jsDb"], DATA["ebJ0Db"], DATA["onDb"]
DUTY = DATA["duty"]
BITS = round(1 / DUTY)
HIT = 3  # the bit the pulse covers

BP = Plot(-5.4, 5.8, -2.3, 4.7, (-4, 12), (-7, 0))
TX0, TW, TY = 1.4, 5.5, 3.0  # bit timeline
BW = TW / BITS


def fmt(v, d=1):
    return f"{v:.{d}f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The same power in bursts")
        wf = ber_waterfall(BP)
        self.caption(f"The example link (Gp {fmt(GP)} dB) faces broadband noise at J/S = {fmt(JS, 0)} dB.")
        self.play(FadeIn(wf[:5]), Create(wf[5]), run_time=2)

        eb = ValueTracker(EB)
        dot = always_redraw(lambda: Dot(ber_point(BP, eb.get_value()), radius=0.09, color=WHITE))
        guides = always_redraw(lambda: VGroup(
            DashedLine([ber_point(BP, eb.get_value())[0], BP.y0, 0], ber_point(BP, eb.get_value()), stroke_width=1.2, dash_length=0.06),
            DashedLine([BP.x0, ber_point(BP, eb.get_value())[1], 0], ber_point(BP, eb.get_value()), stroke_width=1.2, dash_length=0.06),
        ).set_color(GREY))
        bb_txt = label(f"broadband: {sci(DATA['berBbn'])}", BLUE_C1, 22).next_to(ber_point(BP, EB), LEFT, buff=0.2).shift(UP * 0.25)
        self.caption(f"Eb/J0 = {fmt(GP)} − {fmt(JS, 0)} = {fmt(EB)} dB: BER {sci(DATA['berBbn'])}, about 5 wrong bits in a million.")
        self.play(FadeIn(dot), FadeIn(guides), FadeIn(bb_txt))

        # The timeline: broadband, then the same energy in a pulse
        boxes = VGroup(*[Rectangle(width=BW, height=0.4, stroke_color=GREY, stroke_width=1.5).move_to([TX0 + (i + 0.5) * BW, TY, 0]) for i in range(BITS)])
        nums = VGroup(*[label(str(i + 1), GREY, 16).move_to(b) for i, b in enumerate(boxes)])
        title = label(f"{BITS} bits", GREY, 20).next_to(boxes, UP, buff=0.12).align_to(boxes, LEFT)
        base = TY - 0.45
        jam_bb = Rectangle(width=TW, height=0.12, stroke_width=0, fill_color=RED, fill_opacity=0.6).move_to([TX0 + TW / 2, base - 0.06, 0])
        jam_p = Rectangle(width=BW, height=0.12 * BITS, stroke_width=0, fill_color=RED, fill_opacity=0.6).move_to([TX0 + (HIT + 0.5) * BW, base - 0.06 * BITS, 0])
        jam_t = label("jammer power", RED, 18).next_to(jam_bb, DOWN, buff=0.1).align_to(jam_bb, LEFT)
        self.caption("Spread over every bit, the noise is too weak to break any of them.")
        self.play(FadeIn(boxes), FadeIn(nums), FadeIn(title), FadeIn(jam_bb), FadeIn(jam_t))
        self.caption(f"Now the same average power in pulses, on {DUTY:.0%} of the time, each covering whole bits.")
        self.play(Transform(jam_bb, jam_p), jam_t.animate.next_to(jam_p, RIGHT, buff=0.1), run_time=2)
        self.caption(f"{1 / DUTY:.0f} times stronger while on: {fmt(10 * np.log10(1 / DUTY), 0)} dB less Eb/J0 for the bits it hits.")
        self.play(eb.animate.set_value(ON), run_time=4, rate_func=rate_functions.ease_in_out_sine)
        on_txt = label(f"hit bits: {sci(DATA['berOn'])}", RED, 22).next_to(ber_point(BP, ON), RIGHT, buff=0.2).shift(UP * 0.1)
        self.play(FadeIn(on_txt))
        self.caption(f"Bits hit by a pulse see Eb/J0 = {fmt(EB)} − {fmt(10 * np.log10(1 / DUTY), 0)} = {fmt(ON)} dB: BER {sci(DATA['berOn'])}.")
        per = VGroup(*[label(sci(DATA['berOn']) if i == HIT else "0", RED if i == HIT else GREEN_C3, 16)
                       .move_to([TX0 + (i + 0.5) * BW, TY + 0.45, 0]) for i in range(BITS)])
        self.caption("Bits between pulses see no jamming at all.")
        self.play(FadeOut(title), LaggedStart(*[FadeIn(p) for p in per], lag_ratio=0.1))

        # Scratchpad
        overall = DUTY * DATA["berOn"]
        dot.clear_updaters()
        guides.clear_updaters()
        pad = Scratchpad(height=3.3, width=5.9, at=[3.95, -1.35, 0])
        self.play(*pad.show())
        rows = [(f"1 bit in {BITS}: BER {sci(DATA['berOn'])}", RED), (f"{BITS - 1} bits in {BITS}: no errors", GREEN_C3),
                (f"Overall: {DUTY:g} × {sci(DATA['berOn'])} = {sci(overall)}", AMBER_C2)]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.9, c, 24), shift=DOWN * 0.15))
            self.wait(2)
        line = DashedLine([BP.x0, BP.py(np.log10(overall)), 0], [BP.x0 + BP.width, BP.py(np.log10(overall)), 0], color=AMBER_C2, stroke_width=2, dash_length=0.08)
        line_t = label(f"pulsed overall: {sci(overall)}", AMBER_C2, 20).next_to(line, UP, buff=0.05).align_to(line, RIGHT)
        more = 10 ** int(np.floor(np.log10(overall / DATA["berBbn"])))
        self.caption(f"More than {more} times worse than broadband noise ({sci(overall)} against {sci(DATA['berBbn'])}), from the same power.")
        self.play(Create(line), FadeIn(line_t))
        self.rule_card(["Pulses hurt when the link has margin:", "each pulse breaks the bits it hits,", "while broadband noise is too weak to break any."], clear=True)
