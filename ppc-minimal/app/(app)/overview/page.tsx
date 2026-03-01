'use client';

import React, { useEffect, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';

type Project = {
  id: string; name: string; percent_complete: number; actual_hours: number;
  total_hours: number; scheduled_cost: number; has_schedule: boolean;
  baseline_start: string | null; baseline_end: string | null; progress: number; tf: number;
};

type OverviewData = {
  projects: Project[];
  hourSummary: { total: number; mapped: number };
  costSummary: { total_actual_cost: number; total_remaining_cost: number; total_scheduled_cost: number };
};

function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 1 }); }

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 75 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-error)', borderRadius: 3, transition: 'width 0.3s' }} />
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/pca/overview', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message));
  }, []);

  const loading = !data && !error;

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-subtitle">Status across all assigned projects.</p>

      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</div>}

      {/* Top KPI row */}
      {loading ? (
        <div className="kpi-grid" style={{ marginBottom: '1rem' }}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} />)}</div>
      ) : data && (
        <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
          <div className="glass kpi-card">
            <div className="kpi-label">Projects</div>
            <div className="kpi-value">{data.projects.length}</div>
            <div className="kpi-detail">{data.projects.filter(p => p.has_schedule).length} with schedule</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Mapping Coverage</div>
            <div className="kpi-value">{data.hourSummary.total > 0 ? Math.round(data.hourSummary.mapped / data.hourSummary.total * 100) : 0}%</div>
            <div className="kpi-detail">{fmt(data.hourSummary.mapped)} / {fmt(data.hourSummary.total)} hrs</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Actual Cost</div>
            <div className="kpi-value">${fmt(Number(data.costSummary.total_actual_cost))}</div>
            <div className="kpi-detail">Sched: ${fmt(Number(data.costSummary.total_scheduled_cost))}</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Remaining Cost</div>
            <div className="kpi-value">${fmt(Number(data.costSummary.total_remaining_cost))}</div>
          </div>
        </div>
      )}

      {/* Projects table */}
      {loading ? (
        <div style={{ display: 'grid', gap: '0.4rem' }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} />)}</div>
      ) : data && (
        <div className="glass-solid" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
          <table className="dm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>% Complete</th>
                <th>Progress</th>
                <th>Actual Hrs</th>
                <th>Total Hrs</th>
                <th>Sched Cost</th>
                <th>TF</th>
                <th>Schedule</th>
                <th>Baseline</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 36, textAlign: 'right' }}>{Number(p.percent_complete).toFixed(0)}%</span>
                      <div style={{ flex: 1 }}><ProgressBar value={Number(p.percent_complete)} max={100} /></div>
                    </div>
                  </td>
                  <td>{Number(p.progress).toFixed(1)}%</td>
                  <td>{fmt(Number(p.actual_hours))}</td>
                  <td>{fmt(Number(p.total_hours))}</td>
                  <td>${fmt(Number(p.scheduled_cost))}</td>
                  <td>{Number(p.tf)}</td>
                  <td>{p.has_schedule ? <span style={{ color: 'var(--color-success)' }}>Yes</span> : <span style={{ color: 'var(--color-error)' }}>No</span>}</td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {p.baseline_start ? `${p.baseline_start.slice(0, 10)} → ${(p.baseline_end || '').slice(0, 10)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
