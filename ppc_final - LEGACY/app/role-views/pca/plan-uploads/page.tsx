'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import { useData } from '@/lib/data-context';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

function freshnessColor(days: number | null): string {
  if (days === null) return '#EF4444';
  if (days <= 30) return '#10B981';
  if (days <= 60) return '#F59E0B';
  return '#EF4444';
}

function freshnessLabel(days: number | null): string {
  if (days === null) return 'No upload';
  if (days === 0) return 'Today';
  return `${days}d ago`;
}

type ProjectPlanRow = {
  projectId: string;
  projectName: string;
  lastUpload: Date | null;
  daysSinceUpload: number | null;
  documentCount: number;
  hasHealthCheck: boolean;
};

export default function PcaPlanUploadsPage() {
  const { filteredData, data } = useData();
  const source = filteredData || data;

  const rows = useMemo(() => {
    const projects = (source.projects || []).map(asRecord);
    const documents = (source.projectDocuments || []).map(asRecord);

    const docsByProject = new Map<string, { count: number; lastUpload: Date | null }>();
    for (const doc of documents) {
      const pid = asString(doc.projectId || doc.project_id);
      if (!pid) continue;
      const entry = docsByProject.get(pid) || { count: 0, lastUpload: null };
      entry.count++;
      const uploadedAt = doc.uploadedAt || doc.uploaded_at;
      if (uploadedAt) {
        const d = new Date(String(uploadedAt));
        if (Number.isFinite(d.getTime())) {
          if (!entry.lastUpload || d > entry.lastUpload) entry.lastUpload = d;
        }
      }
      docsByProject.set(pid, entry);
    }

    const now = new Date();
    const result: ProjectPlanRow[] = projects.map((p) => {
      const projectId = asString(p.id || p.projectId || p.project_id);
      const projectName = asString(p.name || p.projectNum || projectId);
      const docInfo = docsByProject.get(projectId);
      const lastUpload = docInfo?.lastUpload || null;
      const daysSinceUpload = lastUpload ? daysBetween(lastUpload, now) : null;
      return {
        projectId,
        projectName,
        lastUpload,
        daysSinceUpload,
        documentCount: docInfo?.count || 0,
        hasHealthCheck: false,
      };
    });

    result.sort((a, b) => {
      if (a.daysSinceUpload === null && b.daysSinceUpload === null) return 0;
      if (a.daysSinceUpload === null) return -1;
      if (b.daysSinceUpload === null) return 1;
      return b.daysSinceUpload - a.daysSinceUpload;
    });

    return result.slice(0, 40);
  }, [source.projects, source.projectDocuments]);

  const summary = useMemo(() => {
    const withPlan = rows.filter((r) => r.documentCount > 0).length;
    const stale = rows.filter((r) => r.daysSinceUpload === null || r.daysSinceUpload > 60).length;
    return { total: rows.length, withPlan, withoutPlan: rows.length - withPlan, stale };
  }, [rows]);

  return (
    <RoleWorkstationShell role="pca" title="Plan Uploads" subtitle="Manage project plan uploads and track plan freshness.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'My Projects', value: summary.total, color: 'var(--text-primary)' },
          { label: 'With Plans', value: summary.withPlan, color: '#10B981' },
          { label: 'Without Plans', value: summary.withoutPlan, color: summary.withoutPlan > 0 ? '#EF4444' : 'var(--text-primary)' },
          { label: 'Stale (>60d)', value: summary.stale, color: summary.stale > 0 ? '#F59E0B' : 'var(--text-primary)' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{kpi.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <CommandCenterSection title="Project Plan Status">
        <div style={{ overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 90px 100px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)', minWidth: 500 }}>
            <span>Project</span>
            <span>Documents</span>
            <span>Last Upload</span>
            <span>Freshness</span>
            <span>Action</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No projects in scope.</div>
          ) : (
            rows.map((row) => (
              <div
                key={row.projectId}
                style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 90px 100px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', alignItems: 'center', minWidth: 500 }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.projectName}
                </span>
                <span>{row.documentCount}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {row.lastUpload ? row.lastUpload.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '--'}
                </span>
                <span style={{ color: freshnessColor(row.daysSinceUpload), fontWeight: 600 }}>
                  {freshnessLabel(row.daysSinceUpload)}
                </span>
                <Link
                  href={`/shared/project-plans`}
                  style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textDecoration: 'underline' }}
                >
                  Upload
                </Link>
              </div>
            ))
          )}
        </div>
      </CommandCenterSection>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href="/shared/project-plans" style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem 1rem', fontSize: '0.76rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
          Open Full Project Plans
        </Link>
        <Link href="/shared/mapping" style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.6rem 1rem', fontSize: '0.76rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
          Open Mapping
        </Link>
      </div>
    </RoleWorkstationShell>
  );
}
