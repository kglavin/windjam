"""Level 12, lesson H1: Example, split the mesh. The backbone; a 0.5 W jammer between W3 and W4 silences both and cuts
10 radios off from G (meshTry)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import mesh_parts  # noqa: E402

D = load_data("level12-H1")
S = D["split"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("The backbone as target")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        self.play(FadeIn(V.frame()), *[FadeIn(x) for x in nodes], *[FadeIn(l) for l in links.values()])
        B = D["backbone"]
        self.caption("A mesh heals round a lost radio only if another path exists. Here are the backbone radios.")
        self.play(*[nodes[i][0].animate.set_color(AMBER_C2).scale(1.4) for i in B])
        w3, w4 = D["names"].index("W3"), D["names"].index("W4")
        self.caption("Both ways east pass W3 or W4, 2.4 km apart.")
        self.play(Indicate(nodes[w3], color=YELLOW, scale_factor=1.4), Indicate(nodes[w4], color=YELLOW, scale_factor=1.4))
        j = S["jammer"]
        jam = Square(side_length=0.24, fill_color=RED, fill_opacity=1, stroke_width=0).move_to(V.p(j["xKm"], j["yKm"]))
        ring = V.ring(j["xKm"], j["yKm"], S["rKm"])
        self.caption(f"A 0.5 W jammer between them silences out to {S['rKm']:.2f} km: both go quiet.")
        self.play(FadeIn(jam), Create(ring))
        self.play(*[nodes[i].animate.set_opacity(0.35) for i in S["silenced"]],
                  *[l.animate.set_stroke(opacity=0.15) for (a, b), l in links.items() if a in S["silenced"] or b in S["silenced"]])
        cut = [i for i in S["cut"] if i not in S["silenced"]]
        self.caption(f"Every radio beyond loses G: {len(S['cut'])} cut off, though the jammer is near only two.")
        self.play(*[nodes[i][0].animate.set_color(RED) for i in cut])
        txt = label(f"cut off from G: {len(S['cut'])} of {len(D['nodes'])}", RED, 28).move_to([3.9, 2.2, 0])
        self.play(FadeIn(txt))
        self.caption("The defence: more paths, and a backbone whose role moves, so no place stays the weak point.")
        self.wait(1)
        self.rule_card(["Jam where the paths converge:", "one jammer there cuts off everything beyond."], clear=True)
