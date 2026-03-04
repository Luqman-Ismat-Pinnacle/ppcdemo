'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect } from 'react';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

function AuthLoadingScreen({ message }: { message: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48,
          border: '3px solid rgba(16,185,129,0.3)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem',
        }} />
        <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>{message}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          Pinnacle Project Management
        </p>
      </div>
    </div>
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();

  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (isLoading) return;
    if (!user) {
      window.location.href = '/api/auth/login';
    }
  }, [user, isLoading]);

  if (AUTH_DISABLED) return <>{children}</>;

  if (isLoading) {
    return (
      <>
        <div className="ambient-bg" aria-hidden>
          <span className="ambient-image" />
          <span className="ambient-blob ambient-blob-a" />
          <span className="ambient-blob ambient-blob-b" />
          <span className="ambient-blob ambient-blob-c" />
          <span className="ambient-vignette" />
          <span className="ambient-mask" />
          <span className="ambient-grid" />
        </div>
        <AuthLoadingScreen message="Loading..." />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <div className="ambient-bg" aria-hidden>
          <span className="ambient-image" />
          <span className="ambient-blob ambient-blob-a" />
          <span className="ambient-blob ambient-blob-b" />
          <span className="ambient-blob ambient-blob-c" />
          <span className="ambient-vignette" />
          <span className="ambient-mask" />
          <span className="ambient-grid" />
        </div>
        <AuthLoadingScreen message="Redirecting to login..." />
      </>
    );
  }

  return <>{children}</>;
}
