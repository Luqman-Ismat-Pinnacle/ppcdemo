'use client';

/**
 * User Context for PPC V3
 * Integrates with Auth0 for authentication.
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

/**
 * Adapter that uses Auth0 and provides our UserContext.
 * Must be a child of Auth0Provider (UserProvider from @auth0/nextjs-auth0).
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const { user: auth0User, isLoading } = useAuth0User();
  const user = mapAuth0User(auth0User);

  const login = () => {
    window.location.href = '/api/auth/login';
  };

  const logout = () => {
    window.location.href = '/api/auth/logout';
  };

  const value: UserContextValue = {
    user,
    login,
    logout,
    isLoggedIn: !!user,
    isLoading,
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
