"""Level 12, lesson E1: Time of arrival and round trip. A ranges to B: flight out, B's turnaround, flight back; the
range from the round trip (rttKm)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

R = load_data("level12-E1")["rtt"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Ranging without GPS")
        pa, pb = np.array([-4.5, 2.4, 0]), np.array([4.5, 2.4, 0])
        a = VGroup(Dot(pa, radius=0.12, color=BLUE_C1), label("A", BLUE_C1, 26).next_to(pa, UP))
        b = VGroup(Dot(pb, radius=0.12, color=GREEN_C3), label("B", GREEN_C3, 26).next_to(pb, UP))
        self.caption("Radio travels 300 m each microsecond. Time a signal's flight and you have the distance.")
        self.play(FadeIn(a), FadeIn(b))
        self.caption("Time of arrival needs both clocks in step to a few nanoseconds. The round trip needs none.")
        X0, W, T = -4.6, 10.6, 12.0
        fly = (R["roundUs"] - R["turnUs"]) / 2

        def bar(y, t0, t1, color, text):
            r = Rectangle(width=(t1 - t0) / T * W, height=0.5, stroke_width=0, fill_color=color, fill_opacity=0.9).move_to([X0 + (t0 + t1) / 2 / T * W, y, 0])
            return VGroup(r, label(text, "#0b1220", 18).move_to(r))

        heads = VGroup(label("A", WHITE, 22).move_to([-5.6, 0.6, 0]), label("B", WHITE, 22).move_to([-5.6, -0.4, 0]))
        axis = VGroup(*[label(str(t), GREY, 18).move_to([X0 + t / T * W, -1.1, 0]) for t in range(0, 13, 2)], label("µs", GREY, 18).move_to([X0 + W + 0.3, -1.1, 0]))
        self.play(FadeIn(heads), FadeIn(axis))
        pulse = Dot(pa, radius=0.1, color=YELLOW)
        self.caption("A sends. B answers after a known turnaround. A times the whole exchange on its own clock.")
        self.play(FadeIn(bar(0.6, 0, 0.5, BLUE_C1, "")), pulse.animate.move_to(pb), run_time=1)
        self.play(FadeIn(bar(-0.4, fly, fly + R["turnUs"], GREY, f"turnaround {R['turnUs']} µs")))
        self.play(pulse.animate.move_to(pa), FadeIn(bar(0.6, R["roundUs"] - 0.5, R["roundUs"], AMBER_C2, "")), run_time=1)
        calc = VGroup(label(f"round trip {R['roundUs']} µs − turnaround {R['turnUs']} µs = {R['roundUs'] - R['turnUs']:.1f} µs", WHITE, 24),
                      label(f"÷ 2 = {fly:.1f} µs each way × 300 m = {R['m']} m", YELLOW, 26)).arrange(DOWN, buff=0.15).move_to([0, -2.2, 0])
        self.caption("Distance = (round trip − turnaround) ÷ 2 × 300 m per µs.")
        self.play(FadeIn(calc[0]))
        self.play(FadeIn(calc[1]))
        self.caption("Direct sequence sharpens it: at 10 Mcps one chip is 15 m of range, and the peak reads finer.")
        self.wait(1)
        self.rule_card(["Range = (round trip − turnaround) ÷ 2 × 300 m per µs.", "No common clock needed."], clear=True)
