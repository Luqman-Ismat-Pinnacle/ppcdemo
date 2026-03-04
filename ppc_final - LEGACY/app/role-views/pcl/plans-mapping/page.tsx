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

export default function PclPlansMappingPage() {
  const { filteredData, data } = useData();
  const source = filteredData || data;

  const projects = useMemo(() => (source.projects || []) as unknown as Record<string, unknown>[], [source.projects]);
  const hours = useMemo(() => (source.hours || []) as unknown as Record<string, unknown>[], [source.hours]);
  const projectDocuments = useMemo(() => (source.projectDocuments || []) as unknown as Record<string, unknown>[], [source.projectDocuments]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const p of projects) {
      const id = asString(p.id || p.projectId || p.project_id);
      if (id) map.set(id, p);
    }
    return map;
  }, [projects]);

  const projectsWithPlans = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of projectDocuments) {
      const pid = asString(doc.projectId || doc.project_id);
      if (pid) ids.add(pid);
    }
    return ids;
  }, [projectDocuments]);

  const hourStats = useMemo(() => {
    let total = 0;
    let mapped = 0;
    let unmapped = 0;
    for (const h of hours) {
      total++;
      const taskId = h.taskId || h.task_id || h.taskID;
      if (taskId) mapped++;
      else unmapped++;
    }
    const coverage = total > 0 ? (mapped / total) * 100 : 0;
    return { total, mapped, unmapped, coverage };
  }, [hours]);

  const mappingRows = useMemo(() => {
    const buckets = new Map<string, { totalHours: number; mappedHours: number; unmappedHours: number }>();
    for (const h of hours) {
      const pid = asString(h.projectId || h.project_id);
      if (!pid) continue;
      const bucket = buckets.get(pid) || { totalHours: 0, mappedHours: 0, unmappedHours: 0 };
      const qty = asNumber(h.hours || h.quantity || h.value);
      bucket.totalHours += qty;
      const taskId = h.taskId || h.task_id || h.taskID;
      if (taskId) bucket.mappedHours += qty;
      else bucket.unmappedHours += qty;
      buckets.set(pid, bucket);
    }

    const rows: {
      projectId: string;
      projectName: string;
      pcaEmail: string;
      totalHours: number;
      mappedHours: number;
      unmappedHours: number;
      coveragePercent: number;
    }[] = [];

    for (const [pid, bucket] of buckets) {
      const proj = projectMap.get(pid);
      const projectName = proj ? asString(proj.name || proj.projectName || proj.project_name || pid) : pid;
      const pcaEmail = proj ? asString(proj.pcaEmail || proj.pca_email || proj.projectControllerEmail || '') : '';
      const coveragePercent = bucket.totalHours > 0 ? (bucket.mappedHours / bucket.totalHours) * 100 : 0;
      rows.push({ projectId: pid, projectName, pcaEmail, totalHours: bucket.totalHours, mappedHours: bucket.mappedHours, unmappedHours: bucket.unmappedHours, coveragePercent });
    }

    rows.sort((a, b) => b.unmappedHours - a.unmappedHours);
    return rows.slice(0, 30);
  }, [hours, projectMap]);

  const freshnessRows = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const doc of projectDocuments) {
      const pid = asString(doc.projectId || doc.project_id);
      if (!pid) continue;
      const uploaded = asString(doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at);
      const ts = uploaded ? new Date(uploaded).getTime() : 0;
      if (ts > (buckets.get(pid) || 0)) buckets.set(pid, ts);
    }

    const now = Date.now();
    const rows: {
      projectId: string;
      projectName: string;
      pcaEmail: string;
      lastUpload: string;
      daysSince: number;
    }[] = [];

    for (const p of projects) {
      const pid = asString(p.id || p.projectId || p.project_id);
      if (!pid) continue;
      const projectName = asString(p.name || p.projectName || p.project_name || pid);
      const pcaEmail = asString(p.pcaEmail || p.pca_email || p.projectControllerEmail || '');
      const ts = buckets.get(pid);
      const lastUpload = ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      const daysSince = ts ? Math.floor((now - ts) / 86_400_000) : 9999;
      rows.push({ projectId: pid, projectName, pcaEmail, lastUpload, daysSince });
    }

    rows.sort((a, b) => b.daysSince - a.daysSince);
    return rows.slice(0, 20);
  }, [projects, projectDocuments]);

  function coverageColor(pct: number): string {
    if (pct >= 90) return '#22C55E';
    if (pct >= 70) return '#F59E0B';
    return '#EF4444';
  }

  function freshnessColor(days: number): string {
    if (days >= 9999) return '#EF4444';
    if (days > 60) return '#EF4444';
    if (days >= 30) return '#F59E0B';
    return '#22C55E';
  }

  const kpiCardStyle: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    background: 'var(--bg-card)',
    padding: '0.75rem',
  };
  const labelStyle: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--text-muted)' };
  const valueStyle: React.CSSProperties = { marginTop: 4, fontSize: '1.25rem', fontWeight: 800 };

  const headerStyle: React.CSSProperties = {
    padding: '0.5rem 0.7rem',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '0.68rem',
    color: 'var(--text-muted)',
  };
  const rowStyle: React.CSSProperties = {
    padding: '0.55rem 0.7rem',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '0.74rem',
  };

  return (
    <RoleWorkstationShell role="pcl" requiredTier="tier1" title="Plans & Mapping" subtitle="Cross-project plan freshness and hours mapping oversight.">
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={kpiCardStyle}>
          <div style={labelStyle}>Total Projects</div>
          <div style={valueStyle}>{projects.length}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={labelStyle}>With Plans</div>
          <div style={valueStyle}>{projectsWithPlans.size}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={labelStyle}>Mapping Coverage</div>
          <div style={{ ...valueStyle, color: coverageColor(hourStats.coverage) }}>{hourStats.coverage.toFixed(1)}%</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={labelStyle}>Unmapped Hours</div>
          <div style={{ ...valueStyle, color: hourStats.unmapped > 0 ? '#EF4444' : 'var(--text-primary)' }}>{hourStats.unmapped.toLocaleString()}</div>
        </div>
      </div>

      {/* Project Mapping Table */}
      <CommandCenterSection title="Project Mapping Coverage" status={`${mappingRows.length} projects`}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ ...headerStyle, display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 90px 90px 90px 90px' }}>
            <span>Project</span><span>PCA</span><span>Total Hrs</span><span>Mapped</span><span>Unmapped</span><span>Coverage</span>
          </div>
          {mappingRows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No hours data available.</div>
          ) : mappingRows.map((row) => (
            <div key={row.projectId} style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 90px 90px 90px 90px' }}>
              <Link href="/shared/mapping" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{row.projectName}</Link>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.pcaEmail || '—'}</span>
              <span>{row.totalHours.toFixed(1)}</span>
              <span>{row.mappedHours.toFixed(1)}</span>
              <span style={{ color: row.unmappedHours > 0 ? '#EF4444' : 'var(--text-primary)' }}>{row.unmappedHours.toFixed(1)}</span>
              <span style={{ fontWeight: 700, color: coverageColor(row.coveragePercent) }}>{row.coveragePercent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </CommandCenterSection>

      {/* Plan Freshness Table */}
      <CommandCenterSection title="Plan Freshness" status={`${freshnessRows.length} projects`}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ ...headerStyle, display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 130px 90px' }}>
            <span>Project</span><span>PCA</span><span>Last Upload</span><span>Days Since</span>
          </div>
          {freshnessRows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No project data available.</div>
          ) : freshnessRows.map((row) => (
            <div key={row.projectId} style={{ ...rowStyle, display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 130px 90px' }}>
              <span>{row.projectName}</span>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.pcaEmail || '—'}</span>
              <span>{row.lastUpload}</span>
              <span style={{ fontWeight: 700, color: freshnessColor(row.daysSince) }}>
                {row.daysSince >= 9999 ? 'No upload' : `${row.daysSince}d`}
              </span>
            </div>
          ))}
        </div>
      </CommandCenterSection>
    </RoleWorkstationShell>
  );
}
