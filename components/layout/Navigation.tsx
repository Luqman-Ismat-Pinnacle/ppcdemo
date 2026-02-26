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
        { label: 'Schedule (WBS/Gantt)', href: '/project-controls/wbs-gantt' },
        { label: 'Forecast', href: '/project-management/forecast' },
        { label: 'Documentation', href: '/project-management/documentation' },
        { label: 'Commitments Report', href: '/role-views/project-lead/report' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'Overview', href: '/insights/overview' },
        { label: 'Tasks', href: '/insights/tasks' },
        { label: "Mo's Page", href: '/insights/mos-page' },
      ],
    },
    {
      label: 'Controls',
      items: [
        { label: 'Project Plans', href: '/project-controls/project-plans' },
        { label: 'Data Management', href: '/project-controls/data-management' },
      ],
    },
  ],
  pca: [
    {
      label: 'Operations',
      items: [
        { label: 'Plan Uploads + Publish', href: '/project-controls/project-plans' },
        { label: 'Mapping Workspace', href: '/role-views/pca-workspace' },
        { label: 'Data Quality', href: '/role-views/pca/data-quality' },
        { label: 'Schedule (WBS/Gantt)', href: '/project-controls/wbs-gantt' },
      ],
    },
    {
      label: 'Controls',
      items: [
        { label: 'Folders', href: '/project-controls/folders' },
        { label: 'Data Management', href: '/project-controls/data-management' },
      ],
    },
  ],
  pcl: [
    {
      label: 'Command',
      items: [
        { label: 'Command Center', href: '/role-views/pcl' },
        { label: 'Exceptions', href: '/role-views/pcl-exceptions' },
        { label: 'Schedule Health', href: '/role-views/pcl/schedule-health' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Plans & Mapping', href: '/project-controls/project-plans' },
        { label: 'Resourcing', href: '/project-controls/resourcing' },
        { label: 'Schedule (WBS/Gantt)', href: '/project-controls/wbs-gantt' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'Overview', href: '/insights/overview' },
        { label: 'Hours', href: '/insights/hours' },
      ],
    },
  ],
  senior_manager: [
    {
      label: 'Portfolio',
      items: [
        { label: 'Overview', href: '/insights/overview' },
        { label: 'Commitments', href: '/role-views/senior-manager/commitments' },
        { label: 'Milestones', href: '/insights/milestones' },
      ],
    },
    {
      label: 'Visibility',
      items: [
        { label: 'Documents', href: '/insights/documents' },
        { label: 'Tasks', href: '/insights/tasks' },
        { label: 'WBS / Gantt', href: '/project-controls/wbs-gantt' },
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
        { label: 'Overview', href: '/insights/overview' },
        { label: 'Milestones', href: '/insights/milestones' },
        { label: "Mo's Page", href: '/insights/mos-page' },
      ],
    },
  ],
  rda: [
    {
      label: 'My Work',
      items: [
        { label: 'Tasks', href: '/insights/tasks' },
        { label: 'Hours', href: '/insights/hours' },
        { label: 'QC Log', href: '/project-management/qc-log' },
        { label: 'Schedule (WBS/Gantt)', href: '/project-controls/wbs-gantt' },
      ],
    },
  ],
  client_portal: [
    {
      label: 'Delivery',
      items: [
        { label: 'Overview', href: '/insights/overview' },
        { label: 'Milestones', href: '/insights/milestones' },
        { label: 'Documents', href: '/insights/documents' },
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
