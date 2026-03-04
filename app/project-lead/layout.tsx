'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/project-lead/wbs', label: 'WBS Gantt' },
  { href: '/project-lead/task-progress', label: 'Task Progress' },
  { href: '/project-lead/quality', label: 'Quality' },
  { href: '/project-lead/qc-log', label: 'QC Log' },
  { href: '/project-lead/schedule-health', label: 'Schedule' },
  { href: '/project-lead/cost-control', label: 'Cost Control' },
  { href: '/project-lead/forecast', label: 'Forecast' },
  { href: '/project-lead/sprint', label: 'Sprint' },
];

export default function ProjectLeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar roleKey="project-lead" roleLabel="PL" roleLongLabel="Project Lead" navItems={NAV_ITEMS} notificationRole="PL" />
      <main className="page-shell">{children}</main>
    </>
  );
}
