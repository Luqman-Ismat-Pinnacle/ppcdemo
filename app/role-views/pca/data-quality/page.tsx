'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import { useData } from '@/lib/data-context';

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

export default function PcaDataQualityPage() {
  const { filteredData, data } = useData();
  const source = filteredData || data;

  const metrics = useMemo(() => {
    const tasks = source?.tasks ?? [];
    const hours = source?.hours ?? [];
    const projects = source?.projects ?? [];

    const missingAssignment = tasks.filter(
      (t) => !t.assignedResourceId && !t.employeeId,
    );

    const predecessorSet = new Set(
      tasks.filter((t) => t.predecessorId).map((t) => t.taskId),
    );
    const missingPredecessors = tasks.filter((t) => !t.predecessorId);

    const unmappedHours = hours.filter((h) => !h.taskId);

    const totalTasks = tasks.length;
    const totalHours = hours.length;
    const withAssignment = totalTasks - missingAssignment.length;
    const withPredecessors = predecessorSet.size;
    const mappedHours = totalHours - unmappedHours.length;
    const denominator = totalTasks + totalTasks + totalHours;
    const completenessScore =
      denominator > 0
        ? ((withAssignment + withPredecessors + mappedHours) / denominator) * 100
        : 100;

    const projectMap = new Map<string, { name: string; missingAssignments: number; missingPredecessors: number; unmappedHours: number }>();
    for (const p of projects) {
      projectMap.set(p.projectId, { name: asString(p.name || p.projectId), missingAssignments: 0, missingPredecessors: 0, unmappedHours: 0 });
    }

    for (const t of missingAssignment) {
      const entry = projectMap.get(t.projectId);
      if (entry) entry.missingAssignments++;
    }
    for (const t of missingPredecessors) {
      const entry = projectMap.get(t.projectId);
      if (entry) entry.missingPredecessors++;
    }
    for (const h of unmappedHours) {
      const entry = projectMap.get(h.projectId);
      if (entry) entry.unmappedHours++;
    }

    const projectRows = Array.from(projectMap.entries())
      .map(([id, row]) => {
        const total = row.missingAssignments + row.missingPredecessors + row.unmappedHours;
        const projTasks = tasks.filter((t) => t.projectId === id);
        const projHours = hours.filter((h) => h.projectId === id);
        const projTotalTasks = projTasks.length;
        const projTotalHours = projHours.length;
        const projWithAssignment = projTasks.filter((t) => t.assignedResourceId || t.employeeId).length;
        const projWithPredecessors = projTasks.filter((t) => t.predecessorId).length;
        const projMappedHours = projHours.filter((h) => h.taskId).length;
        const projDenom = projTotalTasks + projTotalTasks + projTotalHours;
        const completeness = projDenom > 0 ? ((projWithAssignment + projWithPredecessors + projMappedHours) / projDenom) * 100 : 100;
        return { id, ...row, total, completeness };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);

    return {
      missingAssignmentCount: missingAssignment.length,
      missingPredecessorsCount: missingPredecessors.length,
      unmappedHoursCount: unmappedHours.length,
      completenessScore,
      projectRows,
    };
  }, [source]);

  const scoreColor = (pct: number) =>
    pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';

  const kpiCards: { label: string; value: number | string; color?: string }[] = [
    { label: 'Tasks Missing Assignment', value: metrics.missingAssignmentCount, color: metrics.missingAssignmentCount > 0 ? '#EF4444' : '#10B981' },
    { label: 'Tasks Without Predecessors', value: metrics.missingPredecessorsCount, color: metrics.missingPredecessorsCount > 0 ? '#F59E0B' : '#10B981' },
    { label: 'Unmapped Hours', value: metrics.unmappedHoursCount, color: metrics.unmappedHoursCount > 0 ? '#EF4444' : '#10B981' },
    { label: 'Data Completeness Score', value: `${metrics.completenessScore.toFixed(1)}%`, color: scoreColor(metrics.completenessScore) },
  ];

  return (
    <RoleWorkstationShell role="pca" title="Data Quality" subtitle="Data completeness and integrity checks for assigned projects.">
      <div style={{ display: 'grid', gap: '0.75rem' }}>

        <CommandCenterSection title="Overall Quality">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.55rem' }}>
            {kpiCards.map((card) => (
              <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
                <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        </CommandCenterSection>

        <CommandCenterSection title="Issues by Project" status={`Top ${metrics.projectRows.length}`}>
          {metrics.projectRows.length === 0 ? (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>No data quality issues found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 0, minWidth: 560 }}>
                {['Project', 'Missing Assign.', 'Missing Pred.', 'Unmapped Hrs', 'Completeness'].map((h) => (
                  <div key={h} style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>{h}</div>
                ))}
                {metrics.projectRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <div style={{ fontSize: '0.74rem', padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>
                      <Link href="/shared/data-management" style={{ color: 'var(--text-link)', textDecoration: 'none' }}>{row.name}</Link>
                    </div>
                    <div style={{ fontSize: '0.74rem', padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>{row.missingAssignments}</div>
                    <div style={{ fontSize: '0.74rem', padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>{row.missingPredecessors}</div>
                    <div style={{ fontSize: '0.74rem', padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>{row.unmappedHours}</div>
                    <div style={{ fontSize: '0.74rem', padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border-color)', fontWeight: 700, color: scoreColor(row.completeness) }}>
                      {row.completeness.toFixed(1)}%
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </CommandCenterSection>

        <CommandCenterSection title="Quick Actions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[
              { label: 'Open Data Management', href: '/shared/data-management' },
              { label: 'Open Mapping', href: '/shared/mapping' },
              { label: 'Upload Plans', href: '/shared/project-plans' },
            ].map((action) => (
              <Link key={action.href} href={action.href} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem 1rem', fontSize: '0.76rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                {action.label}
              </Link>
            ))}
          </div>
        </CommandCenterSection>

      </div>
    </RoleWorkstationShell>
  );
}
