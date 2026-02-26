'use client';

/**
 * @fileoverview Project Lead commitments/report workflow page.
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { useUser } from '@/lib/user-context';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';

function currentPeriodKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function ProjectLeadReportPage() {
  const { filteredData, data: fullData } = useData();
  const { user } = useUser();
  const projects = useMemo(() => {
    const rows = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return rows.map((project) => {
      const p = project as unknown as Record<string, unknown>;
      return {
        id: String(p.id || p.projectId || ''),
        name: String(p.name || p.projectName || p.id || 'Unnamed Project'),
      };
    }).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '');
  const [commitmentText, setCommitmentText] = useState('');
  const [followthroughText, setFollowthroughText] = useState('');
  const [status, setStatus] = useState<'draft' | 'submitted'>('draft');
  const [message, setMessage] = useState('');

  const submit = async () => {
    const res = await fetch('/api/commitments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        periodKey: currentPeriodKey(),
        ownerRole: 'project_lead',
        authorEmployeeId: user?.employeeId || null,
        authorEmail: user?.email || null,
        commitmentText,
        followthroughText,
        status,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setMessage(payload.success ? 'Commitment saved.' : String(payload.error || 'Save failed'));
  };

  return (
    <RoleWorkstationShell role="project_lead" title="Report + Commitments" subtitle="Submit period narrative and commitments with auditable workflow status.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem', maxWidth: 980 }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Project</label>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ padding: '0.48rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>This Period Commitments</label>
        <textarea rows={5} value={commitmentText} onChange={(event) => setCommitmentText(event.target.value)} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Follow-through Notes</label>
        <textarea rows={4} value={followthroughText} onChange={(event) => setFollowthroughText(event.target.value)} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'submitted')} style={{ padding: '0.42rem 0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
            <option value="draft">Draft</option>
            <option value="submitted">Submit</option>
          </select>
          <button type="button" onClick={() => void submit()} style={{ padding: '0.42rem 0.7rem', borderRadius: 8, border: 'none', background: 'var(--pinnacle-teal)', color: '#06241f', fontWeight: 700 }}>Save</button>
          {message ? <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{message}</span> : null}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
