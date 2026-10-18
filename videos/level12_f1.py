"""Level 12, lesson F1: Example, a quiet zone. A 1 W jammer silences the CSMA radios within 1.50 km of it (silenced,
denialRadii); it breaks a 0.8 km link's data only within 0.50 km."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403
from mesh_common import link_of, mesh_parts  # noqa: E402

D = load_data("level12-F1")
Q = D["quiet"]


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("Carrier-sense denial")
        V = MeshView()
        links, nodes = mesh_parts(D, V)
        self.play(FadeIn(V.frame()), *[FadeIn(x) for x in nodes], *[FadeIn(l) for l in links.values()])
        j = Q["jammer"]
        jam = Square(side_length=0.24, fill_color=RED, fill_opacity=1, stroke_width=0).move_to(V.p(j["xKm"], j["yKm"]))
        self.caption("CSMA radios send only when the channel is below their threshold, −85 dBm here.")
        self.play(FadeIn(jam))
        ring = V.ring(j["xKm"], j["yKm"], float(Q["silenceKm"]))
        pad = VGroup(label("1 W = 30 dBm", WHITE, 22), label("at 1 km: 30 − 108.0 = −78.0 dBm", WHITE, 22),
                     label("7.0 dB above −85 dBm", WHITE, 22), label(f"silenced out to {Q['silenceKm']} km", RED, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to([3.9, 1.9, 0])
        self.caption("A weak jammer keeps the channel above that threshold. No J/S needed: nobody near it ever sends.")
        self.play(Create(ring), FadeIn(pad, lag_ratio=0.3), run_time=2)
        self.play(*[nodes[i].animate.set_opacity(0.35) for i in Q["silenced"]])
        data = V.ring(j["xKm"], j["yKm"], float(Q["dataKm"]), color=AMBER_C2, opacity=0.15)
        pad2 = VGroup(label("data on a 0.8 km link: J/S must reach 8 dB", WHITE, 22), label(f"only within {Q['dataKm']} km", AMBER_C2, 24),
                      label(f"to {Q['silenceKm']} km: {Q['ratio']} times the power", AMBER_C2, 24)).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to([3.9, -0.6, 0])
        self.caption("Breaking the data is far harder: these links stand J/S up to 8 dB.")
        self.play(Create(data), FadeIn(pad2, lag_ratio=0.3), run_time=2)
        self.caption("Silencing reaches three times as far for the same power.")
        self.wait(1.5)
        self.rule_card(["Against CSMA a jammer only has to reach the threshold.", "It silences radios far beyond where it could break their data."], clear=True)
