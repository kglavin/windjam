"""Level 5, lesson A1: Example, the majority vote. All eight ways three copies can come out, with their chances."""
import itertools
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level5-A1")
P = DATA["vote"]["p"]
AFTER = DATA["vote"]["after"]
P2, AFTER2 = DATA["vote"]["p2"], DATA["vote"]["after2"]
C = DATA["copies"]


def dot(wrong):
    return Circle(radius=0.14, stroke_width=0, fill_color=RED if wrong else GREEN_C3, fill_opacity=1)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The majority vote")

        # 1. Three copies and a vote
        sent = label("bit +1", BLUE_C1, 30).move_to([-5.4, 0.5, 0])
        copies = VGroup(*[VGroup(Rectangle(width=1.8, height=0.8, stroke_color=GREY, stroke_width=1.5), label(f"copy {i + 1}", GREY, 22))
                          for i in range(C)]).arrange(RIGHT, buff=0.35).move_to([-1.2, 0.5, 0])
        for g in copies:
            g[1].move_to(g[0].get_top() + UP * 0.28)
        arrows = VGroup(*[Arrow(sent.get_right(), g[0].get_left(), buff=0.15, stroke_width=2, tip_length=0.12, color=GREY) for g in copies[:1]])
        self.caption(f"The link sends every bit {C} times: {C} copies.")
        self.play(FadeIn(sent), FadeIn(copies), GrowArrow(arrows[0]))
        decided = VGroup(*[label(t, c, 30).move_to(g[0]) for g, (t, c) in zip(copies, (("+1", GREEN_C3), ("−1", RED), ("+1", GREEN_C3)))])
        self.caption("The receiver decides each copy. Here the second copy came out wrong.")
        self.play(LaggedStart(*[FadeIn(d) for d in decided], lag_ratio=0.3))
        vote = VGroup(Rectangle(width=1.6, height=0.8, stroke_color=WHITE, stroke_width=2), label("vote", WHITE, 22)).move_to([3.6, 0.5, 0])
        vote[1].move_to(vote[0].get_top() + UP * 0.28)
        out = label("+1", GREEN_C3, 30).move_to(vote[0])
        self.caption("Then it takes a vote: whichever value at least two copies agree on wins.")
        self.play(FadeIn(vote), GrowArrow(Arrow(copies.get_right(), vote[0].get_left(), buff=0.15, stroke_width=2, tip_length=0.12, color=GREY)))
        self.play(FadeIn(out))
        self.caption("So one wrong copy does no harm. A bit is lost only when two or three copies are wrong.")
        self.hold_caption()
        self.play(*[FadeOut(m) for m in self.mobjects if m is not self.cap])

        # 2. All eight outcomes
        rows = sorted(itertools.product([False, True], repeat=C), key=lambda r: sum(r))
        table = VGroup()
        for r in rows:
            k = sum(r)
            prob = (P ** k) * ((1 - P) ** (C - k))
            expr = " × ".join(f"{P:g}" if w else f"{1 - P:g}" for w in r)
            lost = k >= 2
            table.add(VGroup(
                VGroup(*[dot(w) for w in r]).arrange(RIGHT, buff=0.12),
                label(f"{expr} = {prob:.3f}", WHITE, 24),
                label("lost" if lost else "kept", RED if lost else GREEN_C3, 24),
            ))
        for row in table:
            row[1].next_to(row[0], RIGHT, buff=0.5)
            row[2].next_to(row[0], RIGHT, buff=4.6)
        table.arrange(DOWN, aligned_edge=LEFT, buff=0.22).move_to([-3.5, 0.1, 0])
        head = VGroup(label("copies", GREY, 20).next_to(table[0][0], UP, buff=0.3),
                      label("chance", GREY, 20).next_to(table[0][1], UP, buff=0.3).align_to(table[0][1], LEFT),
                      label("vote", GREY, 20).next_to(table[0][2], UP, buff=0.3).align_to(table[0][2], LEFT))
        legend = VGroup(dot(False), label("right", GREEN_C3, 18), dot(True), label(f"wrong ({P:g} of the time)", RED, 18)).arrange(RIGHT, buff=0.12)
        legend.next_to(head, UP, buff=0.25).align_to(table, LEFT)
        self.caption(f"Say each copy is wrong {P:g} of the time. These are all {2 ** C} ways the copies can come out.")
        self.play(FadeIn(legend), FadeIn(head))
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.2) for r in table], lag_ratio=0.25), run_time=3)
        lost_rows = [r for r, k in zip(table, rows) if sum(k) >= 2]
        boxes = VGroup(*[SurroundingRectangle(r, color=RED, buff=0.06, stroke_width=1.5) for r in lost_rows])
        self.caption("The bit is lost in the last four: two or three copies wrong.")
        self.play(Create(boxes))

        pad = Scratchpad(height=3.8, width=6.3, at=[3.7, 0.2, 0])
        self.play(*pad.show())
        two = C * P * P * (1 - P)
        three = P ** C
        lines = [(f"Two wrong: {C} × {P:g} × {P:g} × {1 - P:g} = {two:.3f}", WHITE),
                 (f"All three: {P:g} × {P:g} × {P:g} = {three:.3f}", WHITE),
                 (f"After the vote: {two:.3f} + {three:.3f} = {AFTER:.3f}", AMBER_C2)]
        for i, (t, c) in enumerate(lines):
            self.play(FadeIn(pad.line(t, i * 0.9, c, 23), shift=DOWN * 0.15))
            self.wait(2.5)
        self.caption(f"A copy error rate of {P:g} becomes {AFTER:.3f} after the vote.")
        self.caption(f"At {P2:g} per copy it becomes {AFTER2:.4f}: about 3 × {P2:g} × {P2:g}.")
        self.rule_card(["With three copies and a vote, a copy error rate p", f"becomes about 3p²: {P:g} → {AFTER:.3f}, {P2:g} → {AFTER2:.4f}."], clear=True)
