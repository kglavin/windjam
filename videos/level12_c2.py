"""Level 12, lesson C2: Routes kept ready. Every radio flooding costs N × N sends; W3's multipoint relays reach all its
2-hop neighbours, and a flood relayed only by relays costs fewer sends (mpr, mprFlood)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import mesh_parts  # noqa: E402

D = load_data("level12-C2")
M = D["mpr"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Routes kept ready")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        n = len(D["nodes"])
        self.play(FadeIn(V.frame()), *[FadeIn(x) for x in nodes], *[FadeIn(l) for l in links.values()])
        self.caption("OLSR keeps every route ready. Radios send HELLOs to learn their neighbours.")
        self.play(*[Indicate(x[0], color=GREEN_C3, scale_factor=1.6) for x in nodes], run_time=1.2)
        cost = VGroup(label(f"{n} radios each flood their links:", WHITE, 24), label(f"{n} × {n} = {n * n} sends a round", YELLOW, 26)).arrange(DOWN, buff=0.15).move_to([3.9, 2.2, 0])
        self.caption("Each radio floods its links to all the others: N floods of N sends. N × N, not more.")
        self.play(FadeIn(cost))
        u = M["of"]
        adj = {i: set() for i in range(n)}
        for a, b in D["links"]:
            adj[a].add(b)
            adj[b].add(a)
        two = {w for v in adj[u] for w in adj[v]} - adj[u] - {u}
        self.caption(f"Multipoint relays cut it. {D['names'][u]} picks the fewest neighbours that reach all its neighbours' neighbours.")
        self.play(nodes[u][0].animate.set_color(BLUE_C1).scale(1.4))
        self.play(*[nodes[w][0].animate.set_color(YELLOW) for w in two])
        self.play(*[nodes[v][0].animate.set_color(VIOLET).scale(1.3) for v in M["relays"]])
        rel = label(f"relays of {D['names'][u]}: {', '.join(D['names'][v] for v in M['relays'])}", VIOLET, 24).move_to([3.9, 0.6, 0])
        self.play(FadeIn(rel))
        res = VGroup(label("a flood from G, relays only:", WHITE, 22), label(f"{M['sends']} sends, not {n}", YELLOW, 26)).arrange(DOWN, buff=0.12).move_to([3.9, -0.4, 0])
        self.caption("Only relays pass a radio's floods on. Every radio is still reached, with fewer sends.")
        self.play(FadeIn(res))
        self.wait(1)
        self.rule_card(["OLSR: HELLOs and link floods keep every route ready.", "Every radio flooding costs N × N sends; multipoint relays cut that."], clear=True)
