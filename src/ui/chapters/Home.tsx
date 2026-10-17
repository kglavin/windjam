import { CHAPTERS, type Chapter } from './chapters';

export function Home({ onEnter }: { onEnter: (c: Exclude<Chapter, 'home'>) => void }) {
  return (
    <main className="home">
      <h1>Windjam</h1>
      <p className="home-sub">Communications electronic warfare, from the map down to the signal.</p>
      <div className="home-cards">
        {CHAPTERS.map((c) => (
          <section key={c.id} className="home-card">
            <h2>{c.title}</h2>
            <p>{c.blurb}</p>
            <button onClick={() => onEnter(c.id)}>Enter</button>
          </section>
        ))}
      </div>
    </main>
  );
}
