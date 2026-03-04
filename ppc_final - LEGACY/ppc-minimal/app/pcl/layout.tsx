'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/pcl/wbs', label: 'WBS Gantt' },
  { href: '/pcl/data-management', label: 'Data' },
  { href: '/pcl/forecast', label: 'Forecast' },
  { href: '/pcl/metric-provenance', label: 'Metric Provenance' },
  { href: '/pcl/plans-mapping', label: 'Plans & Mapping' },
  { href: '/pcl/resourcing', label: 'Resourcing' },
  { href: '/pcl/schedule-health', label: 'Schedule Health' },
];

export default function PclLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar roleKey="pcl" roleLabel="PCL" roleLongLabel="Project Controls Lead" navItems={NAV_ITEMS} notificationRole="PCL" />
      <main className="page-shell">{children}</main>
    </>
  );
}
