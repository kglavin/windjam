"""Level 12, lesson C1: Routes on demand. G's route request floods the example mesh ring by ring, one send per radio;
the reply returns along the route to E5 (AODV)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import link_of, mesh_parts  # noqa: E402

D = load_data("level12-C1")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Routes on demand")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        self.play(FadeIn(V.frame()), *[FadeIn(n) for n in nodes], *[FadeIn(l) for l in links.values()])
        count = ValueTracker(0)
        counter = always_redraw(lambda: label(f"sends: {int(count.get_value())}", YELLOW, 30).move_to([3.9, 2.2, 0]))
        self.caption("G needs a route to E5 and has none. It broadcasts a route request.")
        self.add(counter)
        hops = D["hops"]
        for h in range(max(hops) + 1):
            ring = [i for i, v in enumerate(hops) if v == h]
            if h == 1:
                self.caption("Every radio that hears it for the first time notes where it came from, and sends it on once.")
            self.play(*[Indicate(nodes[i][0], color=YELLOW, scale_factor=1.8) for i in ring], count.animate.set_value(count.get_value() + len(ring)), run_time=0.9)
        total = label(f"one flood: {len(hops)} radios, {len(hops)} sends", WHITE, 24).move_to([3.9, 1.5, 0])
        self.play(FadeIn(total))
        r = D["route"]
        back = VGroup(*[link_of(links, a, b).copy().set_stroke(BLUE_C1, 6, 1) for a, b in zip(r, r[1:])])
        self.caption("E5 answers. The reply goes back along the noted path, and each radio on it learns the next hop.")
        self.play(LaggedStart(*[Create(s) for s in reversed(back)], lag_ratio=0.6), run_time=2.5)
        self.caption("Nothing is sent until a route is needed. But the first message waits for the flood and the reply.")
        self.wait(1)
        self.rule_card(["AODV: flood a request when a route is needed,", "one send per radio; the reply sets up the path."], clear=True)
