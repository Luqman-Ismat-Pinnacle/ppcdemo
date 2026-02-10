'use client';

/**
 * Auth Provider — wraps NextAuth SessionProvider.
 * File kept as Auth0Provider.tsx to minimize import changes in layout.tsx.
 */

import { SessionProvider } from 'next-auth/react';

export default function Auth0Provider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
