'use client';

/**
 * InactivityLogout – logs user out after 1 hour of no activity.
 * Auth0 is enabled by default. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
 */

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useRef, useCallback } from 'react';

// Auth0 is enabled by default. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
const INACTIVITY_MS = 60 * 60 * 1000; // 1 hour

export default function InactivityLogout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logout = useCallback(() => {
    window.location.href = '/api/auth/logout';
  }, []);

  const resetTimer = useCallback(() => {
    if (AUTH_DISABLED || !user) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(logout, INACTIVITY_MS);
  }, [user, logout]);

  useEffect(() => {
    if (AUTH_DISABLED || !user) return;

    resetTimer();

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [user, resetTimer]);

  return <>{children}</>;
}
