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
import DatabaseStatusIndicator from './DatabaseStatusIndicator';
import WorkdayStatusIndicator from './WorkdayStatusIndicator';

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
  const catchUpLog = data.catchUpLog || [];
  const [showCatchUp, setShowCatchUp] = useState(false);
  const catchUpRef = useRef<HTMLDivElement>(null);
  const [catchUpProject, setCatchUpProject] = useState('');
  const [catchUpEntity, setCatchUpEntity] = useState('');
  const [catchUpWindow, setCatchUpWindow] = useState<'all' | '7' | '30'>('7');

  // Snapshot dropdown state
  const [showSnapshots, setShowSnapshots] = useState(false);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [snapshotType, setSnapshotType] = useState<'baseline' | 'forecast' | 'workday' | 'manual' | 'auto'>('baseline');

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
  const [snapshotNotes, setSnapshotNotes] = useState<string>('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  const catchUpProjectOptions = useMemo(() => {
    if (!data.projects) return [];
    return data.projects
      .map(project => {
        const id = project.id || project.projectId;
        const name = project.name || id;
        return id ? { id, label: name } : null;
      })
      .filter((item): item is { id: string; label: string } => Boolean(item))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data.projects]);

  const catchUpEntityOptions = useMemo(() => {
    return [...new Set(catchUpLog.map(entry => entry.entityType).filter(Boolean))].sort();
  }, [catchUpLog]);

  const filteredCatchUpEntries = useMemo(() => {
    const cutoff =
      catchUpWindow === 'all'
        ? null
        : new Date(Date.now() - Number(catchUpWindow) * 24 * 60 * 60 * 1000);

    return catchUpLog.filter(entry => {
      if (catchUpProject && entry.projectId !== catchUpProject) {
        return false;
      }
      if (catchUpEntity && entry.entityType !== catchUpEntity) {
        return false;
      }
      if (cutoff && entry.timestamp) {
        const entryDate = new Date(entry.timestamp);
        if (Number.isNaN(entryDate.getTime()) || entryDate < cutoff) {
          return false;
        }
      }
      return true;
    });
  }, [catchUpLog, catchUpProject, catchUpEntity, catchUpWindow]);

  const formatCatchUpTime = (value: string | undefined) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
  };

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
    const handleClickOutsideCatchUp = (event: MouseEvent) => {
      if (catchUpRef.current && !catchUpRef.current.contains(event.target as Node)) {
        setShowCatchUp(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideCatchUp);
    return () => document.removeEventListener('mousedown', handleClickOutsideCatchUp);
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
      const versionName = snapshotVersionName || `${snapshotType} ${snapshotDate}`;

      // Combine section and page for view (e.g. "project-controls/resourcing")
      const finalView = snapshotSection ? `${snapshotSection}/${snapshotView}` : snapshotView;

      const input: SnapshotCreateInput = {
        snapshotDate,
        snapshotType,
        versionName,
        createdBy: user?.name || user?.email || 'System',
        notes: snapshotNotes || null,
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
        setSnapshotNotes('');
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
        <DatabaseStatusIndicator />
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <WorkdayStatusIndicator />
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
          <div className={`nav-dropdown-content snapshot-dropdown-content ${showSnapshots ? 'open' : ''}`} style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            minWidth: '400px',
            maxWidth: '500px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxHeight: '80vh',
            overflow: 'hidden',
            display: showSnapshots ? 'flex' : 'none',
            flexDirection: 'column'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Snapshots</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Capture and compare project states</div>
              </div>
              <button
                onClick={() => setShowSnapshots(false)}
                aria-label="Close snapshots"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '4px',
                  lineHeight: 1
                }}
              >
                ✕
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
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={snapshotSection} // Repurposing scope for Section
                      onChange={(e) => {
                        setSnapshotSection(e.target.value);
                        setSnapshotView(''); // Reset page
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Select Section...</option>
                      <option value="project-controls">Project Controls</option>
                      <option value="insights">Insights</option>
                      <option value="project-management">Project Management</option>
                    </select>
                    <select
                      value={snapshotView}
                      onChange={(e) => setSnapshotView(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Select Page...</option>
                      {snapshotSection === 'project-controls' && (
                        <>
                          <option value="wbs-gantt">WBS & Gantt Chart</option>
                          <option value="resourcing">Resourcing</option>
                          <option value="folders">Folders</option>
                          <option value="project-health">Project Health</option>
                          <option value="data-management">Data Management</option>
                        </>
                      )}
                      {snapshotSection === 'insights' && (
                        <>
                          <option value="overview">Overview</option>
                          <option value="milestones">Milestones</option>
                          <option value="hours">Hours Analysis</option>
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
                  </div>

                  <input
                    type="text"
                    value={snapshotVersionName}
                    onChange={(e) => setSnapshotVersionName(e.target.value)}
                    placeholder="Snapshot name (e.g. Baseline V1)"
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.75rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <textarea
                    value={snapshotNotes}
                    onChange={(e) => setSnapshotNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.75rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                  <button
                    onClick={handleCreateSnapshot}
                    disabled={isCreatingSnapshot || !snapshotView}
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
        {mounted && (
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            style={{
              padding: '8px',
              borderRadius: '50%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--transition-normal)',
              boxShadow: 'var(--shadow-sm)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.1) rotate(12deg)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              e.currentTarget.style.borderColor = 'var(--pinnacle-teal)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
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
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        )}
        <div className="nav-divider" style={{ height: '24px', margin: '0 0.5rem' }}></div>
        <div ref={catchUpRef} className="nav-dropdown catch-up-dropdown" style={{ position: 'relative' }}>
          <button
            className={`nav-dropdown-trigger ${showCatchUp ? 'active' : ''}`}
            onClick={() => setShowCatchUp(prev => !prev)}
          >
            Catch Up {catchUpLog.length > 0 && `(${catchUpLog.length})`}
          </button>
          <div className={`nav-dropdown-content catch-up-dropdown-content ${showCatchUp ? 'open' : ''}`}>
            <div className="catch-up-header">
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Catch Up</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Recent approvals & change logs</div>
              </div>
              <button
                onClick={() => setShowCatchUp(false)}
                aria-label="Close catch up"
                className="catch-up-close"
              >
                ✕
              </button>
            </div>
            <div className="catch-up-filters">
              <select value={catchUpProject} onChange={e => setCatchUpProject(e.target.value)} className="catch-up-select">
                <option value="">All Projects</option>
                {catchUpProjectOptions.map(project => (
                  <option key={project.id} value={project.id}>{project.label}</option>
                ))}
              </select>
              <select value={catchUpEntity} onChange={e => setCatchUpEntity(e.target.value)} className="catch-up-select">
                <option value="">All Entities</option>
                {catchUpEntityOptions.map(entity => (
                  <option key={entity} value={entity}>{entity}</option>
                ))}
              </select>
              <select value={catchUpWindow} onChange={e => setCatchUpWindow(e.target.value as typeof catchUpWindow)} className="catch-up-select">
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>
            <div className="catch-up-entries">
              {filteredCatchUpEntries.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No entries match the filters.</div>
              ) : (
                filteredCatchUpEntries.slice(0, 12).map(entry => (
                  <div key={entry.id} className="catch-up-entry">
                    <div className="catch-up-entry-title">{entry.description}</div>
                    <div className="catch-up-entry-meta">
                      <span>{entry.user || 'System'}</span>
                      <span>{entry.projectId || 'Global'}</span>
                      <span>{formatCatchUpTime(entry.timestamp)}</span>
                    </div>
                    {entry.fromValue || entry.toValue ? (
                      <div className="catch-up-entry-delta">
                        <span>{entry.fromValue || '-'}</span>
                        <span>→</span>
                        <span>{entry.toValue || '-'}</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

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
