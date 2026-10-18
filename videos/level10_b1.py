"""Level 10, lesson B1: Example, the loud one and the quiet one. After despreading, the near user's leftover beats the
far user's signal (BER 0.38); decode the near user, subtract it, and the far one comes back (berCdma, sinr)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

N = load_data("level10-B1")["nearFar"]


def bar(x, h, color, name):
    r = Rectangle(width=1.1, height=max(h, 0.05), stroke_width=0, fill_color=color, fill_opacity=0.85).move_to([x, -1.8 + h / 2, 0])
    return VGroup(r, label(name, color, 20).next_to(r, DOWN, buff=0.15))


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Near and far")
        near_db, far_db = N["users"][0]["powerDb"], N["users"][1]["powerDb"]
        base = Line([-6.5, -1.8, 0], [1.5, -1.8, 0], stroke_color=GREY)
        near = bar(-5.0, (near_db + 4) * 0.2, AMBER_C2, f"near: {near_db} dB")
        far = bar(-3.4, (far_db + 4) * 0.2, BLUE_C1, f"far: {far_db} dB")
        self.caption("Two stations share a band. The near one arrives 16 dB stronger than the far one.")
        self.play(Create(base), GrowFromEdge(near[0], DOWN), FadeIn(near[1]), GrowFromEdge(far[0], DOWN), FadeIn(far[1]))
        head = label("after despreading for the far one", GREY, 20).move_to([-0.6, 1.9, 0])
        own = bar(-1.4, 1.0, BLUE_C1, "far's signal")
        left = bar(0.2, 1.42, AMBER_C2, "near's leftover")
        self.caption("Despreading cuts the near one down, but not enough: its leftover is bigger than the far one's signal.")
        self.play(FadeIn(head), GrowFromEdge(own[0], DOWN), FadeIn(own[1]), GrowFromEdge(left[0], DOWN), FadeIn(left[1]))
        pad = Scratchpad(height=3.0, width=5.0, at=[4.4, 0.6, 0])
        self.play(*pad.show())
        self.play(FadeIn(pad.line(f"far SINR {10 * np.log10(N['sinrPlain']):.1f} dB", 0, WHITE, 22)), FadeIn(pad.line(f"far BER {N['berPlain']:.2f}", 0.65, RED, 22)))
        self.caption("The far station is buried: the near-far problem.")
        self.wait(1)
        self.caption("Successive cancellation: decode the near one first, rebuild its chips exactly, and subtract them.")
        self.play(Indicate(near, color=YELLOW))
        self.play(FadeOut(left, shift=DOWN * 0.3), near[0].animate.set_fill(opacity=0.15))
        self.caption("What is left is the far station and the noise.")
        self.play(FadeIn(pad.line(f"after: SINR {10 * np.log10(N['sinrSic']):.1f} dB", 1.4, GREEN_C3, 22)), FadeIn(pad.line(f"far BER {N['berSic']:.1e}", 2.05, GREEN_C3, 22)))
        self.rule_card(["A strong user buries a weak one by its power gap less what the code cuts.", "Decode the strong one, subtract it, then decode the weak."], clear=True)
