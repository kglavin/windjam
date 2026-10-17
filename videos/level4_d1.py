"""Level 4, lesson D1: Example, peaks.

Eight tones as phasors (src/engine/lab/peaks.ts): tone i at (i − 3.5) × 0.05 cycles per chip, amplitude 1/√8 so the
average power is 1, phases zero, random (the figure's seed) or Newman's. Their sum's |x|² is the figure's envelope,
sampled at the same 4 points per chip (videos/data/level4-D1.ts checks it)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level4-D1")
Q = DATA["q"]
F = (np.arange(Q) - (Q - 1) / 2) * DATA["spacing"]   # cycles per chip
CHIPS = DATA["chips"]
S = DATA["s"]
AMP = 1 / np.sqrt(Q)

C = np.array([-4.3, 0.5, 0])  # phasor centre
K = 0.75                      # scene units per unit of amplitude
P = Plot(-1.2, 7.6, -2.6, 4.4, (0, CHIPS), (0, Q + 0.6))
KINDS = [("zero", "In phase"), ("random", "Random phases"), ("newman", "Newman phases")]


def fmt(v, d=1):
    return f"{v:.{d}f}"


class LessonVideo(LessonScene):
    def construct(self):
        t = ValueTracker(0.0)
        phase = {"now": np.array(DATA["phases"]["zero"])}
        self.title_card("Peaks")

        def tips():
            ang = 2 * np.pi * F * t.get_value() + phase["now"]
            steps = AMP * np.exp(1j * ang)
            return np.concatenate([[0], np.cumsum(steps)])

        def arrows():
            p = tips()
            g = VGroup()
            for i in range(Q):
                a, b = p[i], p[i + 1]
                g.add(Arrow(C + K * np.array([a.real, a.imag, 0]), C + K * np.array([b.real, b.imag, 0]), buff=0,
                            stroke_width=3, tip_length=0.1, max_tip_length_to_length_ratio=0.4,
                            color=interpolate_color(ManimColor(AMBER_C2), ManimColor(RED), i / (Q - 1))))
            return g

        def total():
            z = tips()[-1]
            return Arrow(C, C + K * np.array([z.real, z.imag, 0]), buff=0, stroke_width=5, tip_length=0.18, color=WHITE)

        ring_avg = DashedVMobject(Circle(radius=K * 1.0), num_dashes=40).set_stroke(GREY, 1.5).move_to(C)
        ring_peak = DashedVMobject(Circle(radius=K * np.sqrt(Q)), num_dashes=60).set_stroke(GREY, 1.5).move_to(C)
        ring_t = VGroup(label("average", GREY, 18).move_to(C + np.array([0, -K * 1.0 - 0.18, 0])),
                        label(f"{Q} × average", GREY, 18).move_to(C + np.array([0, -K * np.sqrt(Q) - 0.2, 0])))
        tone_arrows = always_redraw(arrows)
        sum_arrow = always_redraw(total)
        power_now = always_redraw(lambda: label(f"power now: {abs(tips()[-1]) ** 2:.1f}", WHITE, 22).move_to(C + np.array([0, 2.75, 0])))

        # 1. Tones as arrows
        self.caption(f"A jammer can send many tones at once. Here, {Q} tones with the same power.")
        first = arrows()
        self.play(LaggedStart(*[GrowArrow(a) for a in first], lag_ratio=0.15), run_time=2)
        self.remove(*first)
        self.add(tone_arrows)
        self.caption("Each arrow is one tone. It turns at the tone's own frequency.")
        self.caption("Add them head to tail: the white arrow is the jammer's signal now.")
        first_sum = total()
        self.play(GrowArrow(first_sum), run_time=1)
        self.remove(first_sum)
        self.add(sum_arrow)
        self.caption("Its length squared is the power. The circles mark the average and 8 times it.")
        self.play(Create(ring_avg), Create(ring_peak), FadeIn(ring_t), FadeIn(power_now))

        axes = P.axes()
        x_t = P.x_ticks(range(0, CHIPS + 1, 10), fmt=str)
        y_t = P.y_ticks([0, 1, 4, 8], fmt=str)
        x_name = label("time (chips)", GREY, 20).next_to(axes, DOWN, buff=0.45)
        y_name = label("power (average = 1)", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.3, 0], aligned_edge=LEFT)
        avg_line = DashedLine([P.x0, P.py(1), 0], [P.x0 + P.width, P.py(1), 0], color=GREY, stroke_width=1.5, dash_length=0.08)
        self.play(FadeIn(axes), FadeIn(x_t), FadeIn(y_t), FadeIn(x_name), FadeIn(y_name), Create(avg_line))

        ghosts = VGroup()
        results = []
        for key, name in KINDS:
            env = DATA["sets"][key]["env"]
            ts = np.arange(len(env)) / S

            def trace(env=env, ts=ts):
                now = t.get_value()
                xs = [x for x in ts if x <= now]
                if len(xs) < 2:
                    xs = [0, 1e-3]
                ys = np.interp(xs, ts, env)
                return P.curve(xs, ys, AMBER_C2, 3)

            curve = always_redraw(trace)
            if key != "zero":
                self.play(t.animate.set_value(0), run_time=0.01)
                target = np.array(DATA["phases"][key])
                start = phase["now"].copy()
                mix = ValueTracker(0)

                def blend(m, start=start, target=target, mix=mix):
                    phase["now"] = start + (np.angle(np.exp(1j * (target - start)))) * mix.get_value()
                self.add(curve)
                mix.add_updater(blend)
                self.add(mix)
                self.caption(f"{name}: same tones, set off at different angles.")
                self.play(mix.animate.set_value(1), run_time=2)
                mix.clear_updaters()
                phase["now"] = target
            else:
                self.add(curve)
                self.caption(f"{name}: at the start all {Q} point the same way. Their lengths add up.")

            peak = DATA["sets"][key]["peak"]
            papr = DATA["sets"][key]["paprDb"]
            if key == "zero":
                self.wait(1)
                self.caption("Then they turn at different speeds and partly cancel. Watch the power.")
            elif key == "random":
                self.caption("They rarely all line up.")
            else:
                self.caption("These phases are chosen so they never line up well.")
            self.play(t.animate.set_value(CHIPS), run_time=14, rate_func=linear)
            curve.clear_updaters()
            pk = DashedLine([P.x0, P.py(peak), 0], [P.x0 + P.width, P.py(peak), 0], color=AMBER_C2, stroke_width=1.5, dash_length=0.08)
            pk_t = label(f"peak {fmt(peak)} × average, PAPR {fmt(papr)} dB", AMBER_C2, 22).next_to([P.x0 + P.width, P.py(peak), 0], UP, buff=0.06).align_to(pk, RIGHT)
            self.play(Create(pk), FadeIn(pk_t))
            if key == "zero":
                self.caption(f"The average power stays 1, but the peaks reach {Q}.")
                self.caption(f"Peak-to-average ratio, PAPR: {Q} times = 10 × log10({Q}) = {fmt(papr)} dB.")
            else:
                self.caption(f"{name}: peaks {fmt(peak)} times the average, PAPR {fmt(papr)} dB.")
            results.append((name, peak, papr))
            self.hold_caption()
            self.play(curve.animate.set_stroke(GREY, 1.5, opacity=0.5), FadeOut(pk), FadeOut(pk_t))
            ghosts.add(curve)

        # 2. Summary and the front end
        self.clear_caption()
        tone_arrows.clear_updaters()
        sum_arrow.clear_updaters()
        power_now.clear_updaters()
        self.play(FadeOut(VGroup(tone_arrows, sum_arrow, power_now, ring_avg, ring_peak, ring_t)))
        rows = VGroup(*[
            label(f"{name}: {fmt(peak)} ×, {fmt(papr)} dB", AMBER_C2 if i == 0 else WHITE, 22)
            for i, (name, peak, papr) in enumerate(results)
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.35).move_to([-6.9, 0.6, 0], aligned_edge=LEFT)
        head = label("peak, PAPR", GREY, 20).next_to(rows, UP, buff=0.3).align_to(rows, LEFT)
        self.play(FadeIn(head), LaggedStart(*[FadeIn(r, shift=RIGHT * 0.2) for r in rows], lag_ratio=0.4))
        self.wait(3)

        limit = 4
        lim = Line([P.x0, P.py(limit), 0], [P.x0 + P.width, P.py(limit), 0], color=RED, stroke_width=3)
        lim_t = label("front-end limit", RED, 22).next_to(lim, UP, buff=0.06).align_to(lim, LEFT).shift(RIGHT * 0.1)
        self.play(ghosts[0].animate.set_stroke(AMBER_C2, 3, opacity=1))
        self.caption("The receiver's first amplifier, its front end, has a limit.")
        self.play(Create(lim), FadeIn(lim_t))
        env = np.array(DATA["sets"]["zero"]["env"])
        ts = np.arange(len(env)) / S
        clipped = VGroup(*[
            Line([P.px(x), P.py(limit), 0], [P.px(x), P.py(y), 0], color=RED, stroke_width=2, stroke_opacity=0.6)
            for x, y in zip(ts, env) if y > limit
        ])
        self.caption("Peaks above it get squashed, and the wanted signal is squashed with them.")
        self.play(FadeIn(clipped))
        self.caption("Level 5 uses that.")
        self.rule_card([f"In phase, {Q} tones peak at {Q} times the average.", "PAPR in dB = 10 × log10(number of tones)."], clear=True)
