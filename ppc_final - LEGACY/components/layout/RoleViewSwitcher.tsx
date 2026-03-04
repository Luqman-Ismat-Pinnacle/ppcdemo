'use client';

/**
 * @fileoverview Floating role-view switcher toolbar.
 *
 * Hover-expand control inspired by dev toolbar UX that lets Product Owner
 * simulate role perspectives and jump to role dashboards quickly.
 */

import React, { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import { isProductOwnerIdentity } from '@/lib/access-control';

export default function RoleViewSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeRole, canSwitchRoles, setActiveRole, presets } = useRoleView();
  const { user } = useUser();
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const open = pinnedOpen || hoverOpen;

  const title = useMemo(
    () => canSwitchRoles ? `Viewing As: ${activeRole.label}` : `Role: ${activeRole.label}`,
    [activeRole.label, canSwitchRoles]
  );

  const isProductOwner = isProductOwnerIdentity(user?.email) || String(user?.role || '').trim().toLowerCase() === 'product owner';
  if (pathname === '/login' || !isProductOwner) return null;

  return (
    <div
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 10010,
        width: open ? 360 : 150,
        transition: 'width 180ms ease',
        background: 'var(--bg-glass)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setPinnedOpen((value) => !value)}
        style={{
          width: '100%',
          border: 'none',
          borderBottom: open ? '1px solid var(--border-color)' : 'none',
          background: 'transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          padding: '0.48rem 0.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--pinnacle-teal)' }}>ROLE</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{activeRole.label}</span>
        </span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{open ? 'Close' : 'Open'}</span>
      </button>

      {open && (
        <div style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem' }}>
            {presets.map((preset) => {
              const selected = preset.key === activeRole.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setActiveRole(preset.key);
                    router.push(preset.dashboardRoute);
                  }}
                  disabled={!canSwitchRoles && !selected}
                  title={preset.description}
                  style={{
                    border: `1px solid ${selected ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                    background: selected ? 'rgba(16,185,129,0.14)' : 'var(--bg-secondary)',
                    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderRadius: 8,
                    padding: '0.42rem 0.45rem',
                    fontSize: '0.68rem',
                    textAlign: 'left',
                    cursor: !canSwitchRoles && !selected ? 'not-allowed' : 'pointer',
                    opacity: !canSwitchRoles && !selected ? 0.58 : 1,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => router.push(activeRole.dashboardRoute)}
              style={{
                width: '100%',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                borderRadius: 8,
                padding: '0.42rem 0.5rem',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
            >
              Open Role Home
            </button>
          </div>
          {!canSwitchRoles && (
            <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
              Switching roles is enabled for Product Owner full-access users.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
