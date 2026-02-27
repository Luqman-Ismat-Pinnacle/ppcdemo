'use client';

import React from 'react';
import { METRIC_DEFINITIONS } from '@/lib/calculations/registry';

const SOURCE_FIELDS_BY_TABLE: Record<string, string[]> = {
  tasks: ['id', 'project_id', 'baseline_hours', 'actual_hours', 'percent_complete', 'finish_date'],
  projects: ['id', 'portfolio_id', 'budget', 'bac', 'status'],
  hours: ['id', 'project_id', 'task_id', 'employee_id', 'hours', 'phase', 'charge_code'],
  employees: ['id', 'employee_id', 'name', 'email', 'role'],
  taskHoursEfficiency: ['tasks', 'actualWorked', 'estimatedAdded', 'efficiency'],
};

const WHERE_USED_BY_FORMULA: Record<string, string[]> = {
  SPI_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/project-management/forecast'],
  CPI_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/project-management/forecast'],
  HOURS_VARIANCE_PCT_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/project-lead', '/project-management/forecast'],
  HEALTH_SCORE_V1: ['/role-views/coo', '/role-views/senior-manager', '/role-views/pcl'],
  IEAC_CPI_V1: ['/role-views/project-lead', '/project-management/forecast'],
  TCPI_BAC_V1: ['/role-views/project-lead', '/project-management/forecast'],
  UTILIZATION_PCT_V1: ['/project-controls/resourcing', '/role-views/pcl'],
  EFFICIENCY_PCT_V1: ['/insights/hours'],
  TASK_EFFICIENCY_PCT_V1: ['/insights/tasks', '/project-controls/wbs-gantt-v2'],
};

export default function MetricProvenanceIndexPage() {
  return (
    <div className="page-panel insights-page" style={{ padding: '1rem 0 2rem' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: 6 }}>Metric Provenance Index</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
        Canonical formulas and data sources used by KPI chips across the app.
      </p>
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
