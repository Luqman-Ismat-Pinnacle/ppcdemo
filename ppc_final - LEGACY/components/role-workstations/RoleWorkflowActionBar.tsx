'use client';

/**
 * @fileoverview Shared action bar for role workstation workflow actions.
 */

import React from 'react';
import Link from 'next/link';
import { useRoleView } from '@/lib/role-view-context';
import { getWorkflowPermissions } from '@/lib/workflow-permissions';

interface ActionItem {
  label: string;
  href?: string;
  onClick?: () => void;
  permission: keyof ReturnType<typeof getWorkflowPermissions>;
}

export default function RoleWorkflowActionBar({ actions }: { actions: ActionItem[] }) {
  const { activeRole } = useRoleView();
  const permissions = getWorkflowPermissions(activeRole.key);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
      {actions.map((action) => {
        const enabled = Boolean(permissions[action.permission]);
        const commonStyle: React.CSSProperties = {
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: enabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
          color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
          padding: '0.42rem 0.62rem',
          fontSize: '0.73rem',
          textDecoration: 'none',
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.65,
        };

        if (action.href) {
          return (
            <Link key={action.label} href={enabled ? action.href : '#'} style={commonStyle} aria-disabled={!enabled}>
              {action.label}
            </Link>
          );
        }

        return (
          <button
            key={action.label}
            type="button"
            onClick={enabled ? action.onClick : undefined}
            disabled={!enabled}
            style={commonStyle}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
