'use client';

/**
 * @fileoverview Theme Provider Component for PPC V3.
 * 
 * Manages application theme state (dark/light mode) and provides
 * theme context to all child components. Persists theme preference
 * to localStorage for persistence across sessions.
 * 
 * Features:
 * - Dark/light mode toggle
 * - localStorage persistence
 * - Initial server-render handling
 * - CSS custom properties via data-theme attribute
 * 
 * @module components/layout/ThemeProvider
 * 
 * @example
 * ```tsx
 * // In app/layout.tsx:
 * <ThemeProvider defaultTheme="dark">
 *   <App />
 * </ThemeProvider>
 * 
 * // In any component:
 * const { theme, toggleTheme } = useTheme();
 * ```
 */

import React, { useEffect, useState, ReactNode } from 'react';
import { ThemeContext, Theme } from '@/lib/theme-context';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme from localStorage or use default
    const savedTheme = localStorage.getItem('ppc-theme') as Theme | null;
    if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
      setThemeState(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('ppc-theme', theme);
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export { useTheme } from '@/lib/theme-context';
