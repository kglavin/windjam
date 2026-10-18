"""Level 7, lesson E1: Example, racing the hop. The follower's delay is its processing time plus the extra path
transmitter → follower → receiver; what is left of the 150 µs dwell is its share. Numbers and the 20% ellipse from
followerNumbers and followerEllipse."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

F = load_data("level7-E1")["follower"]
TX, RX = F["tx"], F["rx"]
DWELL, PROC = F["dwellUs"], F["procUs"]
PATH = F["path"]  # from J2 (index 0) to J1 (last)
BAR_X0, BAR_W, BAR_Y = 1.0, 5.6, 2.3


def at(t):
    """The path entry at fractional index t, interpolated."""
    i = int(np.clip(np.floor(t), 0, len(PATH) - 2))
    f = float(np.clip(t - i, 0, 1))
    a, b = PATH[i], PATH[i + 1]
    return {k: (np.array(a[k]) + f * (np.array(b[k]) - np.array(a[k]))) for k in ("p", "pathUs", "delayUs", "share", "extra")}


def bar(e):
    """The dwell as a bar: processing (grey), the extra path (amber), and the share the follower jams (red)."""
    u = BAR_W / DWELL
    proc = min(PROC, DWELL)
    path = max(0.0, min(float(e["pathUs"]), DWELL - proc))
    seg = lambda x, w, c: Rectangle(width=max(w * u, 0.001), height=0.5, stroke_width=0, fill_color=c, fill_opacity=0.85).move_to(
        [BAR_X0 + (x + w / 2) * u, BAR_Y, 0])
    g = VGroup(Rectangle(width=BAR_W, height=0.5, stroke_color=GREY, stroke_width=1.5).move_to([BAR_X0 + BAR_W / 2, BAR_Y, 0]),
               seg(0, proc, GREY), seg(proc, path, AMBER_C2), seg(proc + path, DWELL - proc - path, RED))
    g.add(label(f"share jammed: {100 * float(e['share']):.0f}%", RED, 24).move_to([BAR_X0 + BAR_W / 2, BAR_Y - 0.7, 0]))
    g.add(label(f"extra path {float(e['extra']):.1f} km = {float(e['pathUs']):.0f} µs", AMBER_C2, 22).move_to([BAR_X0 + BAR_W / 2, BAR_Y - 1.25, 0]))
    return g


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Racing the hop")
        M = MapView()
        tx = M.site(*TX, "transmitter", RED, UR)
        rx = M.site(*RX, "receiver", RED, UR)
        direct = DashedLine(M.p(*TX), M.p(*RX), dash_length=0.08, stroke_color=GREY, stroke_width=1.5)
        self.play(FadeIn(M.grid()), FadeIn(tx), FadeIn(rx), Create(direct))
        t = ValueTracker(len(PATH) - 1)  # start at J1, on the front line
        jam = always_redraw(lambda: M.site(*at(t.get_value())["p"][:2], "follower", AMBER_C2, DR))
        legs = always_redraw(lambda: VGroup(Line(M.p(*TX), M.p(*at(t.get_value())["p"][:2])), Line(M.p(*at(t.get_value())["p"][:2]), M.p(*RX)))
                             .set_stroke(AMBER_C2, 2))
        self.caption("A follower listens for each hop, tunes to its channel and jams it with all its power.")
        self.play(FadeIn(jam), Create(legs))
        head = label(f"one dwell: {DWELL} µs", WHITE, 24).move_to([BAR_X0 + BAR_W / 2, BAR_Y + 0.6, 0])
        the_bar = always_redraw(lambda: bar(at(t.get_value())))
        self.caption(f"But it is always late. First it needs {PROC} µs to hear the hop and tune (grey).")
        self.play(FadeIn(head), FadeIn(the_bar))
        self.caption("Then its signal takes the long way round: every extra km costs 3.3 µs (amber).")
        self.wait(1)
        self.caption("Whatever is left of the dwell is all it jams (red). Here, at the front line, 35%.")
        self.wait(1)
        self.caption("Farther from the line between transmitter and receiver, the path grows and the share shrinks.")
        self.play(t.animate.set_value(0), run_time=6, rate_func=smooth)
        self.caption("Far to the west, the follower jams only 11% of each hop.")
        ell = M.curve(F["ellipse"], RED, 2.5)
        self.caption("Inside this ellipse the follower gets at least 20% of each dwell.")
        self.play(Create(ell), run_time=2)
        self.play(t.animate.set_value(len(PATH) - 1), run_time=3)
        self.caption(f"A shorter dwell shrinks the ellipse. Below {PROC} µs nothing is left at all.")
        self.rule_card(["Share = 1 − (processing + extra km ÷ 0.3) ÷ dwell, times in µs.",
                        "Short dwells, and distance from the link, beat a follower."], clear=True)
