'use client';

/**
 * @fileoverview Main Navigation Component for PPC V3.
 * 
 * Provides dropdown-based navigation organized into three categories:
 * - **Project Controls**: WBS & Gantt, Resourcing, Data Management
 * - **Insights**: Overview, Hours Analysis, QC Dashboard, Milestones, Documents
 * - **Project Management**: Sprint Planning, Forecasting, QC Log
 * 
 * Features:
 * - Hover-activated dropdown menus
 * - Active state highlighting for current page
 * - Divider support within dropdown menus
 * 
 * @module components/layout/Navigation
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label?: string;
  href?: string;
  divider?: boolean;
}

interface NavDropdown {
  label: string;
  items: NavItem[];
}

const navigation: NavDropdown[] = [
  {
    label: 'Project Controls',
    items: [
      { label: 'WBS & Gantt Chart', href: '/project-controls/wbs-gantt' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'Project Health', href: '/project-controls/project-health' },
      { divider: true },
      { label: 'Data Management', href: '/project-controls/data-management' },
      { label: 'Documents', href: '/project-controls/folders' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Overview', href: '/insights/overview' },
      { label: 'Hours & Labor Analysis', href: '/insights/hours' },
      { divider: true },
      { label: 'QC Dashboard', href: '/insights/qc-dashboard' },
      { label: 'Milestone Tracker', href: '/insights/milestones' },
      { label: 'Document Tracker', href: '/insights/documents' },
    ],
  },
  {
    label: 'Project Management',
    items: [
      { label: 'Sprint Planning', href: '/project-management/sprint' },
      { label: 'Forecasting', href: '/project-management/forecast' },
      { label: 'QC Log', href: '/project-management/qc-log' },
    ],
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const isActive = (href: string) => pathname === href;

  const hasActiveItem = (items: NavItem[]) => {
    return items.some((item) => item.href && isActive(item.href));
  };

  return (
    <nav className="nav-menu" id="main-nav">
      {navigation.map((dropdown) => {
        const isOpen = openDropdown === dropdown.label;
        const hasActive = hasActiveItem(dropdown.items);

        return (
          <div
            key={dropdown.label}
            className="nav-dropdown"
            onMouseEnter={() => setOpenDropdown(dropdown.label)}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button
              className={`nav-dropdown-trigger ${hasActive ? 'has-active' : ''} ${isOpen ? 'active' : ''}`}
            >
              <span>{dropdown.label}</span>
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </button>
            <div className={`nav-dropdown-content ${isOpen ? 'open' : ''}`}>
              {dropdown.items.map((item, index) => {
                if (item.divider) {
                  return <div key={`divider-${index}`} className="nav-divider" />;
                }
                if (!item.href || !item.label) return null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-dropdown-item ${isActive(item.href) ? 'active' : ''}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
