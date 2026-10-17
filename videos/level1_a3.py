"""Level 1, lesson A3: The receiver gets the bits back. The chips and noise are the app figure's
(videos/data/level1-A3.ts)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import *  # noqa: E402,F403

DATA = load_data("level1-A3")
N = DATA["chipsPerBit"]
BITS = DATA["bits"]
CODE = DATA["code"]      # repeated for every bit
SENT = DATA["sent"]
NOISE = DATA["noise"]
SUMS = DATA["sums"]
# A code the intercept guessed. With this noise its sums get 2 of the 4 bits right, as coin tosses would.
GUESS = [-1, 1, -1, 1, -1, -1, -1] * len(BITS)

X0 = -4.6
U = 11.0 / len(SENT)
AMP = 0.3                # per unit of chip value
REC_Y, CODE_Y, PROD_Y = 3.0, 1.85, 0.7
SUM_Y = -1.95            # zero line of the chip sums
BAR = 0.13               # per unit of chip value in the sums
NAME_X = X0 - 1.3
TOTAL_Y = -0.45          # the per-bit sums and decisions


def bit_mid(i):
    return X0 + (i + 0.5) * N * U


def chips(values, i):
    return values[i * N:(i + 1) * N]


def noise_label(noi, x):
    """The noise sum, beside the end of its stack."""
    return label(sign_text(sum(noi)), GREY, 20).next_to([x + 0.15, SUM_Y + sum(noi) * BAR, 0], RIGHT, buff=0.06)


def sign_text(v, digits=1):
    return f"{'+' if v >= 0 else '−'}{abs(v):.{digits}f}"


class LessonVideo(LessonScene):
    def construct(self):
        nz = ValueTracker(0)  # noise scale, 0 to 1
        self.title_card("The receiver gets the bits back")

        received = lambda: [s + nz.get_value() * n for s, n in zip(SENT, NOISE)]  # noqa: E731
        rec_name = label("Received", AMBER_C2, 22).move_to([NAME_X, REC_Y, 0])
        rec_row = always_redraw(lambda: chip_wave(received(), X0, U, REC_Y, AMP, AMBER_C2))
        self.caption("The link sends chips: bit × code. Start with no noise.")
        self.play(FadeIn(rec_name), Create(rec_row), run_time=2)

        code_name = label("Code", GREEN_C3, 22).move_to([NAME_X, CODE_Y, 0])
        code_row = chip_wave(CODE, X0, U, CODE_Y, AMP, GREEN_C3)
        self.caption("The friendly receiver knows the code.")
        self.play(FadeIn(code_name), Create(code_row), run_time=1.5)

        # 1. Multiply by the code
        prod_name = label("Received × code", BLUE_C1, 22).move_to([NAME_X, PROD_Y, 0])
        prod_row = always_redraw(lambda: chip_wave([r * c for r, c in zip(received(), CODE)], X0, U, PROD_Y, AMP, BLUE_C1))
        self.caption("It multiplies what it receives by the same code.")
        sweep = Line([X0, PROD_Y - 0.9, 0], [X0, REC_Y + 0.9, 0], color=WHITE, stroke_width=2)
        self.play(FadeIn(prod_name), FadeIn(sweep))
        self.play(Create(prod_row), sweep.animate.set_x(X0 + len(SENT) * U), run_time=3, rate_func=linear)
        self.play(FadeOut(sweep))

        k = 0
        chip_box = Rectangle(width=U, height=REC_Y - PROD_Y + 1.0, stroke_color=WHITE, stroke_width=1.5).move_to(
            [X0 + (k + 0.5) * U, (REC_Y + PROD_Y) / 2, 0])
        times = label(f"{sign_text(SENT[k], 0)} × {sign_text(CODE[k], 0)} = +1", WHITE, 22).next_to(chip_box, RIGHT, buff=0.15).set_y(PROD_Y + 0.7)
        self.caption("A chip times itself is always +1, so the code cancels.")
        self.play(Create(chip_box), FadeIn(times))
        bit_vals = VGroup(*[label(sign_text(b, 0), BLUE_C1, 24).move_to([bit_mid(i), PROD_Y + AMP + 0.3, 0]) for i, b in enumerate(BITS)])
        self.caption("What is left is the bits.")
        self.play(FadeOut(chip_box), FadeOut(times), LaggedStart(*[FadeIn(v) for v in bit_vals], lag_ratio=0.3))

        # 2. Noise
        self.caption("A real signal arrives with noise.")
        self.play(FadeOut(bit_vals))
        self.play(nz.animate.set_value(1), run_time=3)
        for m in (rec_row, prod_row):
            m.clear_updaters()
        self.caption("The bits are harder to read. So the receiver adds up each bit's 7 chips.")

        # 3. Add up one bit: the signal parts, then the noise parts
        sum_name = label("Sum of 7 chips", WHITE, 22).move_to([NAME_X, SUM_Y, 0])
        zero = DashedLine([X0, SUM_Y, 0], [X0 + len(SENT) * U, SUM_Y, 0], color=GREY, stroke_width=1.2, dash_length=0.08).set_opacity(0.6)
        self.play(FadeIn(sum_name), FadeIn(zero))

        def parts(i):
            sig = [BITS[i]] * N
            noi = [n * c for n, c in zip(chips(NOISE, i), chips(CODE, i))]
            x0 = X0 + i * N * U
            return (sig, noi, chip_bars(sig, x0 - 0.2 * U, U, SUM_Y, BAR * 3, BLUE_C1, frac=0.4),
                    chip_bars(noi, x0 + 0.2 * U, U, SUM_Y, BAR * 3, GREY, frac=0.4))

        sig0, noi0, sb0, nb0 = parts(0)
        self.caption("Each chip is now the bit plus some noise. Split them apart.")
        self.play(FadeIn(sb0), FadeIn(nb0))
        self.caption("The bit's 7 chips all point the same way: they add up to 7.")
        sx = bit_mid(0) - 0.5
        self.play(*[Transform(b, t) for b, t in zip(sb0, stack_targets(sb0, sig0, sx, SUM_Y, BAR))], run_time=2.5)
        s0 = label(sign_text(sum(sig0), 0), BLUE_C1, 20).next_to([sx, SUM_Y + sum(sig0) * BAR, 0], UP, buff=0.06)
        self.play(FadeIn(s0))
        self.caption("Noise does not follow the code. Its chips point up and down and mostly cancel.")
        nx = bit_mid(0) + 0.5
        self.play(*[Transform(b, t) for b, t in zip(nb0, stack_targets(nb0, noi0, nx, SUM_Y, BAR))], run_time=2.5)
        n0 = noise_label(noi0, nx)
        self.play(FadeIn(n0))

        self.caption("The same for every bit.")
        labels = [VGroup(s0, n0)]
        stacks = [VGroup(sb0, nb0)]
        rest = [parts(i) for i in range(1, len(BITS))]
        self.play(*[FadeIn(VGroup(p[2], p[3])) for p in rest])
        for i, (sig, noi, sb, nb) in enumerate(rest, start=1):
            stacks.append(VGroup(sb, nb))
        self.play(*[Transform(b, t) for i, (sig, noi, sb, nb) in enumerate(rest, start=1)
                    for b, t in zip(sb, stack_targets(sb, sig, bit_mid(i) - 0.5, SUM_Y, BAR))], run_time=2)
        self.play(*[Transform(b, t) for i, (sig, noi, sb, nb) in enumerate(rest, start=1)
                    for b, t in zip(nb, stack_targets(nb, noi, bit_mid(i) + 0.5, SUM_Y, BAR))], run_time=2)
        for i, (sig, noi, sb, nb) in enumerate(rest, start=1):
            labels.append(VGroup(
                label(sign_text(sum(sig), 0), BLUE_C1, 20).next_to([bit_mid(i) - 0.5, SUM_Y + sum(sig) * BAR, 0], UP if BITS[i] > 0 else DOWN, buff=0.06),
                noise_label(noi, bit_mid(i) + 0.5),
            ))
        self.play(*[FadeIn(l) for l in labels[1:]])

        # 4. The sums decide
        totals = VGroup(*[
            label(f"sum {sign_text(s)}  →  {sign_text(b, 0)}", WHITE, 22).move_to([bit_mid(i), TOTAL_Y, 0])
            for i, (s, b) in enumerate(zip(SUMS, BITS))
        ])
        self.caption("Add the two: the sign of the sum is the bit. All four come back right.")
        self.play(LaggedStart(*[FadeIn(t, shift=UP * 0.1) for t in totals], lag_ratio=0.3))
        self.caption(f"The signal added up to {N}, while the noise stayed small.")

        # 5. Without the code
        guess_row = chip_wave(GUESS, X0, U, CODE_Y, AMP, RED)
        guess_prod = chip_wave([(s + n) * g for s, n, g in zip(SENT, NOISE, GUESS)], X0, U, PROD_Y, AMP, BLUE_C1)
        guess_sums = [sum((s + n) * g for s, n, g in zip(chips(SENT, i), chips(NOISE, i), chips(GUESS, i))) for i in range(len(BITS))]
        guess_bars = VGroup(*[
            Rectangle(width=0.5, height=max(abs(s) * BAR, 1e-3), stroke_width=0, fill_color=RED, fill_opacity=0.8)
            .move_to([bit_mid(i), SUM_Y + s * BAR / 2, 0]) for i, s in enumerate(guess_sums)
        ])
        guess_totals = VGroup(*[
            VGroup(
                label(f"sum {sign_text(s)}  →  {sign_text(1 if s >= 0 else -1, 0)}", WHITE, 22),
                label("right" if (s >= 0) == (b > 0) else "wrong", GREEN_C3 if (s >= 0) == (b > 0) else RED, 20),
            ).arrange(DOWN, buff=0.08).move_to([bit_mid(i), TOTAL_Y - 0.12, 0])
            for i, (s, b) in enumerate(zip(guess_sums, BITS))
        ])
        guess_name = label("Guessed code", RED, 22).move_to([NAME_X, CODE_Y, 0])
        self.caption("A receiver without the code has to guess one.")
        self.play(FadeOut(VGroup(*stacks)), FadeOut(VGroup(*labels)), FadeOut(totals))
        self.play(Transform(code_row, guess_row), Transform(code_name, guess_name))
        self.play(Transform(prod_row, guess_prod), run_time=1.5)
        self.caption("The chips no longer line up, so they do not add up.")
        self.play(FadeIn(guess_bars))
        self.play(LaggedStart(*[FadeIn(t, shift=UP * 0.1) for t in guess_totals], lag_ratio=0.3))
        self.caption("The sums are small and the bits are coin tosses.")
        self.caption("That is the advantage the link has over you, and over any jammer.")

        # 6. Processing gain
        self.clear_caption()
        self.play(*[FadeOut(m) for m in self.mobjects])
        pad = Scratchpad(height=5.0, width=8.0, at=[0, 0.6, 0])
        self.play(*pad.show())
        rows = [  # (text, a note under the line above)
            (f"Signal: {N} chips add up to {N}", False),
            (f"its power grows {N}² = {N * N} times", True),
            (f"Noise: {N} random chips", False),
            (f"powers add, so it grows only {N} times", True),
            (f"The signal gains {N * N} ÷ {N} = {N} times on the noise", False),
        ]
        for i, (t, note) in enumerate(rows):
            self.play(FadeIn(pad.line(t, i, GREY if note else WHITE, 28), shift=DOWN * 0.15))
            self.wait(2.5 if note else 1.8)
        gp = pad.line(f"Processing gain Gp = {N} = chips per bit", 5.2, AMBER_C2, 28)
        self.play(FadeIn(gp, shift=DOWN * 0.15))
        self.play(Create(SurroundingRectangle(gp, color=AMBER_C2, buff=0.12, corner_radius=0.08)))
        self.wait(2)
        self.rule_card(["Gp is the number of chips per bit.", "Only a receiver with the code gets it."])
