'use client';

/**
 * @fileoverview Client Portal view (Phase 7.6).
 *
 * External-facing delivery snapshot with project-level status, KPI provenance,
 * and latest shared document activity.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import { calcCpi, calcHealthScore, calcHoursVariancePct, calcSpi } from '@/lib/calculations/kpis';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default function ClientPortalRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const projects = useMemo(() => {
    const rawProjects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return rawProjects.map((project) => {
      const p = asRecord(project);
      const id = String(p.id || p.projectId || '');
      return {
        id,
        name: String(p.name || p.id || p.projectId || 'Unnamed Project'),
      };
    }).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const scoped = useMemo(() => {
    const tasksRaw = ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[];
    const docsRaw = ((filteredData?.projectDocumentRecords?.length
      ? filteredData.projectDocumentRecords
      : fullData?.projectDocumentRecords) || []) as unknown[];

    const selectedId = selectedProjectId || (projects[0]?.id || '');

    const tasks = tasksRaw
      .map(asRecord)
      .filter((task) => String(task.projectId || task.project_id || '') === selectedId);

    const docs = docsRaw
      .map(asRecord)
      .filter((doc) => String(doc.projectId || doc.project_id || '') === selectedId)
      .sort((a, b) => {
        const ad = new Date(String(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0)).getTime();
        const bd = new Date(String(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0)).getTime();
        return bd - ad;
      });

    return { selectedId, tasks, docs };
  }, [filteredData?.tasks, filteredData?.projectDocumentRecords, fullData?.tasks, fullData?.projectDocumentRecords, projects, selectedProjectId]);

  const metrics = useMemo(() => {
    const baselineHours = scoped.tasks.reduce((sum, task) => sum + toNumber(task.baselineHours || task.baseline_hours), 0);
    const actualHours = scoped.tasks.reduce((sum, task) => sum + toNumber(task.actualHours || task.actual_hours), 0);
    const earnedValue = scoped.tasks.reduce((sum, task) => {
      const baseline = toNumber(task.baselineHours || task.baseline_hours);
      const pct = Math.max(0, Math.min(1, toNumber(task.percentComplete || task.percent_complete) / 100));
      return sum + baseline * pct;
    }, 0);

    const spi = calcSpi(earnedValue, baselineHours, 'client-portal', 'active-project');
    const cpi = calcCpi(earnedValue, actualHours, 'client-portal', 'active-project');
    const variance = calcHoursVariancePct(actualHours, baselineHours, 'client-portal', 'active-project');
    const health = calcHealthScore(spi.value, cpi.value, 'client-portal', 'active-project');

    const completedTasks = scoped.tasks.filter((task) => toNumber(task.percentComplete || task.percent_complete) >= 100).length;

    return {
      baselineHours,
      actualHours,
      completedTasks,
      totalTasks: scoped.tasks.length,
      spi,
      cpi,
      variance,
      health,
    };
  }, [scoped.tasks]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role View</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>Client Portal</h1>
          <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Read-only delivery summary and latest project documentation.
          </div>
        </div>
        <Link href="/role-views" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Back to role views</Link>
      </div>

      <div style={{ maxWidth: 360 }}>
        <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Project</label>
        <select
          value={scoped.selectedId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Health Score', value: `${metrics.health.value}%`, provenance: metrics.health.provenance },
          { label: 'SPI', value: metrics.spi.value.toFixed(2), provenance: metrics.spi.provenance },
          { label: 'CPI', value: metrics.cpi.value.toFixed(2), provenance: metrics.cpi.provenance },
          { label: 'Hours Variance', value: `${metrics.variance.value}%`, provenance: metrics.variance.provenance },
          { label: 'Tasks Completed', value: `${metrics.completedTasks}/${metrics.totalTasks}` },
          { label: 'Actual vs Baseline', value: `${metrics.actualHours.toFixed(1)}h / ${metrics.baselineHours.toFixed(1)}h` },
        ].map((item) => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {item.label}
              {'provenance' in item && item.provenance ? <MetricProvenanceChip provenance={item.provenance} /> : null}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem', minHeight: 0 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', maxHeight: 350, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>Open Delivery Items</div>
          {scoped.tasks.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No tasks found for selected project.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>
              {scoped.tasks
                .filter((task) => toNumber(task.percentComplete || task.percent_complete) < 100)
                .sort((a, b) => toNumber(b.baselineHours || b.baseline_hours) - toNumber(a.baselineHours || a.baseline_hours))
                .slice(0, 14)
                .map((task, index) => (
                  <div key={`${String(task.id || task.taskId || index)}`} style={{ padding: '0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{String(task.name || task.taskName || task.id || 'Unnamed Task')}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {toNumber(task.percentComplete || task.percent_complete).toFixed(0)}% complete · {toNumber(task.baselineHours || task.baseline_hours).toFixed(1)}h baseline
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', maxHeight: 350, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>Latest Documents</div>
          {scoped.docs.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No project documents in current scope.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {scoped.docs.slice(0, 12).map((doc, index) => (
                <div key={`${String(doc.id || index)}`} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 600 }}>{String(doc.name || doc.docType || 'Document')}</div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {String(doc.status || 'unknown')} · updated {new Date(String(doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at || Date.now())).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
