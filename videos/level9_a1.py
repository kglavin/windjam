"""Level 9, lesson A1: Example, what a soldier can carry. The four platforms' RF power and time on air (the lab's round
figures, from tactics.ts), then the soldier pack worked: DC power, battery life, and jamming a quarter of the time."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level9-A1")
PLAT = D["platforms"]
COLORS = [AMBER_C2, BLUE_C1, GREEN_C3, VIOLET]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Power is scarce")
        xs = [-5.2, -1.8, 1.6, 5.0]
        names = VGroup(*[label(p["name"], c, 24).move_to([x, 3.0, 0]) for p, c, x in zip(PLAT, COLORS, xs)])
        self.caption("A jammer needs power where it stands: a soldier's battery, a UAV's payload, a generator, an engine.")
        self.play(LaggedStart(*[FadeIn(n) for n in names], lag_ratio=0.3))
        # Bars: RF power on a log scale (1 W to 1000 W), time on air on a log scale (1 h to 200 h).
        def bar(v, top, y0, color, x):
            h = 1.8 * np.log10(v) / np.log10(top)
            return Rectangle(width=0.7, height=max(h, 0.05), stroke_width=0, fill_color=color, fill_opacity=0.85).move_to([x, y0 + h / 2, 0])
        rf = VGroup(*[bar(p["rfW"], 1000, 0.4, c, x - 0.5) for p, c, x in zip(PLAT, COLORS, xs)])
        hrs = VGroup(*[bar(max(p["hours"], 1.01), 200, 0.4, c, x + 0.5).set_fill(opacity=0.45) for p, c, x in zip(PLAT, COLORS, xs)])
        rf_l = VGroup(*[label(f"{p['rfW']:g} W", GREY, 18).next_to(b, UP, buff=0.08) for p, b in zip(PLAT, rf)])
        hr_l = VGroup(*[label(f"{p['hours']:.3g} h", GREY, 18).next_to(b, UP, buff=0.08) for p, b in zip(PLAT, hrs)])
        key = label("solid: radio power      faint: hours on air at full power", GREY, 20).move_to([0, -0.1, 0])
        self.caption("Bigger platforms send more power for longer. The small ones run out fast.")
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in rf], lag_ratio=0.2), FadeIn(rf_l))
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in hrs], lag_ratio=0.2), FadeIn(hr_l), FadeIn(key))
        s = PLAT[0]
        pad = Scratchpad(height=2.4, width=10.0, at=[0, -1.75, 0])
        self.play(*pad.show())
        rows = [
            (f"Soldier pack: {s['rfW']:g} W of radio power at {s['efficiency'] * 100:.0f}% efficiency", WHITE),
            (f"DC power = {s['rfW']:g} ÷ {s['efficiency']} = {s['dcW']:.1f} W: the rest is heat", YELLOW),
            (f"{s['energyWh']:g} Wh ÷ {s['dcW']:.1f} W = {s['hours']:.1f} hours of jamming", YELLOW),
        ]
        self.caption("The amplifier turns only part of its supply into radio power. Every watt sent costs two or three of battery.")
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.65, c, 22)))
            self.wait(1.2)
        self.caption(f"Jam only a quarter of the time and the battery lasts 4 times as long: {4 * s['hours']:.0f} hours.")
        self.rule_card(["DC power = RF power ÷ efficiency.", "Time on air = energy ÷ DC power. Jam only when it pays."], clear=True)
