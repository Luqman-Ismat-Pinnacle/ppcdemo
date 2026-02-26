'use client';

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function RdaHoursPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const entries = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];
    return entries.slice(0, 80).map((entry, index) => {
      const row = asRecord(entry);
      const hours = Number(row.hours || row.quantity || 0);
      return {
        id: String(row.id || `${index}`),
        date: String(row.date || row.workDate || row.work_date || ''),
        projectId: String(row.projectId || row.project_id || '-'),
        taskId: String(row.taskId || row.task_id || ''),
        hours: Number.isFinite(hours) ? hours : 0,
      };
    });
  }, [filteredData?.hours, fullData?.hours]);

  const summary = useMemo(() => ({
    totalHours: rows.reduce((sum, row) => sum + row.hours, 0),
    unmapped: rows.filter((row) => !row.taskId).length,
  }), [rows]);

  return (
    <RoleWorkstationShell role="rda" title="Hours Lane" subtitle="Timesheet and execution-hour visibility in the active role scope.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Hours</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.totalHours.toFixed(1)}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Unmapped Entries</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.unmapped > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.unmapped}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 100px 110px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Date</span><span>Project</span><span>Task</span><span>Hours</span><span>Action</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No hour entries in scope.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 100px 110px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.date ? new Date(row.date).toLocaleDateString() : '-'}</span>
            <span>{row.projectId}</span>
            <span>{row.taskId || <span style={{ color: '#F59E0B' }}>Unmapped</span>}</span>
            <span>{row.hours.toFixed(1)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{row.taskId ? 'Review' : 'Map'}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
