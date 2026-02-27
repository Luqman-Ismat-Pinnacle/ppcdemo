'use client';

/**
 * @fileoverview Shared shell for role workstation pages.
 */

import React from 'react';
import { useUser } from '@/lib/user-context';
import { useRoleView } from '@/lib/role-view-context';
import type { RoleViewKey } from '@/types/role-workstation';
import RoleContextStrip from '@/components/role-workstations/RoleContextStrip';
import { isRoleEnhancementTierEnabled, type RoleEnhanceTier } from '@/lib/role-enhancement-flags';

export default function RoleWorkstationShell({
  role,
  title,
  subtitle,
  children,
  actions,
  requiredTier = 'tier1',
}: {
  role: RoleViewKey;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  requiredTier?: RoleEnhanceTier;
}) {
  const enabled = isRoleEnhancementTierEnabled(requiredTier);
  const { user } = useUser();
  const { activeRole } = useRoleView();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || 'there';
  const contextLine = `${activeRole.label} · ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {title}
          </div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.45rem' }}>{greeting}, {firstName}</h1>
          <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{contextLine} · {subtitle}</div>
        </div>
      </div>
      <RoleContextStrip role={role} />

      {actions ? <div>{actions}</div> : null}
      {!enabled ? (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            This workstation section is currently behind rollout flag `{requiredTier}`.
          </div>
        </div>
      ) : children}
    </div>
  );
}
