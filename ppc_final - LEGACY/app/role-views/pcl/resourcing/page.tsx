'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function PclResourcingPage() {
  const { filteredData, data: fullData } = useData();

  const outliers = useMemo(() => {
    const employees = (filteredData?.employees?.length ? filteredData.employees : fullData?.employees) || [];
    const hours = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];

    const byEmployeeHours = new Map<string, number>();
    for (const hour of hours) {
      const row = asRecord(hour);
      const employeeId = String(row.employeeId || row.employee_id || row.resourceId || row.resource_id || '');
      if (!employeeId) continue;
      const value = Number(row.hours || row.quantity || 0);
      byEmployeeHours.set(employeeId, (byEmployeeHours.get(employeeId) || 0) + (Number.isFinite(value) ? value : 0));
    }

    return employees.map((employee) => {
      const row = asRecord(employee);
      const employeeId = String(row.id || row.employeeId || '');
      const name = String(row.name || row.employeeName || row.displayName || employeeId || 'Employee');
      const hoursValue = byEmployeeHours.get(employeeId) || 0;
      const utilization = Math.round((hoursValue / 40) * 100);
      return { employeeId, name, utilization, hoursValue };
    }).filter((row) => row.utilization > 100 || (row.utilization > 0 && row.utilization < 60))
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 15);
  }, [filteredData?.employees, filteredData?.hours, fullData?.employees, fullData?.hours]);

  const summary = useMemo(() => ({
    overUtilized: outliers.filter((row) => row.utilization > 100).length,
    underUtilized: outliers.filter((row) => row.utilization > 0 && row.utilization < 60).length,
    outlierCount: outliers.length,
  }), [outliers]);

  return (
    <RoleWorkstationShell role="pcl" requiredTier="tier1" title="Resourcing" subtitle="Portfolio staffing coordination and capacity balancing.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Over-Utilized (&gt;100%)</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.overUtilized > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overUtilized}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Under-Utilized (&lt;60%)</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.underUtilized > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.underUtilized}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Outliers in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.outlierCount}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Employee</span><span>Hours</span><span>Utilization</span>
        </div>
        {outliers.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No utilization outliers detected in scope.</div>
        ) : outliers.map((row) => (
          <div key={row.employeeId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.name}</span>
            <span>{row.hoursValue.toFixed(1)}</span>
            <span style={{ color: row.utilization > 100 ? '#EF4444' : '#F59E0B' }}>{row.utilization}%</span>
          </div>
        ))}
      </div>
      <Link href="/project-controls/resourcing" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Full Resourcing Workspace</Link>
    </RoleWorkstationShell>
  );
}
