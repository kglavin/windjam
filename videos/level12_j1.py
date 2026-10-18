"""Level 12, lesson J1: Denial of sleep. Battery life of a sleeping sensor alone, under 10 fake frames a second, and with
an authenticated preamble (lifeDays)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

Z = load_data("level12-J1")["sleep"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Fake frames and flat batteries")
        rows = [("left alone", f"{Z['quietMw']} mW", float(Z["quiet"]), GREEN_C3),
                ("10 fake frames a second", "30.52 mW", float(Z["attacked"]), RED),
                ("same, authenticated preamble", "1.02 mW", float(Z["withAp"]), BLUE_C1)]
        X0, W, top = -2.2, 6.4, 1603.0
        bars = VGroup()
        for k, (name, mw, days, col) in enumerate(rows):
            y = 1.8 - 1.4 * k
            r = Rectangle(width=max(days / top * W, 0.05), height=0.6, stroke_width=0, fill_color=col, fill_opacity=0.9)
            r.move_to([X0 + r.width / 2, y, 0])
            bars.add(VGroup(label(name, WHITE, 22).move_to([-4.4, y + 0.2, 0]), label(mw, GREY, 20).move_to([-4.4, y - 0.2, 0]), r,
                            label(f"{days:g} days", col, 24).next_to(r, RIGHT, buff=0.15)))
        self.caption("A sensor that sleeps most of the time lasts years on a 20 Wh battery.")
        self.play(FadeIn(bars[0]))
        self.caption("Each fake frame wakes it, and waking costs 3 mJ. Ten a second: its battery lasts weeks.")
        self.play(FadeIn(bars[1]))
        self.caption("An authenticated preamble only friendly radios can make. A 0.05 mJ check drops a fake before the wake.")
        self.play(FadeIn(bars[2]))
        self.wait(1)
        table = VGroup(label("hopping, spreading: protect the data", WHITE, 24),
                       label("authenticated preamble: stops fakes and denial of sleep, not jamming", WHITE, 24)).arrange(DOWN, buff=0.15).move_to([0, -2.5, 0])
        self.caption("Each defence stops its own attack. None of these stops a jammer silencing CSMA radios by energy.")
        self.play(FadeIn(table))
        self.wait(1)
        self.rule_card(["Fake frames drain a sleeping radio's battery.", "An authenticated preamble drops them before the wake."], clear=True)
