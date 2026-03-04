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

export default function PclCommandCenter() {
  const { user } = useUser();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedWatch, setExpandedWatch] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/pcl/summary', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7} style={{ background: 'rgba(255,255,255,0.025)' }}>
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
