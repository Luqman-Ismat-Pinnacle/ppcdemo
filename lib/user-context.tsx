'use client';

/**
 * @fileoverview User Context for PPC V3
 * 
 * Provides user authentication state management across the application.
 * Integrates with Supabase Auth for session management.
 * Uses localStorage as fallback for demo mode.
 * 
 * @module lib/user-context
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
  login: (user: UserInfo) => void;
  logout: () => void;
  isLoggedIn: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Default user for demo purposes - matches login page demo user
 */
const DEFAULT_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@pinnaclereliability.com',
  role: 'Project Controls',
  initials: 'DU'
};

/**
 * UserProvider component that wraps the application
 * Provides user state and authentication functions
 * Integrates with Supabase Auth when configured
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize user from Supabase session or localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      
      try {
        if (isSupabaseConfigured()) {
          // Check for existing Supabase session
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.user) {
            const userName = session.user.user_metadata?.full_name || 
                            session.user.email?.split('@')[0] || 
                            'User';
            setUser({
              name: userName,
              email: session.user.email || '',
              role: session.user.user_metadata?.role || 'User',
              initials: getInitials(userName)
            });
          } else {
            // No Supabase session, check localStorage
            loadFromLocalStorage();
          }
          
          // Listen for auth state changes
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (event === 'SIGNED_IN' && session?.user) {
                const userName = session.user.user_metadata?.full_name || 
                                session.user.email?.split('@')[0] || 
                                'User';
                const userInfo = {
                  name: userName,
                  email: session.user.email || '',
                  role: session.user.user_metadata?.role || 'User',
                  initials: getInitials(userName)
                };
                setUser(userInfo);
                saveToLocalStorage(userInfo);
              } else if (event === 'SIGNED_OUT') {
                setUser(null);
                clearLocalStorage();
              }
            }
          );
          
          // Cleanup subscription on unmount
          return () => subscription.unsubscribe();
        } else {
          // No Supabase - use localStorage only
          loadFromLocalStorage();
        }
      } catch (e) {
        console.error('Failed to initialize auth:', e);
        loadFromLocalStorage();
      } finally {
        setIsHydrated(true);
        setIsLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  /**
   * Load user from localStorage
   */
  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem('ppc-user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load user from storage:', e);
    }
  };

  /**
   * Save user to localStorage
   */
  const saveToLocalStorage = (userInfo: UserInfo) => {
    try {
      localStorage.setItem('ppc-user', JSON.stringify(userInfo));
    } catch (e) {
      console.error('Failed to save user to storage:', e);
    }
  };

  /**
   * Clear user from localStorage
   */
  const clearLocalStorage = () => {
    try {
      localStorage.removeItem('ppc-user');
    } catch (e) {
      console.error('Failed to remove user from storage:', e);
    }
  };

  /**
   * Log in a user and persist to localStorage
   */
  const login = (userInfo: UserInfo) => {
    setUser(userInfo);
    saveToLocalStorage(userInfo);
  };

  /**
   * Log out the current user
   */
  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('Failed to sign out from Supabase:', e);
    }
    
    setUser(null);
    clearLocalStorage();
  };

  return (
    <UserContext.Provider value={{ 
      user: isHydrated ? user : null, 
      login, 
      logout, 
      isLoggedIn: isHydrated && !!user,
      isLoading
    }}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access user context
 * @returns User context value with user info and auth functions
 */
export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    // Return a default value if context is not available
    return {
      user: DEFAULT_USER,
      login: () => {},
      logout: () => {},
      isLoggedIn: false,
      isLoading: false
    };
  }
  return context;
}

/**
 * Get user initials from name
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
