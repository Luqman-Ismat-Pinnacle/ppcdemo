'use client';

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function CooPeriodReviewPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    const hours = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];
    const notes = (filteredData?.moPeriodNotes?.length ? filteredData.moPeriodNotes : fullData?.moPeriodNotes) || [];

    const hoursByProject = new Map<string, number>();
    for (const hour of hours) {
      const row = asRecord(hour);
      const projectId = String(row.projectId || row.project_id || '');
      if (!projectId) continue;
      const value = Number(row.hours || row.quantity || 0);
      hoursByProject.set(projectId, (hoursByProject.get(projectId) || 0) + (Number.isFinite(value) ? value : 0));
    }

    const noteCountByProject = new Map<string, number>();
    for (const note of notes) {
      const row = asRecord(note);
      const projectId = String(row.projectId || row.project_id || '');
      if (!projectId) continue;
      noteCountByProject.set(projectId, (noteCountByProject.get(projectId) || 0) + 1);
    }

    return projects.map((project) => {
      const row = asRecord(project);
      const projectId = String(row.id || row.projectId || '');
      return {
        projectId,
        projectName: String(row.name || row.projectName || projectId || 'Project'),
        customer: String(row.customer || row.customerName || row.customer_name || 'Unknown'),
        periodHours: Number((hoursByProject.get(projectId) || 0).toFixed(1)),
        periodNotes: noteCountByProject.get(projectId) || 0,
      };
    }).sort((a, b) => b.periodHours - a.periodHours).slice(0, 40);
  }, [filteredData?.hours, filteredData?.moPeriodNotes, filteredData?.projects, fullData?.hours, fullData?.moPeriodNotes, fullData?.projects]);

  const summary = useMemo(() => ({
    projectCount: rows.length,
    totalHours: rows.reduce((sum, row) => sum + row.periodHours, 0),
    totalNotes: rows.reduce((sum, row) => sum + row.periodNotes, 0),
  }), [rows]);

  return (
    <RoleWorkstationShell
      role="coo"
      title="Period Review"
      subtitle="Executive rollup context for period notes and operating snapshots."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Projects in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.projectCount}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Period Hours</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.totalHours.toFixed(1)}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Period Notes</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.totalNotes}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 130px 130px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Customer</span><span>Period Hours</span><span>Period Notes</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No period review rows available.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 130px 130px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.projectName}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{row.customer}</span>
            <span>{row.periodHours.toFixed(1)}</span>
            <span>{row.periodNotes}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
