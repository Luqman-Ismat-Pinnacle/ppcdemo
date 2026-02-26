'use client';

/**
 * @fileoverview Senior Manager team command surface.
 */

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SeniorManagerTeamPage() {
  const { filteredData, data: fullData } = useData();

  const employees = useMemo(
    () => ((filteredData?.employees?.length ? filteredData.employees : fullData?.employees) || []).map(asRecord),
    [filteredData?.employees, fullData?.employees],
  );
  const tasks = useMemo(
    () => ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord),
    [filteredData?.tasks, fullData?.tasks],
  );

  const rows = useMemo(() => {
    return employees.slice(0, 80).map((employee, index) => {
      const name = String(employee.name || employee.employeeName || `Employee ${index + 1}`);
      const owned = tasks.filter((task) => {
        const owner = String(task.resourceName || task.assignedTo || task.owner || '').toLowerCase();
        return owner.includes(name.toLowerCase());
      });
      const active = owned.filter((task) => toNumber(task.percentComplete ?? task.percent_complete) < 100).length;
      const overdue = owned.filter((task) => {
        const due = String(task.finishDate || task.finish_date || '');
        return due && Date.parse(due) < Date.now() && toNumber(task.percentComplete ?? task.percent_complete) < 100;
      }).length;
      return {
        id: String(employee.id || employee.employeeId || index),
        name,
        role: String(employee.role || employee.jobTitle || 'Unassigned'),
        active,
        overdue,
      };
    });
  }, [employees, tasks]);

  const totalOverdue = rows.reduce((sum, row) => sum + row.overdue, 0);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      requiredTier="tier1"
      title="Team"
      subtitle="Project lead and workforce pressure view with assignment-level signals."
    >
      <WorkstationLayout
        focus={(
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>People in Scope</div>
                <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{rows.length}</div>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Active Tasks</div>
                <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{rows.reduce((sum, row) => sum + row.active, 0)}</div>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Overdue Tasks</div>
                <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: totalOverdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{totalOverdue}</div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 90px 90px', gap: '0.5rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>Person</span>
                <span>Role</span>
                <span>Active</span>
                <span>Overdue</span>
              </div>
              {rows.length === 0 ? (
                <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No team rows in current scope.</div>
              ) : rows.map((row) => (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 90px 90px', gap: '0.5rem', padding: '0.52rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
                  <span>{row.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.role}</span>
                  <span>{row.active}</span>
                  <span style={{ color: row.overdue > 0 ? '#EF4444' : 'var(--text-secondary)' }}>{row.overdue}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
