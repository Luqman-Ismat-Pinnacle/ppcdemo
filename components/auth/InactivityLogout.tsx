'use client';

/**
 * InactivityLogout – logs user out after 1 hour of no activity.
 * Bypass: set NEXT_PUBLIC_AUTH_DISABLED=true to skip (render children only).
 */

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useRef, useCallback } from 'react';

const AUTH_BYPASS = typeof process === 'undefined' || process.env.NEXT_PUBLIC_AUTH_DISABLED !== 'false';
const INACTIVITY_MS = 60 * 60 * 1000; // 1 hour

export default function InactivityLogout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  if (AUTH_BYPASS) return <>{children}</>;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logout = useCallback(() => {
    window.location.href = '/api/auth/logout';
  }, []);

  const resetTimer = useCallback(() => {
    if (!user) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(logout, INACTIVITY_MS);
  }, [user, logout]);

  useEffect(() => {
    if (!user) return;

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
