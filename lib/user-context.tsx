'use client';

/**
 * User Context for PPC V3
 *
 * Auth0 handles authentication. After login, we match the user's email
 * against the employees table to pull their role, department, etc.
 * Shows a "Fetching Profile" screen while the employee lookup happens.
 *
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass Auth0 and use a demo user.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser as useAuth0User } from '@auth0/nextjs-auth0/client';
import { hasGlobalViewAccess, resolveRoleForIdentity } from '@/lib/access-control';

export interface UserInfo {
  name: string;
  email: string;
  role: string;
  initials: string;
  canViewAll: boolean;
  employeeId?: string | null;
  department?: string;
  managementLevel?: string;
  jobTitle?: string;
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
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
}

const DEMO_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@pinnacle.com',
  role: 'Admin',
  initials: 'DU',
  canViewAll: true,
};

/**
 * Fetching Profile screen — shown after Auth0 login while matching employee
 */
function FetchingProfile() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'transparent',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48,
          border: '3px solid rgba(63,63,70,0.5)',
          borderTopColor: '#40E0D0',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1.25rem',
        }} />
        <p style={{
          color: '#40E0D0', fontSize: '1rem', fontWeight: 600,
          margin: '0 0 0.5rem',
        }}>
          Fetching Profile
        </p>
        <p style={{ color: '#a1a1aa', fontSize: '0.75rem', margin: 0 }}>
          Matching your account to the employee directory...
        </p>
      </div>
    </div>
  );
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { user: auth0User, isLoading: auth0Loading } = useAuth0User();
  const [enrichedUser, setEnrichedUser] = useState<UserInfo | null>(null);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [fetched, setFetched] = useState(false);

  // After Auth0 gives us a user, match against employees table (email-only)
  useEffect(() => {
    if (AUTH_DISABLED || !auth0User || fetched) return;

    const matchEmployee = async () => {
      const email = (auth0User.email || '').trim();
      if (!email) {
        setEnrichedUser({
          name: auth0User.name || 'User',
          email: '',
          role: resolveRoleForIdentity({ email: auth0User.email || '', fallbackRole: 'User' }),
          initials: getInitials(auth0User.name || 'User'),
          canViewAll: hasGlobalViewAccess({
            email: auth0User.email || '',
            role: resolveRoleForIdentity({ email: auth0User.email || '', fallbackRole: 'User' }),
          }),
        });
        setFetched(true);
        return;
      }
      setFetchingProfile(true);
      try {
        const res = await fetch('/api/auth/employee-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (data.success && data.employee) {
          const resolvedRole = resolveRoleForIdentity({
            email: data.employee.email || auth0User.email || '',
            fallbackRole: data.employee.role,
          });
          setEnrichedUser({
            name: data.employee.name || auth0User.name || 'User',
            email: data.employee.email || auth0User.email || '',
            role: resolvedRole,
            initials: getInitials(data.employee.name || auth0User.name || 'User'),
            canViewAll: Boolean(data.employee.canViewAll) || hasGlobalViewAccess({
              email: data.employee.email || auth0User.email || '',
              role: resolvedRole,
            }),
            employeeId: data.employee.employeeId,
            department: data.employee.department,
            managementLevel: data.employee.managementLevel,
            jobTitle: data.employee.jobTitle,
          });
        } else {
          // No match — use Auth0 info with default role
          const resolvedRole = resolveRoleForIdentity({
            email: auth0User.email || '',
            fallbackRole: 'User',
          });
          setEnrichedUser({
            name: auth0User.name || 'User',
            email: auth0User.email || '',
            role: resolvedRole,
            initials: getInitials(auth0User.name || 'User'),
            canViewAll: hasGlobalViewAccess({
              email: auth0User.email || '',
              role: resolvedRole,
            }),
          });
        }
      } catch (err) {
        console.error('[UserContext] Employee match failed:', err);
        // Fallback to Auth0 info
        const resolvedRole = resolveRoleForIdentity({
          email: auth0User.email || '',
          fallbackRole: 'User',
        });
        setEnrichedUser({
          name: auth0User.name || 'User',
          email: auth0User.email || '',
          role: resolvedRole,
          initials: getInitials(auth0User.name || 'User'),
          canViewAll: hasGlobalViewAccess({
            email: auth0User.email || '',
            role: resolvedRole,
          }),
        });
      }
      setFetchingProfile(false);
      setFetched(true);
    };

    matchEmployee();
  }, [auth0User, fetched]);

  // Reset when user logs out
  useEffect(() => {
    if (!auth0User && fetched) {
      setEnrichedUser(null);
      setFetched(false);
    }
  }, [auth0User, fetched]);

  const login = () => {
    if (AUTH_DISABLED) return;
    window.location.href = '/api/auth/login';
  };

  const logout = () => {
    if (AUTH_DISABLED) return;
    window.location.href = '/api/auth/logout';
  };

  const user = AUTH_DISABLED ? DEMO_USER : enrichedUser;
  const isLoading = AUTH_DISABLED ? false : (auth0Loading || fetchingProfile);

  // Show "Fetching Profile" screen while matching employee
  if (!AUTH_DISABLED && auth0User && fetchingProfile) {
    return (
      <UserContext.Provider value={{ user: null, login, logout, isLoggedIn: false, isLoading: true }}>
        <FetchingProfile />
      </UserContext.Provider>
    );
  }

  return (
    <UserContext.Provider value={{
      user,
      login,
      logout,
      isLoggedIn: AUTH_DISABLED ? true : !!enrichedUser,
      isLoading,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
