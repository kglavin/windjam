"""Level 12, lesson B1: Listen first, or take turns. CSMA: A sends, C hears a busy channel, backs off, then sends.
TDMA: repeating frames of 5 slots, one radio each."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

X0, W = -4.6, 10.6


def bar(row_y, t0, t1, t_max, color, text=None):
    r = Rectangle(width=max((t1 - t0) / t_max * W, 0.04), height=0.5, stroke_width=0, fill_color=color, fill_opacity=0.9)
    r.move_to([X0 + (t0 + t1) / 2 / t_max * W, row_y, 0])
    if text and r.width > 0.8:
        return VGroup(r, label(text, "#0b1220", 20).move_to(r))
    return VGroup(r)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Sharing the channel")
        rows = {"A": 2.2, "C": 1.2, "slots": -1.4}
        heads = VGroup(label("CSMA: A", WHITE, 22).move_to([-5.7, rows["A"], 0]), label("CSMA: C", WHITE, 22).move_to([-5.7, rows["C"], 0]),
                       label("TDMA", WHITE, 22).move_to([-5.7, rows["slots"], 0]))
        lines = VGroup(*[Line([X0, y, 0], [X0 + W, y, 0], stroke_color=GREY, stroke_width=1) for y in rows.values()])
        self.caption("All the radios share one channel. Two sending at once near one receiver: both messages lost.")
        self.play(FadeIn(heads), Create(lines))
        self.caption("CSMA: listen before you talk. A hears a quiet channel and sends.")
        self.play(FadeIn(bar(rows["A"], 1, 5, 20, BLUE_C1, "A sends")))
        self.caption("C listens, finds the channel busy, and waits a random time.")
        self.play(FadeIn(bar(rows["C"], 2, 2.3, 20, GREY)), FadeIn(bar(rows["C"], 2.3, 6.5, 20, AMBER_C2, "busy: back off")))
        self.caption("Then it listens again, finds it quiet, and sends. No clock needed, but C must keep listening.")
        self.play(FadeIn(bar(rows["C"], 6.5, 10, 20, BLUE_C1, "C sends")))
        self.caption("TDMA: take turns. Time is cut into frames of slots; each radio sends only in its own.")
        slots = VGroup(*[bar(rows["slots"], f * 10 + i * 2, f * 10 + i * 2 + 1.8, 20, BLUE_C1 if s == "C" else GREY, s)
                         for f in (0, 1) for i, s in enumerate("ABCDE")])
        self.play(LaggedStart(*[FadeIn(s) for s in slots], lag_ratio=0.15), run_time=2)
        note = label("5 slots of 2 ms: C sends every 10 ms, and can sleep in between", WHITE, 24).move_to([0, -2.4, 0])
        self.caption("No collisions, and radios sleep outside their slots. But every radio needs the same clock.")
        self.play(FadeIn(note))
        self.wait(1)
        self.rule_card(["CSMA: listen first, back off when busy; no clock.", "TDMA: own slots, no collisions, sleep between; needs a common clock."], clear=True)
