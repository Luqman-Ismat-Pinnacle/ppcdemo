'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import OffenderList from '@/components/command-center/OffenderList';

type ClientSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    projectStatus: { projectId: string; projectName: string; plainStatus: string; percentComplete: number; scheduleStatus: string };
    milestones: Array<{ id: string; name: string; status: string; plannedDate: string; actualDate: string }>;
    deliverables: Array<{ id: string; name: string; status: string; updatedAt: string }>;
    upcomingWork: string[];
  };
};

export default function ClientPortalCommandCenterPage() {
  const [payload, setPayload] = useState<ClientSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/client-portal/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as ClientSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <RoleWorkstationShell role="client_portal" title="Client Command Center" subtitle="Client-safe project status, milestones, deliverables, and upcoming work.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="Project Status Card" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{payload?.sections.projectStatus.projectName || 'Project'}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{payload?.sections.projectStatus.plainStatus || 'Status unavailable'}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{payload?.sections.projectStatus.percentComplete || 0}% complete</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{payload?.sections.projectStatus.scheduleStatus || ''}</div>
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="Milestones">
            <OffenderList
              rows={(payload?.sections.milestones || []).map((row) => ({
                id: row.id,
                label: `${row.name} · ${row.status}`,
                value: row.plannedDate || 'TBD',
                href: '/role-views/client-portal/milestones',
              }))}
              empty="No client-visible milestones."
            />
          </CommandCenterSection>

          <CommandCenterSection title="Recent Deliverables">
            <OffenderList
              rows={(payload?.sections.deliverables || []).map((row) => ({
                id: row.id,
                label: `${row.name} · ${row.status}`,
                value: row.updatedAt || 'Unknown',
                href: '/role-views/client-portal/updates',
              }))}
              empty="No client-safe deliverables."
            />
          </CommandCenterSection>
        </div>

        <CommandCenterSection title="Upcoming Work">
          <OffenderList
            rows={(payload?.sections.upcomingWork || []).map((row, index) => ({ id: `${index}`, label: row, value: '' }))}
            empty="No upcoming work narrative available."
          />
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
