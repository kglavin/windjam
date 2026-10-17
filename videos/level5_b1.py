"""Level 5, lesson B1: Example, one copy of every bit, or every copy of some bits.

Both pulsed jammers are on a third of the time at the same average power (J/S 15 dB), so a copy inside a pulse sees
three times the jammer: copy error rate copyBerOn. BERs are the engine's exampleTheory, as the lesson prints them."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level5-B1")
C = DATA["copies"]
Q_ON = DATA["copyBerOn"]
ONE = DATA["oneCopy"]
WHOLE = DATA["wholeBit"]
COUNT = WHOLE["periodCopies"]   # one period of the whole-bit jammer: 9 copies, 3 bits
X0, W = -4.4, 10.8
ROW_T, ROW_A, ROW_B = 2.5, 0.8, -1.3


def maj(q):
    return 3 * q * q * (1 - q) + q ** 3


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Pulses against the vote")
        boxes, marks, cw = copy_timeline(COUNT, X0, W, ROW_T)
        names = VGroup(label("copies", GREY, 22).move_to([X0 - 1.4, ROW_T, 0]))
        self.caption(f"Every bit is sent as {C} copies, and the receiver takes a vote.")
        self.play(FadeIn(boxes), FadeIn(marks), FadeIn(names))

        def pulses(spec, y, name):
            g = VGroup()
            for start in range(0, COUNT, spec["periodCopies"]):
                g.add(Rectangle(width=spec["onCopies"] * cw, height=0.55, stroke_width=0, fill_color=RED, fill_opacity=0.85)
                      .move_to([X0 + (start + spec["onCopies"] / 2) * cw, y, 0]))
            base = Line([X0, y - 0.275, 0], [X0 + W, y - 0.275, 0], color=GREY, stroke_width=1)
            return g, base, label(name, RED, 22).move_to([X0 - 1.4, y, 0])

        def copy_errs(spec, y):
            hit = set()
            for start in range(0, COUNT, spec["periodCopies"]):
                hit.update(range(start, start + spec["onCopies"]))
            return VGroup(*[label(f"{Q_ON:.2f}" if i in hit else "0", RED if i in hit else GREEN_C3, 22)
                            .move_to([X0 + (i + 0.5) * cw, y - 0.5, 0]) for i in range(COUNT)]), hit

        def outcome(hit, y):
            g = VGroup()
            for b in range(COUNT // C):
                k = len([i for i in range(b * C, (b + 1) * C) if i in hit])
                txt, col = ("kept", GREEN_C3) if k <= 1 else (f"lost {maj(Q_ON):.2f}", RED)
                g.add(label(txt, col, 24).move_to([X0 + (b + 0.5) * C * cw, y - 1.0, 0]))
            return g

        # 1. One copy of every bit
        pa, ba, na = pulses(ONE, ROW_A, "one copy\nof every bit")
        self.caption(f"Jammer A: pulses on one copy of every bit, on 1/{ONE['periodCopies']} of the time.")
        self.play(FadeIn(ba), FadeIn(na), LaggedStart(*[GrowFromEdge(p, DOWN) for p in pa], lag_ratio=0.2))
        ea, hit_a = copy_errs(ONE, ROW_A)
        self.caption(f"Each copy a pulse hits is wrong {Q_ON:.2f} of the time. The others are clean.")
        self.play(FadeIn(ea))
        oa = outcome(hit_a, ROW_A)
        self.caption("But every bit still has two clean copies, and they outvote the broken one.")
        self.play(LaggedStart(*[FadeIn(o) for o in oa], lag_ratio=0.3))
        self.caption("Almost no bits are lost.")

        # 2. Every copy of some bits
        pb, bb, nb = pulses(WHOLE, ROW_B, "every copy of\nevery third bit")
        self.caption(f"Jammer B: the same power in pulses {WHOLE['onCopies']} copies long, every {WHOLE['periodCopies']} copies.")
        self.play(FadeIn(bb), FadeIn(nb), LaggedStart(*[GrowFromEdge(p, DOWN) for p in pb], lag_ratio=0.2))
        eb, hit_b = copy_errs(WHOLE, ROW_B)
        self.play(FadeIn(eb))
        ob = outcome(hit_b, ROW_B)
        self.caption("All three copies of a bit break together, so the vote cannot help.")
        self.play(LaggedStart(*[FadeIn(o) for o in ob], lag_ratio=0.3))
        self.caption(f"The hit bit is lost when two or three copies are wrong: {maj(Q_ON):.2f} of the time.")

        # 3. Scratchpad
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=4.2, width=10.0, at=[0, 0.6, 0])
        self.play(*pad.show())
        rows = [
            (f"A copy inside a pulse: wrong {Q_ON:.2f} of the time", WHITE),
            (f"Broadband noise, same power: BER {sci(DATA['berBbn'])}", GREY),
            (f"One copy of every bit: the vote fixes it, BER {sci(DATA['berOneCopy']) if DATA['berOneCopy'] > 0 else 'almost 0'}", GREEN_C3),
            (f"Every copy of every third bit: {maj(Q_ON):.2f} ÷ 3 = {sci(DATA['berWholeBit'])}", AMBER_C2),
            (f"{DATA['berWholeBit'] / DATA['berBbn']:.0f} times worse than broadband noise", AMBER_C2),
        ]
        for i, (t, c) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i * 0.85, c, 26), shift=DOWN * 0.15))
            self.wait(2.5)
        self.rule_card(["Against a vote, a pulse must cover every copy of a bit:", "three copies long, starting where a bit starts."])
