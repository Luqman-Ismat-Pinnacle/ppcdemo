'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import NotificationBell from '@/components/ui/NotificationBell';
import FeedbackButton from '@/components/feedback/FeedbackButton';
import { useUser } from '@/lib/user-context';

type NavItem = { href: string; label: string };

type NavBarProps = {
  roleKey: string;
  roleLabel: string;
  roleLongLabel: string;
  navItems: NavItem[];
  notificationRole?: string;
};

const ROLE_SWITCHES: { href: string; label: string; style: React.CSSProperties }[] = [
  { href: '/pca', label: 'PCA', style: { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)' } },
  { href: '/pcl', label: 'PCL', style: { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' } },
  { href: '/coo', label: 'COO', style: { background: 'rgba(99,102,241,0.16)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.28)' } },
  { href: '/senior-manager', label: 'SM', style: { background: 'rgba(245,158,11,0.16)', color: '#fde68a', border: '1px solid rgba(245,158,11,0.3)' } },
  { href: '/project-lead', label: 'PL', style: { background: 'rgba(14,165,233,0.15)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.25)' } },
  { href: '/product-owner', label: 'PO', style: { background: 'rgba(236,72,153,0.15)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.25)' } },
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
        {canSwitch && ROLE_SWITCHES.filter((s) => s.href !== `/${roleKey}`).map((s) => (
          <Link key={s.href} href={s.href} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 6, ...s.style, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Switch to {s.label}
          </Link>
        ))}
        <FeedbackButton />
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
