'use client';

/**
 * AuthGuard – redirects unauthenticated users to sign in.
 * Uses NextAuth session. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
 * When auth is disabled, no NextAuth hooks are called (SessionProvider is absent).
 */

import { useSession, signIn } from 'next-auth/react';
import { useEffect } from 'react';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

function AuthGuardInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      signIn(undefined, { callbackUrl: window.location.href });
    }
  }, [session, status]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--pinnacle-teal)] mx-auto" />
          <p className="mt-4 text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
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

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  if (AUTH_DISABLED) return <>{children}</>;
  return <AuthGuardInner>{children}</AuthGuardInner>;
}
