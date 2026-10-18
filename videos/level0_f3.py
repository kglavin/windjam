"""Level 0, lesson F3: Radiated power and margin. The link as a power ladder (EIRP, path, receive antenna and cable,
sensitivity, margin), then a fading signal against its margin (fade probabilities from urban.ts)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

D = load_data("level0-F3")
FSL = round(D["fsl"])
STEPS = [("amplifier, 20 W", 43, WHITE), ("cable −3 dB", 40, GREY), ("antenna +10 dBi: EIRP", 50, AMBER_C2),
         (f"free space −{FSL} dB", 50 - FSL, BLUE_C1), ("receive antenna +3 dBi", 50 - FSL + 3, GREY), ("cable −1 dB: arrives", 50 - FSL + 2, GREEN_C3)]
SENS = -104


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Radiated power and margin")
        y = lambda dbm: -2.6 + (dbm + 110) / 165 * 5.6
        axis = VGroup(Line([-5.6, y(-110), 0], [-5.6, y(55), 0], stroke_color=GREY),
                      *[VGroup(Line([-5.7, y(v), 0], [-5.5, y(v), 0], stroke_color=GREY), label(f"{v:+d}", GREY, 18).next_to([-5.7, y(v), 0], LEFT, buff=0.08))
                        for v in [50, 0, -50, -100]],
                      label("dBm", GREY, 18).move_to([-6.3, y(55) + 0.1, 0]))
        self.caption("Follow the signal from amplifier to receiver, adding gains and taking off losses: a power ladder.")
        self.play(FadeIn(axis))
        prev = None
        marks = VGroup()
        for i, (name, dbm, col) in enumerate(STEPS):
            x = -4.6 + i * 2.05
            dot = Dot([x, y(dbm), 0], color=col, radius=0.08)
            txt = VGroup(label(name, col, 18), label(neg(f"{dbm:+d} dBm"), col, 20)).arrange(DOWN, buff=0.05)
            txt.next_to(dot, LEFT if i == 3 else (UP if (dbm > -20 or i % 2) else DOWN), buff=0.12)
            anims = [FadeIn(dot), FadeIn(txt)]
            if prev is not None:
                anims.append(Create(Arrow(prev.get_center(), dot.get_center(), buff=0.1, stroke_width=3, color=GREY, max_tip_length_to_length_ratio=0.08)))
            if i == 0:
                self.caption("A 20 W amplifier is +43 dBm.")
            if i == 2:
                self.caption("Less 3 dB of cable, plus a 10 dBi antenna: EIRP +50 dBm, 100 W toward the receiver.")
            if i == 3:
                self.caption(f"At 300 MHz over 10 km, free space takes {FSL} dB.")
            if i == 5:
                self.caption("The receiving antenna adds 3 dB and its cable takes 1: −50 dBm arrives.")
            self.play(*anims, run_time=0.9)
            marks.add(dot, txt)
            prev = dot
        sens = DashedLine([-5.6, y(SENS), 0], [6.5, y(SENS), 0], dash_length=0.12, stroke_color=RED, stroke_width=2)
        sens_l = label("receiver sensitivity −104 dBm", RED, 20).next_to([6.5, y(SENS), 0], UP, buff=0.08).shift(LEFT * 2.2)
        top = STEPS[-1][1]
        br = Line([5.9, y(SENS), 0], [5.9, y(top), 0], stroke_color=YELLOW, stroke_width=3)
        br_l = label(f"margin {top - SENS} dB", YELLOW, 22).next_to(br, LEFT, buff=0.1)
        self.caption("The receiver works down to −104 dBm. What arrives above that is the link margin.")
        self.play(Create(sens), FadeIn(sens_l))
        self.play(Create(br), FadeIn(br_l))
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])

        # Fading against margin.
        P = Plot(-5.8, 11.6, -2.4, 4.6, (0, 400), (-40, 10))
        rng = np.random.default_rng(5)
        h = (rng.standard_normal(2000) + 1j * rng.standard_normal(2000)) / np.sqrt(2)
        k = np.ones(30) / 30
        smooth = np.convolve(h, k, mode="same")
        lvl = 20 * np.log10(np.abs(smooth[:400]) / np.sqrt(np.mean(np.abs(smooth) ** 2)) + 1e-9)
        axes = VGroup(P.axes(), P.y_ticks([0, -10, -20, -30]),
                      label("received level against its average (dB), along a street", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.3))
        self.caption("Among buildings and moving vehicles the signal fades, sometimes deeply, as paths cancel.")
        self.play(FadeIn(axes), Create(P.curve(np.arange(400), lvl, BLUE_C1, 2)), run_time=3)
        for f in D["fades"]:
            m = f["margin"]
            line = DashedLine([P.x0, P.py(-m), 0], [P.x0 + P.width, P.py(-m), 0], dash_length=0.1, stroke_color=RED, stroke_width=1.5)
            lab = label(f"{m} dB margin: lost {100 * f['p']:.2g}% of the time", RED, 20).next_to([P.x0 + P.width, P.py(-m), 0], DOWN, buff=0.08).shift(LEFT * 2.6)
            self.caption(f"With {m} dB of margin, the link drops only in fades deeper than {m} dB: about {100 * f['p']:.2g}% of the time.")
            self.play(Create(line), FadeIn(lab))
        self.rule_card(["EIRP = amplifier − cable + antenna gain. Margin = what arrives − sensitivity.",
                        "Each 10 dB of margin cuts the time lost to fades by 10 times."], clear=True)
