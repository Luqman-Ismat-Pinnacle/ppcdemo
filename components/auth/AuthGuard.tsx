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
    return <>{children}</>;
  }

  if (!user) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
