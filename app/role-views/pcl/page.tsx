'use client';

/**
 * @fileoverview PCL command center workstation page.
 */

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';
import ComplianceMatrix, { type ComplianceMatrixRow } from '@/components/role-workstations/ComplianceMatrix';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

export default function PclHomePage() {
  const [rows, setRows] = useState<ComplianceMatrixRow[]>([]);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/compliance/matrix?limit=20', {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.email]);

  return (
    <RoleWorkstationShell
      role="pcl"
      title="PCL Command Center"
      subtitle="Compliance posture, schedule exceptions, and portfolio intervention queue."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Exceptions', href: '/role-views/pcl/exceptions', permission: 'triageExceptions' },
            { label: 'Plans + Mapping', href: '/role-views/pcl/plans-mapping', permission: 'editMapping' },
            { label: 'WBS Risk Queue', href: '/role-views/pcl/wbs', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Open Issues',
            formulaId: 'PCL_OPEN_ISSUES_V1',
            formula: 'Count(tasks where start/finish dates missing)',
            sources: ['tasks'],
            scope: 'portfolio projects in current role lens',
            window: 'current snapshot',
          },
          {
            metric: 'Overdue Tasks',
            formulaId: 'PCL_OVERDUE_TASKS_V1',
            formula: 'Count(tasks where %complete < 100 and finish_date < today)',
            sources: ['tasks'],
            scope: 'portfolio projects in current role lens',
            window: 'current day',
          },
          {
            metric: 'Health Score',
            formulaId: 'PCL_HEALTH_PROXY_V1',
            formula: '100 - (open_issues*10) - (overdue_tasks*2), floored at 0',
            sources: ['tasks'],
            scope: 'per project, command-center matrix',
            window: 'current snapshot',
          },
        ]}
      />
      <ComplianceMatrix rows={rows} />
    </RoleWorkstationShell>
  );
}
