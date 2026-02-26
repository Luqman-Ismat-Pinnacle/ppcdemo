'use client';

/**
 * @fileoverview Header-primary role navigation with scoped badges.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { RoleViewKey } from '@/types/role-workstation';

type NavItem = {
  label?: string;
  href?: string;
  divider?: boolean;
  badgeKey?: string;
};

type NavDropdown = {
  label: string;
  items: NavItem[];
};

type BadgeMap = Record<string, number | '!' | null>;

const PRODUCT_OWNER_NAV: NavDropdown[] = [
  {
    label: 'Command Center',
    items: [
      { label: 'Overview', href: '/role-views/product-owner' },
      { label: 'Role Monitor', href: '/role-views/product-owner#role-monitor' },
      { label: 'System Health', href: '/role-views/product-owner#system-health' },
      { label: 'Feedback', href: '/project-management/qc-log' },
      { label: 'Data Admin', href: '/project-controls/data-management' },
    ],
  },
  {
    label: 'Cross Role',
    items: [
      { label: 'PCL', href: '/role-views/pcl' },
      { label: 'PCA', href: '/role-views/pca' },
      { label: 'Project Lead', href: '/role-views/project-lead' },
      { label: 'Senior Manager', href: '/role-views/senior-manager' },
      { label: 'COO', href: '/role-views/coo' },
      { label: 'RDA', href: '/role-views/rda' },
    ],
  },
];

const ROLE_NATIVE_NAV: Record<RoleViewKey, NavDropdown[]> = {
  product_owner: PRODUCT_OWNER_NAV,
  coo: [
    {
      label: 'Executive',
      items: [
        { label: 'AI Command', href: '/role-views/coo/ai' },
        { label: 'Period Review', href: '/role-views/coo/period-review' },
        { label: 'Portfolio', href: '/role-views/coo' },
        { label: 'Milestones', href: '/role-views/coo/milestones' },
        { label: 'Commitments', href: '/role-views/coo/commitments', badgeKey: 'coo_commitments' },
      ],
    },
  ],
  senior_manager: [
    {
      label: 'Portfolio',
      items: [
        { label: 'Overview', href: '/role-views/senior-manager' },
        { label: 'Projects', href: '/role-views/senior-manager/projects' },
        { label: 'Team', href: '/role-views/senior-manager/team' },
        { label: 'Milestones', href: '/role-views/senior-manager/milestones' },
        { label: 'Commitments', href: '/role-views/senior-manager/commitments', badgeKey: 'sm_commitments' },
        { label: 'Documents', href: '/role-views/senior-manager/documents' },
      ],
    },
  ],
  project_lead: [
    {
      label: 'Project',
      items: [
        { label: 'My Project', href: '/role-views/project-lead' },
        { label: 'Schedule', href: '/role-views/project-lead/schedule' },
        { label: 'Team', href: '/role-views/project-lead/team' },
        { label: 'Sprint', href: '/project-management/sprint' },
        { label: 'Forecast', href: '/role-views/project-lead/forecast' },
        { label: 'Documents', href: '/role-views/project-lead/documents' },
        { label: 'Report', href: '/role-views/project-lead/report', badgeKey: 'pl_report' },
      ],
    },
  ],
  pcl: [
    {
      label: 'Control',
      items: [
        { label: 'Command Center', href: '/role-views/pcl' },
        { label: 'Schedule Health', href: '/role-views/pcl/schedule-health' },
        { label: 'Plans & Mapping', href: '/role-views/pcl/plans-mapping' },
        { label: 'Resourcing', href: '/role-views/pcl/resourcing' },
        { label: 'Exceptions', href: '/role-views/pcl/exceptions', badgeKey: 'pcl_exceptions' },
      ],
    },
  ],
  pca: [
    {
      label: 'Operations',
      items: [
        { label: 'My Work', href: '/role-views/pca' },
        { label: 'Mapping', href: '/role-views/pca/mapping', badgeKey: 'pca_mapping' },
        { label: 'Plan Uploads', href: '/role-views/pca/plan-uploads' },
        { label: 'Data Quality', href: '/role-views/pca/data-quality' },
        { label: 'WBS', href: '/role-views/pca/wbs' },
      ],
    },
  ],
  rda: [
    {
      label: 'Execution',
      items: [
        { label: 'My Work', href: '/role-views/rda' },
        { label: 'Sprint', href: '/role-views/rda/sprint' },
        { label: 'Hours', href: '/role-views/rda/hours' },
        { label: 'Schedule', href: '/role-views/rda/schedule' },
        { label: 'Work Queue', href: '/role-views/rda/work', badgeKey: 'rda_overdue' },
      ],
    },
  ],
  client_portal: [
    {
      label: 'Client',
      items: [{ label: 'Portal', href: '/role-views/client-portal' }],
    },
  ],
};

function Badge({ value }: { value: number | '!' }) {
  return (
    <span
      style={{
        marginLeft: 6,
        minWidth: 16,
        height: 16,
        padding: '0 5px',
        borderRadius: 999,
        background: value === '!' ? '#EF4444' : 'rgba(16,185,129,0.22)',
        color: value === '!' ? '#fff' : 'var(--text-primary)',
        border: `1px solid ${value === '!' ? '#EF4444' : 'var(--border-color)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.62rem',
        fontWeight: 700,
      }}
    >
      {value}
    </span>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [badges, setBadges] = useState<BadgeMap>({});

  useEffect(() => {
    let cancelled = false;
    const headers = {
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    };

    async function loadBadges() {
      try {
        const [alertsRes, commitmentsRes, mappingRes, tasksRes] = await Promise.all([
          fetch('/api/alerts?status=open&limit=500', { cache: 'no-store', headers }),
          fetch('/api/commitments?limit=500', { cache: 'no-store', headers }),
          fetch('/api/data/mapping?action=getCoverage&limit=500', { cache: 'no-store', headers }),
          fetch('/api/data?table=tasks&limit=1000', { cache: 'no-store', headers }),
        ]);

        const alertsPayload = await alertsRes.json().catch(() => ({}));
        const commitmentsPayload = await commitmentsRes.json().catch(() => ({}));
        const mappingPayload = await mappingRes.json().catch(() => ({}));
        const tasksPayload = await tasksRes.json().catch(() => ({}));
        if (cancelled) return;

        const alerts = Array.isArray(alertsPayload.alerts) ? alertsPayload.alerts : [];
        const commitments = Array.isArray(commitmentsPayload.rows) ? commitmentsPayload.rows : [];
        const tasks = Array.isArray(tasksPayload.rows) ? tasksPayload.rows : [];

        const unresolvedCommitments = commitments.filter((row: { status?: string }) => {
          const status = String(row.status || '').toLowerCase();
          return status === 'submitted' || status === 'escalated';
        }).length;

        const overdueTasks = tasks.filter((task: Record<string, unknown>) => {
          const pct = Number(task.percent_complete ?? task.percentComplete ?? 0);
          const finish = String(task.finish_date || task.finishDate || '');
          return pct < 100 && finish && Number.isFinite(Date.parse(finish)) && Date.parse(finish) < Date.now();
        }).length;

        const mappingBacklog = Number(mappingPayload?.summary?.unmappedHours || 0);

        setBadges({
          pcl_exceptions: alerts.length > 0 ? alerts.length : null,
          pca_mapping: mappingBacklog > 0 ? mappingBacklog : null,
          pl_report: overdueTasks > 0 ? '!' : null,
          coo_commitments: unresolvedCommitments > 0 ? unresolvedCommitments : null,
          sm_commitments: unresolvedCommitments > 0 ? unresolvedCommitments : null,
          rda_overdue: overdueTasks > 0 ? overdueTasks : null,
        });
      } catch {
        if (!cancelled) setBadges({});
      }
    }

    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, [activeRole.key, user?.email]);

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
                const badge = item.badgeKey ? badges[item.badgeKey] : null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-dropdown-item ${isActive(item.href) ? 'active' : ''}`}
                  >
                    <span>{item.label}</span>
                    {badge ? <Badge value={badge} /> : null}
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
