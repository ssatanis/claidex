import Link from 'next/link';

type Props = { params: Promise<{ id: string }> };

export default async function EntityPage({ params }: Props) {
  const { id } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  let entity: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${apiBase}/entities/${id}`, { cache: 'no-store' });
    if (res.ok) entity = await res.json();
  } catch {
    // ignore
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <Link href="/">← Home</Link>
      <h1>Entity: {id}</h1>
      {entity ? (
        <pre style={{ background: '#f0f0f0', padding: '1rem', overflow: 'auto' }}>
          {JSON.stringify(entity, null, 2)}
        </pre>
      ) : (
        <p>Entity not found or API unavailable.</p>
      )}
    </main>
  );
}
