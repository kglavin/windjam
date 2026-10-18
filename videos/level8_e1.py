"""Level 8, lesson E1: Keeping the lock. Early and late correlators half a chip either side of the prompt one; their
difference steers the timing back. A chip's correlation with itself is a triangle one chip either side."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403


def tri(t):
    return max(0.0, 1 - abs(t))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Keeping the lock")
        P = Plot(-6.2, 7.0, -0.4, 3.2, (-1.6, 1.6), (0, 1.15))
        xs = np.linspace(-1.6, 1.6, 200)
        peak = P.curve(xs, [tri(x) for x in xs], BLUE_C1, 3)
        axes = VGroup(P.axes(), P.x_ticks([-1, -0.5, 0, 0.5, 1], lambda v: f"{v:g}"),
                      label("offset from the true timing (chips)", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.5))
        self.caption("Correlating the code with itself gives a peak one chip wide either side of the right timing.")
        self.play(FadeIn(axes), Create(peak))
        err = ValueTracker(0.0)
        pts = always_redraw(lambda: VGroup(
            Dot([P.px(err.get_value() - 0.5), P.py(tri(err.get_value() - 0.5)), 0], color=AMBER_C2, radius=0.09),
            Dot([P.px(err.get_value()), P.py(tri(err.get_value())), 0], color=WHITE, radius=0.09),
            Dot([P.px(err.get_value() + 0.5), P.py(tri(err.get_value() + 0.5)), 0], color=GREEN_C3, radius=0.09),
        ))
        names = VGroup(label("early", AMBER_C2, 22), label("prompt", WHITE, 22), label("late", GREEN_C3, 22)).arrange(RIGHT, buff=0.5).move_to([3.9, 2.6, 0])
        diff = always_redraw(lambda: label(f"early − late = {tri(err.get_value() - 0.5) - tri(err.get_value() + 0.5):+.2f}", YELLOW, 28).move_to([3.9, 1.8, 0]))
        self.caption("The receiver runs three correlators: early, prompt, and late, half a chip apart.")
        self.play(FadeIn(pts), FadeIn(names), FadeIn(diff))
        self.caption("On time, early and late sit at the same height: their difference is 0.")
        self.wait(1)
        self.caption("If the receiver's clock runs late, the late one slides down the peak and early − late turns positive.")
        self.play(err.animate.set_value(0.35), run_time=2)
        self.caption("That sign tells the loop which way to move, and it pulls the timing back.")
        self.play(err.animate.set_value(0), run_time=2)
        self.play(err.animate.set_value(-0.35), run_time=2)
        self.caption("Early, the difference turns negative and pulls the other way.")
        self.play(err.animate.set_value(0), run_time=2)
        S = Plot(1.2, 5.4, -2.9, 2.0, (-1.6, 1.6), (-1.1, 1.1))
        s_curve = S.curve(xs, [tri(x - 0.5) - tri(x + 0.5) for x in xs], YELLOW, 3)
        s_axes = VGroup(Line([S.x0, S.py(0), 0], [S.x0 + S.width, S.py(0), 0], stroke_color=GREY, stroke_width=1.5),
                        label("the S-curve: early − late against the timing error", GREY, 18).next_to([S.x0 + S.width / 2, S.y0, 0], DOWN, buff=0.05))
        self.caption("Plotted against the timing error, the difference is an S: it steers back within about a chip.")
        self.play(FadeIn(s_axes), Create(s_curve))
        self.caption("A bigger jump, or a jammer that buries the correlators, loses the lock, and the search starts again.")
        self.rule_card(["Early − late = 0 on time; its sign steers the timing back.", "Lose it, and the receiver must search again."], clear=True)
