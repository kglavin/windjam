// Renders lesson explainer videos (docs/design-lesson-videos.md).
//
//   npm run video -- level1-C1              review copy in tmp/videos/ (or $VIDEO_REVIEW_DIR)
//   npm run video -- level1-C1 --publish    also writes public/videos/level1-C1.mp4 (Git LFS)
//   npm run video -- --all [--publish]      every videos/level*_*.py
//
// Steps: export the scene's data from the engine (videos/data/<id>.ts, when there is one), render the Manim scene at
// 720p30, then re-encode small (H.264, no audio, playable before fully loaded). Manim comes from videos/.venv
// (see videos/README.md) or $MANIM.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const VIDEOS = join(ROOT, 'videos');
const MEDIA = join(VIDEOS, '.media');
const REVIEW = resolve(ROOT, process.env.VIDEO_REVIEW_DIR ?? 'tmp/videos');
const PUBLIC = join(ROOT, 'public', 'videos');
const MANIM = process.env.MANIM ?? join(VIDEOS, '.venv', 'bin', 'manim');

const sceneFile = (id: string) => `${id.toLowerCase().replace('-', '_')}.py`;
const idOf = (file: string) => file.replace(/\.py$/, '').replace('_', '-').replace(/-(\w+)$/, (_, s: string) => `-${s.toUpperCase()}`);

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status ?? r.signal})`);
}

function render(id: string, publish: boolean) {
  const file = sceneFile(id);
  if (!existsSync(join(VIDEOS, file))) throw new Error(`no scene videos/${file} for ${id}`);
  const data = join(VIDEOS, 'data', `${id}.ts`);
  if (existsSync(data)) run('npx', ['tsx', data, join(VIDEOS, 'data', `${id}.json`)]);

  // Low priority and two encoder threads, so a render does not starve the rest of the machine.
  run('nice', ['-n', '10', MANIM, '-qm', '--disable_caching', '--progress_bar', 'none', '--media_dir', MEDIA, join(VIDEOS, file), 'LessonVideo']);
  const raw = join(MEDIA, 'videos', file.replace(/\.py$/, ''), '720p30', 'LessonVideo.mp4');

  mkdirSync(REVIEW, { recursive: true });
  const out = join(REVIEW, `${id}.mp4`);
  run('nice', ['-n', '10', 'ffmpeg', '-v', 'error', '-y', '-threads', '2', '-i', raw, '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  // Poster: the title card, fully written at about 1.6 s (LessonScene.title_card).
  const poster = join(REVIEW, `${id}.jpg`);
  run('ffmpeg', ['-v', 'error', '-y', '-ss', '1.6', '-i', out, '-frames:v', '1', '-q:v', '4', poster]);
  console.log(`review copy: ${out}`);
  if (publish) publishFiles(id);
}

function publishFiles(id: string) {
  mkdirSync(PUBLIC, { recursive: true });
  for (const ext of ['mp4', 'jpg']) copyFileSync(join(REVIEW, `${id}.${ext}`), join(PUBLIC, `${id}.${ext}`));
  console.log(`published: public/videos/${id}.mp4 and .jpg`);
}

const args = process.argv.slice(2);
const publish = args.includes('--publish');
const ids = args.includes('--all')
  ? readdirSync(VIDEOS).filter((f) => /^level\d+_\w+\.py$/.test(f)).sort().map(idOf)
  : args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('usage: npm run video -- <id>... | --all  [--publish]   (id like level1-C1)');
  process.exit(1);
}
for (const id of ids) render(id, publish);
