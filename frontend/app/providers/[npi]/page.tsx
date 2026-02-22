import Link from 'next/link';

type Props = { params: Promise<{ npi: string }> };

export default async function ProviderPage({ params }: Props) {
  const { npi } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  let provider: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${apiBase}/providers/${npi}`, { cache: 'no-store' });
    if (res.ok) provider = await res.json();
  } catch {
    // ignore
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <Link href="/">← Home</Link>
      <h1>Provider: {npi}</h1>
      {provider ? (
        <pre style={{ background: '#f0f0f0', padding: '1rem', overflow: 'auto' }}>
          {JSON.stringify(provider, null, 2)}
        </pre>
      ) : (
        <p>Provider not found or API unavailable.</p>
      )}
    </main>
  );
}
