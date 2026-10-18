"""Level 9, lesson E1: Example, stand near the hub. The 10 W pack walks from near outstation S1 to 1.5 km from the hub;
each link turns red as it breaks (networkTry on the example network)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

N = load_data("level9-E1")["net"]
NODES = N["nodes"]
LINKS = N["links"]
WALK = N["walk"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The hub is the target")
        M = MapView()
        self.play(FadeIn(M.grid()))
        t = ValueTracker(0)

        def state():
            return WALK[int(round(np.clip(t.get_value(), 0, len(WALK) - 1)))]

        def link_lines():
            g = VGroup()
            den = state()["denied"]
            for i, l in enumerate(LINKS):
                a, b = NODES[l["from"]], NODES[l["to"]]
                pa, pb = M.p(a["xKm"], a["yKm"]), M.p(b["xKm"], b["yKm"])
                d = pb - pa
                off = np.array([-d[1], d[0], 0]) / (np.linalg.norm(d) or 1) * 0.05
                g.add(Line(pa + off, pb + off, stroke_color=RED if den[i] else GREEN_C3, stroke_width=3))
            return g

        lines = always_redraw(link_lines)
        nodes = VGroup(*[M.site(n["xKm"], n["yKm"], n["name"], RED if n["name"] == "hub" else BLUE_C1, UR) for n in NODES])
        self.caption("An enemy hub talks to five outstations: a link into the hub from each, and one back.")
        self.play(FadeIn(lines), FadeIn(nodes))
        pack = always_redraw(lambda: M.site(*state()["at"], "pack", AMBER_C2, DL))
        count = always_redraw(lambda: label(f"links into the hub broken: {sum(state()['denied'][:5])} of 5", YELLOW, 26).move_to([3.6, 2.4, 0]))
        self.caption("Your 10 W pack starts near outstation S1. It breaks nothing there that matters.")
        self.play(FadeIn(pack), FadeIn(count))
        self.caption("Every message into the hub arrives at one receiver. Move the pack toward it.")
        self.play(t.animate.set_value(len(WALK) - 1), run_time=7, rate_func=linear)
        self.caption("Near the hub, J/S at that one receiver beats every outstation's signal: all five links into it break.")
        self.wait(2)
        self.caption("One small jammer, every spoke. That is why level 6 finds the hub first: it sends the most.")
        self.rule_card(["Against hub and spoke, jam the hub's receiver:", "one jammer breaks every spoke."], clear=True)
