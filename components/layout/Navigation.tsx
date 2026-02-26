'use client';

/**
 * @fileoverview Role-native header navigation with direct desktop links and mobile hamburger menu.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import { ROLE_NAV_CONFIG } from '@/lib/role-navigation';
import { fetchRoleUiCounts, type BadgeValue } from '@/lib/role-ui-data';

function Badge({ value }: { value: BadgeValue }) {
  if (!value) return null;
  return <span className="role-nav-badge">{value}</span>;
}

export default function Navigation() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, BadgeValue>>({});

  const navConfig = useMemo(() => ROLE_NAV_CONFIG[activeRole.key], [activeRole.key]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, activeRole.key]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCounts() {
      try {
        const counts = await fetchRoleUiCounts(activeRole.key, user?.email, controller.signal);
        setBadges(counts.badges);
      } catch {
        if (!controller.signal.aborted) setBadges({});
      }
    }

    void loadCounts();
    return () => controller.abort();
  }, [activeRole.key, user?.email]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="role-nav" id="main-nav">
      <div className="role-nav-desktop" role="menubar" aria-label={`${activeRole.label} navigation`}>
        {navConfig.primary.map((item) => (
          <Link key={item.href} href={item.href} className={`role-nav-link ${isActive(item.href) ? 'active' : ''}`}>
            <span>{item.label}</span>
            <Badge value={item.badgeKey ? badges[item.badgeKey] : null} />
          </Link>
        ))}
      </div>

      <button
        type="button"
        className="role-nav-mobile-trigger"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
        aria-label="Open navigation menu"
      >
        <span aria-hidden>☰</span>
      </button>

      {mobileOpen ? (
        <div className="role-nav-mobile-panel">
          {navConfig.primary.map((item) => (
            <Link key={item.href} href={item.href} className={`role-nav-mobile-item ${isActive(item.href) ? 'active' : ''}`}>
              <span>{item.label}</span>
              <Badge value={item.badgeKey ? badges[item.badgeKey] : null} />
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
