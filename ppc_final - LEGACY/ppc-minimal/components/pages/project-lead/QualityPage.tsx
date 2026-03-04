'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import Link from 'next/link';

type QcProject = {
  project_id: string; project_name: string;
  total_hours: number; qc_hours: number; rework_hours: number; execute_hours: number;
  qc_ratio: number; rework_ratio: number;
};
type MonthlyQc = { month: string; qc_hours: number; rework_hours: number; execute_hours: number; total_hours: number };
type PhaseQc = { project_id: string; project_name: string; phase_name: string; qc_hours: number; rework_hours: number; total_hours: number };
type Payload = {
  success: boolean;
  kpis: { totalQcHours: number; totalReworkHours: number; totalExecuteHours: number; qcRatio: number; reworkRatio: number; costOfQuality: number };
  byProject: QcProject[];
  monthlyTrend: MonthlyQc[];
  phaseQuality: PhaseQc[];
};
type QcLogPayload = {
  success: boolean;
  kpis: { coverage: number; openDefects: number; avgScore: number };
  recentIssues: Array<{ taskName: string; projectName: string; qcStatus: string; severity: string; defectsOpen: number }>;
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (<div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>);
}

export default function QualityPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [qcLogData, setQcLogData] = useState<QcLogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/project-lead/quality', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/shared/qc-log', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([quality, qc]) => { setData(quality); setQcLogData(qc); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const trendChart = useMemo<EChartsOption>(() => {
    if (!data?.monthlyTrend?.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['QC', 'Rework', 'Execute'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 50, right: 20, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.monthlyTrend.map((m) => m.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [
        { name: 'Execute', type: 'bar', stack: 'all', data: data.monthlyTrend.map((m) => m.execute_hours), itemStyle: { color: '#10b981' } },
        { name: 'QC', type: 'bar', stack: 'all', data: data.monthlyTrend.map((m) => m.qc_hours), itemStyle: { color: '#3b82f6' } },
        { name: 'Rework', type: 'bar', stack: 'all', data: data.monthlyTrend.map((m) => m.rework_hours), itemStyle: { borderRadius: [3, 3, 0, 0], color: '#ef4444' } },
      ],
    };
  }, [data]);

  const qcByProjectChart = useMemo<EChartsOption>(() => {
    if (!data?.byProject?.length) return {};
    const sorted = [...data.byProject].sort((a, b) => b.rework_ratio - a.rework_ratio).slice(0, 12);
    return {
      tooltip: { trigger: 'axis', formatter: (params: unknown) => { const d = (params as { dataIndex: number }[])[0]; const p = sorted[d.dataIndex]; return `${p.project_name}<br/>QC: ${p.qc_ratio}%<br/>Rework: ${p.rework_ratio}%<br/>QC Hrs: ${p.qc_hours}<br/>Rework Hrs: ${p.rework_hours}`; } },
      grid: { left: 140, right: 20, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.project_name.length > 22 ? p.project_name.slice(0, 20) + '…' : p.project_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [
        { name: 'QC', type: 'bar', stack: 'ratio', data: sorted.map((p) => p.qc_ratio), itemStyle: { color: '#3b82f6' } },
        { name: 'Rework', type: 'bar', stack: 'ratio', data: sorted.map((p) => p.rework_ratio), itemStyle: { borderRadius: [0, 3, 3, 0], color: '#ef4444' } },
      ],
    };
  }, [data]);

  const costOfQualityChart = useMemo<EChartsOption>(() => {
    if (!data?.kpis) return {};
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['40%', '70%'],
        label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {d}%' },
        data: [
          { name: 'Execute', value: data.kpis.totalExecuteHours, itemStyle: { color: '#10b981' } },
          { name: 'QC', value: data.kpis.totalQcHours, itemStyle: { color: '#3b82f6' } },
          { name: 'Rework', value: data.kpis.totalReworkHours, itemStyle: { color: '#ef4444' } },
        ],
      }],
    };
  }, [data]);

  const filteredPhases = useMemo(() => {
    if (!data?.phaseQuality) return [];
    return projectFilter === 'all' ? data.phaseQuality : data.phaseQuality.filter((p) => p.project_id === projectFilter);
  }, [data, projectFilter]);

  if (loading) return <div><h1 className="page-title">Quality & QC</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={300} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Quality & QC</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load quality data.</div></div>;

  const k = data.kpis;
  const q = qcLogData?.kpis;

  return (
    <div>
      <h1 className="page-title">Quality & QC</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="QC Hours" value={k.totalQcHours.toLocaleString()} detail={`${k.qcRatio}% of total`} color="#3b82f6" />
        <KpiCard label="Rework Hours" value={k.totalReworkHours.toLocaleString()} detail={`${k.reworkRatio}% of total`} color={k.reworkRatio > 5 ? '#ef4444' : '#f59e0b'} />
        <KpiCard label="Execute Hours" value={k.totalExecuteHours.toLocaleString()} color="#10b981" />
        <KpiCard label="Cost of Quality" value={`${k.costOfQuality}%`} color={k.costOfQuality > 15 ? '#ef4444' : k.costOfQuality > 8 ? '#f59e0b' : '#10b981'} detail="QC + Rework / Total" />
        <KpiCard label="QC Ratio" value={`${k.qcRatio}%`} color="#3b82f6" />
        <KpiCard label="Rework Ratio" value={`${k.reworkRatio}%`} color={k.reworkRatio > 5 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Task QC Coverage" value={`${q?.coverage?.toFixed(1) || '0.0'}%`} color={(q?.coverage || 0) >= 90 ? '#10b981' : (q?.coverage || 0) >= 70 ? '#f59e0b' : '#ef4444'} detail="QC log completion" />
        <KpiCard label="Open Defects" value={q?.openDefects || 0} color={(q?.openDefects || 0) > 0 ? '#ef4444' : '#10b981'} detail={`Avg checklist: ${q?.avgScore?.toFixed(1) || '0.0'}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>QC & Rework Trend (12 mo)</h3>
          <ChartWrapper option={trendChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Cost of Quality Breakdown</h3>
          <ChartWrapper option={costOfQualityChart} height={240} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>QC & Rework by Project</h3>
        <ChartWrapper option={qcByProjectChart} height={Math.max(200, (data.byProject?.length || 5) * 24)} />
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', gap: '0.4rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>QC Log Signals</h3>
          <Link href="/project-lead/qc-log" style={{ fontSize: '0.66rem', color: '#93c5fd', textDecoration: 'none', border: '1px solid rgba(147,197,253,0.35)', borderRadius: 6, padding: '0.24rem 0.5rem' }}>
            Open QC Log
          </Link>
        </div>
        {(qcLogData?.recentIssues || []).length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.68rem', padding: '0.4rem 0.2rem' }}>No active QC issues.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.45rem' }}>
            {(qcLogData?.recentIssues || []).slice(0, 8).map((i, idx) => (
              <div key={idx} style={{ border: '1px solid rgba(148,163,184,0.1)', background: 'rgba(30,41,59,0.38)', borderRadius: 8, padding: '0.4rem 0.5rem' }}>
                <div style={{ fontSize: '0.66rem', color: '#e2e8f0', fontWeight: 600 }}>{i.taskName}</div>
                <div style={{ fontSize: '0.61rem', color: '#94a3b8' }}>{i.projectName}</div>
                <div style={{ fontSize: '0.61rem', marginTop: '0.15rem', color: i.qcStatus === 'failed' ? '#ef4444' : i.qcStatus === 'rework_required' ? '#f59e0b' : '#94a3b8' }}>
                  {i.qcStatus} · {i.severity} · open defects: {i.defectsOpen}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Phase-Level Quality Detail</h3>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }}>
            <option value="all">All Projects</option>
            {(data.byProject || []).map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Phase', 'Project', 'QC Hours', 'Rework Hours', 'Total Hours', 'QC %', 'Rework %'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Phase', 'Project'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPhases.map((p, i) => {
                const qcPct = p.total_hours > 0 ? ((p.qc_hours / p.total_hours) * 100).toFixed(1) : '0.0';
                const rwPct = p.total_hours > 0 ? ((p.rework_hours / p.total_hours) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>{p.phase_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.project_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#3b82f6' }}>{p.qc_hours}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.rework_hours > 0 ? '#ef4444' : '#94a3b8' }}>{p.rework_hours}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{p.total_hours}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#3b82f6' }}>{qcPct}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: Number(rwPct) > 5 ? '#ef4444' : '#94a3b8' }}>{rwPct}%</td>
                  </tr>
                );
              })}
              {filteredPhases.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>No QC/rework data for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
