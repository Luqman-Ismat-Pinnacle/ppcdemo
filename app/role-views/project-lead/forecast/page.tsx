'use client';

/**
 * @fileoverview Project Lead forecast workstation page.
 *
 * Surfaces core forecast KPIs using the shared calculation layer and links to
 * the full advanced forecast workspace.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import { useData } from '@/lib/data-context';
import { calcCpi, calcIeacCpi, calcSpi } from '@/lib/calculations/kpis';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ProjectLeadForecastPage() {
  const { filteredData, data: fullData } = useData();

  const kpis = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];

    const actual = tasks.reduce((sum, task) => sum + num((task as unknown as Record<string, unknown>).actualHours ?? (task as unknown as Record<string, unknown>).actual_hours), 0);
    const planned = tasks.reduce((sum, task) => sum + num((task as unknown as Record<string, unknown>).baselineHours ?? (task as unknown as Record<string, unknown>).baseline_hours), 0);
    const earned = tasks.reduce((sum, task) => {
      const row = task as unknown as Record<string, unknown>;
      const baseline = num(row.baselineHours ?? row.baseline_hours);
      const pct = Math.max(0, Math.min(1, num(row.percentComplete ?? row.percent_complete) / 100));
      return sum + baseline * pct;
    }, 0);
    const bac = projects.reduce((sum, project) => sum + num((project as unknown as Record<string, unknown>).budget ?? (project as unknown as Record<string, unknown>).totalBudget ?? (project as unknown as Record<string, unknown>).bac), 0) || planned;

    const cpi = calcCpi(earned, actual, 'project-lead', 'active-filters');
    const spi = calcSpi(earned, planned, 'project-lead', 'active-filters');
    const ieac = calcIeacCpi(bac, cpi.value, 'project-lead', 'active-filters');

    return { cpi, spi, ieac };
  }, [filteredData?.projects, filteredData?.tasks, fullData?.projects, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Forecast Workspace"
      subtitle="Project-level forecast controls and KPI health using shared formulas."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-management/forecast" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Full Forecast</Link>
          <Link href="/role-views/project-lead/report" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Commitments</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'CPI', value: kpis.cpi.value.toFixed(2), provenance: kpis.cpi.provenance },
          { label: 'SPI', value: kpis.spi.value.toFixed(2), provenance: kpis.spi.provenance },
          { label: 'IEAC', value: kpis.ieac.value.toLocaleString(undefined, { maximumFractionDigits: 2 }), provenance: kpis.ieac.provenance },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {card.label}
              <MetricProvenanceChip provenance={card.provenance} />
            </div>
            <div style={{ marginTop: 4, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
