'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function ProjectLeadTeamPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const employees = ((filteredData?.employees?.length ? filteredData.employees : fullData?.employees) || []).map(asRecord);
    const tasks = ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord);
    const hours = ((filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || []).map(asRecord);

    const assignmentsByEmployee = new Map<string, number>();
    for (const task of tasks) {
      const employeeId = String(task.resource_id || task.resourceId || task.employeeId || '').trim();
      if (!employeeId) continue;
      assignmentsByEmployee.set(employeeId, (assignmentsByEmployee.get(employeeId) || 0) + 1);
    }

    const hoursByEmployee = new Map<string, number>();
    for (const hour of hours) {
      const employeeId = String(hour.employee_id || hour.employeeId || hour.resource_id || hour.resourceId || '').trim();
      if (!employeeId) continue;
      hoursByEmployee.set(employeeId, (hoursByEmployee.get(employeeId) || 0) + num(hour.hours || hour.quantity));
    }

    return employees.map((employee) => {
      const employeeId = String(employee.id || employee.employeeId || '');
      const name = String(employee.name || employee.employeeName || employee.displayName || employeeId || 'Employee');
      const assignedTasks = assignmentsByEmployee.get(employeeId) || 0;
      const loggedHours = hoursByEmployee.get(employeeId) || 0;
      const utilization = Math.round((loggedHours / 40) * 100);
      return { employeeId, name, assignedTasks, loggedHours, utilization };
    }).sort((a, b) => b.assignedTasks - a.assignedTasks).slice(0, 40);
  }, [filteredData?.employees, filteredData?.hours, filteredData?.tasks, fullData?.employees, fullData?.hours, fullData?.tasks]);

  const summary = useMemo(() => ({
    employees: rows.length,
    overloaded: rows.filter((row) => row.utilization > 100).length,
    unassignedCapacity: rows.filter((row) => row.assignedTasks === 0).length,
  }), [rows]);

  return (
    <RoleWorkstationShell role="project_lead" title="Team" subtitle="Team workload visibility and assignment readiness for owned project scope.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Team Members</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.employees}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Over-Utilized</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.overloaded > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overloaded}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Assigned Tasks</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.unassignedCapacity > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.unassignedCapacity}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 120px 120px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Team Member</span><span>Assigned</span><span>Hours</span><span>Utilization</span><span>Actions</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No team rows in scope.</div>
        ) : rows.map((row) => (
          <div key={row.employeeId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 120px 120px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.name}</span>
            <span>{row.assignedTasks}</span>
            <span>{row.loggedHours.toFixed(1)}</span>
            <span style={{ color: row.utilization > 100 ? '#EF4444' : row.utilization < 60 && row.assignedTasks > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{row.utilization}%</span>
            <Link href="/project-controls/resourcing" style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>Rebalance</Link>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
