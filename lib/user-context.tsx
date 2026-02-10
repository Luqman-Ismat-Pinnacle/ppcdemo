'use client';

/**
 * User Context for PPC V3
 * Integrates with NextAuth for authentication (Microsoft Entra ID).
 * After sign-in, the user's name/email is matched against the employees table
 * to pull their role (done server-side in the JWT callback).
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass and use a demo user.
 *
 * When auth is disabled, NextAuth hooks are NOT called (no SessionProvider).
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
 * Authenticated UserProvider: uses NextAuth session.
 */
function AuthenticatedUserProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const user: UserInfo | null = session?.user
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

  const login = () => signIn(undefined, { callbackUrl: window.location.href });
  const logout = () => signOut({ callbackUrl: '/' });

  const value: UserContextValue = {
    user,
    login,
    logout,
    isLoggedIn: !!session,
    isLoading: status === 'loading',
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * Demo UserProvider: no auth hooks, uses static demo user.
 */
function DemoUserProvider({ children }: { children: ReactNode }) {
  const value: UserContextValue = {
    user: DEMO_USER,
    login: () => {},
    logout: () => {},
    isLoggedIn: true,
    isLoading: false,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * UserProvider: delegates to authenticated or demo provider based on config.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  if (AUTH_DISABLED) return <DemoUserProvider>{children}</DemoUserProvider>;
  return <AuthenticatedUserProvider>{children}</AuthenticatedUserProvider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
