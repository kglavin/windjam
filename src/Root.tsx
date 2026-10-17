import { useEffect, useState } from 'react';
import { App } from './App';
import { CHAPTERS, type Chapter, chapterFromSearch, searchFor } from './ui/chapters/chapters';
import { Home } from './ui/chapters/Home';
import { LabChapter } from './ui/lab/LabChapter';

export function Root() {
  const [initial] = useState(() => chapterFromSearch(window.location.search));
  const [chapter, setChapter] = useState<Chapter>(initial.chapter);
  const [level] = useState<number | undefined>(initial.level);
  // App and the lab mount on first entry and stay mounted so a chapter resumes where it was left.
  const [visited, setVisited] = useState<Set<Chapter>>(() => new Set([initial.chapter]));
  const [lastApp, setLastApp] = useState<'sandbox' | 'missions'>(initial.chapter === 'missions' ? 'missions' : 'sandbox');

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + searchFor(window.location.search, chapter, chapter === 'lab' ? level : undefined));
  }, [chapter, level]);

  const go = (c: Chapter) => {
    setChapter(c);
    setVisited((v) => (v.has(c) ? v : new Set(v).add(c)));
    if (c === 'sandbox' || c === 'missions') setLastApp(c);
  };
  const appChapter = chapter === 'sandbox' || chapter === 'missions' ? chapter : lastApp;
  const appMounted = visited.has('sandbox') || visited.has('missions');
  const title = CHAPTERS.find((c) => c.id === chapter)?.title;

  return (
    <div className="root-col">
      {chapter !== 'home' && (
        <div className="topbar">
          <span>Windjam · {title}</span>
          <button onClick={() => go('home')}>Chapters</button>
        </div>
      )}
      <div className="chapter-wrap" hidden={chapter !== 'home'}>
        {chapter === 'home' && <Home onEnter={go} />}
      </div>
      {appMounted && (
        <div className="chapter-wrap" hidden={chapter !== 'sandbox' && chapter !== 'missions'}>
          <App chapter={appChapter} onChapter={go} />
        </div>
      )}
      {visited.has('lab') && (
        <div className="chapter-wrap" hidden={chapter !== 'lab'}>
          <LabChapter level={level} />
        </div>
      )}
    </div>
  );
}
