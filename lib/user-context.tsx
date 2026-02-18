'use client';

/**
 * User Context for PPC V3
 *
 * Auth0 handles authentication. After login, we match the user's name/email
 * against the employees table to pull their role, department, etc.
 * Shows a "Fetching Profile" screen while the employee lookup happens.
 *
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to bypass Auth0 and use a demo user.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser as useAuth0User } from '@auth0/nextjs-auth0/client';

export interface UserInfo {
  name: string;
  email: string;
  role: string;
  initials: string;
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
const ROLE_CLAIMS = (
  process.env.NEXT_PUBLIC_AUTH_ROLE_CLAIMS
  || 'roles,role,https://pinnacle/roles,https://pinnacle/role,https://schemas.microsoft.com/ws/2008/06/identity/claims/role'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ROLE_CLAIM_SINGLE = process.env.NEXT_PUBLIC_AUTH_ROLE_CLAIM || '';
const ROLE_SOURCE = (process.env.NEXT_PUBLIC_AUTH_ROLE_SOURCE || 'oauth-first').toLowerCase();

function getInitials(name: string): string {
  if (!name) return '?';
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
}

const DEMO_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@pinnacle.com',
  role: 'Admin',
  initials: 'DU',
};

function normalizeRoleValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim());
    return typeof first === 'string' ? first.trim() : null;
  }
  return null;
}

function extractRoleFromOAuth(auth0User: Record<string, unknown>): string | null {
  const orderedKeys = ROLE_CLAIM_SINGLE ? [ROLE_CLAIM_SINGLE, ...ROLE_CLAIMS] : ROLE_CLAIMS;
  for (const key of orderedKeys) {
    if (!(key in auth0User)) continue;
    const role = normalizeRoleValue(auth0User[key]);
    if (role) return role;
  }
  return null;
}

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

  // After Auth0 gives us a user, match against employees table
  useEffect(() => {
    if (AUTH_DISABLED || !auth0User || fetched) return;

    const matchEmployee = async () => {
      const auth0UserRecord = auth0User as unknown as Record<string, unknown>;
      const oauthRole = extractRoleFromOAuth(auth0UserRecord);
      if (oauthRole && ROLE_SOURCE !== 'employee-only') {
        setEnrichedUser({
          name: auth0User.name || 'User',
          email: auth0User.email || '',
          role: oauthRole,
          initials: getInitials(auth0User.name || 'User'),
          employeeId: (auth0UserRecord.employee_id as string) || null,
          department: (auth0UserRecord.department as string) || '',
          managementLevel: (auth0UserRecord.management_level as string) || '',
          jobTitle: (auth0UserRecord.job_title as string) || '',
        });
        setFetched(true);
        return;
      }

      if (ROLE_SOURCE === 'oauth-only') {
        setEnrichedUser({
          name: auth0User.name || 'User',
          email: auth0User.email || '',
          role: 'User',
          initials: getInitials(auth0User.name || 'User'),
        });
        setFetched(true);
        return;
      }

      setFetchingProfile(true);
      try {
        const res = await fetch('/api/auth/employee-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: auth0User.name || '',
            email: auth0User.email || '',
          }),
        });
        const data = await res.json();

        if (data.success && data.employee) {
          setEnrichedUser({
            name: data.employee.name || auth0User.name || 'User',
            email: data.employee.email || auth0User.email || '',
            role: data.employee.role,
            initials: getInitials(data.employee.name || auth0User.name || 'User'),
            employeeId: data.employee.employeeId,
            department: data.employee.department,
            managementLevel: data.employee.managementLevel,
            jobTitle: data.employee.jobTitle,
          });
        } else {
          // No match — use Auth0 info with default role
          setEnrichedUser({
            name: auth0User.name || 'User',
            email: auth0User.email || '',
            role: 'User',
            initials: getInitials(auth0User.name || 'User'),
          });
        }
      } catch (err) {
        console.error('[UserContext] Employee match failed:', err);
        // Fallback to Auth0 info
        setEnrichedUser({
          name: auth0User.name || 'User',
          email: auth0User.email || '',
          role: 'User',
          initials: getInitials(auth0User.name || 'User'),
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
