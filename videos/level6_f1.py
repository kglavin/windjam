"""Level 6, lesson F1: Example, one UAV, many bearings.

The UAV flies the lesson's 6 km leg, a bearing every 0.5 km (exampleBearings for F1), and the least-squares fix after
each bearing shrinks (fixFromBearings); then a leg flown toward the transmitter, whose bearings never cross."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level6-F1")["f1"]
LEG = DATA["leg"]
BRG = DATA["bearings"]
FIXES = DATA["fixes"]
TX = DATA["target"]


def uav(at):
    return Triangle(color=AMBER_C2, fill_color=AMBER_C2, fill_opacity=1).scale(0.13).move_to(at)


class LessonVideo(LessonScene):
    def construct(self):
        self.title_card("One UAV, many bearings")
        M = MapView()
        path = DashedLine(M.p(*LEG[0]), M.p(*LEG[-1]), dash_length=0.1, stroke_color=AMBER_C2, stroke_width=3)
        plane = uav(M.p(*LEG[0]))
        self.play(FadeIn(M.grid()), Create(path), FadeIn(plane))
        self.caption(f"One UAV flies a 6 km leg along the front line, {DATA['heightM']} m up.")
        self.caption(f"Up there it hears the transmitter at {DATA['uavSnr']:.0f} dB, where a ground site hears {DATA['groundSnr']:.0f} dB.")
        self.caption("So every bearing is as sharp as the rule allows: σ = 2°.")

        pad = Scratchpad(height=3.0, width=6.2)
        self.play(*pad.show())
        count = pad.line("bearings: 0", 0, WHITE, 26)
        cep = pad.line("CEP: no fix yet", 0.85, GREEN_C3, 26)
        self.play(FadeIn(count), FadeIn(cep))
        self.caption("A bearing every half kilometre. Each comes from a new place, so they cross like bearings from many sites.")
        rays = VGroup()
        ell = None
        for k, (p, b) in enumerate(zip(LEG, BRG)):
            ray = M.ray(*p, b, width=1.6)
            rays.add(ray)
            anims = [plane.animate.move_to(M.p(*p)), Create(ray)]
            count.become(pad.line(f"bearings: {k + 1}", 0, WHITE, 26))
            f = FIXES[k]
            if f is not None:
                cep.become(pad.line(f"CEP: {f['cep']:.2f} km", 0.85, GREEN_C3, 26))
                e = M.ellipse(f["x"], f["y"], f["a"], f["b"], f["angle"])
                anims.append(Transform(ell, e) if ell is not None else Create(e))
                ell = ell if ell is not None else e
            self.play(*anims, run_time=0.7)
        self.caption(f"The bearings swing from {BRG[0]:.0f}° to {BRG[-1]:.0f}°: the leg works as a 6 km baseline.")
        last = FIXES[-1]
        miss = np.hypot(last["x"] - TX[0], last["y"] - TX[1])
        self.caption(f"The fix of all {len(BRG)} is {miss:.2f} km from the transmitter, with a CEP of {last['cep']:.2f} km.")
        marks = VGroup(M.cross(last["x"], last["y"]), M.target(*TX))
        self.play(Create(marks[0]), FadeIn(marks[1]))
        self.wait(1)

        # Toward the transmitter instead.
        self.caption("Now the same UAV flies straight toward the transmitter.")
        count.become(pad.line("bearings: 0", 0, WHITE, 26))
        cep.become(pad.line("CEP: no fix", 0.85, RED, 26))
        self.play(FadeOut(rays), FadeOut(ell), FadeOut(path), FadeOut(marks[0]))
        tw = DATA["toward"]
        path2 = DashedLine(M.p(*tw[0]["p"]), M.p(*tw[-1]["p"]), dash_length=0.1, stroke_color=AMBER_C2, stroke_width=3)
        self.play(plane.animate.move_to(M.p(*tw[0]["p"])), Create(path2))
        for k, step in enumerate(tw):
            count.become(pad.line(f"bearings: {k + 1}", 0, WHITE, 26))
            self.play(plane.animate.move_to(M.p(*step["p"])), Create(M.ray(*step["p"], step["b"], width=1.6)), run_time=0.35)
        self.caption("Every bearing points the same way. They never cross, so there is no fix.")
        self.rule_card(["Fly across the line of sight, as long a leg as the transmitter allows.",
                        "The longer the leg, the steeper the crossings and the smaller the CEP."], clear=True)
