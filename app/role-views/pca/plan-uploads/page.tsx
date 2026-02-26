'use client';

/**
 * @fileoverview PCA plan upload workstation route.
 *
 * Provides upload/publish readiness summary and direct entry into MPP processing.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as unknown as Record<string, unknown>) : {};
}

function hasPlan(project: Record<string, unknown>, projectIdsWithDocs: Set<string>): boolean {
  const rawHasSchedule = project.has_schedule ?? project.hasSchedule;
  const hasSchedule = rawHasSchedule === true || rawHasSchedule === 1 || String(rawHasSchedule || '').toLowerCase() === 'true' || String(rawHasSchedule || '') === '1';
  const projectId = String(project.id ?? project.projectId ?? '');
  return hasSchedule || Boolean(projectId && projectIdsWithDocs.has(projectId));
}

export default function PcaPlanUploadsPage() {
  const { filteredData, data: fullData } = useData();

  const metrics = useMemo(() => {
    const sourceProjects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    const sourceDocs = (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments) || [];
    const projectIdsWithDocs = new Set(
      sourceDocs
        .map((doc) => {
          const row = readRecord(doc);
          return String(row.projectId ?? row.project_id ?? '');
        })
        .filter(Boolean),
    );

    const projects = sourceProjects.map((project) => readRecord(project));
    const withPlan = projects.filter((project) => hasPlan(project, projectIdsWithDocs)).length;
    const withoutPlan = Math.max(0, projects.length - withPlan);

    return { totalProjects: projects.length, withPlan, withoutPlan };
  }, [filteredData?.projectDocuments, filteredData?.projects, fullData?.projectDocuments, fullData?.projects]);

  return (
    <RoleWorkstationShell
      role="pca"
      title="Plan Uploads"
      subtitle="Upload, parse, reconcile, and publish project plans with audit-backed workflow."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/project-plans" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Upload + Parser</Link>
          <Link href="/role-views/pca-workspace" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Mapping Workspace</Link>
          <Link href="/role-views/pca/data-quality" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Data Quality</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Projects in Scope', value: metrics.totalProjects },
          { label: 'Projects with Plan', value: metrics.withPlan },
          { label: 'Projects Missing Plan', value: metrics.withoutPlan },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
