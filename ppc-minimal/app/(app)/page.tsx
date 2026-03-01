'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Kpis = {
  totalProjects: number; withSchedule: number; totalTasks: number;
  unmappedHours: number; totalHoursLogged: number; projectsNoSchedule: number;
  employees: number; contractValue: number; totalCost: number;
  workdayPhases: number; mappedEntries: number;
};
type QueueItem = { id: string; severity: string; title: string; reason: string };
type ActivityRow = { project_id: string; project_name: string; total_hours: string; entries: string };
type TopProject = { id: string; name: string; percent_complete: number; actual_hours: number; remaining_hours: number; actual_cost: number; has_schedule: boolean };
type MonthRow = { month: string; hours: string; cost: string };

function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function pctColor(v: number) { return v >= 75 ? 'var(--color-success)' : v >= 40 ? 'var(--color-warning)' : 'var(--color-error)'; }

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === 'critical' ? 'var(--color-error)' : severity === 'warning' ? 'var(--color-warning)' : 'var(--color-info)';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 8, flexShrink: 0 }} />;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pctColor(pct), borderRadius: 3, transition: 'width 0.3s' }} />
    </div>
  );
}

export default function CommandCenterPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [topProjects, setTopProjects] = useState<TopProject[]>([]);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/pca/summary', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!data.success) { setError(data.error || 'Failed'); return; }
        setKpis(data.kpis);
        setQueue(data.queue || []);
        setActivity(data.recentActivity || []);
        setTopProjects(data.topProjects || []);
        setMonthly(data.hoursByMonth || []);
      })
      .catch(e => setError(e.message));
  }, []);

  const loading = !kpis && !error;

  const mappingPct = useMemo(() => {
    if (!kpis) return 0;
    const total = kpis.mappedEntries + kpis.unmappedHours;
    return total > 0 ? Math.round(kpis.mappedEntries / total * 100) : 0;
  }, [kpis]);

  const trendOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: monthly.map(m => m.month), axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'Hrs', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      { type: 'value', name: '$', splitLine: { show: false } },
    ],
    series: [
      { name: 'Hours', type: 'bar', data: monthly.map(m => Number(m.hours)), itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] } },
      { name: 'Cost', type: 'line', yAxisIndex: 1, data: monthly.map(m => Number(m.cost)), smooth: true, lineStyle: { color: '#3b82f6' }, itemStyle: { color: '#3b82f6' } },
    ],
  }), [monthly]);

  return (
    <div>
      <h1 className="page-title">PCA Command Center</h1>
      <p className="page-subtitle">Priority queue and key metrics for project data integrity.</p>

      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</div>}

      {/* ── KPI strip ── */}
      {loading ? (
        <div className="kpi-grid" style={{ marginBottom: '0.85rem' }}>
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} height={76} />)}
        </div>
      ) : kpis && (
        <div className="kpi-grid" style={{ marginBottom: '0.85rem' }}>
          <KpiCard label="Active Projects" value={kpis.totalProjects} />
          <KpiCard label="With Schedule" value={kpis.withSchedule} detail={`${kpis.totalProjects ? Math.round(kpis.withSchedule / kpis.totalProjects * 100) : 0}% coverage`} />
          <KpiCard label="Employees" value={kpis.employees.toLocaleString()} />
          <KpiCard label="Total Tasks" value={kpis.totalTasks.toLocaleString()} />
          <KpiCard label="Hours Logged" value={fmt(kpis.totalHoursLogged)} />
          <KpiCard label="Total Cost" value={`$${fmt(kpis.totalCost)}`} />
          <KpiCard label="Contract Value" value={`$${fmt(kpis.contractValue)}`} />
          <KpiCard label="WD Phases" value={kpis.workdayPhases.toLocaleString()} />
          <KpiCard label="Mapping" value={`${mappingPct}%`} detail={`${kpis.mappedEntries.toLocaleString()} mapped`} />
          <KpiCard label="No Schedule" value={kpis.projectsNoSchedule} detail="Missing MPP" />
        </div>
      )}

      {/* ── Row 2: Priority Queue + Activity + Trend ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem', marginBottom: '0.85rem' }}>
        <div className="glass-raised" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem' }}>Priority Queue</div>
          {loading && <Skeleton height={80} />}
          {queue.length === 0 && kpis && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No urgent items.</div>}
          {queue.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)' }}>
              <SeverityDot severity={item.severity} />
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.reason}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-raised" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem' }}>Recent Activity (7d)</div>
          {loading && <Skeleton height={80} />}
          {activity.length === 0 && kpis && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No recent hours logged.</div>}
          {activity.map(row => (
            <div key={row.project_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.74rem' }}>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{row.project_name || row.project_id}</span>
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{Number(row.total_hours).toFixed(1)}h ({row.entries})</span>
            </div>
          ))}
        </div>

        <div className="glass-raised" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem' }}>Monthly Trend (6mo)</div>
          {loading ? <Skeleton height={160} /> : monthly.length > 0
            ? <ChartWrapper option={trendOption} height={180} />
            : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>No data</div>
          }
        </div>
      </div>

      {/* ── Row 3: Top Projects table ── */}
      <div className="glass-raised" style={{ padding: '0.75rem', marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem' }}>Top Projects by Hours</div>
        {loading ? <Skeleton height={120} /> : topProjects.length > 0 ? (
          <div style={{ overflow: 'auto' }}>
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Progress</th>
                  <th>Actual Hrs</th>
                  <th>Remaining Hrs</th>
                  <th>Actual Cost</th>
                  <th>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map(p => {
                  const pct = Number(p.percent_complete || 0);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.id}</td>
                      <td style={{ minWidth: 130 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ProgressBar pct={pct} />
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: pctColor(pct), whiteSpace: 'nowrap' }}>{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td>{fmt(Number(p.actual_hours || 0))}</td>
                      <td>{fmt(Number(p.remaining_hours || 0))}</td>
                      <td>${fmt(Number(p.actual_cost || 0))}</td>
                      <td>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: p.has_schedule ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: p.has_schedule ? '#10b981' : '#ef4444' }}>
                          {p.has_schedule ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No projects</div>}
      </div>

      {/* ── Row 4: Data Health Summary ── */}
      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.65rem' }}>
          <HealthCard label="Schedule Coverage" value={kpis.totalProjects > 0 ? Math.round(kpis.withSchedule / kpis.totalProjects * 100) : 0} />
          <HealthCard label="Mapping Coverage" value={mappingPct} />
          <HealthCard label="Active Employees" value={100} fixed />
          <HealthCard label="Contract Loaded" value={kpis.contractValue > 0 ? 100 : 0} fixed />
        </div>
      )}
    </div>
  );
}

function HealthCard({ label, value, fixed }: { label: string; value: number; fixed?: boolean }) {
  const color = value >= 75 ? 'var(--color-success)' : value >= 40 ? 'var(--color-warning)' : 'var(--color-error)';
  return (
    <div className="glass" style={{ padding: '0.75rem' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color }}>{fixed ? (value > 0 ? '✓' : '✗') : `${value}%`}</div>
        {!fixed && (
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${Math.min(value, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        )}
      </div>
    </div>
  );
}
