'use client';

/**
 * @fileoverview Role-native header navigation with direct desktop links and mobile hamburger menu.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [badges, setBadges] = useState<Record<string, BadgeValue>>({});

  const navConfig = useMemo(() => ROLE_NAV_CONFIG[activeRole.key], [activeRole.key]);

  useEffect(() => {
    setMobileOpen(false);
    setToolsOpen(false);
  }, [pathname, activeRole.key]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!toolsRef.current) return;
      if (!toolsRef.current.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
        {navConfig.tools.length > 0 ? (
          <div ref={toolsRef} className="role-nav-tools-wrap">
            <button
              type="button"
              className={`role-nav-tools-trigger ${toolsOpen ? 'active' : ''}`}
              onClick={() => setToolsOpen((value) => !value)}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
            >
              <span>All Tools</span>
              <span style={{ opacity: 0.8 }}>▼</span>
            </button>
            {toolsOpen ? (
              <div className="role-nav-tools-panel" role="menu">
                {navConfig.tools.map((tool) => (
                  <Link key={tool.href} href={tool.href} className={`role-nav-tool-item ${isActive(tool.href) ? 'active' : ''}`}>
                    <span>{tool.label}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
          {navConfig.tools.length > 0 ? (
            <>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '0.3rem 0' }} />
              {navConfig.tools.map((tool) => (
                <Link key={tool.href} href={tool.href} className={`role-nav-mobile-item ${isActive(tool.href) ? 'active' : ''}`}>
                  <span>{tool.label}</span>
                </Link>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
