'use client';

/**
 * @fileoverview Application Header Component for PPC V3.
 * 
 * Provides the main header bar including:
 * - Logo with link to WBS/Gantt (main page)
 * - Main navigation dropdowns (Project Controls, Insights, Project Management)
 * - Date filter control
 * - Hierarchy filter control
 * - Theme toggle button (dark/light mode)
 * - User profile dropdown with logout and help link
 * 
 * The header is hidden on the login page.
 * 
 * @module components/layout/Header
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/lib/theme-context';
import { useUser } from '@/lib/user-context';
import { useRoleView } from '@/lib/role-view-context';
import Navigation from './Navigation';
import HierarchyFilter from './HierarchyFilter';
import DateFilterControl from './DateFilterControl';
import StatusAndLogsDropdown from './StatusAndLogsDropdown';
import NotificationBell from './NotificationBell';

/**
 * Header component displaying the main application header.
 * Contains navigation, filters, theme toggle, and user profile.
 * 
 * @returns {JSX.Element | null} The header element, or null on login page
 */
export default function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Get theme - must be called before any conditional returns
  const themeContext = useTheme();
  const theme = themeContext?.theme || 'dark';
  const toggleTheme = themeContext?.toggleTheme || (() => { });

  // Get user info from context
  const { user, logout: userLogout } = useUser();
  const { activeRole } = useRoleView();

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setProfileOpen(false);
    userLogout();
  };

  return (
    <header className="app-header" style={{
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div className="header-left">
        <Link href={activeRole.dashboardRoute} className="app-logo-trigger" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image
            src="/logo.png"
            alt="Pinnacle Project Management"
            width={100}
            height={24}
            priority
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.outerHTML = '<span style="font-size:0.9rem;font-weight:700;background:linear-gradient(135deg,#40E0D0,#CDDC39);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Pinnacle Project Management</span>';
            }}
          />
        </Link>
        <Navigation />
      </div>
      <div className="header-right">
        <StatusAndLogsDropdown />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <DateFilterControl />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <HierarchyFilter />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <NotificationBell />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        {/* Profile Dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            className="user-profile"
            onClick={() => setProfileOpen(!profileOpen)}
            style={{ cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <div className="user-info">
              <span className="user-name">{user?.name || 'Guest'}</span>
              <span className="user-role">{user?.role || 'User'} · Viewing {activeRole.label}</span>
            </div>
            <div className="user-avatar">{user?.initials || 'GU'}</div>
            <svg viewBox="0 0 12 12" width="10" height="10" style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>

          {profileOpen && (
            <div className="profile-dropdown">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name || 'Guest'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user?.email || 'guest@pinnacle.com'}</div>
              </div>
              <div style={{ padding: '4px' }}>
                {/* Theme Toggle */}
                <button
                  type="button"
                  onClick={() => { toggleTheme(); setProfileOpen(false); }}
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(64, 224, 208, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {theme === 'dark' ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                      <circle cx="12" cy="12" r="5"></circle>
                      <line x1="12" y1="1" x2="12" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="23"></line>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                      <line x1="1" y1="12" x2="3" y2="12"></line>
                      <line x1="21" y1="12" x2="23" y2="12"></line>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                  )}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                {/* Help Center Link */}
                <Link
                  href="/help"
                  onClick={() => setProfileOpen(false)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    textDecoration: 'none',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(64, 224, 208, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Help Center
                </Link>
                {/* Sign Out */}
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#EF4444',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16,17 21,12 16,7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
