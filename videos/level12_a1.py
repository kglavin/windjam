"""Level 12, lesson A1: Multi-hop and self-healing. A message hops from G to E5 along the fewest-hop route; relay N is
knocked out and the route moves (route on the example mesh)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import link_of, mesh_parts  # noqa: E402

D = load_data("level12-A1")
N = D["nodes"]


class LessonVideo(LessonScene):
    def hop(self, V, path):
        dot = Dot(V.p(N[path[0]]["xKm"], N[path[0]]["yKm"]), radius=0.12, color=YELLOW)
        self.add(dot)
        for a, b in zip(path, path[1:]):
            self.play(dot.animate.move_to(V.p(N[b]["xKm"], N[b]["yKm"])), run_time=0.6)
        self.play(FadeOut(dot))

    def construct(self):
        self.title_card("Every radio a router")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        self.caption("A mesh has no base station and no hub. Every radio sends its own messages and relays others'.")
        self.play(FadeIn(V.frame()), *[FadeIn(n) for n in nodes])
        self.play(*[Create(l) for l in links.values()], run_time=1.5)
        r = D["route"]
        names = [D["names"][i] for i in r]
        path = VGroup(*[link_of(links, a, b).copy().set_stroke(BLUE_C1, 6, 1) for a, b in zip(r, r[1:])])
        info = label(f"{len(r) - 1} hops, {len(r) - 2} relays", BLUE_C1, 26).move_to([3.9, 2.2, 0])
        route_l = label(" → ".join(names), BLUE_C1, 22).move_to([3.9, 1.6, 0])
        self.caption("G cannot reach E5 directly. The message goes neighbour to neighbour: multi-hop.")
        self.play(Create(path), FadeIn(info), FadeIn(route_l))
        self.hop(V, r)
        k = D["knocked"]
        x = Cross(nodes[k][0], stroke_color=RED, stroke_width=5, scale_factor=1.6)
        self.caption(f"Relay {D['names'][k]} is lost: its battery dies, or it is jammed.")
        self.play(Create(x), nodes[k].animate.set_opacity(0.35), path.animate.set_stroke(opacity=0.25))
        self.caption("Its neighbours miss its HELLOs and drop the link. A route error goes back, and a new path is found.")
        r2 = D["repair"]
        path2 = VGroup(*[link_of(links, a, b).copy().set_stroke(BLUE_C1, 6, 1) for a, b in zip(r2, r2[1:])])
        self.play(FadeOut(path), Create(path2),
                  Transform(info, label(f"{len(r2) - 1} hops, {len(r2) - 2} relays", BLUE_C1, 26).move_to([3.9, 2.2, 0])),
                  Transform(route_l, label(" → ".join(D["names"][i] for i in r2), BLUE_C1, 20).move_to([3.9, 1.6, 0])))
        self.hop(V, r2)
        self.caption("The mesh heals round the gap. Each hop is short, but each adds delay and costs the relay battery.")
        self.wait(1)
        self.rule_card(["Every radio relays. A lost radio is routed round,", "if another path exists."], clear=True)
