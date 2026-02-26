'use client';

/**
 * @fileoverview Global role-native navigation.
 *
 * The active role selected in the toolbar controls the entire menu surface.
 * There is no separate "Role Views" section; role context is now the app shell.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import type { RoleViewKey } from '@/types/role-workstation';

interface NavItem {
  label?: string;
  href?: string;
  divider?: boolean;
}

interface NavDropdown {
  label: string;
  items: NavItem[];
}

const PRODUCT_OWNER_NAV: NavDropdown[] = [
  {
    label: 'Project Controls',
    items: [
      { label: 'Project Plans', href: '/project-controls/project-plans' },
      { label: 'Resourcing', href: '/project-controls/resourcing' },
      { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
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
      { label: 'Hours', href: '/insights/hours' },
      { label: 'Metric Provenance', href: '/insights/metric-provenance' },
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
];

const ROLE_NATIVE_NAV: Record<RoleViewKey, NavDropdown[]> = {
  product_owner: PRODUCT_OWNER_NAV,
  project_lead: [
    {
      label: 'Execution',
      items: [
        { label: 'Project Home', href: '/role-views/project-lead' },
        { label: 'Schedule', href: '/role-views/project-lead/schedule' },
        { label: 'Team', href: '/role-views/project-lead/team' },
        { label: 'Week Ahead', href: '/role-views/project-lead/week-ahead' },
        { label: 'Forecast', href: '/role-views/project-lead/forecast' },
        { label: 'Documents', href: '/role-views/project-lead/documents' },
        { label: 'Commitments Report', href: '/role-views/project-lead/report' },
      ],
    },
    {
      label: 'Controls',
      items: [
        { label: 'WBS/Gantt Engine', href: '/project-controls/wbs-gantt' },
        { label: 'Project Plans', href: '/role-views/pca/plan-uploads' },
        { label: 'Data Management', href: '/project-controls/data-management' },
      ],
    },
  ],
  pca: [
    {
      label: 'Operations',
      items: [
        { label: 'PCA Home', href: '/role-views/pca' },
        { label: 'Plan Uploads + Publish', href: '/role-views/pca/plan-uploads' },
        { label: 'Mapping Workspace', href: '/role-views/pca/mapping' },
        { label: 'Data Quality', href: '/role-views/pca/data-quality' },
        { label: 'WBS Workspace', href: '/role-views/pca/wbs' },
      ],
    },
    {
      label: 'Controls',
      items: [
        { label: 'Project Plans Engine', href: '/project-controls/project-plans' },
        { label: 'Data Management', href: '/project-controls/data-management' },
      ],
    },
  ],
  pcl: [
    {
      label: 'Command',
      items: [
        { label: 'Command Center', href: '/role-views/pcl' },
        { label: 'Exceptions', href: '/role-views/pcl/exceptions' },
        { label: 'Schedule Health', href: '/role-views/pcl/schedule-health' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Plans & Mapping', href: '/role-views/pcl/plans-mapping' },
        { label: 'Resourcing', href: '/role-views/pcl/resourcing' },
        { label: 'WBS Risk Queue', href: '/role-views/pcl/wbs' },
      ],
    },
  ],
  senior_manager: [
    {
      label: 'Portfolio',
      items: [
        { label: 'Portfolio Home', href: '/role-views/senior-manager' },
        { label: 'Projects', href: '/role-views/senior-manager/projects' },
        { label: 'Milestones', href: '/role-views/senior-manager/milestones' },
        { label: 'Commitments', href: '/role-views/senior-manager/commitments' },
      ],
    },
    {
      label: 'Visibility',
      items: [
        { label: 'Documents', href: '/role-views/senior-manager/documents' },
        { label: 'WBS', href: '/role-views/senior-manager/wbs' },
      ],
    },
  ],
  coo: [
    {
      label: 'Executive',
      items: [
        { label: 'Pulse', href: '/role-views/coo' },
        { label: 'Period Review', href: '/role-views/coo/period-review' },
        { label: 'Commitments', href: '/role-views/coo/commitments' },
        { label: 'AI Briefing', href: '/role-views/coo/ai' },
      ],
    },
    {
      label: 'Business',
      items: [
        { label: 'Milestones', href: '/role-views/coo/milestones' },
        { label: 'WBS', href: '/role-views/coo/wbs' },
      ],
    },
  ],
  rda: [
    {
      label: 'My Work',
      items: [
        { label: 'Home', href: '/role-views/rda' },
        { label: 'Hours', href: '/role-views/rda/hours' },
        { label: 'Work', href: '/role-views/rda/work' },
        { label: 'Schedule', href: '/role-views/rda/schedule' },
      ],
    },
  ],
  client_portal: [
    {
      label: 'Delivery',
      items: [
        { label: 'Client Portal', href: '/role-views/client-portal' },
      ],
    },
  ],
};

export default function Navigation() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const visibleNavigation = useMemo(
    () => ROLE_NATIVE_NAV[activeRole.key] || PRODUCT_OWNER_NAV,
    [activeRole.key],
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const hasActiveItem = (items: NavItem[]) => items.some((item) => item.href && isActive(item.href));

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
            <button className={`nav-dropdown-trigger ${hasActive ? 'has-active' : ''} ${isOpen ? 'active' : ''}`}>
              <span>{dropdown.label}</span>
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </button>
            <div className={`nav-dropdown-content ${isOpen ? 'open' : ''}`}>
              {dropdown.items.map((item, index) => {
                if (item.divider) return <div key={`divider-${index}`} className="nav-divider" />;
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
