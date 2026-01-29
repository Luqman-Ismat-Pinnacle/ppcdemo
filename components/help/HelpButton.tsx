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
  '/insights/overview': 'overview',
  '/insights/hours': 'hours',
  '/insights/milestones': 'milestones',
  '/insights/documents': 'documents',
  '/insights/qc-dashboard': 'qc-dashboard',
  '/project-controls/data-management': 'data-management',
  '/project-controls/wbs-gantt': 'wbs-gantt',
  '/project-controls/resourcing': 'resourcing',
  '/project-management/forecast': 'forecast',
  '/project-management/sprint': 'sprint',
  '/project-management/qc-log': 'qc-log',
};

/**
 * HelpButton - Floating help button component
 * 
 * Renders a fixed-position button in the bottom-left corner that
 * links to the help page for the current route.
 */
export default function HelpButton() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Don't show on login page
  if (pathname === '/login') {
    return null;
  }

  // Get help page ID for current route
  const helpId = ROUTE_TO_HELP_ID[pathname] || 'home';
  const helpUrl = `/help/${helpId}`;

  return (
    <Link
      href={helpUrl}
      className="help-button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      aria-label="Get help for this page"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '1.5rem',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: isPressed 
          ? 'var(--pinnacle-teal)' 
          : isHovered 
            ? 'linear-gradient(135deg, var(--pinnacle-teal), var(--pinnacle-lime))' 
            : 'var(--bg-card)',
        border: `2px solid ${isHovered ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 9999,
        boxShadow: isHovered 
          ? '0 8px 24px rgba(64, 224, 208, 0.3)' 
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s ease',
        transform: isPressed ? 'scale(0.95)' : isHovered ? 'scale(1.05)' : 'scale(1)',
        textDecoration: 'none',
      }}
    >
      {/* Question mark icon */}
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        style={{
          transition: 'transform 0.2s ease',
          transform: isHovered ? 'rotate(-10deg)' : 'rotate(0deg)',
        }}
      >
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke={isPressed ? '#000' : isHovered ? '#000' : 'var(--pinnacle-teal)'} 
          strokeWidth="2"
          fill="none"
        />
        <path 
          d="M12 17v-.01M12 13.5a2 2 0 1 0-2-2" 
          stroke={isPressed ? '#000' : isHovered ? '#000' : 'var(--pinnacle-teal)'} 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
        />
        <circle 
          cx="12" 
          cy="9.5" 
          r="0.5" 
          fill={isPressed ? '#000' : isHovered ? '#000' : 'var(--pinnacle-teal)'}
        />
      </svg>
      
      {/* Tooltip */}
      {isHovered && (
        <span
          style={{
            position: 'absolute',
            left: '60px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            pointerEvents: 'none',
          }}
        >
          Help & Documentation
        </span>
      )}
    </Link>
  );
}

