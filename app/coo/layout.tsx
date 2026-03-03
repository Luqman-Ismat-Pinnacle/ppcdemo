'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/coo/wbs', label: 'WBS Gantt' },
  { href: '/coo/operating-review', label: 'Operating Review' },
  { href: '/coo/variance-review', label: 'Variance Review' },
  { href: '/coo/commitments', label: 'Commitments' },
  { href: '/coo/forecast', label: 'Forecast' },
  { href: '/coo/pipeline', label: 'Pipeline' },
  { href: '/coo/metric-provenance', label: 'Metric Provenance' },
];

export default function CooLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar roleKey="coo" roleLabel="COO" roleLongLabel="Chief Operating Officer" navItems={NAV_ITEMS} notificationRole="COO" />
      <main className="page-shell">{children}</main>
    </>
  );
}
