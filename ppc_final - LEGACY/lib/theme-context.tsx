'use client';

/**
 * @fileoverview Theme Context for PPC V3 Application.
 * 
 * Provides theme state (dark/light mode) and controls for the application.
 * Used by the ThemeProvider component to manage theme switching.
 * 
 * @module lib/theme-context
 * 
 * @example
 * ```tsx
 * import { useTheme } from '@/lib/theme-context';
 * 
 * function ThemeToggle() {
 *   const { theme, toggleTheme } = useTheme();
 *   return (
 *     <button onClick={toggleTheme}>
 *       Current: {theme}
 *     </button>
 *   );
 * }
 * ```
 */

import { createContext, useContext } from 'react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Available theme options.
 * - 'dark': Dark mode with dark backgrounds and light text
 * - 'light': Light mode with light backgrounds and dark text
 * 
 * @typedef {'dark' | 'light'} Theme
 */
export type Theme = 'dark' | 'light';

/**
 * Shape of the Theme Context.
 * Provides current theme state and methods to change it.
 * 
 * @interface ThemeContextType
 * @property {Theme} theme - Current active theme
 * @property {Function} toggleTheme - Toggle between dark and light themes
 * @property {Function} setTheme - Explicitly set a specific theme
 */
export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/**
 * React Context for theme management.
 * Default value assumes dark theme with no-op handlers.
 * These defaults are overridden by ThemeProvider.
 */
export const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access theme context.
 * Provides current theme and methods to change it.
 * 
 * @returns {ThemeContextType} Theme state and controls
 * 
 * @example
 * ```tsx
 * const { theme, setTheme } = useTheme();
 * setTheme('light'); // Switch to light mode
 * ```
 */
export function useTheme() {
  return useContext(ThemeContext);
}
