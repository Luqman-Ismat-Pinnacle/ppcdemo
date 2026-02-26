'use client';

/**
 * @fileoverview PCA workstation home.
 *
 * Surfaces today's queue with direct actions for mapping, plan uploads, and data quality.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import { useData } from '@/lib/data-context';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { DataQualityIssue, RoleQueueItem } from '@/types/role-workstation';

type QueueStats = {
  unmappedHours: number;
  overduePlans: number;
  dataIssues: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function PcaRoleHomePage() {
  const { filteredData, data: fullData } = useData();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingIssues(true);
      try {
        const res = await fetch('/api/data-quality/issues?scope=assigned&limit=100', {
          cache: 'no-store',
          headers: {
            'x-role-view': activeRole.key,
            'x-actor-email': user?.email || '',
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && payload.success) {
          setIssues(Array.isArray(payload.issues) ? payload.issues : []);
        }
      } finally {
        if (!cancelled) setLoadingIssues(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.email]);

  const stats = useMemo<QueueStats>(() => {
    const docs = (filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
      || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
      || [];
    const hours = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];

    const mappedHours = hours.filter((entry) => {
      const row = asRecord(entry);
      const taskId = String(row.taskId || row.task_id || '').trim();
      return Boolean(taskId);
    });
    const unmappedHours = Math.max(0, hours.length - mappedHours.length);

    const byProjectLatest = new Map<string, number>();
    for (const doc of docs) {
      const row = asRecord(doc);
      const projectId = String(row.projectId || row.project_id || '');
      if (!projectId) continue;
      const date = new Date(String(row.lastUploadedAt || row.last_uploaded_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at || ''));
      if (!Number.isFinite(date.getTime())) continue;
      const ts = date.getTime();
      byProjectLatest.set(projectId, Math.max(ts, byProjectLatest.get(projectId) || 0));
    }
    let overduePlans = 0;
    for (const ts of byProjectLatest.values()) {
      const days = Math.floor((Date.now() - ts) / 86400000);
      if (days > 14) overduePlans += 1;
    }
    return { unmappedHours, overduePlans, dataIssues: issues.length };
  }, [filteredData?.hours, filteredData?.projectDocumentRecords, filteredData?.projectDocuments, fullData?.hours, fullData?.projectDocumentRecords, fullData?.projectDocuments, issues.length]);

  const queue = useMemo<RoleQueueItem[]>(() => {
    const items: RoleQueueItem[] = [];
    if (stats.dataIssues > 0) {
      items.push({
        id: 'q_data_critical',
        queueType: 'data_quality',
        severity: 'critical',
        projectId: null,
        projectName: null,
        description: `${stats.dataIssues} data quality issue(s) need triage`,
        metricValue: stats.dataIssues,
        actionHref: '/role-views/pca/data-quality',
        actionLabel: 'Fix Issues',
      });
    }
    if (stats.overduePlans > 0) {
      items.push({
        id: 'q_overdue_plans',
        queueType: 'plan_upload',
        severity: 'warning',
        projectId: null,
        projectName: null,
        description: `${stats.overduePlans} project(s) have plan uploads overdue by >14 days`,
        metricValue: stats.overduePlans,
        actionHref: '/role-views/pca/plan-uploads',
        actionLabel: 'Upload Plans',
      });
    }
    if (stats.unmappedHours > 0) {
      items.push({
        id: 'q_unmapped_hours',
        queueType: 'mapping',
        severity: stats.unmappedHours > 100 ? 'critical' : 'warning',
        projectId: null,
        projectName: null,
        description: `${stats.unmappedHours} hour entries are still unmapped`,
        metricValue: stats.unmappedHours,
        actionHref: '/role-views/pca/mapping',
        actionLabel: 'Map Hours',
      });
    }
    return items;
  }, [stats.dataIssues, stats.overduePlans, stats.unmappedHours]);

  return (
    <RoleWorkstationShell
      role="pca"
      title="PCA Workstation"
      subtitle="Assigned-project operations: mapping, data quality, MPP parser publish, and scoped WBS edits."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Upload + Parser', href: '/role-views/pca/plan-uploads', permission: 'uploadPlans' },
            { label: 'Open Mapping Queue', href: '/role-views/pca/mapping', permission: 'editMapping' },
            { label: 'Open Data Quality', href: '/role-views/pca/data-quality', permission: 'editMapping' },
            { label: 'Open WBS', href: '/role-views/pca/wbs', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Unmapped Hours</div>
          <div style={{ marginTop: 4, fontSize: '1.22rem', fontWeight: 800 }}>{stats.unmappedHours}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Overdue Plan Uploads</div>
          <div style={{ marginTop: 4, fontSize: '1.22rem', fontWeight: 800 }}>{stats.overduePlans}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Data Issues</div>
          <div style={{ marginTop: 4, fontSize: '1.22rem', fontWeight: 800 }}>{stats.dataIssues}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Today&apos;s Priority Queue
        </div>
        {loadingIssues ? (
          <div style={{ padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading queue...</div>
        ) : queue.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No urgent items right now.</div>
        ) : queue.map((item) => (
          <div key={item.id} style={{ padding: '0.6rem 0.7rem', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '110px 1fr 120px', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.7rem', color: item.severity === 'critical' ? '#EF4444' : item.severity === 'warning' ? '#F59E0B' : 'var(--text-muted)' }}>
              {item.queueType.replace('_', ' ')}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{item.description}</span>
            <Link href={item.actionHref} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', justifySelf: 'end' }}>{item.actionLabel}</Link>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
