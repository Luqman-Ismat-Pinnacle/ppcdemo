'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/pca/wbs', label: 'WBS Gantt' },
  { href: '/pca/mapping', label: 'Mapping' },
  { href: '/pca/project-plans', label: 'Project Plans' },
  { href: '/pca/sprint', label: 'Sprint' },
  { href: '/pca/forecast', label: 'Forecast' },
  { href: '/pca/metric-provenance', label: 'Metric Provenance' },
  { href: '/pca/data-management', label: 'Data' },
];

export default function PcaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar roleKey="pca" roleLabel="PCA" roleLongLabel="Project Controls Analyst" navItems={NAV_ITEMS} />
      <main className="page-shell">{children}</main>
    </>
  );
}
