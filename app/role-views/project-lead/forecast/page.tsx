'use client';

/**
 * @fileoverview Project Lead forecast workstation page.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import { useData } from '@/lib/data-context';
import { calcCpi, calcIeacCpi, calcSpi } from '@/lib/calculations/kpis';
import PlanVsForecastActualSCurve from '@/components/role-workstations/PlanVsForecastActualSCurve';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function ProjectLeadForecastPage() {
  const { filteredData, data: fullData } = useData();
  const [scenarioFactor, setScenarioFactor] = useState(1);

  const base = useMemo(() => {
    const tasks = (((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[]).map(asRecord);
    const projects = (((filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || []) as unknown[]).map(asRecord);

    const actual = tasks.reduce((sum, task) => sum + num(task.actualHours ?? task.actual_hours), 0);
    const planned = tasks.reduce((sum, task) => sum + num(task.baselineHours ?? task.baseline_hours), 0);
    const earned = tasks.reduce((sum, task) => {
      const baseline = num(task.baselineHours ?? task.baseline_hours);
      const pct = Math.max(0, Math.min(1, num(task.percentComplete ?? task.percent_complete) / 100));
      return sum + baseline * pct;
    }, 0);
    const bac = projects.reduce((sum, project) => sum + num(project.budget ?? project.totalBudget ?? project.bac), 0) || planned;
    return { tasks, actual, planned, earned, bac };
  }, [filteredData?.projects, filteredData?.tasks, fullData?.projects, fullData?.tasks]);

  const kpis = useMemo(() => {
    const cpi = calcCpi(base.earned, base.actual, 'project-lead', 'active-filters');
    const spi = calcSpi(base.earned, base.planned, 'project-lead', 'active-filters');
    const ieac = calcIeacCpi(base.bac, cpi.value, 'project-lead', 'active-filters');
    const scenarioForecast = ieac.value * scenarioFactor;

    const topVarianceTasks = base.tasks
      .map((task) => ({
        id: String(task.id || task.taskId || ''),
        name: String(task.name || task.taskName || task.id || 'Task'),
        baseline: num(task.baselineHours ?? task.baseline_hours),
        actual: num(task.actualHours ?? task.actual_hours),
      }))
      .map((task) => ({ ...task, variance: task.actual - task.baseline }))
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 15);

    return { cpi, spi, ieac, scenarioForecast, topVarianceTasks };
  }, [base.actual, base.bac, base.earned, base.planned, base.tasks, scenarioFactor]);

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

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', display: 'grid', gridTemplateColumns: '1fr 180px 200px', alignItems: 'end', gap: '0.7rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Scenario Multiplier</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Adjust IEAC for conservative or optimistic scenario planning.</div>
        </div>
        <input
          type="number"
          step={0.01}
          min={0.5}
          max={1.8}
          value={scenarioFactor}
          onChange={(event) => setScenarioFactor(Math.min(1.8, Math.max(0.5, Number(event.target.value || 1))))}
          style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        />
        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
          Scenario IEAC: <strong>{kpis.scenarioForecast.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
      </div>

      <PlanVsForecastActualSCurve planned={base.planned} actual={base.actual} forecast={kpis.scenarioForecast} />

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 120px 120px 120px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Top Variance Tasks</span><span>Baseline</span><span>Actual</span><span>Variance</span>
        </div>
        {kpis.topVarianceTasks.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No task variance rows in scope.</div>
        ) : kpis.topVarianceTasks.map((task) => (
          <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 120px 120px 120px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{task.name}</span>
            <span>{task.baseline.toFixed(1)}</span>
            <span>{task.actual.toFixed(1)}</span>
            <span style={{ color: Math.abs(task.variance) > 20 ? '#EF4444' : 'var(--text-primary)' }}>{task.variance.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
