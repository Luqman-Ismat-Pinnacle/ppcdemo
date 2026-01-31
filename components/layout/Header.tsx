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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from '@/lib/theme-context';
import { useUser } from '@/lib/user-context';
import { useData } from '@/lib/data-context';
import { createSnapshot, type SnapshotCreateInput } from '@/lib/snapshot-utils';
import { syncTable } from '@/lib/supabase';
import Navigation from './Navigation';
import HierarchyFilter from './HierarchyFilter';
import DateFilterControl from './DateFilterControl';
import StatusAndLogsDropdown from './StatusAndLogsDropdown';

/**
 * Header component displaying the main application header.
 * Contains navigation, filters, theme toggle, and user profile.
 * 
 * @returns {JSX.Element | null} The header element, or null on login page
 */
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Get theme - must be called before any conditional returns
  const themeContext = useTheme();
  const theme = themeContext?.theme || 'dark';
  const toggleTheme = themeContext?.toggleTheme || (() => { });

  // Get user info from context
  const { user, logout: userLogout } = useUser();
  const { data, updateData, hierarchyFilter } = useData();

  // Snapshot dropdown state
  const [showSnapshots, setShowSnapshots] = useState(false);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [snapshotType, setSnapshotType] = useState<'manual' | 'auto'>('manual');

  // UI Selection State
  const [snapshotSection, setSnapshotSection] = useState<string>('');

  // Data Scope Derivation based on global filters
  const derivedScope = useMemo(() => {
    if (!hierarchyFilter?.path || hierarchyFilter.path.length === 0) {
      return { scope: 'all', scopeId: null };
    }
    const path = hierarchyFilter.path;

    // Check Project Level (Index 3)
    if (path[3]) {
      const p = data.projects?.find(x => x.name === path[3]);
      if (p) return { scope: 'project', scopeId: p.id || p.projectId };
    }
    // Check Site Level (Index 2)
    if (path[2]) {
      const s = data.sites?.find(x => x.name === path[2]);
      if (s) return { scope: 'site', scopeId: s.id || s.siteId };
    }
    // Check Customer Level (Index 1)
    if (path[1]) {
      const c = data.customers?.find(x => x.name === path[1]);
      if (c) return { scope: 'customer', scopeId: c.id || c.customerId };
    }
    // Check Portfolio Level (Index 0)
    if (path[0]) {
      const pf = data.portfolios?.find(x => x.name === path[0] || (x.employeeId && `${x.manager}'s Portfolio` === path[0]));
      if (pf) return { scope: 'portfolio', scopeId: pf.id || pf.portfolioId };
    }

    return { scope: 'all', scopeId: null };
  }, [hierarchyFilter, data]);

  const [snapshotView, setSnapshotView] = useState<string>('');
  const [snapshotVersionName, setSnapshotVersionName] = useState<string>('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    const handleClickOutsideSnapshot = (event: MouseEvent) => {
      if (snapshotRef.current && !snapshotRef.current.contains(event.target as Node)) {
        setShowSnapshots(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideSnapshot);
    return () => document.removeEventListener('mousedown', handleClickOutsideSnapshot);
  }, []);

  const snapshots = data.snapshots || [];
  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => {
      const dateA = new Date(a.snapshotDate).getTime();
      const dateB = new Date(b.snapshotDate).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [snapshots]);

  const handleCreateSnapshot = async () => {
    if (!data.projects || data.projects.length === 0) {
      alert('Add projects before creating snapshots.');
      return;
    }

    setIsCreatingSnapshot(true);
    try {
      const snapshotDate = new Date().toISOString().split('T')[0];
      const versionName = snapshotVersionName || `Snapshot ${snapshotDate}`;

      // View: section only (entire section) or section/page
      const finalView = snapshotView ? `${snapshotSection}/${snapshotView}` : snapshotSection;

      const input: SnapshotCreateInput = {
        snapshotDate,
        snapshotType,
        versionName,
        createdBy: user?.name || user?.email || 'System',
        notes: null,
        scope: derivedScope.scope as any, // Cast to satisfy type, logic handled via derivation
        scopeId: derivedScope.scopeId,
        view: finalView,
      };

      const newSnapshot = createSnapshot(data, input);

      // Add to data context
      updateData({
        snapshots: [...snapshots, newSnapshot],
      });

      // Sync to database if configured
      const result = await syncTable('snapshots', [newSnapshot]);
      if (result.success) {
        setSnapshotVersionName('');
        setSnapshotView('');
        setShowSnapshots(false);
        alert(`Snapshot "${versionName}" created successfully!`);
      } else {
        alert(`Snapshot created locally. ${result.error || 'Database sync failed.'}`);
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      alert('Failed to create snapshot. Please try again.');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleLogout = () => {
    setProfileOpen(false);
    userLogout();
    router.push('/login');
  };

  // Don't render header on login page - after all hooks
  if (pathname === '/login') {
    return null;
  }

  return (
    <header className="app-header" style={{
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div className="header-left">
        <div className="app-logo">
          <Link href="/project-controls/wbs-gantt">
            <Image
              src="/logo.png"
              alt="Pinnacle"
              width={100}
              height={24}
              priority
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.outerHTML = '<span style="font-size:0.9rem;font-weight:700;background:linear-gradient(135deg,#40E0D0,#CDDC39);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Pinnacle</span>';
              }}
            />
          </Link>
        </div>
        <Navigation />
      </div>
      <div className="header-right">
        <StatusAndLogsDropdown />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <DateFilterControl />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <HierarchyFilter />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        {/* Snapshot Dropdown */}
        <div ref={snapshotRef} className="nav-dropdown snapshot-dropdown" style={{ position: 'relative' }}>
          <button
            className={`nav-dropdown-trigger ${showSnapshots ? 'active' : ''}`}
            onClick={() => setShowSnapshots(prev => !prev)}
            title="Snapshots"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: showSnapshots ? 'var(--bg-tertiary)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <span style={{ fontSize: '0.8rem' }}>Snapshots</span>
            {snapshots.length > 0 && (
              <span style={{
                fontSize: '0.7rem',
                background: 'var(--accent-color)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '10px',
                minWidth: '18px',
                textAlign: 'center'
              }}>
                {snapshots.length}
              </span>
            )}
          </button>
          <div className={`nav-dropdown-content dropdown-container ${showSnapshots ? 'open' : ''}`} style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            minWidth: '380px',
            maxWidth: '420px',
            zIndex: 1000,
            maxHeight: '80vh',
            overflow: 'hidden',
            display: showSnapshots ? 'flex' : 'none',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Snapshots</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Manual &amp; automatic capture</div>
              </div>
              <button
                onClick={() => setShowSnapshots(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', lineHeight: 1, fontSize: '1.1rem' }}
              >
                ×
              </button>
            </div>

            {/* Create Snapshot Form */}
            <div style={{ padding: '0', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setSnapshotType('manual')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: snapshotType !== 'auto' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                    color: snapshotType !== 'auto' ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: snapshotType !== 'auto' ? '2px solid var(--accent-color)' : 'none'
                  }}
                >
                  Manual Snapshot
                </button>
                <button
                  onClick={() => setSnapshotType('auto')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: snapshotType === 'auto' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                    color: snapshotType === 'auto' ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: snapshotType === 'auto' ? '2px solid var(--accent-color)' : 'none'
                  }}
                >
                  Auto Snapshots
                </button>
              </div>

              {snapshotType !== 'auto' ? (
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>What to capture</div>
                  <select
                    value={snapshotSection}
                    onChange={(e) => { setSnapshotSection(e.target.value); setSnapshotView(''); }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Section or page…</option>
                    <option value="project-controls">Project Controls (section)</option>
                    <option value="insights">Insights (section)</option>
                    <option value="project-management">Project Management (section)</option>
                  </select>
                  {snapshotSection && (
                    <select
                      value={snapshotView}
                      onChange={(e) => setSnapshotView(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">Entire section</option>
                      {snapshotSection === 'project-controls' && (
                        <>
                          <option value="wbs-gantt">WBS &amp; Gantt</option>
                          <option value="resourcing">Resourcing</option>
                          <option value="folders">Project Plans</option>
                          <option value="data-management">Data Management</option>
                        </>
                      )}
                      {snapshotSection === 'insights' && (
                        <>
                          <option value="overview">Overview</option>
                          <option value="milestones">Milestones</option>
                          <option value="hours">Hours</option>
                          <option value="documents">Documents</option>
                          <option value="qc-dashboard">QC Dashboard</option>
                        </>
                      )}
                      {snapshotSection === 'project-management' && (
                        <>
                          <option value="boards">Boards</option>
                          <option value="backlog">Backlog</option>
                          <option value="sprint">Sprint</option>
                          <option value="forecast">Forecast</option>
                          <option value="qc-log">QC Log</option>
                        </>
                      )}
                    </select>
                  )}
                  <input
                    type="text"
                    value={snapshotVersionName}
                    onChange={(e) => setSnapshotVersionName(e.target.value)}
                    placeholder="Name (optional)"
                    style={{
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={handleCreateSnapshot}
                    disabled={isCreatingSnapshot || !snapshotSection}
                    style={{
                      padding: '8px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: isCreatingSnapshot || !snapshotView ? 'var(--bg-tertiary)' : 'var(--accent-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isCreatingSnapshot || !snapshotView ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {isCreatingSnapshot ? 'Creating...' : 'Create Snapshot'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <div style={{ marginBottom: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Scheduled Snapshots</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginBottom: '8px' }}>
                    <span>Weekly Baseline (Friday 5PM)</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '28px', height: '16px' }}>
                      <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                      <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--accent-color)', borderRadius: '16px' }}></span>
                      <span style={{ position: 'absolute', content: '""', height: '12px', width: '12px', left: '2px', bottom: '2px', backgroundColor: 'white', borderRadius: '50%' }}></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <span>Monthly Forecast (1st of Month)</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '28px', height: '16px' }}>
                      <input type="checkbox" style={{ opacity: 0, width: 0, height: 0 }} />
                      <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ccc', borderRadius: '16px' }}></span>
                      <span style={{ position: 'absolute', content: '""', height: '12px', width: '12px', left: '2px', bottom: '2px', backgroundColor: 'white', borderRadius: '50%' }}></span>
                    </label>
                  </div>
                  <button style={{ marginTop: '12px', width: '100%', padding: '6px', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '6px', color: 'var(--accent-color)', fontSize: '0.7rem', cursor: 'pointer' }}>
                    + Add New Trigger
                  </button>
                </div>
              )}
            </div>

            {/* Snapshot List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {sortedSnapshots.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  No snapshots yet. Create one to get started.
                </div>
              ) : (
                sortedSnapshots.slice(0, 10).map((snapshot, index) => (
                  <div
                    key={`${snapshot.id}-${index}`}
                    style={{
                      padding: '10px 12px',
                      marginBottom: '4px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {snapshot.versionName}
                      </div>
                      {snapshot.isLocked && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)' }}>🔒</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {snapshot.snapshotType} • {snapshot.scope}
                      {snapshot.totalProjects && ` • ${snapshot.totalProjects} projects`}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {new Date(snapshot.snapshotDate).toLocaleDateString()} • {snapshot.createdBy}
                    </div>
                  </div>
                ))
              )}
            </div>

            {sortedSnapshots.length > 10 && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                <Link
                  href="/project-controls/data-management?table=snapshots"
                  onClick={() => setShowSnapshots(false)}
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent-color)',
                    textDecoration: 'none'
                  }}
                >
                  View all {sortedSnapshots.length} snapshots →
                </Link>
              </div>
            )}
          </div>
        </div>
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
              <span className="user-role">{user?.role || 'User'}</span>
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
