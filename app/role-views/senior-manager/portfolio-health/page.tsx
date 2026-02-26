'use client';

/**
 * @fileoverview Senior Manager portfolio health page.
 *
 * Canonical route that rolls in portfolio project/milestone risk content from
 * legacy senior-manager sub-routes.
 */

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function SeniorManagerPortfolioHealthPage() {
  const { filteredData, data: fullData } = useData();

  const projects = useMemo(
    () => ((filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || []).map(asRecord),
    [filteredData?.projects, fullData?.projects],
  );
  const milestones = useMemo(
    () => ((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []).map(asRecord),
    [filteredData?.milestones, fullData?.milestones],
  );

  const projectRows = useMemo(() => {
    return projects.map((project) => {
      const id = String(project.id || project.projectId || '');
      const name = String(project.name || project.projectName || id || 'Project');
      const health = num(project.healthScore || project.health_score || 0);
      const spi = num(project.spi || 0);
      const cpi = num(project.cpi || 0);
      const risk = (health < 60 ? 2 : 0) + (spi > 0 && spi < 0.9 ? 1 : 0) + (cpi > 0 && cpi < 0.9 ? 1 : 0);
      return { id, name, health, spi, cpi, risk };
    }).sort((a, b) => b.risk - a.risk || a.health - b.health);
  }, [projects]);

  const milestoneSummary = useMemo(() => {
    const now = Date.now();
    let overdue = 0;
    let upcoming = 0;
    for (const m of milestones) {
      const dueRaw = m.dueDate || m.due_date || m.targetDate || m.target_date;
      const due = dueRaw ? new Date(String(dueRaw)) : null;
      const done = String(m.status || '').toLowerCase().includes('complete');
      if (!due || !Number.isFinite(due.getTime()) || done) continue;
      if (due.getTime() < now) overdue += 1;
      if (due.getTime() >= now && due.getTime() < now + 14 * 86400000) upcoming += 1;
    }
    return { total: milestones.length, overdue, upcoming };
  }, [milestones]);

  const atRisk = projectRows.filter((row) => row.risk >= 2).length;

  return (
    <RoleWorkstationShell
      role="senior_manager"
      requiredTier="tier2"
      title="Senior Manager Command Center"
      subtitle="Portfolio-light health lens with rolled-in project and milestone risk controls."
    >
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
          {[
            { label: 'Projects', value: projectRows.length },
            { label: 'At-Risk Projects', value: atRisk, color: atRisk > 0 ? '#EF4444' : 'var(--text-primary)' },
            { label: 'Overdue Milestones', value: milestoneSummary.overdue, color: milestoneSummary.overdue > 0 ? '#EF4444' : 'var(--text-primary)' },
            { label: 'Upcoming Milestones (14d)', value: milestoneSummary.upcoming },
          ].map((card) => (
            <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
              <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.color || 'var(--text-primary)' }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Portfolio Project Health (Rolled In)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 100px 100px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>Project</span><span>Health</span><span>SPI</span><span>CPI</span><span>Risk</span>
          </div>
          {projectRows.slice(0, 40).map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 100px 100px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
              <span>{row.name}</span>
              <span style={{ color: row.health < 60 ? '#EF4444' : row.health < 80 ? '#F59E0B' : '#10B981' }}>{row.health.toFixed(0)}</span>
              <span>{row.spi.toFixed(2)}</span>
              <span>{row.cpi.toFixed(2)}</span>
              <span style={{ color: row.risk >= 2 ? '#EF4444' : row.risk === 1 ? '#F59E0B' : 'var(--text-secondary)' }}>{row.risk}</span>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
