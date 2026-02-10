'use client';

import { useUser } from '@auth0/nextjs-auth0/client';

export default function AuthButtons() {
  const { user, isLoading } = useUser();

  if (isLoading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--text-primary)]">{user.name}</span>
        <button
          onClick={() => (window.location.href = '/api/auth/logout')}
          style={{
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--border-color)',
            background: 'transparent', color: '#EF4444',
            fontSize: '0.75rem', cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => (window.location.href = '/api/auth/login')}
      style={{
        padding: '4px 10px', borderRadius: 6,
        border: '1px solid var(--border-color)',
        background: 'transparent', color: 'var(--pinnacle-teal)',
        fontSize: '0.75rem', cursor: 'pointer',
      }}
    >
      Login
    </button>
  );
}
