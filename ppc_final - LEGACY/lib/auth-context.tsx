'use client';

/**
 * @fileoverview Authentication Context
 * 
 * Provides authentication state management using Supabase Auth.
 * This context handles user login, logout, and session management.
 * 
 * @module lib/auth-context
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Auth context state and methods
 */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Hook to access auth context
 * @throws Error if used outside of AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Auth Provider Component
 * Wraps the application to provide authentication state
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  // Initialize auth state
  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isConfigured]);

  /**
   * Sign in with email and password
   */
  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isConfigured) {
      // Allow bypass when Supabase is not configured (development)
      setUser({ id: 'dev-user', email } as User);
      setSession({ user: { id: 'dev-user', email } } as Session);
      return { success: true };
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return { success: false, error: error.message };
      }

      setSession(data.session);
      setUser(data.user);
      setLoading(false);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }
  }, [isConfigured]);

  /**
   * Sign up with email and password
   */
  const signUp = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isConfigured) {
      return { success: false, error: 'Supabase not configured' };
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return { success: false, error: error.message };
      }

      setSession(data.session);
      setUser(data.user);
      setLoading(false);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }
  }, [isConfigured]);

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    if (!isConfigured) {
      setUser(null);
      setSession(null);
      return;
    }

    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setLoading(false);
  }, [isConfigured]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    session,
    loading,
    error,
    isConfigured,
    signIn,
    signUp,
    signOut,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

