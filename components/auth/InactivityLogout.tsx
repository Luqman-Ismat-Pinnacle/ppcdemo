'use client';

/**
 * InactivityLogout – signs user out after 1 hour of no activity.
 * Uses NextAuth session. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
 */

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useCallback } from 'react';

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
const INACTIVITY_MS = 60 * 60 * 1000; // 1 hour

export default function InactivityLogout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logout = useCallback(() => {
    signOut({ callbackUrl: '/' });
  }, []);

  const resetTimer = useCallback(() => {
    if (AUTH_DISABLED || !session) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(logout, INACTIVITY_MS);
  }, [session, logout]);

  useEffect(() => {
    if (AUTH_DISABLED || !session) return;

    resetTimer();

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [session, resetTimer]);

  return <>{children}</>;
}
