'use client';

import React from 'react';
import { METRIC_DEFINITIONS } from '@/lib/calculations/registry';

const DATA_FLOW_LINEAGE = [
  { from: 'tasks', to: 'taskHoursEfficiency', label: 'Task hours → efficiency' },
  { from: 'hours', to: 'taskHoursEfficiency', label: 'Hours → actual worked' },
  { from: 'taskHoursEfficiency', to: 'EFFICIENCY_PCT_V1', label: 'Efficiency → KPI' },
  { from: 'tasks', to: 'projectsEfficiencyMetrics', label: 'Tasks → project metrics' },
  { from: 'hours', to: 'laborBreakdown', label: 'Hours → labor breakdown' },
  { from: 'tasks', to: 'sCurve', label: 'Tasks → S-curve' },
  { from: 'sCurve', to: 'portfolio health', label: 'S-curve → portfolio health' },
  { from: 'projects', to: 'budgetVariance', label: 'Projects → budget variance' },
  { from: 'budgetVariance', to: 'HEALTH_SCORE_V1', label: 'Variance → health score' },
];

const SOURCE_FIELDS_BY_TABLE: Record<string, string[]> = {
  tasks: ['id', 'project_id', 'baseline_hours', 'actual_hours', 'percent_complete', 'finish_date'],
  projects: ['id', 'portfolio_id', 'budget', 'bac', 'status'],
  hours: ['id', 'project_id', 'task_id', 'employee_id', 'hours', 'phase', 'charge_code'],
  employees: ['id', 'employee_id', 'name', 'email', 'role'],
  taskHoursEfficiency: ['tasks', 'actualWorked', 'estimatedAdded', 'efficiency'],
};

const WHERE_USED_BY_FORMULA: Record<string, string[]> = {
  SPI_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/shared/forecast'],
  CPI_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/shared/forecast'],
  HOURS_VARIANCE_PCT_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/shared/forecast'],
  HEALTH_SCORE_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/pcl'],
  IEAC_CPI_V1: ['/role-views/project-lead', '/shared/forecast'],
  TCPI_BAC_V1: ['/role-views/project-lead', '/shared/forecast'],
  UTILIZATION_PCT_V1: ['/shared/resourcing', '/role-views/pcl'],
  EFFICIENCY_PCT_V1: ['/shared/hours'],
  TASK_EFFICIENCY_PCT_V1: ['/shared/tasks', '/shared/wbs-gantt-v2'],
};

export default function MetricProvenanceIndexPage() {
  return (
    <div className="page-panel insights-page" style={{ padding: '1rem 0 2rem' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: 6 }}>Metric Provenance Index</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
        Canonical formulas and data sources used by KPI chips across the app.
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Data Flow Lineage</h2>
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            background: 'var(--surface-glass)',
            padding: 12,
            fontSize: '0.85rem',
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'none' }}>
            {DATA_FLOW_LINEAGE.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <code>{item.from}</code> → <code>{item.to}</code>
                {item.label && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({item.label})</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div style={{ display: 'grid', gap: 10 }}>
        {METRIC_DEFINITIONS.map(def => (
          <section
            key={def.id}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: 'var(--bg-card)',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong>{def.label}</strong>
              <code style={{ fontSize: '0.72rem' }}>{def.id}</code>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              <div>Expression: <code>{def.expression}</code></div>
              <div>Sources: {def.dataSources.join(', ')}</div>
              <div>
                Source fields:{' '}
                {def.dataSources
                  .map((table) => `${table}(${(SOURCE_FIELDS_BY_TABLE[table] || ['*']).join(', ')})`)
                  .join(' · ')}
              </div>
              <div>
                Where used: {(WHERE_USED_BY_FORMULA[def.id] || []).join(', ') || 'Not mapped'}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{def.notes}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
