import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div className="glass" style={{ maxWidth: 560, width: '100%', padding: '1.25rem' }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>Page not found</h1>
        <p className="page-subtitle" style={{ marginBottom: 14 }}>
          The page you requested does not exist in this view.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/pca" className="btn">Go to PCA</Link>
          <Link href="/pcl" className="btn">Go to PCL</Link>
        </div>
      </div>
    </main>
  );
}
