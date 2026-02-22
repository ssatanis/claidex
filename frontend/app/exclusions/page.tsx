import Link from 'next/link';

export default function ExclusionsPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <Link href="/">← Home</Link>
      <h1>Exclusions (LEIE)</h1>
      <p>Search and browse OIG exclusion list.</p>
      <p><em>Connect to backend /providers and /exclusions for live data.</em></p>
    </main>
  );
}
