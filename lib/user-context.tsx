'use client';

/**
 * User Context for PPC V3
 * Integrates with Auth0 for authentication (enabled by default).
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass Auth0 and use a demo user.
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

// Auth0 is enabled by default. Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass.
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

function mapAuth0User(auth0User: Record<string, any> | null | undefined): UserInfo | null {
  if (!auth0User) return null;
  const name = auth0User.name ?? auth0User.email ?? 'User';
  // Try extracting role from Auth0 custom claims, app_metadata, or user_metadata
  const role =
    auth0User['https://ppc.pinnacle.com/role'] ||
    auth0User['https://ppc.pinnacle.com/roles']?.[0] ||
    auth0User.app_metadata?.role ||
    auth0User.user_metadata?.role ||
    auth0User.role ||
    (auth0User['https://ppc.pinnacle.com/job_title']) ||
    auth0User.jobTitle ||
    'User';
  return {
    name,
    email: auth0User.email ?? '',
    role,
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
 * UserProvider: wraps Auth0 user state. Falls back to demo user when AUTH_DISABLED.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const { user: auth0User, isLoading } = useAuth0User();
  const user = AUTH_DISABLED ? DEMO_USER : mapAuth0User(auth0User);

  const login = () => {
    if (AUTH_DISABLED) return;
    window.location.href = '/api/auth/login';
  };

  const logout = () => {
    if (AUTH_DISABLED) return;
    window.location.href = '/api/auth/logout';
  };

  const value: UserContextValue = {
    user: AUTH_DISABLED ? DEMO_USER : user,
    login,
    logout,
    isLoggedIn: AUTH_DISABLED ? true : !!user,
    isLoading: AUTH_DISABLED ? false : isLoading,
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
