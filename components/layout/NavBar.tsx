'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import NotificationBell from '@/components/ui/NotificationBell';
import { useUser } from '@/lib/user-context';

type NavItem = { href: string; label: string };

type NavBarProps = {
  roleKey: string;
  roleLabel: string;
  roleLongLabel: string;
  navItems: NavItem[];
  notificationRole?: string;
};

const ROLE_SWITCHES: { href: string; label: string }[] = [
  { href: '/pca', label: 'PCA' },
  { href: '/pcl', label: 'PCL' },
  { href: '/coo', label: 'COO' },
  { href: '/senior-manager', label: 'SM' },
  { href: '/project-lead', label: 'PL' },
  { href: '/product-owner', label: 'PO' },
];

function getInitials(name: string): string {
  if (!name) return '??';
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function NavBar({ roleKey, roleLabel, roleLongLabel, navItems, notificationRole }: NavBarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const displayName = user?.name || `${roleLabel} User`;
  const initials = getInitials(displayName);
  const canSwitch = user?.canSwitchViews ?? false;
  const switchTargets = ROLE_SWITCHES.filter((s) => s.href !== `/${roleKey}`);

  return (
    <nav className="nav-bar">
      <div className="nav-left">
        <Link href={`/${roleKey}`} className="nav-logo">
          <Image src="/logo.png" alt="Pinnacle Project Management" width={100} height={24} style={{ objectFit: 'contain', height: 'auto', maxHeight: 24 }} priority />
        </Link>
        <div className="nav-divider" />
        {navItems.map((item) => {
          const isActive = item.href === `/${roleKey}` ? pathname === `/${roleKey}` : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={`nav-link${isActive ? ' active' : ''}`}>{item.label}</Link>;
        })}
      </div>
      <div className="nav-right">
        {canSwitch && (
          <select
            defaultValue=""
            onChange={(e) => {
              const href = e.target.value;
              if (href) window.location.href = href;
            }}
            style={{
              fontSize: '0.66rem',
              fontWeight: 600,
              padding: '0.22rem 0.45rem',
              borderRadius: 7,
              border: '1px solid rgba(64,224,208,0.35)',
              background: 'rgba(64,224,208,0.1)',
              color: '#7de8df',
              maxWidth: 130,
            }}
            aria-label="Switch role view"
          >
            <option value="" disabled>Switch view</option>
            {switchTargets.map((s) => (
              <option key={s.href} value={s.href}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <NotificationBell role={notificationRole || roleLabel} />
        <div className="nav-divider" />
        <div className="nav-profile">
          <div className="nav-profile-info">
            <span className="nav-profile-name">{displayName}</span>
            <span className="nav-profile-role">{roleLongLabel}</span>
          </div>
          <div className="nav-avatar">{initials}</div>
        </div>
      </div>
    </nav>
  );
}
