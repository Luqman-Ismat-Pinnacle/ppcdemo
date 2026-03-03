'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import { useUser } from '@/lib/user-context';
import { getGreetingTitle } from '@/lib/greeting';

interface CpiProject { id: string; name: string; cpi: number }
interface CpiDistribution { high: number; medium: number; low: number; projects: CpiProject[] }
interface ExceptionItem {
  project_id: string; project_name: string; severity: string; reason: string;
  percent_complete: number; actual_cost: number; scheduled_cost: number;
  actual_hours: number; total_hours: number;
}
interface InterventionItem {
  id: string; project_id: string; project_name: string; severity: string;
  priority: string; reason: string; recommended_action: string; pcl_notes: string;
  status: string; variance_pct: number; actual_cost: number; scheduled_cost: number;
  actual_hours: number; total_hours: number; percent_complete: number;
  escalated_by: string; approved_at: string | null; created_at: string;
}
interface MappingRow {
  project_id: string; project_name: string; pca_name: string;
  total_entries: number; mapped_entries: number; unmapped_entries: number; coverage_pct: number;
}
interface FreshnessRow {
  project_id: string; project_name: string; pca_name: string;
  last_upload: string | null; days_since_upload: number | null;
}
interface SpiCpiPoint {
  id: string;
  name: string;
  cpi: number;
  spi: number;
  percent_complete: number;
  overdue_count: number;
}
interface SummaryData {
  kpis: {
    totalProjects: number;
    withSchedule: number;
    overdueTasks: number;
    criticalTasks: number;
    portfolioSpi: number;
    plansWithoutSprints: number;
    staleSprints: number;
    slowMovers: number;
    highVariance: number;
    slowProgress: number;
  };
  cpiDistribution: CpiDistribution;
  spiCpiMatrix: SpiCpiPoint[];
  exceptionQueue: ExceptionItem[];
  mappingHealth: MappingRow[];
  planFreshness: FreshnessRow[];
  sprintHealth: {
    plansWithoutSprints: Array<{ id: string; name: string }>;
    staleSprintProjects: Array<{ id: string; name: string; last_sprint_update: string }>;
  };
  executionRisks: {
    slowMovers: Array<{ id: string; name: string; percent_complete: number; recent_hours: number }>;
    highVariance: Array<{ id: string; name: string; actual_hours: number; total_hours: number; variance_pct: number }>;
    slowProgress: Array<{ id: string; name: string; percent_complete: number; actual_hours: number; total_hours: number }>;
  };
}

const SEV_COLORS: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const CPI_COLORS: Record<string, string> = { high: '#10b981', medium: '#f59e0b', low: '#ef4444' };

function SeverityDot({ severity }: { severity: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS[severity] || '#9ca3af', flexShrink: 0 }} />;
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

