'use client';

import NavBar from '@/components/layout/NavBar';

const NAV_ITEMS = [
  { href: '/product-owner', label: 'Overview' },
  { href: '/product-owner/database', label: 'Database' },
  { href: '/product-owner/feedback', label: 'Issues & Features' },
  { href: '/product-owner/connections', label: 'Connections' },
];

export default function ProductOwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar
        roleKey="product-owner"
        roleLabel="PO"
        roleLongLabel="Product Owner"
        navItems={NAV_ITEMS}
        notificationRole="PO"
      />
      <main className="page-shell">{children}</main>
    </>
  );
}
