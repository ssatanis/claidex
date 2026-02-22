import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1>Claidex</h1>
      <p>Healthcare provider and corporate entity lookup.</p>
      <nav style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link href="/providers">Providers (NPI)</Link>
        <Link href="/entities">Entities</Link>
        <Link href="/exclusions">Exclusions (LEIE)</Link>
      </nav>
      <section style={{ marginTop: '2rem' }}>
        <label htmlFor="search">Search by NPI or name: </label>
        <input id="search" type="search" placeholder="NPI or name..." style={{ padding: '0.5rem', minWidth: 200 }} />
        <button type="button" style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem' }}>
          Search
        </button>
      </section>
    </main>
  );
}
