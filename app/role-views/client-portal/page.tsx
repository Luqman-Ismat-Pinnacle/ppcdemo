'use client';

/**
 * @fileoverview Client Portal role view.
 *
 * Client-safe delivery snapshot with visibility filters for milestones/documents.
 */

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';

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
      return { id, name: String(p.name || p.projectName || id || 'Project') };
    }).filter((project) => project.id);
  }, [filteredData?.projects, fullData?.projects]);

  const [selectedProjectId, setSelectedProjectId] = useState('');

  const scoped = useMemo(() => {
    const selectedId = selectedProjectId || (projects[0]?.id || '');
    const tasks = (((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[])
      .map(asRecord)
      .filter((task) => String(task.projectId || task.project_id || '') === selectedId);
    const docs = (((filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
      || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
      || []) as unknown[])
      .map(asRecord)
      .filter((doc) => String(doc.projectId || doc.project_id || '') === selectedId)
      .filter((doc) => {
        const status = String(doc.status || '').toLowerCase();
        return status.includes('customer_signed_off') || status.includes('signed off') || status.includes('in_review') || status.includes('pending client');
      })
      .sort((a, b) => {
        const ad = new Date(String(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0)).getTime();
        const bd = new Date(String(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0)).getTime();
        return bd - ad;
      });
    const milestones = (((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []) as unknown[])
      .map(asRecord)
      .filter((milestone) => String(milestone.projectId || milestone.project_id || '') === selectedId)
      .filter((milestone) => {
        const raw = milestone.is_client_visible ?? milestone.isClientVisible;
        return raw === true || raw === 1 || String(raw || '').toLowerCase() === 'true';
      });
    return { selectedId, tasks, docs, milestones };
  }, [filteredData?.milestones, filteredData?.projectDocumentRecords, filteredData?.projectDocuments, filteredData?.tasks, fullData?.milestones, fullData?.projectDocumentRecords, fullData?.projectDocuments, fullData?.tasks, projects, selectedProjectId]);

  const metrics = useMemo(() => {
    const baselineHours = scoped.tasks.reduce((sum, task) => sum + toNumber(task.baselineHours || task.baseline_hours), 0);
    const actualHours = scoped.tasks.reduce((sum, task) => sum + toNumber(task.actualHours || task.actual_hours), 0);
    const completedTasks = scoped.tasks.filter((task) => toNumber(task.percentComplete || task.percent_complete) >= 100).length;
    const totalTasks = scoped.tasks.length;
    const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const scheduleVarianceDays = scoped.tasks.reduce((sum, task) => sum + toNumber(task.varianceDays || task.variance_days || 0), 0);
    const projectStatus = percentComplete >= 85 ? 'On Track' : percentComplete >= 60 ? 'Watch' : 'Needs Attention';
    return {
      projectStatus,
      percentComplete,
      workPlannedVsDone: `${baselineHours.toFixed(1)}h / ${actualHours.toFixed(1)}h`,
      scheduleStatus: scheduleVarianceDays > 0 ? `+${Math.round(scheduleVarianceDays)} days` : 'On Track',
    };
  }, [scoped.tasks]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role View</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>Client Portal</h1>
        <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Client-facing project status, milestones, and approved document visibility.
        </div>
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
          { label: 'Project Status', value: metrics.projectStatus },
          { label: '% Complete', value: `${metrics.percentComplete}%` },
          { label: 'Work Planned vs Done', value: metrics.workPlannedVsDone },
          { label: 'Schedule Status', value: metrics.scheduleStatus },
        ].map((item) => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem', minHeight: 0 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>Your Key Milestones</div>
          {scoped.milestones.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No client-visible milestones configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {scoped.milestones.slice(0, 20).map((milestone, index) => (
                <div key={String(milestone.id || milestone.milestoneId || index)} style={{ padding: '0.52rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{String(milestone.name || milestone.milestoneName || 'Milestone')}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {String(milestone.status || 'Unknown')} · {String(milestone.dueDate || milestone.due_date || milestone.targetDate || milestone.target_date || '-')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.6rem' }}>Latest Documents</div>
          {scoped.docs.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No client-visible documents in current scope.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {scoped.docs.slice(0, 15).map((doc, index) => (
                <div key={`${String(doc.id || index)}`} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 600 }}>{String(doc.name || doc.documentName || doc.docType || 'Document')}</div>
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
