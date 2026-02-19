'use client';

/**
 * AuthGuard – redirects unauthenticated users to Auth0 login.
 * Auth0 is enabled by default. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
 */

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect } from 'react';

// Auth0 is enabled by default. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();

  // Hooks must be called unconditionally — redirect effect runs only when auth is active
  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (isLoading) return;
    if (!user) {
      window.location.href = '/api/auth/login';
    }
  }, [user, isLoading]);

  // When auth is disabled, render children immediately
  if (AUTH_DISABLED) return <>{children}</>;

  if (isLoading) {
    return <>{children}</>;
  }

  if (!user) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
