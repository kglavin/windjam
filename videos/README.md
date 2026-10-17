# Lesson videos

Manim scenes for the Link lab's explainer videos. The design is in `docs/design-lesson-videos.md`.

| File | What it is |
|---|---|
| `common.py` | The shared look: the app's colours, captions held long enough to read, the scratchpad panel |
| `level<N>_<step>.py` | One scene per lesson step, class `LessonVideo`, for example `level1_c1.py` for lesson C1 of level 1 |
| `data/<id>.ts` | Exports the scene's numbers from the engine to `data/<id>.json`, so curves match the app |

## Setup (once per machine)

System packages (Debian/Ubuntu):

```sh
sudo apt-get install -y ffmpeg libcairo2-dev libpango1.0-dev pkg-config git-lfs
git lfs install --local
```

Python 3.12 environment in `videos/.venv` (ignored by git), using [uv](https://docs.astral.sh/uv/):

```sh
uv venv --python 3.12 videos/.venv
uv pip install --python videos/.venv/bin/python -r videos/requirements.txt
```

No LaTeX is needed. The scenes use plain `Text`, never `MathTex`, `Tex`, `Brace` or `DecimalNumber`.

## Render

```sh
npm run video -- level1-C1              # review copy: tmp/videos/level1-C1.mp4
npm run video -- level1-C1 --publish    # also public/videos/level1-C1.mp4 (Git LFS)
npm run video -- --all                  # every scene
```

Open the review copy in VS Code to watch it. `VIDEO_REVIEW_DIR` moves the review copies elsewhere.

Publish only a video that has been reviewed, then commit it with its scene. Draft renders stay out of git.

## Adding a video

1. Write `videos/level<N>_<step>.py` with a `LessonVideo(LessonScene)` class. Use `self.caption()` for every line
   of text the viewer must read, and finish with `self.rule_card([...])` when the lesson has a rule.
2. If it plots anything the app computes, add `videos/data/level<N>-<STEP>.ts` and read it with `load_data()`.
3. Render, review, publish.
4. Set `video: 'level<N>-<STEP>'` on the lesson step. A test checks the file exists in `public/videos/`.
