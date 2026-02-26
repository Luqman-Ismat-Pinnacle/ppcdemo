'use client';

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function SeniorManagerProjectsPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    const healthRows = (filteredData?.projectHealth?.length ? filteredData.projectHealth : fullData?.projectHealth) || [];

    const healthByProject = new Map<string, Record<string, unknown>>();
    for (const health of healthRows) {
      const row = asRecord(health);
      const projectId = String(row.projectId || row.project_id || row.id || '');
      if (projectId) healthByProject.set(projectId, row);
    }

    return projects.map((project) => {
      const row = asRecord(project);
      const projectId = String(row.id || row.projectId || '');
      const health = healthByProject.get(projectId) || {};
      const score = Number(health.healthScore || health.health_score || health.overall || 0);
      const cpi = Number(health.cpi || health.CPI || 0);
      const spi = Number(health.spi || health.SPI || 0);
      return {
        projectId,
        projectName: String(row.name || row.projectName || projectId || 'Project'),
        customer: String(row.customer || row.customerName || row.customer_name || 'Unknown'),
        healthScore: Number.isFinite(score) ? score : 0,
        cpi: Number.isFinite(cpi) ? cpi : 0,
        spi: Number.isFinite(spi) ? spi : 0,
      };
    });
  }, [filteredData?.projectHealth, filteredData?.projects, fullData?.projectHealth, fullData?.projects]);

  const summary = useMemo(() => {
    const atRisk = rows.filter((row) => row.healthScore < 60 || (row.cpi > 0 && row.cpi < 0.8)).length;
    return { totalProjects: rows.length, atRisk };
  }, [rows]);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="Projects"
      subtitle="Portfolio project rollup with operational risk and health drill-down."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Projects in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.totalProjects}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>At-Risk Projects</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.atRisk > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.atRisk}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 110px 110px 110px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Customer</span><span>Health</span><span>CPI</span><span>SPI</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No projects found.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 110px 110px 110px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.projectName}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{row.customer}</span>
            <span style={{ color: row.healthScore < 60 ? '#EF4444' : row.healthScore < 80 ? '#F59E0B' : '#10B981' }}>{row.healthScore.toFixed(0)}</span>
            <span>{row.cpi.toFixed(2)}</span>
            <span>{row.spi.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
