'use client';

/**
 * @fileoverview Floating Help Button Component for PPC V3.
 * 
 * Renders a fixed-position help button in the bottom-left corner
 * of every page (except login). Links to context-sensitive help
 * based on the current route.
 * 
 * Features:
 * - Fixed position in bottom-left corner
 * - Route-aware help links (each page has specific help)
 * - Animated hover and press effects
 * - Tooltip on hover
 * - Accessible with keyboard navigation
 * - Hidden on login page
 * 
 * @module components/help/HelpButton
 * 
 * @example
 * ```tsx
 * // In app/layout.tsx:
 * <HelpButton />
 * ```
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Map routes to help page IDs
 */
const ROUTE_TO_HELP_ID: Record<string, string> = {
  '/': 'home',
  '/login': 'login',
  '/insights/overview-v2': 'overview',
  '/insights/tasks': 'tasks',
  '/insights/mos-page': 'overview',
  '/insights/overview': 'overview',
  '/insights/hours': 'hours',
  '/insights/milestones': 'milestones',
  '/insights/documents': 'documents',
  '/insights/qc-dashboard': 'qc-dashboard',
  '/project-controls/data-management': 'data-management',
  '/project-controls/wbs-gantt': 'wbs-gantt',
  '/project-controls/resourcing': 'resourcing',
  '/project-controls/folders': 'project-plans',
  '/project-management/forecast': 'forecast',
  '/project-management/sprint': 'sprint',
  '/project-management/qc-log': 'qc-log',
  '/feedback': 'feedback',
};

/**
 * HelpButton - Floating help button component
 * 
 * Renders a fixed-position button in the bottom-left corner that
 * links to the help page for the current route.
 */
export default function HelpButton() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<'help' | 'feedback' | null>(null);

  // Hide on login/help pages so page-level links are never obstructed.
  if (pathname === '/login' || pathname.startsWith('/help')) {
    return null;
  }

  const helpId = ROUTE_TO_HELP_ID[pathname] || 'home';
  const helpUrl = `/help?context=${encodeURIComponent(helpId)}`;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '0.9rem',
        left: '0.9rem',
        display: 'flex',
        flexDirection: 'row',
        gap: '0.45rem',
        zIndex: 9999,
      }}
    >
      <Link
        href={helpUrl}
        aria-label="Open Help Center"
        onMouseEnter={() => setHovered('help')}
        onMouseLeave={() => setHovered(null)}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: hovered === 'help' ? 'linear-gradient(135deg, var(--pinnacle-teal), var(--pinnacle-lime))' : 'var(--bg-card)',
          border: `1px solid ${hovered === 'help' ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: hovered === 'help' ? '0 8px 20px rgba(64, 224, 208, 0.24)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.18s ease',
          textDecoration: 'none',
          color: hovered === 'help' ? '#000' : 'var(--pinnacle-teal)',
          position: 'relative',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4" />
          <line x1="12" y1="17" x2="12" y2="17.01" />
        </svg>
        {hovered === 'help' && (
          <span
            style={{
              position: 'absolute',
              bottom: '42px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '0.4rem 0.65rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              pointerEvents: 'none',
              zIndex: 10020,
            }}
          >
            Help
          </span>
        )}
      </Link>

      <Link
        href="/feedback"
        aria-label="Open Features and Issues"
        onMouseEnter={() => setHovered('feedback')}
        onMouseLeave={() => setHovered(null)}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: hovered === 'feedback' ? 'linear-gradient(135deg, #3B82F6, #40E0D0)' : 'var(--bg-card)',
          border: `1px solid ${hovered === 'feedback' ? '#3B82F6' : 'var(--border-color)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: hovered === 'feedback' ? '0 8px 20px rgba(59, 130, 246, 0.24)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.18s ease',
          textDecoration: 'none',
          color: hovered === 'feedback' ? '#000' : '#3B82F6',
          position: 'relative',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
        {hovered === 'feedback' && (
          <span
            style={{
              position: 'absolute',
              bottom: '42px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '0.4rem 0.65rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              pointerEvents: 'none',
              zIndex: 10020,
            }}
          >
            Issues & Features
          </span>
        )}
      </Link>
    </div>
  );
}
