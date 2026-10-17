export function LabChapter({ level }: { level?: number }) {
  return (
    <main className="lab-placeholder">
      <h1>Link lab</h1>
      {level !== undefined && <p>Level {level}</p>}
      <p>Levels arrive with LL-10. See docs/design-link-lab.md.</p>
    </main>
  );
}
