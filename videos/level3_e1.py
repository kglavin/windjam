"""Level 3, lesson E1: Example, how short should the pulses be?

Pulses on a fraction d of the time, covering whole bits: the bits they hit see Eb/J0 = d × (broadband Eb/J0), the
rest see none, so the overall BER is d × Q(√(2·d·Eb/J0)). Its peak is at in-pulse Eb/J0 ≈ 0.7 (the lessons'
BEST_PULSE_EBJ0)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level3-E1")
EB = DATA["ebJ0Db"]
R = 10 ** (EB / 10)
BEST = DATA["bestDuty"]

BP = Plot(-5.4, 5.0, -2.3, 4.7, (-8, 12), (-7, 0))     # in-pulse Eb/J0 → BER of the bits hit
DP = Plot(1.3, 5.4, -2.3, 4.7, (-2, 0), (-7, -1))      # log10(duty) → overall BER


def overall(d):
    return d * ber_bpsk(d * R)


def fmt(v, d=1):
    return f"{v:.{d}f}".replace("-", "−")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("How short should the pulses be?")
        d = ValueTracker(1.0)
        wf = ber_waterfall(BP)
        wf[4].become(label("BER of the bits hit", GREY, 20).move_to([BP.x0, BP.y0 + BP.height + 0.25, 0], aligned_edge=LEFT))
        wf[3].become(label("Eb/J0 during the pulse (dB)", GREY, 20).next_to([BP.x0 + BP.width / 2, BP.y0, 0], DOWN, buff=0.45))
        dx = VGroup(
            DP.axes(),
            VGroup(*[label(t, GREY, 18).move_to([DP.px(v), DP.y0 - 0.25, 0]) for v, t in ((-2, "1%"), (-1, "10%"), (0, "100%"))]),
            VGroup(*[label(ber_tick(e), GREY, 18).next_to([DP.x0, DP.py(e), 0], LEFT, buff=0.12) for e in range(-7, 0)]),
            label("time the jammer is on", GREY, 20).next_to([DP.x0 + DP.width / 2, DP.y0, 0], DOWN, buff=0.45),
            label("overall BER", GREY, 20).move_to([DP.x0, DP.y0 + DP.height + 0.25, 0], aligned_edge=LEFT),
        )

        def on_db():
            return EB + 10 * np.log10(d.get_value())

        dot = always_redraw(lambda: Dot(ber_point(BP, on_db()), radius=0.09, color=WHITE))

        seen = {"min": 1.0}  # the trace keeps the shortest duty reached, so it stays drawn on the way back

        def trace():
            seen["min"] = min(seen["min"], d.get_value())
            ds = np.logspace(0, np.log10(seen["min"]), 200)
            return DP.curve(np.log10(ds), [np.log10(max(overall(x), 1e-12)) for x in ds], AMBER_C2, 3.5)

        curve = always_redraw(trace)
        ddot = always_redraw(lambda: Dot([DP.px(np.log10(d.get_value())), DP.py(np.log10(max(overall(d.get_value()), 1e-12))), 0], radius=0.09, color=AMBER_C2))
        rd = always_redraw(lambda: label(f"on {d.get_value():.1%} of the time", WHITE, 22).move_to([DP.x0 + DP.width / 2, DP.y0 + DP.height + 0.7, 0]))

        self.caption(f"The example link's broadband Eb/J0 is {fmt(EB)} dB. Now vary how long the jammer is on.")
        self.play(FadeIn(wf[:5]), Create(wf[5]), FadeIn(dx), run_time=2)
        self.play(FadeIn(dot), FadeIn(curve), FadeIn(ddot), FadeIn(rd))
        self.caption(f"On all the time it is broadband noise: BER {sci(overall(1.0))}.")

        self.caption("Shorter pulses are stronger, so the bits they hit break more often.")
        self.play(d.animate.set_value(0.3), run_time=5, rate_func=linear)
        self.caption("But shorter pulses hit fewer bits.")
        self.play(d.animate.set_value(BEST), run_time=5, rate_func=linear)
        on_best = 10 * np.log10(DATA["bestPulseEbJ0"])
        self.caption(f"The best pulse is just strong enough to break the bits it hits: Eb/J0 about {fmt(on_best)} dB.")
        mark = VGroup(DashedLine([DP.px(np.log10(BEST)), DP.y0, 0], [DP.px(np.log10(BEST)), DP.py(np.log10(overall(BEST))), 0],
                                 color=AMBER_C2, stroke_width=1.5, dash_length=0.06),
                      label(f"best: {BEST:.1%}", AMBER_C2, 20).next_to([DP.px(np.log10(BEST)), DP.py(np.log10(overall(BEST))), 0], UP, buff=0.15))
        self.play(FadeIn(mark))
        self.caption("Any shorter, and the extra strength is wasted on bits that were already broken.")
        self.play(d.animate.set_value(0.012), run_time=5, rate_func=linear)
        self.play(d.animate.set_value(BEST), run_time=2)
        for m in (dot, curve, ddot, rd):
            m.clear_updaters()

        self.clear_caption()
        self.play(FadeOut(VGroup(wf, dot)), VGroup(dx, curve, ddot, rd, mark).animate.shift(RIGHT * 0.3))
        pad = Scratchpad(height=3.6, width=6.6, at=[-3.4, 0.4, 0])
        self.play(*pad.show())
        rows = [
            (f"Broadband Eb/J0 = {fmt(EB)} dB = {DATA['ebJ0Ratio']:g} times", WHITE),
            (f"Best duty = {DATA['bestPulseEbJ0']:g} ÷ {DATA['ebJ0Ratio']:g} = {BEST:.3f}", WHITE),
            (f"on about {BEST:.0%} of the time", GREY),
            (f"Overall BER ≈ {DATA['berBest']:.2g}", AMBER_C2),
        ]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.85, c, 24), shift=DOWN * 0.15))
            self.wait(2.2)
        self.rule_card(["Best duty ≈ 0.7 ÷ (broadband Eb/J0 as a ratio).", "If that comes out above 1, jam all the time."], clear=True)
