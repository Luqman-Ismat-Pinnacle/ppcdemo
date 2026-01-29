'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { Button } from '@/components/ui';

export default function AuthButtons() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <Button variant="secondary" size="sm" loading>
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name || 'User'}
              className="w-8 h-8 rounded-full border-2 border-[var(--pinnacle-teal)]"
            />
          )}
          <span className="text-sm text-[var(--text-primary)]">
            {user.name}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (window.location.href = '/api/auth/logout')}
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
      onClick={() => (window.location.href = '/api/auth/login')}
    >
      Login
    </Button>
  );
}
