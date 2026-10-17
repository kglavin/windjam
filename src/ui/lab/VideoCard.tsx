import { useRef, useState } from 'react';

export const videoSrc = (id: string) => `/videos/${id}.mp4`;
export const posterSrc = (id: string) => `/videos/${id}.jpg`;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Watched videos, remembered in this browser only, so a lesson the player comes back to starts collapsed.
const KEY = 'windjam.videosWatched';
function watchedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function markWatched(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...watchedSet().add(id)]));
  } catch {
    // storage blocked: the card simply opens again next time
  }
}

// A lesson's explainer video. Open on the title frame the first time (not playing), collapsed once it has played
// to the end. Not scored.
export function VideoCard({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(() => !watchedSet().has(id));
  const [length, setLength] = useState<number | null>(null);
  const ref = useRef<HTMLVideoElement>(null);

  const toggle = () => {
    const v = ref.current;
    if (open) v?.pause();
    else void v?.play().catch(() => {});
    setOpen(!open);
  };

  return (
    <section className="inst-panel video-card">
      <header className="inst-head">
        <h3>Explainer: {title}</h3>
        {length !== null && <span>{clock(length)}</span>}
        <button type="button" className="video-toggle" onClick={toggle}>{open ? 'Hide' : 'Watch'}</button>
      </header>
      <video
        ref={ref}
        className="video-player"
        src={videoSrc(id)}
        poster={posterSrc(id)}
        preload="metadata"
        controls
        playsInline
        hidden={!open}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
        onEnded={() => {
          markWatched(id);
          setOpen(false);
        }}
      />
    </section>
  );
}
