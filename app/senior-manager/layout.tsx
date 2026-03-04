'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/senior-manager', label: 'Command Center' },
  { href: '/senior-manager/financial-health', label: 'Financial Health' },
  { href: '/senior-manager/client-assurance', label: 'Client Assurance' },
  { href: '/senior-manager/delivery-risk', label: 'Delivery Risk' },
  { href: '/senior-manager/operating-rhythm', label: 'Operating Rhythm' },
  { href: '/senior-manager/commitments', label: 'Commitments' },
  { href: '/senior-manager/forecast-review', label: 'Forecast Review' },
  { href: '/senior-manager/guardrails', label: 'Guardrails' },
  { href: '/senior-manager/wbs', label: 'WBS Gantt' },
  { href: '/senior-manager/sprint', label: 'Sprint' },
];

export default function SeniorManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar roleKey="senior-manager" roleLabel="SM" roleLongLabel="Senior Manager" navItems={NAV_ITEMS} notificationRole="SM" />
      <main className="page-shell">{children}</main>
    </>
  );
}
