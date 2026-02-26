'use client';

/**
 * @fileoverview Role-specific context strip for workstation shells.
 */

import React, { useMemo } from 'react';
import { useData } from '@/lib/data-context';
import type { RoleViewKey } from '@/types/role-workstation';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

export default function RoleContextStrip({ role }: { role: RoleViewKey }) {
  const { filteredData, data: fullData } = useData();
  const filteredDataRecord = filteredData as unknown as Record<string, unknown>;
  const fullDataRecord = fullData as unknown as Record<string, unknown>;

  const source = useMemo(() => ({
    projects: (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [],
    tasks: (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [],
    hours: (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [],
    alerts: ((filteredDataRecord.alerts as unknown[])?.length
      ? (filteredDataRecord.alerts as unknown[])
      : ((fullDataRecord.alerts as unknown[]) || [])),
    docs: (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments) || [],
  }), [filteredData, fullData, filteredDataRecord, fullDataRecord]);

  const chips = useMemo(() => {
    const projects = source.projects as unknown as Array<Record<string, unknown>>;
    const tasks = source.tasks as unknown as Array<Record<string, unknown>>;
    const hours = source.hours as unknown as Array<Record<string, unknown>>;
    const alerts = source.alerts as unknown as Array<Record<string, unknown>>;
    const docs = source.docs as unknown as Array<Record<string, unknown>>;
    const now = Date.now();
    const staleCutoff = now - (14 * 24 * 60 * 60 * 1000);

    const openAlerts = alerts.filter((a) => !(a.acknowledgedAt || a.acknowledged_at)).length;
    const overdueTasks = tasks.filter((t) => {
      const pct = toNumber(t.percentComplete ?? t.percent_complete);
      if (pct >= 100) return false;
      const finish = parseDate(t.finishDate ?? t.finish_date ?? t.endDate ?? t.end_date);
      return Boolean(finish && finish.getTime() < now);
    }).length;
    const unmappedHours = hours.filter((h) => !(h.taskId || h.task_id)).reduce((sum, h) => sum + toNumber(h.hours), 0);
    const staleDocs = docs.filter((d) => {
      const uploaded = parseDate(d.updatedAt ?? d.updated_at ?? d.uploadedAt ?? d.uploaded_at);
      return !uploaded || uploaded.getTime() < staleCutoff;
    }).length;

    if (role === 'pcl') {
      return [
        { label: 'Projects', value: String(projects.length) },
        { label: 'Open Exceptions', value: String(openAlerts) },
        { label: 'Overdue Tasks', value: String(overdueTasks) },
      ];
    }
    if (role === 'pca') {
      return [
        { label: 'Projects In Scope', value: String(projects.length) },
        { label: 'Unmapped Hours', value: unmappedHours.toFixed(1) },
        { label: 'Plans Needing Refresh', value: String(staleDocs) },
      ];
    }
    if (role === 'project_lead') {
      return [
        { label: 'Owned Projects', value: String(projects.length) },
        { label: 'Open Tasks', value: String(tasks.length - tasks.filter((t) => toNumber(t.percentComplete ?? t.percent_complete) >= 100).length) },
        { label: 'Stale Docs', value: String(staleDocs) },
      ];
    }
    if (role === 'senior_manager' || role === 'coo') {
      return [
        { label: 'Portfolio Projects', value: String(projects.length) },
        { label: 'Open Alerts', value: String(openAlerts) },
        { label: 'Overdue Tasks', value: String(overdueTasks) },
      ];
    }
    if (role === 'rda') {
      return [
        { label: 'Task Lane', value: String(tasks.length) },
        { label: 'My Overdue', value: String(overdueTasks) },
        { label: 'Hours Logged', value: hours.reduce((sum, h) => sum + toNumber(h.hours), 0).toFixed(1) },
      ];
    }
    return [{ label: 'Projects', value: String(projects.length) }];
  }, [role, source]);

  const identity = useMemo(() => {
    if (role === 'coo') return 'Chief Operating Officer | All Portfolios';
    if (role === 'senior_manager') return 'Senior Manager | Active Portfolio Scope';
    if (role === 'project_lead') return 'Project Lead | Active Customer and Project Scope';
    if (role === 'pca') return 'Project Controls Analyst | Assigned Project Operations';
    if (role === 'pcl') return 'Project Controls Lead | Portfolio Command Scope';
    if (role === 'rda') return 'RDA | Personal Task Execution Lane';
    if (role === 'client_portal') return 'Client Portal | Delivery Visibility';
    return 'Product Owner | Global Role Simulation';
  }, [role]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{identity}</div>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {chips.map((chip) => (
          <div key={chip.label} style={{ border: '1px solid var(--border-color)', borderRadius: 999, background: 'var(--bg-secondary)', padding: '0.28rem 0.6rem', fontSize: '0.69rem', color: 'var(--text-secondary)' }}>
            <span style={{ opacity: 0.85 }}>{chip.label}:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{chip.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
