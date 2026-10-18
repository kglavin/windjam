"""Level 11, lesson B1: Example, one distance, three losses. Loss against distance at 450 MHz: free space, a street
microcell and Hata over the rooftops (urban.ts), with the 2 km values and the slopes."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

L = load_data("level11-B1")["loss"]
LX = [float(np.log10(d)) for d in L["km"]]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("One distance, three losses")
        P = Plot(-5.8, 7.4, -2.4, 4.9, (-1, float(np.log10(3))), (60, 160))
        ticks = [0.1, 0.2, 0.5, 1, 2, 3]
        axes = VGroup(P.axes(),
                      VGroup(*[label(f"{t:g}", GREY, 20).move_to([P.px(np.log10(t)), P.y0 - 0.25, 0]) for t in ticks]),
                      P.y_ticks([60, 80, 100, 120, 140, 160]),
                      label("distance (km)", GREY, 20).next_to([P.x0 + P.width / 2, P.y0, 0], DOWN, buff=0.45),
                      label("path loss (dB), 450 MHz", GREY, 20).move_to([P.x0, P.y0 + P.height + 0.25, 0], aligned_edge=LEFT))
        self.play(FadeIn(axes))
        x2 = P.px(np.log10(2))
        mark = DashedLine([x2, P.y0, 0], [x2, P.y0 + P.height, 0], dash_length=0.1, stroke_color=GREY, stroke_width=2)
        rows = [("free space", GREY, L["free"], L["at2"]["free"]),
                ("along a street", GREEN_C3, L["street"], L["at2"]["street"]),
                ("rooftops (Hata)", BLUE_C1, L["hata"], L["at2"]["hata"])]
        caps = ["In free space: 91.5 dB at 2 km.",
                "Low antennas along a street (a microcell): free space at first, steeper past a breakpoint.",
                "From a 30 m mast over the rooftops (Hata): 129.1 dB, 37.6 dB more than free space."]
        self.play(Create(mark))
        keys = VGroup()
        for i, (name, col, ys, v) in enumerate(rows):
            self.caption(caps[i])
            c = P.curve(LX, ys, col)
            k = label(f"{name}: {v} dB", col, 22)
            keys.add(k)
            keys.arrange(DOWN, aligned_edge=LEFT, buff=0.25).move_to([2.3, 1.4, 0], aligned_edge=LEFT)
            self.play(Create(c), FadeIn(k), run_time=1.5)
        build = P.curve(LX, [y + 15 for y in L["hata"]], AMBER_C2)
        bk = label(f"into a building: about {float(L['at2']['hata']) + 15:.1f} dB", AMBER_C2, 22)
        keys.add(bk)
        keys.arrange(DOWN, aligned_edge=LEFT, buff=0.25).move_to([2.3, 1.2, 0], aligned_edge=LEFT)
        self.caption("Into a building: about 15 dB more again.")
        self.play(Create(build), FadeIn(bk))
        slope = VGroup(label("per tenfold distance:", WHITE, 24), label("free space 20 dB", GREY, 24), label("Hata, 30 m mast: 35 dB", BLUE_C1, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.2).move_to([2.3, -1.2, 0], aligned_edge=LEFT)
        self.caption("Hata: 44.9 − 6.55 × log10(mast height) dB per tenfold distance. 35 dB for 30 m, not 40.")
        self.play(FadeIn(slope))
        self.wait(2)
        self.rule_card(["In town, loss grows about 35 dB per tenfold distance (Hata, 30 m mast).", "A building adds about 15 dB."], clear=True)
