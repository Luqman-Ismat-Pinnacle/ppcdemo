'use client';

/**
 * @fileoverview Shared shell for role workstation pages.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_NAV_CONFIG } from '@/lib/role-navigation';
import type { RoleViewKey } from '@/types/role-workstation';

export default function RoleWorkstationShell({
  role,
  title,
  subtitle,
  children,
  actions,
}: {
  role: RoleViewKey;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = ROLE_NAV_CONFIG[role];

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{nav.title}</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.45rem' }}>{title}</h1>
          <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{subtitle}</div>
        </div>
        <Link href="/role-views" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Back to role hub</Link>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
        {nav.items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                background: active ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderRadius: 999,
                padding: '0.33rem 0.64rem',
                whiteSpace: 'nowrap',
                fontSize: '0.7rem',
                textDecoration: 'none',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {actions ? <div>{actions}</div> : null}
      {children}
    </div>
  );
}
