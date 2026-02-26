'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function PclWbsPage() {
  const { filteredData, data: fullData } = useData();

  const riskRows = useMemo(() => {
    const tasks = ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord);
    return tasks
      .filter((task) => {
        const progress = num(task.percentComplete ?? task.percent_complete);
        if (progress >= 100) return false;
        const isCritical = String(task.isCriticalPath || task.is_critical_path || '').toLowerCase() === 'true' || num(task.totalFloat ?? task.total_float) <= 0;
        const dueRaw = task.finishDate ?? task.finish_date ?? task.endDate ?? task.end_date;
        const due = dueRaw ? new Date(String(dueRaw)) : null;
        const overdue = due && Number.isFinite(due.getTime()) && due.getTime() < Date.now();
        return isCritical || overdue;
      })
      .map((task) => ({
        id: String(task.id || task.taskId || ''),
        taskName: String(task.name || task.taskName || task.id || 'Task'),
        projectId: String(task.projectId || task.project_id || '-'),
        floatDays: num(task.totalFloat ?? task.total_float),
        lastActivity: String(task.updatedAt || task.updated_at || task.modifiedAt || task.modified_at || '-'),
      }))
      .sort((a, b) => a.floatDays - b.floatDays)
      .slice(0, 30);
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="pcl"
      requiredTier="tier3"
      title="Portfolio WBS Risk Queue"
      subtitle="Cross-project schedule intervention and escalation controls."
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Critical Risk Queue
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 120px 100px 130px 120px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Task</span><span>Project</span><span>Float</span><span>Last Activity</span><span>Action</span>
        </div>
        {riskRows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No critical risk rows in current scope.</div>
        ) : riskRows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 120px 100px 130px 120px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.taskName}</span>
            <span>{row.projectId}</span>
            <span style={{ color: row.floatDays <= 0 ? '#EF4444' : '#F59E0B' }}>{row.floatDays.toFixed(1)}</span>
            <span>{row.lastActivity}</span>
            <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>Open WBS</Link>
          </div>
        ))}
      </div>
      <RoleScopedWbsWorkspace role="pcl" />
    </RoleWorkstationShell>
  );
}
