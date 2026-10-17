"""Level 5, lesson C1: Example, a receiver that needs time to recover.

One overloading pulse a copy long every blindPeriod copies; the front end is then blind for recoveryCopies more. As
the lesson says, a bit with two or more blind copies is a coin toss. The BERs are the engine's exampleTheory."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level5-C1")
C = DATA["copies"]
COUNT = DATA["blindPeriod"]
REC = DATA["recoveryCopies"]
BLIND = 1 + REC                      # the pulse's copy and the recovery after it
X0, W = -4.4, 10.8
ROW_T, ROW_J, ROW_R, ROW_O = 2.6, 1.0, -0.4, -1.4
BITS = COUNT // C
BLIND_PER_BIT = [len([i for i in range(b * C, (b + 1) * C) if i < BLIND]) for b in range(BITS)]
TOSSES = sum(1 for k in BLIND_PER_BIT if k >= 2)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Blinding the receiver")
        boxes, marks, cw = copy_timeline(COUNT, X0, W, ROW_T, h=0.36)
        for m in marks:
            m[1].scale(0.85)
        names = VGroup(label("copies", GREY, 22).move_to([X0 - 1.4, ROW_T, 0]),
                       label("jammer", RED, 22).move_to([X0 - 1.4, ROW_J, 0]),
                       label("receiver", WHITE, 22).move_to([X0 - 1.4, ROW_R, 0]))
        self.caption(f"The link sends {C} copies of every bit and takes a vote.")
        self.play(FadeIn(boxes), FadeIn(marks), FadeIn(names[0]))

        # 1. The overload
        base = Line([X0, ROW_J - 0.4, 0], [X0 + W, ROW_J - 0.4, 0], color=GREY, stroke_width=1)
        limit = DashedLine([X0, ROW_J + 0.25, 0], [X0 + W, ROW_J + 0.25, 0], color=WHITE, stroke_width=1.5, dash_length=0.08)
        limit_t = label("front-end overload level", WHITE, 18).next_to(limit, UP, buff=0.05).align_to(limit, RIGHT)
        pulse = Rectangle(width=cw, height=1.2, stroke_width=0, fill_color=RED, fill_opacity=0.9).move_to([X0 + cw / 2, ROW_J + 0.2, 0])
        self.caption("A strong enough pulse overloads the receiver's front end.")
        self.play(FadeIn(names[1]), FadeIn(base), Create(limit), FadeIn(limit_t))
        self.play(GrowFromEdge(pulse, DOWN))

        # 2. Blind for the recovery time
        rbase = Line([X0, ROW_R - 0.25, 0], [X0 + W, ROW_R - 0.25, 0], color=GREY, stroke_width=1)
        n_blind = ValueTracker(1)
        shade = always_redraw(lambda: Rectangle(width=n_blind.get_value() * cw, height=0.5, stroke_width=0, fill_color=GREY, fill_opacity=0.55)
                              .move_to([X0 + n_blind.get_value() * cw / 2, ROW_R, 0]))
        blind_t = always_redraw(lambda: label(f"blind: {n_blind.get_value():.0f} copies", WHITE, 20).next_to(
            [X0 + n_blind.get_value() * cw, ROW_R, 0], RIGHT, buff=0.15))
        self.caption(f"It then stays blind for its recovery time: {REC} more copies, after the pulse has ended.")
        self.play(FadeIn(names[2]), FadeIn(rbase), FadeIn(shade), FadeIn(blind_t))
        self.play(n_blind.animate.set_value(BLIND), run_time=4, rate_func=linear)
        shade.clear_updaters()
        blind_t.clear_updaters()
        self.caption("While blind it hears nothing, so each copy it decides is a coin toss.")

        # 3. Which bits are lost
        outs = VGroup(*[
            label("coin\ntoss" if k >= 2 else "fine", YELLOW if k >= 2 else GREEN_C3, 20).move_to([X0 + (b + 0.5) * C * cw, ROW_O, 0])
            for b, k in enumerate(BLIND_PER_BIT)
        ])
        self.caption(f"Bits with two or more blind copies are a coin toss: {TOSSES} of these {BITS}.")
        self.play(LaggedStart(*[FadeIn(o) for o in outs], lag_ratio=0.15))
        self.caption(f"That pattern repeats every {COUNT} copies. The jammer was on only {DATA['blindDuty']:.0%} of the time.")
        self.play(Indicate(pulse, color=RED, scale_factor=1.1))

        # 4. Scratchpad
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=4.2, width=10.0, at=[0, 0.6, 0])
        self.play(*pad.show())
        rows = [
            (f"Blind {BLIND} copies out of every {COUNT}", WHITE),
            (f"{TOSSES} bits in {BITS} are coin tosses: BER {sci(DATA['berBlind'])}", AMBER_C2),
            (f"Broadband noise at the same average power: BER {sci(DATA['berBbn'])}", GREY),
            (f"{DATA['berBlind'] / DATA['berBbn']:.0f} times more damage, from a jammer on {DATA['blindDuty']:.0%} of the time", AMBER_C2),
        ]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.9, c, 26), shift=DOWN * 0.15))
            self.wait(2.5)
        self.rule_card(["Overloading pulses do damage in proportion to the time", "the receiver is blind, not to the jammer's average power."])
