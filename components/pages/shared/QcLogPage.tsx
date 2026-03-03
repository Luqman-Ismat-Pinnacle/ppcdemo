'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type QcRow = {
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  phaseId: string;
  phaseName: string;
  unitId: string;
  unitName: string;
  epicName: string;
  featureName: string;
  isCritical: boolean;
  percentComplete: number;
  baselineEnd: string;
  qcStatus: string;
  severity: string;
  itemCount: number;
  correctCount: number;
  minorIssues: number;
  majorIssues: number;
  checklistScore: number;
  defectsFound: number;
  defectsOpen: number;
  inspector: string;
  inspectedAt: string;
  resolvedAt: string;
  note: string;
  updatedAt: string;
};

type Payload = {
  success: boolean;
  kpis: {
    totalTasks: number;
    coverage: number;
    passed: number;
    failed: number;
    rework: number;
    openDefects: number;
    totalCount: number;
    totalCorrect: number;
    totalMinor: number;
    totalMajor: number;
    avgScore: number;
  };
  statusMix: Record<string, number>;
  severityMix: Record<string, number>;
  recentIssues: QcRow[];
  rows: QcRow[];
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

const STATUS_OPTIONS = ['not_started', 'passed', 'failed', 'rework_required'] as const;
const SEVERITY_OPTIONS = ['low', 'medium', 'high'] as const;

export default function QcLogPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string>('');

  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [edits, setEdits] = useState<Record<string, Partial<QcRow>>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/shared/qc-log', { cache: 'no-store' });
      const d = await r.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    (data?.rows || []).forEach((r) => map.set(r.projectId, r.projectName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (data?.rows || []).filter((r) => {
      if (projectFilter !== 'all' && r.projectId !== projectFilter) return false;
      if (statusFilter !== 'all' && r.qcStatus !== statusFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.phaseName || '').toLowerCase().includes(q) ||
        (r.epicName || '').toLowerCase().includes(q) ||
        (r.featureName || '').toLowerCase().includes(q) ||
        (r.inspector || '').toLowerCase().includes(q)
      );
    });
  }, [data, projectFilter, statusFilter, severityFilter, search]);

  useEffect(() => {
    const next: Record<string, Partial<QcRow>> = {};
    (data?.rows || []).forEach((r) => {
      next[r.taskId] = {
        taskId: r.taskId,
        qcStatus: r.qcStatus,
        severity: r.severity,
        itemCount: r.itemCount,
        correctCount: r.correctCount,
        minorIssues: r.minorIssues,
        majorIssues: r.majorIssues,
        checklistScore: r.checklistScore,
        defectsFound: r.defectsFound,
        defectsOpen: r.defectsOpen,
        inspector: r.inspector,
        inspectedAt: r.inspectedAt || '',
        resolvedAt: r.resolvedAt || '',
        note: r.note || '',
      };
    });
    setEdits(next);
  }, [data]);

  const statusChart = useMemo<EChartsOption>(() => {
    const mix = data?.statusMix || {};
    return {
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['42%', '72%'], label: { color: '#cbd5e1', fontSize: 10 }, data: Object.entries(mix).map(([k, v]) => ({ name: k, value: v })) }],
    };
  }, [data]);

  const severityChart = useMemo<EChartsOption>(() => {
    const mix = data?.severityMix || {};
    const keys = ['low', 'medium', 'high'];
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 35, right: 10, top: 18, bottom: 24 },
      xAxis: { type: 'category', data: keys, axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'bar', data: keys.map((k) => mix[k] || 0), itemStyle: { color: '#6366f1', borderRadius: [3, 3, 0, 0] } }],
    };
  }, [data]);

  const saveRow = async (taskId: string, rowOverride?: Partial<QcRow>) => {
    const row = rowOverride || edits[taskId];
    if (!row?.taskId) return;
    setSavingTaskId(taskId);
    await fetch('/api/shared/qc-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    });
    setSavingTaskId('');
  };

  const queueAutoSave = (taskId: string, row: Partial<QcRow>) => {
    if (saveTimers.current[taskId]) clearTimeout(saveTimers.current[taskId]);
    saveTimers.current[taskId] = setTimeout(() => {
      saveRow(taskId, row);
      delete saveTimers.current[taskId];
    }, 550);
  };

  const setRowEdit = (taskId: string, patch: Partial<QcRow>) => {
    setEdits((prev) => {
      const nextRow = { ...prev[taskId], ...patch };
      queueAutoSave(taskId, nextRow);
      return { ...prev, [taskId]: nextRow };
    });
  };

  if (loading) {
    return (
      <div>
        <h1 className="page-title">QC Log</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div>
        <h1 className="page-title">QC Log</h1>
        <div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load QC log data.</div>
      </div>
    );
  }

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">QC Log</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <KpiCard label="Task Coverage" value={`${k.coverage}%`} detail={`${k.totalTasks} tasks`} color={k.coverage >= 90 ? '#10b981' : k.coverage >= 70 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Passed" value={k.passed} color="#10b981" />
        <KpiCard label="Failed" value={k.failed} color={k.failed > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Rework" value={k.rework} color={k.rework > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Open Defects" value={k.openDefects} color={k.openDefects > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Avg Checklist" value={`${k.avgScore.toFixed(1)}%`} color={k.avgScore >= 90 ? '#10b981' : k.avgScore >= 75 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Count" value={k.totalCount} />
        <KpiCard label="Correct" value={k.totalCorrect} color="#10b981" />
        <KpiCard label="Minor Issues" value={k.totalMinor} color="#f59e0b" />
        <KpiCard label="Major Issues" value={k.totalMajor} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e2e8f0' }}>Status Mix</h3>
          <ChartWrapper option={statusChart} height={210} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e2e8f0' }}>Issue Severity Mix</h3>
          <ChartWrapper option={severityChart} height={210} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.35rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Task QC Register</h3>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.4rem', fontSize: '0.66rem' }}>
                <option value="all">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.4rem', fontSize: '0.66rem' }}>
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.4rem', fontSize: '0.66rem' }}>
                <option value="all">All Severity</option>
                {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task..." style={{ width: 140, background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.45rem', fontSize: '0.66rem' }} />
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 500 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}>
                  {['Task', 'Project', 'Phase', 'Epic', 'Feature', 'Status', 'Severity', 'Count', 'Correct', 'Minor', 'Major', 'Open Defects', 'Score', 'Inspector', 'Inspected', 'Resolved'].map((h) => (
                    <th key={h} style={{ textAlign: ['Task', 'Project', 'Phase', 'Epic', 'Feature'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600, padding: '0.35rem 0.45rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const e = edits[r.taskId] || {};
                  return (
                  <tr key={r.taskId} style={{ borderBottom: '1px solid rgba(148,163,184,.06)' }}>
                    <td style={{ padding: '0.35rem 0.45rem', color: r.isCritical ? '#ef4444' : '#e2e8f0' }}>{r.isCritical ? '● ' : ''}{r.taskName}</td>
                    <td style={{ padding: '0.35rem 0.45rem', color: '#94a3b8' }}>{r.projectName}</td>
                    <td style={{ padding: '0.35rem 0.45rem', color: '#94a3b8' }}>{r.phaseName || '—'}</td>
                    <td style={{ padding: '0.35rem 0.45rem', color: '#94a3b8' }}>{r.epicName || '—'}</td>
                    <td style={{ padding: '0.35rem 0.45rem', color: '#94a3b8' }}>{r.featureName || '—'}</td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>
                      <select value={String(e.qcStatus || 'not_started')} onChange={(ev) => setRowEdit(r.taskId, { qcStatus: ev.target.value })} style={{ width: 112, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.22rem 0.32rem', fontSize: '0.64rem' }}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>
                      <select value={String(e.severity || 'low')} onChange={(ev) => setRowEdit(r.taskId, { severity: ev.target.value })} style={{ width: 88, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.22rem 0.32rem', fontSize: '0.64rem' }}>
                        {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.itemCount || 0)} onChange={(ev) => setRowEdit(r.taskId, { itemCount: Number(ev.target.value || 0) })} style={{ width: 58, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.correctCount || 0)} onChange={(ev) => setRowEdit(r.taskId, { correctCount: Number(ev.target.value || 0) })} style={{ width: 58, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.minorIssues || 0)} onChange={(ev) => setRowEdit(r.taskId, { minorIssues: Number(ev.target.value || 0) })} style={{ width: 58, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.majorIssues || 0)} onChange={(ev) => setRowEdit(r.taskId, { majorIssues: Number(ev.target.value || 0) })} style={{ width: 58, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.defectsOpen || 0)} onChange={(ev) => setRowEdit(r.taskId, { defectsOpen: Number(ev.target.value || 0) })} style={{ width: 64, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="number" value={Number(e.checklistScore || 0)} onChange={(ev) => setRowEdit(r.taskId, { checklistScore: Number(ev.target.value || 0) })} style={{ width: 66, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem', textAlign: 'right' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input value={String(e.inspector || '')} onChange={(ev) => setRowEdit(r.taskId, { inspector: ev.target.value })} style={{ width: 96, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}><input type="date" value={String(e.inspectedAt || '')} onChange={(ev) => setRowEdit(r.taskId, { inspectedAt: ev.target.value })} style={{ width: 122, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem' }} /></td>
                    <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input type="date" value={String(e.resolvedAt || '')} onChange={(ev) => setRowEdit(r.taskId, { resolvedAt: ev.target.value })} style={{ width: 122, background: 'rgba(51,65,85,0.35)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 6, color: '#e2e8f0', padding: '0.18rem 0.28rem', fontSize: '0.64rem' }} />
                        {savingTaskId === r.taskId && <span style={{ fontSize: '0.58rem', color: '#93c5fd' }}>saving</span>}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(148,163,184,.12)', paddingTop: '0.6rem' }}>
            <h4 style={{ fontSize: '0.72rem', color: '#e2e8f0', marginBottom: '0.3rem' }}>Recent Issues</h4>
            <div style={{ maxHeight: 170, overflowY: 'auto', display: 'grid', gap: '0.35rem' }}>
              {(data.recentIssues || []).slice(0, 8).map((r) => (
                <div key={`${r.taskId}-${r.updatedAt || ''}`} style={{ border: '1px solid rgba(148,163,184,.1)', borderRadius: 6, padding: '0.35rem 0.45rem', background: 'rgba(30,41,59,.36)' }}>
                  <div style={{ fontSize: '0.64rem', color: '#e2e8f0', fontWeight: 600 }}>{r.taskName}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{r.projectName} · {r.qcStatus} · Open defects: {r.defectsOpen}</div>
                </div>
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}
