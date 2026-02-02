'use client';

/**
 * AuthGuard – redirects unauthenticated users to Auth0 login.
 * Bypass: set NEXT_PUBLIC_AUTH_DISABLED=true to skip (render children only).
 */

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect } from 'react';

// Bypass when NEXT_PUBLIC_AUTH_DISABLED !== 'false' (default: bypass so app works without login)
const AUTH_BYPASS = typeof process === 'undefined' || process.env.NEXT_PUBLIC_AUTH_DISABLED !== 'false';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();

  if (AUTH_BYPASS) return <>{children}</>;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      window.location.href = '/api/auth/login';
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--pinnacle-teal)] mx-auto" />
          <p className="mt-4 text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--pinnacle-teal)] mx-auto" />
          <p className="mt-4 text-[var(--text-muted)]">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
