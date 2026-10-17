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

| Lesson | Video | Status |
|---|---|---|
| Level 1 A1, Bits become chips | Bits × code = chips, one bit at a time; count the chips | First version |
| Level 1 C1, Reading the chip rate | Test wave against one chip gives the nulls; side humps from the chip's edges hold 10% of the power; null-to-null bandwidth ÷ 2 on a scratchpad | First version |
| Level 1 D1, Reading the code length | Delayed copy slides along the preamble while the autocorrelation traces; peak spacing × chip rate on a scratchpad | First version |
| Level 1 A2, Spreading makes the signal wide and low | Candidate | |
| Level 1 A3, The receiver gets the bits back | Candidate | |
| Level 2, Jamming to signal ratio | Candidate | |
| Level 3, Three ways to spend the same power | Candidate | |

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
