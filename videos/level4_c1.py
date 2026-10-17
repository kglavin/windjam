"""Level 4, lesson C1: Example, keep off the carrier.

A tone against a short code: despreading lets through the part of the tone that matches the code's spectrum at the
tone's offset (the response, 1 ≈ broadband noise of the same power). BER is berToneShortCode, phase-averaged, at the
lesson's Eb/N0 and J/S (videos/data/level4-C1.ts)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level4-C1")
KHZ = np.array(DATA["khz"])
BER = np.array(DATA["ber"])
RESP = np.array(DATA["response"])
LINE = DATA["lineKhz"]
N = DATA["n"]

TP = Plot(-4.6, 11.0, 1.0, 2.2, (0, 100), (0, 1.15))
BP = Plot(-4.6, 11.0, -2.6, 2.8, (0, 100), (-4, -1))


def resp_at(k):
    return float(np.interp(k, KHZ, RESP))


def ber_at(k):
    return float(np.interp(k, KHZ, BER))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Keep off the carrier")
        f = ValueTracker(0.0)

        top = VGroup(TP.axes(), TP.x_ticks(range(0, 101, 20), fmt=str),
                     label("how much of a tone gets through despreading", GREY, 20).move_to([TP.x0, TP.y0 + TP.height + 0.6, 0], aligned_edge=LEFT),
                     label("1 = like noise", GREY, 18).next_to([TP.x0, TP.py(1), 0], LEFT, buff=0.12))
        lines = [k * LINE for k in range(int(100 / LINE) + 1)]
        stems = VGroup(*[Line([TP.px(x), TP.py(0), 0], [TP.px(x), TP.py(resp_at(x)), 0], color=GREEN_C3, stroke_width=4) for x in lines])
        heads = VGroup(*[Dot([TP.px(x), TP.py(resp_at(x)), 0], radius=0.06, color=GREEN_C3) for x in lines])
        self.caption(f"A short code repeats every bit, so its spectrum is thin lines one bit rate apart: {LINE:.1f} kHz.")
        self.play(FadeIn(top))
        self.play(LaggedStart(*[AnimationGroup(Create(s), FadeIn(h)) for s, h in zip(stems, heads)], lag_ratio=0.3), run_time=2)
        sp = bracket(TP.px(lines[1]), TP.px(lines[2]), TP.py(1.08), UP, GREEN_C3)
        sp_t = label(f"{LINE:.1f} kHz", GREEN_C3, 18).next_to(sp, UP, buff=0.04)
        self.play(FadeIn(sp), FadeIn(sp_t))
        self.caption("The code has almost as many +1 chips as −1, so on the carrier it has almost nothing.")
        self.play(Indicate(heads[0], color=WHITE, scale_factor=2))
        cont = TP.curve(KHZ, RESP, GREEN_C3, 1.5).set_stroke(opacity=0.5)
        self.caption("Over one bit, the code's spectrum is this smooth curve through the lines.")
        self.play(Create(cont), run_time=2)
        self.caption("It sets how much of a tone gets through despreading.")
        self.play(FadeOut(sp), FadeOut(sp_t))

        # The BER plot and the sweep
        bot = VGroup(BP.axes(), BP.x_ticks(range(0, 101, 20), fmt=str),
                     VGroup(*[label(ber_tick(e), GREY, 18).next_to([BP.x0, BP.py(e), 0], LEFT, buff=0.12) for e in range(-4, 0)]),
                     label("BER", GREY, 20).move_to([BP.x0, BP.y0 + BP.height + 0.25, 0], aligned_edge=LEFT),
                     label("tone offset (kHz)", GREY, 20).next_to([BP.x0 + BP.width / 2, BP.y0, 0], DOWN, buff=0.45))
        refs = VGroup(
            DashedLine([BP.x0, BP.py(np.log10(DATA["bbn"])), 0], [BP.x0 + BP.width, BP.py(np.log10(DATA["bbn"])), 0], color=RED, stroke_width=1.5, dash_length=0.08),
            label(f"broadband noise {sci(DATA['bbn'])}", RED, 18).next_to([BP.x0 + BP.width, BP.py(np.log10(DATA["bbn"])), 0], UP, buff=0.05).align_to([BP.x0 + BP.width, 0, 0], RIGHT),
            DashedLine([BP.x0, BP.py(np.log10(DATA["noJam"])), 0], [BP.x0 + BP.width, BP.py(np.log10(DATA["noJam"])), 0], color=GREY, stroke_width=1.5, dash_length=0.08),
            label(f"no jammer {sci(DATA['noJam'])}", GREY, 18).next_to([BP.x0 + BP.width, BP.py(np.log10(DATA["noJam"])), 0], DOWN, buff=0.05).align_to([BP.x0 + BP.width, 0, 0], RIGHT),
        )
        marker = always_redraw(lambda: VGroup(
            DashedLine([TP.px(f.get_value()), BP.y0, 0], [TP.px(f.get_value()), TP.y0 + TP.height, 0], color=RED, stroke_width=2, dash_length=0.07),
            label(f"tone at {f.get_value():.0f} kHz", RED, 20).next_to([TP.px(f.get_value()), TP.y0 + TP.height, 0], UP, buff=0.05),
        ))

        def trace():
            xs = KHZ[KHZ <= f.get_value() + 1e-9]
            if len(xs) < 2:
                xs = KHZ[:2]
            return BP.curve(xs, [np.log10(ber_at(x)) for x in xs], AMBER_C2, 3)

        curve = always_redraw(trace)
        self.caption(f"Now a tone jammer at J/S = {DATA['jsDb']} dB, slid away from the carrier.")
        self.play(FadeIn(bot), FadeIn(refs), FadeIn(marker), FadeIn(curve))
        self.caption(f"On the carrier it is wiped out: BER {sci(DATA['carrier'])}, against {sci(DATA['noJam'])} with no jammer at all.")
        self.play(Flash([BP.px(0), BP.py(np.log10(DATA["carrier"])), 0], color=AMBER_C2))
        self.caption("Slide it up: the BER follows the code's spectrum.")
        self.play(f.animate.set_value(LINE), run_time=5, rate_func=linear)
        self.caption(f"On the first line it does about what noise does: {sci(DATA['line'])}, against {sci(DATA['bbn'])}.")
        self.play(f.animate.set_value(LINE * 1.5), run_time=3, rate_func=linear)
        self.caption("Away from the lines it follows the curve: much less in the dips, a little more just below the first line.")
        self.play(f.animate.set_value(100), run_time=6, rate_func=linear)
        for m in (curve, marker):
            m.clear_updaters()

        # Phase
        bar = VGroup(
            Line([BP.px(LINE), BP.py(np.log10(DATA["lineMin"])), 0], [BP.px(LINE), BP.py(np.log10(DATA["lineMax"])), 0], color=WHITE, stroke_width=4),
            Line([BP.px(LINE) - 0.12, BP.py(np.log10(DATA["lineMin"])), 0], [BP.px(LINE) + 0.12, BP.py(np.log10(DATA["lineMin"])), 0], color=WHITE, stroke_width=3),
            Line([BP.px(LINE) - 0.12, BP.py(np.log10(DATA["lineMax"])), 0], [BP.px(LINE) + 0.12, BP.py(np.log10(DATA["lineMax"])), 0], color=WHITE, stroke_width=3),
        )
        self.caption("The tone meets the code the same way in every bit, so one run depends on the tone's phase.")
        self.play(FadeOut(marker), Create(bar))
        self.caption(f"On the first line a single run can land anywhere from {sci(DATA['lineMin'])} to {sci(DATA['lineMax'])}.")
        self.rule_card(["Against a short code a tone does no better than broadband noise.", "On the carrier it does almost nothing: keep it off the carrier."], clear=True)
