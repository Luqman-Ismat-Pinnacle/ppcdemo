'use client';

/**
 * Auth Provider — wraps NextAuth SessionProvider ONLY when auth is active.
 * When NEXT_PUBLIC_AUTH_DISABLED=true, skips SessionProvider entirely
 * to avoid server errors when NextAuth is not configured.
 */

import { SessionProvider } from 'next-auth/react';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

export default function Auth0Provider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Skip SessionProvider when auth is disabled — prevents
  // "Server error" when NEXTAUTH_SECRET is not configured
  if (AUTH_DISABLED) {
    return <>{children}</>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
