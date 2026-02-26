'use client';

/**
 * @fileoverview Role-native header navigation with primary links + tools drawer.
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
  return (
    <span className="role-nav-badge">
      {value}
    </span>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, BadgeValue>>({});
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});

  const navConfig = useMemo(
    () => ROLE_NAV_CONFIG[activeRole.key],
    [activeRole.key],
  );

  useEffect(() => {
    setToolsOpen(false);
    setMobileOpen(false);
  }, [pathname, activeRole.key]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCounts() {
      try {
        const counts = await fetchRoleUiCounts(activeRole.key, user?.email, controller.signal);
        setBadges(counts.badges);
        setToolCounts(counts.tools);
      } catch {
        if (!controller.signal.aborted) {
          setBadges({});
          setToolCounts({});
        }
      }
    }

    void loadCounts();
    return () => controller.abort();
  }, [activeRole.key, user?.email]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="role-nav" id="main-nav">
      <div className="role-nav-desktop">
        {navConfig.primary.map((item) => (
          <Link key={item.href} href={item.href} className={`role-nav-link ${isActive(item.href) ? 'active' : ''}`}>
            <span>{item.label}</span>
            <Badge value={item.badgeKey ? badges[item.badgeKey] : null} />
          </Link>
        ))}
        <div className="role-nav-tools-wrap">
          <button
            type="button"
            className={`role-nav-tools-trigger ${toolsOpen ? 'active' : ''}`}
            onClick={() => setToolsOpen((value) => !value)}
            aria-expanded={toolsOpen}
            aria-label="Open role tools"
          >
            Tools
            <span style={{ opacity: 0.72 }}>({navConfig.tools.length})</span>
          </button>
          {toolsOpen ? (
            <div className="role-nav-tools-panel">
              {navConfig.tools.map((item) => (
                <Link key={item.href} href={item.href} className={`role-nav-tool-item ${isActive(item.href) ? 'active' : ''}`}>
                  <span>{item.label}</span>
                  {item.countKey ? <span className="role-nav-tool-count">{toolCounts[item.countKey] ?? 0}</span> : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="role-nav-mobile-trigger"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
        aria-label="Open navigation menu"
      >
        Menu
      </button>

      {mobileOpen ? (
        <div className="role-nav-mobile-panel">
          <div className="role-nav-mobile-section-title">Primary</div>
          {navConfig.primary.map((item) => (
            <Link key={item.href} href={item.href} className={`role-nav-mobile-item ${isActive(item.href) ? 'active' : ''}`}>
              <span>{item.label}</span>
              <Badge value={item.badgeKey ? badges[item.badgeKey] : null} />
            </Link>
          ))}
          <div className="role-nav-mobile-section-title">Tools</div>
          {navConfig.tools.map((item) => (
            <Link key={item.href} href={item.href} className={`role-nav-mobile-item ${isActive(item.href) ? 'active' : ''}`}>
              <span>{item.label}</span>
              {item.countKey ? <span className="role-nav-tool-count">{toolCounts[item.countKey] ?? 0}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
