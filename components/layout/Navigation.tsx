'use client';

/**
 * @fileoverview Main Navigation Component for PPC V3.
 * 
 * Provides dropdown-based navigation organized into three categories:
 * - **Project Controls**: Project Plans, Resourcing, Data Management
 * - **Insights**: Overview (with Variance & Milestones), Tasks (Hours & QC), Documents
 * - **Project Management**: Sprint Planning, Forecasting, Documentation, QC Log
 * - **Role Views**: Phase 7 role-specific operational dashboards
 * 
 * Note: WBS & Gantt is the home/landing page (accessible via logo click)
 * 
 * Features:
 * - Hover-activated dropdown menus
 * - Active state highlighting for current page
 * - Divider support within dropdown menus
 * 
 * @module components/layout/Navigation
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import { ROLE_NAV_CONFIG } from '@/lib/role-navigation';

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
      { label: 'Project Plans', href: '/project-controls/project-plans' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { divider: true },
      { label: 'Data Management', href: '/project-controls/data-management' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Overview', href: '/insights/overview' },
      { label: 'Tasks', href: '/insights/tasks' },
      { label: "Mo's Page", href: '/insights/mos-page' },
      { divider: true },
      { label: 'Documents', href: '/insights/documents' },
    ],
  },
  {
    label: 'Project Management',
    items: [
      { label: 'Sprint Planning', href: '/project-management/sprint' },
      { divider: true },
      { label: 'Forecasting', href: '/project-management/forecast' },
      { label: 'Documentation', href: '/project-management/documentation' },
      { label: 'QC Log', href: '/project-management/qc-log' },
    ],
  },
  {
    label: 'Role Views',
    items: [
      { label: 'Role Views Hub', href: '/role-views' },
      { label: 'Project Lead', href: '/role-views/project-lead' },
      { divider: true },
      { label: 'PCA Workspace', href: '/role-views/pca' },
      { label: 'PCL Workspace', href: '/role-views/pcl' },
      { label: 'Senior Manager', href: '/role-views/senior-manager' },
      { label: 'COO', href: '/role-views/coo' },
      { label: 'RDA', href: '/role-views/rda' },
    ],
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const isActive = (href: string) => pathname === href;

  const hasActiveItem = (items: NavItem[]) => {
    return items.some((item) => item.href && isActive(item.href));
  };

  const allowedDropdowns = useMemo(() => {
    switch (activeRole.key) {
      case 'project_lead':
        return new Set(['Project Controls', 'Project Management', 'Insights', 'Role Views']);
      case 'pca':
        return new Set(['Project Controls', 'Role Views']);
      case 'pcl':
        return new Set(['Project Controls', 'Insights', 'Role Views']);
      case 'senior_manager':
      case 'coo':
      case 'client_portal':
        return new Set(['Insights', 'Project Management', 'Role Views']);
      case 'rda':
        return new Set(['Project Controls', 'Insights', 'Role Views']);
      case 'product_owner':
      default:
        return null;
    }
  }, [activeRole.key]);

  const visibleNavigation = useMemo(() => {
    if (!allowedDropdowns) return navigation;
    const base = navigation.filter((dropdown) => allowedDropdowns.has(dropdown.label));
    return base.map((dropdown) => {
      if (dropdown.label !== 'Role Views') return dropdown;
      const roleNavItems = ROLE_NAV_CONFIG[activeRole.key]?.items || [];
      const items: NavItem[] = [
        { label: 'Role Views Hub', href: '/role-views' },
        { divider: true },
        ...roleNavItems.map((item) => ({ label: item.label, href: item.href })),
      ];
      return { ...dropdown, items };
    });
  }, [activeRole.key, allowedDropdowns]);

  return (
    <nav className="nav-menu" id="main-nav">
      {visibleNavigation.map((dropdown) => {
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
