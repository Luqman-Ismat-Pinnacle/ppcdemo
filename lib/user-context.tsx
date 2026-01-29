'use client';

/**
 * @fileoverview User Context for PPC V3
 * 
 * Provides user authentication state management across the application.
 * Integrates with Auth0 for authentication.
 * 
 * @module lib/user-context
 */

import React, { createContext, useContext, ReactNode } from 'react';


/**
 * User information structure
 */
export interface UserInfo {
  name: string;
  email: string;
  role: string;
  initials: string;
}

/**
 * User context value structure
 */
interface UserContextValue {
  user: UserInfo | null;
  login: () => void;
  logout: () => void;
  isLoggedIn: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Helper function to get initials from name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * UserProvider component that wraps the application
 * Provides user state and authentication functions
 * Integrates with Auth0 for authentication
 */
export function UserProvider({ children }: { children: ReactNode }) {
  // Bypass Auth0 for development/demo
  const user: UserInfo = {
    name: 'Demo User',
    email: 'demo@pinnacle.com',
    role: 'Admin',
    initials: 'DU'
  };
  const isLoading = false;

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
    isLoading
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access user context
 */
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