const PRIORITIES = ['P1', 'P2', 'P3'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;
const STATUS_COLORS: Record<string, string> = { pcl_review: '#f59e0b', approved: '#10b981', dismissed: '#6b7280', resolved: '#3b82f6' };

export default function PclCommandCenter() {
  const { user } = useUser();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedWatch, setExpandedWatch] = useState<Set<string>>(new Set());
  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [actionBusy, setActionBusy] = useState('');
  const [editingIntv, setEditingIntv] = useState<Record<string, Partial<InterventionItem>>>({});

  const loadInterventions = async () => {
    try {
      const r = await fetch('/api/pcl/interventions', { cache: 'no-store' });
      const d = await r.json();
      if (d.success) setInterventions(d.items || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch('/api/pcl/summary', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    loadInterventions();
  }, []);

  const escalate = async (ex: ExceptionItem) => {
    setActionBusy(ex.project_id);
    try {
      await fetch('/api/pcl/interventions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'escalate',
          projectId: ex.project_id,
          projectName: ex.project_name,
          severity: ex.severity,
          priority: ex.severity === 'critical' ? 'P1' : ex.severity === 'warning' ? 'P2' : 'P3',
          reason: ex.reason,
          recommendedAction: ex.severity === 'critical' ? 'Immediate review required' : 'Monitor and assess',
          actualCost: ex.actual_cost,
          scheduledCost: ex.scheduled_cost,
          actualHours: ex.actual_hours,
          totalHours: ex.total_hours,
          percentComplete: ex.percent_complete,
          escalatedBy: user?.name || 'PCL',
        }),
      });
      await loadInterventions();
    } finally { setActionBusy(''); }
  };

  const interventionAction = async (action: string, id: string, extra?: Record<string, unknown>) => {
    setActionBusy(id);
    try {
      await fetch('/api/pcl/interventions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...extra }),
      });
      await loadInterventions();
    } finally { setActionBusy(''); }
  };

  const updateIntvField = (id: string, field: string, value: string) => {
    setEditingIntv((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveIntvEdits = (id: string) => {
    const edits = editingIntv[id];
    if (!edits) return;
    interventionAction('update', id, {
      severity: edits.severity,
      priority: edits.priority,
      recommendedAction: edits.recommended_action,
      pclNotes: edits.pcl_notes,
    });
  };

  const isEscalated = (projectId: string) =>
    interventions.some((i) => i.project_id === projectId && (i.status === 'pcl_review' || i.status === 'approved'));

  const spiCpiMatrixOption: EChartsOption = useMemo(() => {
    const points = (data?.spiCpiMatrix || []).filter((p) => Number(p.spi) > 0 || Number(p.cpi) > 0);
    const maxX = Math.max(1.2, ...points.map((p) => Number(p.spi || 0)));
    const maxY = Math.max(1.2, ...points.map((p) => Number(p.cpi || 0)));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const d = p?.data?.value || p?.data || [];
          const name = d[3] || p?.name || 'Project';
          const spi = Number(d[0] ?? 0).toFixed(2);
          const cpi = Number(d[1] ?? 0).toFixed(2);
          const pct = Number(d[2] ?? 0).toFixed(0);
          const overdue = Number(d[4] ?? 0);
          return `<b>${name}</b><br/>SPI: ${spi}<br/>CPI: ${cpi}<br/>Complete: ${pct}%<br/>Overdue Tasks: ${overdue}`;
        },
      },
      grid: { left: 45, right: 20, top: 20, bottom: 48 },
      xAxis: {
        type: 'value',
        name: 'SPI',
        min: 0,
        max: Math.ceil(maxX * 10) / 10,
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'CPI',
        min: 0,
        max: Math.ceil(maxY * 10) / 10,
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          type: 'scatter',
          symbol: 'circle',
          data: points.map((p) => {
            const spi = Number(p.spi || 0);
            const cpi = Number(p.cpi || 0);
            const overdue = Number(p.overdue_count || 0);
            const size = Math.min(26, Math.max(8, 8 + overdue * 2));
            const isGood = spi >= 1 && cpi >= 1;
            const isWatch = spi >= 1 || cpi >= 1;
            const color = isGood ? '#10b981' : isWatch ? '#f59e0b' : '#ef4444';
            return {
              value: [spi, cpi, Number(p.percent_complete || 0), p.name, overdue],
              symbolSize: size,
              itemStyle: { color, opacity: 0.85, borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1 },
            };
          }),
          markLine: {
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: 'rgba(255,255,255,0.35)', type: 'dashed' },
            data: [{ xAxis: 1 }, { yAxis: 1 }],
          },
        },
      ],
    };
  }, [data?.spiCpiMatrix]);

  if (loading) return (
    <div>
      <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
      <p className="page-subtitle">What needs attention now across schedule, mapping, and cost signals.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Skeleton height={250} />
        <Skeleton height={250} />
      </div>
    </div>
  );

  if (error) return (
    <div>
      <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
      <div style={{ color: 'var(--color-error)', fontSize: '0.82rem' }}>{error}</div>
    </div>
  );

  if (!data) return null;

  const { kpis, cpiDistribution, exceptionQueue, mappingHealth, planFreshness, sprintHealth, executionRisks } = data;
  const sprintingGapCount = kpis.plansWithoutSprints + kpis.staleSprints;


  return (
    <div>
      <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
      <p className="page-subtitle">What needs attention now across schedule, mapping, and cost signals.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Active Projects" value={kpis.totalProjects} detail={`${kpis.withSchedule} with schedule`} />
        <KpiCard label="Attention Items" value={exceptionQueue.length} detail={`${exceptionQueue.filter(e => e.severity === 'critical').length} critical`} color={exceptionQueue.some(e => e.severity === 'critical') ? '#ef4444' : undefined} />
        <KpiCard label="Overdue Tasks" value={kpis.overdueTasks} color={kpis.overdueTasks > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Critical Tasks" value={kpis.criticalTasks} color={kpis.criticalTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Portfolio SPI" value={kpis.portfolioSpi.toFixed(2)} color={kpis.portfolioSpi >= 0.95 ? '#10b981' : kpis.portfolioSpi >= 0.85 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Sprinting Gaps" value={sprintingGapCount} detail={`${kpis.plansWithoutSprints} missing · ${kpis.staleSprints} stale`} color={sprintingGapCount > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="High Variance" value={kpis.highVariance} color={kpis.highVariance > 0 ? '#ef4444' : '#10b981'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden', width: '100%' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>SPI/CPI Risk Matrix</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {(['high', 'medium', 'low'] as const).map(bucket => (
              <div key={bucket} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: CPI_COLORS[bucket] }} />
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{bucket}</span>
                <span style={{ fontWeight: 700, color: CPI_COLORS[bucket] }}>{cpiDistribution[bucket]}</span>
              </div>
            ))}
          </div>
          <ChartWrapper option={spiCpiMatrixOption} height={300} />
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden', width: '100%' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Projects To Watch</div>
          <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto' }}>
            {exceptionQueue.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '0.78rem' }}>No active exceptions</div>
            )}
            {exceptionQueue.length > 0 && (
              <table className="dm-table" style={{ width: '100%', minWidth: 860, fontSize: '0.72rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Project</th>
                    <th style={{ textAlign: 'left' }}>Severity</th>
                    <th style={{ textAlign: 'right' }}>Progress</th>
                    <th style={{ textAlign: 'right' }}>Actual Cost</th>
                    <th style={{ textAlign: 'right' }}>Hours (A/T)</th>
                    <th style={{ textAlign: 'left' }}>Reason</th>
                    <th style={{ textAlign: 'left' }}>Review</th>
                    <th style={{ textAlign: 'center', width: 80 }}>Escalate</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptionQueue.map((ex) => {
                    const rowKey = `${ex.project_id}-${ex.reason}`;
                    const isOpen = expandedWatch.has(rowKey);
                    return (
                      <React.Fragment key={rowKey}>
                        <tr>
                          <td style={{ fontWeight: 600 }}>{ex.project_name}</td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <SeverityDot severity={ex.severity} />
                              <span style={{ textTransform: 'uppercase', fontWeight: 700, color: SEV_COLORS[ex.severity] || '#9ca3af' }}>{ex.severity}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{Math.round(ex.percent_complete)}%</td>
                          <td style={{ textAlign: 'right' }}>${Math.round(ex.actual_cost).toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            {Math.round(ex.actual_hours).toLocaleString()} / {Math.round(ex.total_hours).toLocaleString()}
                          </td>
                          <td>{ex.reason}</td>
                          <td>
                            <button
                              className="btn"
                              type="button"
                              style={{ padding: '0.2rem 0.45rem', minHeight: 24, fontSize: '0.66rem' }}
                              onClick={() => {
                                setExpandedWatch((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(rowKey)) next.delete(rowKey);
                                  else next.add(rowKey);
                                  return next;
                                });
                              }}
                            >
                              {isOpen ? 'Hide details' : 'Why review?'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isEscalated(ex.project_id) ? (
                              <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 600 }}>Escalated</span>
                            ) : (
                              <button
                                className="btn btn-accent"
                                style={{ fontSize: '0.62rem', padding: '0.18rem 0.4rem', minHeight: 20 }}
                                disabled={actionBusy === ex.project_id}
                                onClick={() => escalate(ex)}
                              >
                                {actionBusy === ex.project_id ? '...' : 'Escalate'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ background: 'rgba(255,255,255,0.025)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '0.35rem 0' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Trigger:</span> <strong>{ex.reason}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Budget Burn:</span> <strong>${Math.round(ex.actual_cost).toLocaleString()} / ${Math.round(ex.scheduled_cost).toLocaleString()}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Execution:</span> <strong>{Math.round(ex.percent_complete)}% complete, {Math.round(ex.actual_hours).toLocaleString()} actual hours</strong></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Intervention Queue */}
      <div className="glass" style={{ padding: '1rem', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>
          Intervention Queue
          <span style={{ fontWeight: 400, fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 8 }}>
            {interventions.filter((i) => i.status === 'pcl_review').length} pending review
          </span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          {interventions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '0.78rem' }}>
              No interventions escalated yet. Use the Escalate button on exception rows above.
            </div>
          ) : (
            <table className="dm-table" style={{ width: '100%', minWidth: 960, fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Priority</th>
                  <th style={{ textAlign: 'left' }}>Severity</th>
                  <th style={{ textAlign: 'left' }}>Reason</th>
                  <th style={{ textAlign: 'left' }}>Action</th>
                  <th style={{ textAlign: 'left' }}>Notes</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center', width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((item) => {
                  const edits = editingIntv[item.id] || {};
                  const sev = edits.severity || item.severity;
                  const pri = edits.priority || item.priority;
                  const recAction = edits.recommended_action ?? item.recommended_action ?? '';
                  const notes = edits.pcl_notes ?? item.pcl_notes ?? '';
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.project_name}</td>
                      <td>
                        {item.status === 'pcl_review' ? (
                          <select
                            value={pri}
                            onChange={(e) => updateIntvField(item.id, 'priority', e.target.value)}
                            onBlur={() => saveIntvEdits(item.id)}
                            style={{ width: 56, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: pri === 'P1' ? '#ef4444' : pri === 'P2' ? '#f59e0b' : '#60a5fa', padding: '0.18rem 0.25rem', fontSize: '0.66rem', fontWeight: 700 }}
                          >
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontWeight: 700, color: item.priority === 'P1' ? '#ef4444' : item.priority === 'P2' ? '#f59e0b' : '#60a5fa' }}>{item.priority}</span>
                        )}
                      </td>
                      <td>
                        {item.status === 'pcl_review' ? (
                          <select
                            value={sev}
                            onChange={(e) => updateIntvField(item.id, 'severity', e.target.value)}
                            onBlur={() => saveIntvEdits(item.id)}
                            style={{ width: 80, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: SEV_COLORS[sev] || '#9ca3af', padding: '0.18rem 0.25rem', fontSize: '0.66rem', fontWeight: 700 }}
                          >
                            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <SeverityDot severity={item.severity} />
                            <span style={{ fontWeight: 700, color: SEV_COLORS[item.severity], textTransform: 'uppercase', fontSize: '0.66rem' }}>{item.severity}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</td>
                      <td>
                        {item.status === 'pcl_review' ? (
                          <input
                            value={recAction}
                            onChange={(e) => updateIntvField(item.id, 'recommended_action', e.target.value)}
                            onBlur={() => saveIntvEdits(item.id)}
                            placeholder="Recommended action"
                            style={{ width: 160, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.3rem', fontSize: '0.66rem' }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.68rem' }}>{item.recommended_action || '—'}</span>
                        )}
                      </td>
                      <td>
                        {item.status === 'pcl_review' ? (
                          <input
                            value={notes}
                            onChange={(e) => updateIntvField(item.id, 'pcl_notes', e.target.value)}
                            onBlur={() => saveIntvEdits(item.id)}
                            placeholder="PCL notes"
                            style={{ width: 140, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.3rem', fontSize: '0.66rem' }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.68rem' }}>{item.pcl_notes || '—'}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: STATUS_COLORS[item.status] || '#9ca3af', textTransform: 'uppercase' }}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.status === 'pcl_review' && (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button
                              className="btn btn-accent"
                              style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem', minHeight: 20 }}
                              disabled={actionBusy === item.id}
                              onClick={() => interventionAction('approve', item.id)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn"
                              style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem', minHeight: 20 }}
                              disabled={actionBusy === item.id}
                              onClick={() => interventionAction('dismiss', item.id)}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                        {item.status === 'approved' && (
                          <button
                            className="btn"
                            style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem', minHeight: 20 }}
                            disabled={actionBusy === item.id}
                            onClick={() => interventionAction('resolve', item.id)}
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Mapping Health</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>PCA</th>
                  <th style={{ textAlign: 'right' }}>Unmapped</th>
                  <th style={{ textAlign: 'right', minWidth: 100 }}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {mappingHealth.map((r, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project_name}</td>
                    <td>{r.pca_name || 'Unassigned'}</td>
                    <td style={{ textAlign: 'right' }}>{r.unmapped_entries}</td>
                    <td><CoverageBar pct={Number(r.coverage_pct)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Plan Freshness</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>PCA</th>
                  <th style={{ textAlign: 'right' }}>Days Since Upload</th>
                </tr>
              </thead>
              <tbody>
                {planFreshness.map((r, i) => {
                  const days = r.days_since_upload;
                  const color = days == null ? '#ef4444' : days < 30 ? '#10b981' : days < 60 ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={i}>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project_name}</td>
                      <td>{r.pca_name || 'Unassigned'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color }}>{days != null ? `${days}d` : 'Never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Plans Missing / Stale Sprinting</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Last Sprint Update</th>
                </tr>
              </thead>
              <tbody>
                {sprintHealth.plansWithoutSprints.map((p) => (
                  <tr key={`nosprint-${p.id}`}>
                    <td>{p.name}</td>
                    <td style={{ color: '#f59e0b' }}>No Sprint</td>
                    <td style={{ textAlign: 'right' }}>—</td>
                  </tr>
                ))}
                {sprintHealth.staleSprintProjects.map((p) => (
                  <tr key={`stale-${p.id}`}>
                    <td>{p.name}</td>
                    <td style={{ color: '#f59e0b' }}>Stale Sprint</td>
                    <td style={{ textAlign: 'right' }}>{p.last_sprint_update ? new Date(p.last_sprint_update).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {sprintHealth.plansWithoutSprints.length === 0 && sprintHealth.staleSprintProjects.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No sprinting gaps found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>High Variance Projects</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                  <th style={{ textAlign: 'right' }}>Planned Hrs</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {executionRisks.highVariance.slice(0, 8).map((p) => (
                  <tr key={`var-${p.id}`}>
                    <td>{p.name}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(p.actual_hours)).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(p.total_hours)).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.variance_pct).toFixed(1)}%</td>
                  </tr>
                ))}
                {executionRisks.highVariance.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No high variance projects</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14, width: '100%' }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Slow Movers</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'right' }}>% Complete</th>
                  <th style={{ textAlign: 'right' }}>Recent Hours (30d)</th>
                </tr>
              </thead>
              <tbody>
                {executionRisks.slowMovers.slice(0, 12).map((p) => (
                  <tr key={`slow-table-${p.id}`}>
                    <td>{p.name}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.percent_complete).toFixed(0)}%</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(p.recent_hours))}</td>
                  </tr>
                ))}
                {executionRisks.slowMovers.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No slow movers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Slow Progress</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'right' }}>% Complete</th>
                  <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                  <th style={{ textAlign: 'right' }}>Planned Hrs</th>
                </tr>
              </thead>
              <tbody>
                {executionRisks.slowProgress.slice(0, 12).map((p) => (
                  <tr key={`progress-table-${p.id}`}>
                    <td>{p.name}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.percent_complete).toFixed(0)}%</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(p.actual_hours)).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(p.total_hours)).toLocaleString()}</td>
                  </tr>
                ))}
                {executionRisks.slowProgress.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No slow progress projects</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
