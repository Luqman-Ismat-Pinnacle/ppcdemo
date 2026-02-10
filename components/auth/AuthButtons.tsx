'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui';

export default function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <Button variant="secondary" size="sm" loading>
        Loading...
      </Button>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {session.user.image && (
            <img
              src={session.user.image}
              alt={session.user.name || 'User'}
              className="w-8 h-8 rounded-full border-2 border-[var(--pinnacle-teal)]"
            />
          )}
          <span className="text-sm text-[var(--text-primary)]">
            {session.user.name}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          Logout
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() => signIn()}
    >
      Login
    </Button>
  );
}
