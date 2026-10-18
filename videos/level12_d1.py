"""Level 12, lesson D1: A backbone through the mesh. The example mesh's connected dominating set (backbone); a flood
relayed only by it costs one send per backbone radio plus the source."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import mesh_parts  # noqa: E402

D = load_data("level12-D1")


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("A backbone")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        n = len(D["nodes"])
        B = set(D["backbone"])
        self.caption("A flat mesh wastes sends: every flood reaches every radio, and neighbours repeat each other.")
        self.play(FadeIn(V.frame()), *[FadeIn(x) for x in nodes], *[FadeIn(l) for l in links.values()])
        self.caption("A backbone: a connected group of radios that every other radio is next to.")
        self.play(*[nodes[i][0].animate.set_color(AMBER_C2).scale(1.4) for i in B])
        self.play(*[l.animate.set_stroke(AMBER_C2, 5, 1) for (a, b), l in links.items() if a in B and b in B])
        txt = VGroup(label(f"backbone: {len(B)} of {n} radios", AMBER_C2, 26),
                     label("every other radio touches one", WHITE, 22)).arrange(DOWN, buff=0.15).move_to([3.9, 2.2, 0])
        self.play(FadeIn(txt))
        g = D["gateway"]
        self.caption("Only backbone radios relay. A flood from G: G sends once, then each backbone radio once.")
        self.play(Indicate(nodes[g][0], color=YELLOW, scale_factor=1.8))
        self.play(LaggedStart(*[Indicate(nodes[i][0], color=YELLOW, scale_factor=1.8) for i in sorted(B)], lag_ratio=0.3), run_time=2)
        sends = label(f"{len(B) + (0 if g in B else 1)} sends instead of {n}", YELLOW, 28).move_to([3.9, 1.0, 0])
        self.play(FadeIn(sends))
        self.caption("Backbone radios work hardest and drain first. A load-balanced backbone hands the role round.")
        self.wait(1)
        self.rule_card(["A backbone relays for everyone:", "a flood costs one send per backbone radio plus the source."], clear=True)
