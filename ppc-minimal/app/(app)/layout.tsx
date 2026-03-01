'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import NotificationBell from '@/components/ui/NotificationBell';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview' },
  { href: '/wbs', label: 'WBS Gantt' },
  { href: '/mapping', label: 'Mapping' },
  { href: '/project-plans', label: 'Project Plans' },
  { href: '/sprint', label: 'Sprint' },
  { href: '/forecast', label: 'Forecast' },
  { href: '/data-management', label: 'Data' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="nav-bar">
        {/* Left: logo + links */}
        <div className="nav-left">
          <Link href="/" className="nav-logo">
            <Image
              src="/logo.png"
              alt="Pinnacle Project Management"
              width={100}
              height={24}
              style={{ objectFit: 'contain', height: 'auto', maxHeight: 24 }}
              priority
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.outerHTML = '<span style="font-size:0.85rem;font-weight:700;background:linear-gradient(135deg,#10b981,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Pinnacle PM</span>';
              }}
            />
          </Link>

          <div className="nav-divider" />

          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right: notifications + profile */}
        <div className="nav-right">
          <NotificationBell />
          <div className="nav-divider" />
          <div className="nav-profile">
            <div className="nav-profile-info">
              <span className="nav-profile-name">PCA User</span>
              <span className="nav-profile-role">Project Controls Analyst</span>
            </div>
            <div className="nav-avatar">PC</div>
          </div>
        </div>
      </nav>
      <main className="page-shell">
        {children}
      </main>
    </>
  );
}
