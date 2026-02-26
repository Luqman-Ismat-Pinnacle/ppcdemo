'use client';

/**
 * @fileoverview Product Owner command center.
 *
 * Global operational view for platform health, open issues/features, and
 * role/user coverage across the organization.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';

type AlertRow = {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedProjectId: string | null;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function ProductOwnerCommandCenterPage() {
  const { data } = useData();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch('/api/alerts?status=open&limit=100', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !payload.success) return;
        setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const tasks = useMemo(() => ((data?.tasks || []) as unknown[]).map(asRecord), [data?.tasks]);
  const employees = useMemo(() => ((data?.employees || []) as unknown[]).map(asRecord), [data?.employees]);
  const projects = useMemo(() => ((data?.projects || []) as unknown[]).map(asRecord), [data?.projects]);

  const features = useMemo(() => {
    const featureCandidates = tasks.filter((task) => {
      const name = String(task.name || task.taskName || '').toLowerCase();
      return name.includes('feature') || name.includes('enhancement') || name.includes('epic');
    });
    const source = featureCandidates.length > 0 ? featureCandidates : tasks;
    return source.map((task, idx) => ({
      id: String(task.id || task.taskId || idx),
      name: String(task.name || task.taskName || task.id || 'Task'),
      projectId: String(task.projectId || task.project_id || '-'),
      percentComplete: toNumber(task.percentComplete ?? task.percent_complete),
      owner: String(task.resourceName || task.owner || task.assignee || '-'),
    }));
  }, [tasks]);

  const openFeatures = useMemo(() => features.filter((feature) => feature.percentComplete < 100), [features]);

  const roleRows = useMemo(() => {
    return employees.map((employee, idx) => ({
      id: String(employee.id || employee.employeeId || idx),
      name: String(employee.name || employee.employeeName || 'Unknown'),
      email: String(employee.email || '-'),
      role: String(employee.role || employee.jobTitle || 'Unassigned'),
      department: String(employee.department || '-'),
      activeProjects: projects.filter((project) => {
        const manager = String(project.manager || project.owner || '').toLowerCase();
        const employeeName = String(employee.name || employee.employeeName || '').toLowerCase();
        return employeeName && manager && manager.includes(employeeName);
      }).length,
    }));
  }, [employees, projects]);

  const roleBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of roleRows) {
      map.set(row.role, (map.get(row.role) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [roleRows]);

  const summary = {
    openIssues: alerts.length,
    criticalIssues: alerts.filter((alert) => alert.severity === 'critical').length,
    openFeatures: openFeatures.length,
    people: roleRows.length,
  };

  return (
    <RoleWorkstationShell
      role="product_owner"
      requiredTier="tier1"
      title="Product Owner Command Center"
      subtitle="Global platform health, feature flow, role coverage, and cross-workstation control."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/role-views/pcl" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open PCL Command Center</Link>
          <Link href="/role-views/pca" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open PCA Command Center</Link>
          <Link href="/role-views/project-lead" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Project Lead Command Center</Link>
          <Link href="/project-controls/data-management" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Data Management</Link>
        </div>
      )}
    >
      <WorkstationLayout
        focus={(
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
              {[
                { label: 'Open Issues', value: summary.openIssues, danger: summary.openIssues > 0 },
                { label: 'Critical Issues', value: summary.criticalIssues, danger: summary.criticalIssues > 0 },
                { label: 'Open Features', value: summary.openFeatures },
                { label: 'People in System', value: summary.people },
              ].map((card) => (
                <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{card.label}</div>
                  <div style={{ marginTop: 4, fontSize: '1.24rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '0.75rem' }}>
              <div id="system-health" style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Open Issues Queue</div>
                {alerts.length === 0 ? (
                  <div style={{ padding: '0.72rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open issues.</div>
                ) : alerts.slice(0, 18).map((alert) => (
                  <div key={alert.id} style={{ padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : 'var(--text-primary)' }}>{alert.title}</div>
                    <div style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>{alert.message}</div>
                  </div>
                ))}
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Open Features</div>
                {openFeatures.length === 0 ? (
                  <div style={{ padding: '0.72rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open features found in current dataset.</div>
                ) : openFeatures.slice(0, 18).map((feature) => (
                  <div key={feature.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 100px 70px', gap: '0.45rem', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feature.name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{feature.projectId}</span>
                    <span>{feature.percentComplete.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div id="role-monitor" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Role Distribution</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.35rem 0.55rem', padding: '0.55rem 0.7rem', fontSize: '0.74rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Role</span><span style={{ color: 'var(--text-muted)' }}>People</span>
                  {roleBreakdown.map(([role, count]) => (
                    <React.Fragment key={role}>
                      <span>{role}</span><span>{count}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>People + Roles</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 120px', gap: '0.35rem 0.55rem', padding: '0.55rem 0.7rem', fontSize: '0.72rem', maxHeight: 320, overflowY: 'auto' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Person</span><span style={{ color: 'var(--text-muted)' }}>Role</span><span style={{ color: 'var(--text-muted)' }}>Dept</span>
                  {roleRows.slice(0, 120).map((row) => (
                    <React.Fragment key={row.id}>
                      <span title={row.email}>{row.name}</span>
                      <span>{row.role}</span>
                      <span>{row.department}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
