'use client';

/**
 * User Context for PPC V3
 * Integrates with Auth0 when enabled; bypass uses demo user.
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to skip Auth0 login.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useUser as useAuth0User } from '@auth0/nextjs-auth0/client';

export interface UserInfo {
  name: string;
  email: string;
  role: string;
  initials: string;
}

interface UserContextValue {
  user: UserInfo | null;
  login: () => void;
  logout: () => void;
  isLoggedIn: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

// Bypass Auth0 when NEXT_PUBLIC_AUTH_DISABLED is true, or when unset (default bypass for now)
const AUTH_BYPASS = typeof process === 'undefined' || process.env.NEXT_PUBLIC_AUTH_DISABLED !== 'false';

function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function mapAuth0User(auth0User: { name?: string | null; email?: string | null } | null | undefined): UserInfo | null {
  if (!auth0User) return null;
  const name = auth0User.name ?? auth0User.email ?? 'User';
  return {
    name,
    email: auth0User.email ?? '',
    role: 'User',
    initials: getInitials(name),
  };
}

const DEMO_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@pinnacle.com',
  role: 'Admin',
  initials: 'DU',
};

/**
 * UserProvider: when AUTH_BYPASS (NEXT_PUBLIC_AUTH_DISABLED=true), uses demo user; otherwise Auth0.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const { user: auth0User, isLoading } = useAuth0User();
  const user = AUTH_BYPASS ? DEMO_USER : mapAuth0User(auth0User);

  const login = () => {
    if (AUTH_BYPASS) return;
    window.location.href = '/api/auth/login';
  };

  const logout = () => {
    if (AUTH_BYPASS) return;
    window.location.href = '/api/auth/logout';
  };

  const value: UserContextValue = {
    user: AUTH_BYPASS ? DEMO_USER : user,
    login,
    logout,
    isLoggedIn: AUTH_BYPASS ? true : !!user,
    isLoading: AUTH_BYPASS ? false : isLoading,
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
