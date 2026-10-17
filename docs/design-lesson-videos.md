# Design: lesson explainer videos

Short animated videos, made with [Manim](https://www.manim.community/), that teach the moving part of a Link lab
lesson: a process, a sweep, a signal sliding against itself. They sit beside the lesson's figure and text, never in
place of them. The first three are level 1 lessons A1 (bits become chips), C1 (reading the chip rate) and D1
(reading the code length).

## 1. Decisions

D1. **Place in a lesson.** A lesson step may name one video (`video: 'level1-C1'` on `LessonStep`). Practice,
apply and question steps have none. The video shows as a card above the lesson's figure: a header
"Explainer: <lesson title>", the length, and a Hide or Watch button. The first time a lesson opens, the card is open
on the video's title frame (`<id>.jpg`, the poster) and waits for the player to press play; it does not autoplay,
so the player can read first. When the video ends the card collapses, and the browser remembers it as watched
(`localStorage`), so the lesson opens collapsed next time. Watch reopens and plays it. A collapsed card on first
visit was easy to miss, which is why it starts open. The figure stays on screen because the player needs it while
reading the worked steps and answering the check. Videos are not scored and do not gate progress.

D2. **Captions are burned in.** There is no voiceover, so the video must stand alone. Every line the viewer must
read is a caption at the bottom of the frame. The lesson text is unchanged.

D3. **Captions are paced for reading.** Each caption stays up for at least its word count ÷ 2.5 words per second
+ 1 s, and never less than 3 s (`LessonScene.caption` in `videos/common.py`). Scratchpad lines get a pause each.
The first C1 draft, paced by the animation alone, was too fast to read.

D4. **Format.** 720p, 30 fps, H.264 (`-crf 28`), no audio, `+faststart` so playback starts before the file has
loaded. About 1 MB per minute: D1 is 1.2 MB for 74 s, against 5.0 MB at 1080p60 with no visible loss at panel size.
Background `#0b1220`, the instrument background, so the player blends into the panel.

D5. **Storage.** Published videos are `public/videos/<id>.mp4` with their poster `<id>.jpg`, committed with Git
LFS (`.gitattributes`). Vite
serves `public/` unchanged in dev and build, so `npm run build` needs no Manim. Only reviewed videos are
published; draft renders go to a review folder outside git.

D6. **Sources.** Everything needed to rebuild a video is in the repo under `videos/`:

| Path | Content |
|---|---|
| `videos/common.py` | Shared look: colours from `src/styles.css`, `LessonScene` (captions, title, rule card), `Scratchpad`, `bracket` |
| `videos/level<N>_<step>.py` | One scene per lesson step, class `LessonVideo` |
| `videos/data/<id>.ts` | Exports the numbers the scene plots from the engine (the same capture, Welch spectrum or autocorrelation the app draws) to `videos/data/<id>.json` |
| `videos/requirements.txt` | `manim==0.22.0` |
| `videos/README.md` | Setup and commands |
| `scripts/video.ts` | `npm run video`: export data, render, encode, grab the poster, copy to review and optionally to `public/` |

The Python environment (`videos/.venv`), Manim's output (`videos/.media`), exported JSON and review copies
(`tmp/`) are ignored by git.

D7. **Numbers come from the engine.** A curve in a video is the app's own curve for the same link, exported by
`videos/data/<id>.ts`, and labels are computed from that data (chip rate, code length), not typed. If a lesson's
example link changes, re-rendering the video follows it.

D8. **No LaTeX.** Scenes use `Text` only, never `MathTex`, `Tex`, `Brace` or `DecimalNumber`, which need a TeX
install. `bracket()` replaces braces. This keeps setup to ffmpeg, cairo, pango and a Python venv.

## 2. Which lessons get a video

A lesson gets a video when something in it moves: a signal built step by step, a sweep, a delay, a calculation that
reads a number off a plot. Definitions and tables do not. A video runs 1 to 3 minutes.

| Code | Lesson | Video | Status |
|---|---|---|---|
| | L1 A1, Bits become chips | Bits × code = chips, one bit at a time; count the chips | Published |
| | L1 C1, Reading the chip rate | Test wave against one chip gives the nulls; side humps from the chip's edges hold 10% of the power; null-to-null bandwidth ÷ 2 on a scratchpad | Published |
| | L1 D1, Reading the code length | Delayed copy slides along the preamble while the autocorrelation traces; peak spacing × chip rate on a scratchpad | Published |
| V1 | L1 A2, Spreading makes the signal wide and low | Pulse shortens from bit to chip while the spectrum widens and drops at constant area; noise floor; same picture in dB | Published |
| V2 | L1 A3, The receiver gets the bits back | Received × code cancels the code; each bit's 7 chips stack to 7 while noise chips cancel; a receiver with a guessed code; Gp on a scratchpad | Published |
| V3 | L2 B1, What the decoder sees | Spectra before and after despreading: the signal collapses into a peak and gains Gp, the jammer stays spread; the bit filter keeps 1/Gp of it; Eb/J0 = Gp − J/S | Published |
| V4 | L3 B1, A quarter of the band | The receiver's multiply by the code spreads the partial-band jammer back over the whole band (numerical convolution, matching the engine's sinc² weighting) | Published |
| V5 | L3 D1, Long pulses or short ones | Chip sums with pulses: one-chip pulses averaged over the bit, one-bit pulses break bits; 0.1 × 0.22 on a scratchpad | Published |
| V6 | L4 B1, The code turns the tone into noise | A tone × a long code; short code against long code; tone × long code in time; the spike smears into a sinc² at the noise level | In review |
| V7 | L4 D1, Peaks | Eight tones as phasors: in phase they peak at 8× the average, random and Newman phases lower (the engine's phases); a front-end limit squashing the peaks | In review |
| V8 | L3 A1, Three ways to spend the same power | One block of power reshaped: wide and low, narrow and tall, short and tall | Tier 2 |
| V9 | L3 C1, The same power in bursts | Bit timeline with pulses; hit bits break, the rest are clean; 0.1 × 0.081 on a scratchpad | Tier 2 |
| V10 | L3 E1, How short should the pulses be | Duty cycle sweep: the overall BER rises to a peak and falls | Tier 2 |
| V11 | L4 C1, Keep off the carrier | A tone sliding across the short code's line spectrum while the BER follows | Tier 2 |
| V12 | L5 A1, The majority vote | Three copies, the two-or-more-wrong cases, 3p² on a scratchpad | Tier 2 |
| V13 | L5 B1, Every copy of some bits | Copy timeline: pulses on one copy of every bit against all copies of one bit | Tier 2 |
| V14 | L5 C1, Blinding the receiver | Pulse plus recovery time as a shaded blind stretch; blind copies are coin tosses | Tier 2 |

Not planned: L1 B1, L1 E1, L1 F1, L2 A1, L2 C1, L2 D1, L2 E1, L4 A1. They are side-by-side comparisons, a table,
reading a plot, or already interactive (the BER meter, the scene); a video would repeat the figure.

Three building blocks in `videos/common.py` cover most of the list: chip rows and chip sums (V2, V5, V13), a
plot frame for spectra that reshape (V1, V3, V4, V6), and a pulse timeline (V9, V13, V14). Build order: V1 and V2
(finishes level 1 unit A), V3, V4 and V5, V6 and V7, then tier 2.

## 3. Making a video

1. Write the scene and, if it plots app data, its exporter (`videos/README.md`, "Adding a video").
2. `npm run video -- <id>` renders a review copy into `tmp/videos/` (ignored by git).
3. Review it in VS Code, which plays videos from the container. Re-render as needed; review copies never touch git.
4. `npm run video -- <id> --publish`, set `video: '<id>'` on the lesson step, commit the scene, exporter, video and
   lesson change together. `src/ui/lab/VideoCard.test.tsx` fails if a lesson names a video with no file.

Renders run at low priority with two encoder threads. Render one video at a time.

## 4. Open questions

Q1. Voiceover: narration would let captions shrink to key terms. It needs a voice, a script per video, and audio
in the files.
Q2. WebVTT captions instead of burned-in ones: the player could toggle them and screen readers could read them.
`LessonScene.caption` knows each caption's start and end, so it could write the `.vtt` while rendering.
Q3. Should watching a video be recorded in progress (watched or not), or stay untracked as now?
