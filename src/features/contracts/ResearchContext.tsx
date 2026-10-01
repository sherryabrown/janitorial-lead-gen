export function ResearchContext({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <section aria-label="Research context" className="source-summary">
      <h3>Research context</h3>
      {notes.map((note) => <p key={note}>{note}</p>)}
    </section>
  );
}
