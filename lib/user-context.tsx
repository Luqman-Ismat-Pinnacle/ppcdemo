'use client';

/**
 * User Context for PPC V3
 * Integrates with NextAuth for authentication (Microsoft Entra ID).
 * After sign-in, the user's name/email is matched against the employees table
 * to pull their role (done server-side in the JWT callback).
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass and use a demo user.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export interface UserInfo {
  name: string;
  email: string;
  role: string;
  initials: string;
  employeeId?: string;
  department?: string;
  managementLevel?: string;
}

interface UserContextValue {
  user: UserInfo | null;
  login: () => void;
  logout: () => void;
  isLoggedIn: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';

function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const DEMO_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@pinnacle.com',
  role: 'Admin',
  initials: 'DU',
};

/**
 * UserProvider: wraps NextAuth session state.
 * Falls back to demo user when AUTH_DISABLED.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const user: UserInfo | null = AUTH_DISABLED
    ? DEMO_USER
    : session?.user
      ? {
          name: session.user.name || 'User',
          email: session.user.email || '',
          role: (session.user as any).role || 'User',
          initials: getInitials(session.user.name || 'User'),
          employeeId: (session.user as any).employeeId || undefined,
          department: (session.user as any).department || undefined,
          managementLevel: (session.user as any).managementLevel || undefined,
        }
      : null;

  const login = () => {
    if (AUTH_DISABLED) return;
    signIn(undefined, { callbackUrl: window.location.href });
  };

  const logout = () => {
    if (AUTH_DISABLED) return;
    signOut({ callbackUrl: '/' });
  };

  const value: UserContextValue = {
    user: AUTH_DISABLED ? DEMO_USER : user,
    login,
    logout,
    isLoggedIn: AUTH_DISABLED ? true : !!session,
    isLoading: AUTH_DISABLED ? false : status === 'loading',
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
