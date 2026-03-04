'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

/* ─── types ─── */
type Project = {
  id: string; name: string; owner: string; customer_name: string;
  variance_hours: number; variance_pct: number; critical_open: number;
  spi: number; trend_hours_pct: number; avg_progress: number;
  actual_hours: number; baseline_hours: number; task_count: number;
  margin_pct: number; remaining_hours: number; total_hours: number;
  actual_cost?: number; remaining_cost?: number;
};
type RootCause = { root_cause: string; impact_hours: number; project_count: number };
type WeeklyRow = { week: string; hours: number; cost: number };
type HierarchyItem = {
  project_id: string; project_name: string; phase_id: string; phase_name: string;
  task_id: string; task_name: string; baseline_hours: number; actual_hours: number;
  percent_complete: number; is_critical: boolean; total_float: number;
  baseline_start: string; baseline_end: string; subtask_count: number; variance: number;
  early_start?: string; early_finish?: string; late_start?: string; late_finish?: string;
  resource?: string; actual_cost?: number; remaining_cost?: number;
};
type DepPred = { task_id: string; predecessor_id: string };

type Payload = {
  success: boolean;
  kpis: {
    totalProjects: number; projectsAtRisk: number; totalVarianceHours: number;
    avgSpi: number; totalCriticalOpen: number; totalRemainingHours: number; avgProgress: number;
  };
  projects: Project[];
  rootCauses: RootCause[];
  weeklyThroughput: WeeklyRow[];
  hierarchy: HierarchyItem[];
  predecessors: DepPred[];
};

/* ─── helpers ─── */
function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

function rygLight(v: number, thresholds: [number, number] = [0.9, 1.1]) {
  if (v >= thresholds[1]) return '#ef4444';
  if (v <= thresholds[0]) return '#10b981';
  return '#f59e0b';
}

/* ─── Dependency timeline + scenario inputs (chart reflects scenario) ─── */
function DependencyCalendar({ hierarchy, predecessors }: { hierarchy: HierarchyItem[]; predecessors: DepPred[]; projects?: Project[] }) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedPhaseKeys, setSelectedPhaseKeys] = useState<Set<string>>(new Set());
  const [productivity, setProductivity] = useState(0);
  const [riskDays, setRiskDays] = useState(0);
  const [fte, setFte] = useState(1);

  const enriched = useMemo(() => {
    const successorCount = new Map<string, number>();
    predecessors.forEach((p) => successorCount.set(p.predecessor_id, (successorCount.get(p.predecessor_id) || 0) + 1));
    return hierarchy
      .map((t) => {
        const start = new Date(t.baseline_start);
        const end = new Date(t.baseline_end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
        const depCount = successorCount.get(t.task_id) || 0;
        const riskScore = (t.is_critical ? 4 : 0) + (t.total_float < 0 ? 3 : 0) + depCount * 1.4 + Math.max(0, t.variance) / 12;
        const remainingHours = Math.max(0, t.baseline_hours - t.actual_hours);
        const baseFte = durationDays > 0 && t.baseline_hours > 0 ? t.baseline_hours / (durationDays * 8) : 1;
        const phaseKey = `${t.project_id}::${t.phase_id}`;
        return { ...t, start, end, durationDays, depCount, riskScore, remainingHours, baseFte, phaseKey };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.riskScore - a!.riskScore)) as Array<HierarchyItem & { start: Date; end: Date; durationDays: number; depCount: number; riskScore: number; remainingHours: number; baseFte: number; phaseKey: string }>;
  }, [hierarchy, predecessors]);

  const visibleTasks = useMemo(() => enriched.slice(0, 40), [enriched]);
  const taskById = useMemo(() => new Map(visibleTasks.map((t) => [t.task_id, t])), [visibleTasks]);
  const taskNames = useMemo(() => visibleTasks.map((t) => `${t.project_name} / ${t.phase_name} / ${t.task_name}`), [visibleTasks]);

  const selectedTaskIdSet = useMemo(() => {
    const out = new Set(selectedTaskIds);
    selectedPhaseKeys.forEach((pk) => {
      visibleTasks.filter((t) => t.phaseKey === pk).forEach((t) => out.add(t.task_id));
    });
    return out;
  }, [selectedTaskIds, selectedPhaseKeys, visibleTasks]);

  const downstreamTaskIds = useMemo(() => {
    if (!selectedTaskIdSet.size) return new Set<string>();
    const succ = new Map<string, string[]>();
    predecessors.forEach((p) => {
      if (!succ.has(p.predecessor_id)) succ.set(p.predecessor_id, []);
      succ.get(p.predecessor_id)!.push(p.task_id);
    });
    const visited = new Set<string>();
    const queue = [...selectedTaskIdSet];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of succ.get(id) || []) queue.push(next);
    }
    selectedTaskIdSet.forEach((id) => visited.delete(id));
    return visited;
  }, [selectedTaskIdSet, predecessors]);

  const maxSelectedShift = useMemo(() => {
    if (!selectedTaskIdSet.size || fte <= 0) return 0;
    let maxShift = 0;
    selectedTaskIdSet.forEach((tid) => {
      const t = taskById.get(tid);
      if (!t) return;
      const hrs = t.remainingHours > 0 ? t.remainingHours : t.baseline_hours;
      const newDuration = Math.max(1, Math.round((hrs / (fte * 8)) * (1 + productivity / 100) + riskDays * (t.is_critical ? 1 : 0.5)));
      const scenarioEnd = new Date(t.start);
      scenarioEnd.setDate(scenarioEnd.getDate() + newDuration);
      const shift = Math.round((scenarioEnd.getTime() - t.end.getTime()) / 86400000);
      if (shift > maxShift) maxShift = shift;
    });
    return maxShift;
  }, [selectedTaskIdSet, fte, productivity, riskDays, taskById]);

  const scenarioTasks = useMemo(() => {
    const hasSelection = selectedTaskIdSet.size > 0;
    return visibleTasks.map((t) => {
      let scenarioDuration = t.durationDays;
      const isSelected = selectedTaskIdSet.has(t.task_id);
      if (hasSelection && isSelected && fte > 0) {
        const hrs = t.remainingHours > 0 ? t.remainingHours : t.baseline_hours;
        scenarioDuration = Math.max(1, Math.round((hrs / (fte * 8)) * (1 + productivity / 100) + riskDays * (t.is_critical ? 1 : 0.5)));
      } else {
        scenarioDuration = Math.max(1, Math.round(t.durationDays * (1 + productivity / 100) + riskDays * (t.is_critical ? 1 : 0.5)));
      }
      const scenarioEnd = new Date(t.start);
      scenarioEnd.setDate(scenarioEnd.getDate() + scenarioDuration);
      let shiftDays = Math.round((scenarioEnd.getTime() - t.end.getTime()) / 86400000);
      const isDownstream = downstreamTaskIds.has(t.task_id);
      if (isDownstream && hasSelection && maxSelectedShift > 0) {
        shiftDays = Math.max(shiftDays, maxSelectedShift);
      }
      return { ...t, scenarioEnd, shiftDays, isDownstream };
    });
  }, [visibleTasks, productivity, riskDays, selectedTaskIdSet, fte, downstreamTaskIds, maxSelectedShift]);

  const hourlyRate = useMemo(() => {
    const totalCost = hierarchy.reduce((s, t) => s + (t.actual_cost ?? 0) + (t.remaining_cost ?? 0), 0);
    const totalHrs = hierarchy.reduce((s, t) => s + t.actual_hours + Math.max(0, t.baseline_hours - t.actual_hours), 0);
    return totalHrs > 0 ? totalCost / totalHrs : 100;
  }, [hierarchy]);

  const dependencyLines = useMemo(() => {
    return predecessors
      .map((d) => {
        const to = taskById.get(d.task_id);
        const from = taskById.get(d.predecessor_id);
        if (!to || !from) return null;
        const fromLabel = `${from.project_name} / ${from.phase_name} / ${from.task_name}`;
        const toLabel = `${to.project_name} / ${to.phase_name} / ${to.task_name}`;
        return {
          coords: [[from.end.toISOString().slice(0, 10), fromLabel], [to.start.toISOString().slice(0, 10), toLabel]],
          to,
          from,
        };
      })
      .filter(Boolean) as Array<{ coords: [string, string][]; to: typeof visibleTasks[number]; from: typeof visibleTasks[number] }>;
  }, [predecessors, taskById]);

  const timelineOption = useMemo<EChartsOption>(() => {
    if (!visibleTasks.length) return {};
    const startPoints = visibleTasks.map((t) => ({
      value: [t.start.toISOString().slice(0, 10), `${t.project_name} / ${t.phase_name} / ${t.task_name}`, t.riskScore, t.depCount, t.variance, t.total_float],
      itemStyle: { color: t.is_critical ? '#ef4444' : '#60a5fa' },
    }));
    const endPoints = visibleTasks.map((t) => ({
      value: [t.end.toISOString().slice(0, 10), `${t.project_name} / ${t.phase_name} / ${t.task_name}`, t.riskScore, t.depCount, t.variance, t.total_float],
      itemStyle: { color: t.is_critical ? '#f97316' : '#10b981' },
    }));
    const taskScenarioActive = selectedTaskIdSet.size > 0 && (productivity !== 0 || riskDays !== 0 || Math.abs(fte - 1) > 0.05);
    const scenarioEndPoints = (productivity !== 0 || riskDays !== 0 || taskScenarioActive)
      ? scenarioTasks.map((t) => ({
          value: [t.scenarioEnd.toISOString().slice(0, 10), `${t.project_name} / ${t.phase_name} / ${t.task_name}`, t.shiftDays],
          itemStyle: { color: t.shiftDays > 0 ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)' },
          symbol: 'diamond',
        }))
      : [];

    const legendData = ['Task Start', 'Task End', 'Dependencies'];
    if (scenarioEndPoints.length) legendData.push('Scenario End');

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const d = (p as { data?: { value?: unknown } }).data?.value ?? (p as { value?: unknown }).value;
          if (!Array.isArray(d)) return '';
          const seriesName = (p as { seriesName?: string }).seriesName ?? '';
          if (seriesName === 'Scenario End' && d.length >= 3) {
            return `${d[1]}<br/>Scenario End: ${d[0]}<br/>Shift: ${(d[2] as number) > 0 ? '+' : ''}${d[2]}d`;
          }
          return `${d[1]}<br/>Date: ${d[0]}<br/>Risk: ${Number(d[2]).toFixed(1)}<br/>Dependencies: ${d[3]}<br/>Variance: ${Math.round(Number(d[4]))}h<br/>Float: ${d[5]}d`;
        },
      },
      legend: { data: legendData, top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 200, right: 35, top: 30, bottom: 52 },
      xAxis: { type: 'time', axisLabel: { color: '#94a3b8', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      yAxis: { type: 'category', data: taskNames, inverse: true, axisLabel: { color: '#94a3b8', fontSize: 9, width: 190, overflow: 'truncate' } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', yAxisIndex: 0, right: 4, width: 14 }],
      series: [
        { name: 'Dependencies', type: 'lines', coordinateSystem: 'cartesian2d', polyline: false, z: 1, symbol: ['none', 'arrow'], symbolSize: 8, lineStyle: { color: 'rgba(148,163,184,0.45)', width: 1.2, curveness: 0.2 }, data: dependencyLines.map((l) => ({ coords: l.coords })) },
        { name: 'Task Start', type: 'scatter', z: 3, symbolSize: 7, data: startPoints },
        { name: 'Task End', type: 'scatter', z: 4, symbolSize: 7, data: endPoints },
        ...(scenarioEndPoints.length ? [{ name: 'Scenario End', type: 'scatter', z: 5, symbolSize: 8, symbol: 'diamond', data: scenarioEndPoints }] : []),
      ],
    } as EChartsOption;
  }, [visibleTasks, scenarioTasks, dependencyLines, taskNames, productivity, riskDays, selectedTaskIdSet, fte]);

  const currentFinish = scenarioTasks.length ? scenarioTasks.reduce((m, r) => r.end > m ? r.end : m, scenarioTasks[0].end) : null;
  const scenarioFinish = scenarioTasks.length ? scenarioTasks.reduce((m, r) => r.scenarioEnd > m ? r.scenarioEnd : m, scenarioTasks[0].scenarioEnd) : null;
  const portfolioShiftDays = currentFinish && scenarioFinish ? Math.round((scenarioFinish.getTime() - currentFinish.getTime()) / 86400000) : 0;
  const tasksSlipping = scenarioTasks.filter((t) => t.shiftDays > 0).length;
  const maxTaskShift = scenarioTasks.length ? Math.max(...scenarioTasks.map((t) => t.shiftDays)) : 0;

  const fmtDate = (s: string) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
  const extraCostHours = scenarioTasks.reduce((s, t) => s + (t.shiftDays > 0 ? t.shiftDays * 8 * (t.baseFte || 1) : 0), 0);
  const extraCost = Math.round(extraCostHours * hourlyRate);
  const phaseGroups = useMemo(() => {
    const m = new Map<string, { phaseKey: string; projectName: string; phaseName: string; tasks: typeof visibleTasks }>();
    visibleTasks.forEach((t) => {
      if (!m.has(t.phaseKey)) m.set(t.phaseKey, { phaseKey: t.phaseKey, projectName: t.project_name, phaseName: t.phase_name, tasks: [] });
      m.get(t.phaseKey)!.tasks.push(t);
    });
    return Array.from(m.values());
  }, [visibleTasks]);

  const toggleTask = (tid: string) => setSelectedTaskIds((prev) => { const n = new Set(prev); if (n.has(tid)) n.delete(tid); else n.add(tid); return n; });
  const togglePhase = (pk: string) => setSelectedPhaseKeys((prev) => { const n = new Set(prev); if (n.has(pk)) n.delete(pk); else n.add(pk); return n; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {visibleTasks.length > 0 ? (
        <>
          <div className="glass" style={{ padding: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>Scenario inputs (apply to selected tasks/phases)</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Productivity %</span>
                <input type="number" min={-30} max={30} step={1} value={productivity} onChange={(e) => setProductivity(Number(e.target.value) || 0)} style={{ width: 56, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#e2e8f0', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }} />
              </label>
              <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Risk days</span>
                <input type="number" min={0} max={60} step={1} value={riskDays} onChange={(e) => setRiskDays(Math.max(0, Number(e.target.value) || 0))} style={{ width: 56, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#e2e8f0', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }} />
              </label>
              <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>FTE</span>
                <input type="number" min={0.25} max={8} step={0.25} value={fte} onChange={(e) => setFte(Math.max(0.25, Math.min(8, Number(e.target.value) || 1)))} style={{ width: 56, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#e2e8f0', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>Phases</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {phaseGroups.map((g) => (
                    <label key={g.phaseKey} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.68rem', color: '#cbd5e1' }}>
                      <input type="checkbox" checked={selectedPhaseKeys.has(g.phaseKey)} onChange={() => togglePhase(g.phaseKey)} />
                      {g.projectName} / {g.phaseName} ({g.tasks.length})
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>Tasks (with dependent count)</div>
                <select multiple value={[...selectedTaskIds]} onChange={(e) => { const opts = Array.from((e.target as HTMLSelectElement).selectedOptions, (o) => o.value); setSelectedTaskIds(new Set(opts)); }} style={{ minWidth: 280, maxHeight: 120, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#e2e8f0', fontSize: '0.68rem', padding: '0.25rem' }}>
                  {visibleTasks.map((t) => (
                    <option key={t.task_id} value={t.task_id}>{t.project_name} / {t.phase_name} / {t.task_name} ({t.depCount} dep)</option>
                  ))}
                </select>
                <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '0.2rem' }}>Ctrl+click to select multiple</div>
              </div>
            </div>
            {selectedTaskIdSet.size > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(148,163,184,0.12)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', fontSize: '0.68rem' }}>
                <div><span style={{ color: '#64748b' }}>Selected</span><br /><span style={{ color: '#e2e8f0' }}>{selectedTaskIdSet.size} tasks</span></div>
                <div><span style={{ color: '#64748b' }}>Downstream</span><br /><span style={{ color: '#e2e8f0' }}>{downstreamTaskIds.size} affected</span></div>
                <div><span style={{ color: '#64748b' }}>Max shift</span><br /><span style={{ color: maxSelectedShift > 0 ? '#ef4444' : '#10b981' }}>{maxSelectedShift > 0 ? '+' : ''}{maxSelectedShift}d</span></div>
              </div>
            )}
          </div>
          <ChartWrapper option={timelineOption} height={460} />
          <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
            Dots mark task start/end. Diamonds show scenario end. Arrows = dependencies.
          </div>
          {(productivity !== 0 || riskDays !== 0 || (selectedTaskIdSet.size > 0 && Math.abs(fte - 1) > 0.05)) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div className="glass kpi-card">
                <div className="kpi-label">Current Finish</div>
                <div className="kpi-value" style={{ fontSize: '0.8rem' }}>{currentFinish ? currentFinish.toISOString().slice(0, 10) : '—'}</div>
              </div>
              <div className="glass kpi-card">
                <div className="kpi-label">Scenario Finish</div>
                <div className="kpi-value" style={{ fontSize: '0.8rem', color: '#c7d2fe' }}>{scenarioFinish ? scenarioFinish.toISOString().slice(0, 10) : '—'}</div>
              </div>
              <div className="glass kpi-card">
                <div className="kpi-label">Portfolio Shift</div>
                <div className="kpi-value" style={{ color: portfolioShiftDays > 0 ? '#ef4444' : '#10b981' }}>{portfolioShiftDays > 0 ? '+' : ''}{portfolioShiftDays}d</div>
              </div>
              <div className="glass kpi-card">
                <div className="kpi-label">Tasks Slipping</div>
                <div className="kpi-value" style={{ color: tasksSlipping > 0 ? '#ef4444' : '#10b981' }}>{tasksSlipping}</div>
              </div>
              <div className="glass kpi-card">
                <div className="kpi-label">Max Task Shift</div>
                <div className="kpi-value" style={{ color: maxTaskShift > 0 ? '#ef4444' : '#10b981' }}>{maxTaskShift > 0 ? '+' : ''}{maxTaskShift}d</div>
              </div>
              <div className="glass kpi-card">
                <div className="kpi-label">Extra Cost (est.)</div>
                <div className="kpi-value" style={{ color: extraCost > 0 ? '#ef4444' : '#10b981', fontSize: '0.85rem' }}>${extraCost.toLocaleString()}</div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No schedule data available</div>
      )}
    </div>
  );
}

/* ─── Combined Delivery Risk Register with drill-down to tasks ─── */
function DeliveryRiskRegister({ projects, hierarchy, commentText, setCommentText, saveComment }: {
  projects: Project[];
  hierarchy: HierarchyItem[];
  commentText: string;
  setCommentText: (v: string) => void;
  saveComment: (id: string) => void;
}) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const grouped = useMemo(() => {
    const projMap = new Map<string, { name: string; phases: Map<string, { name: string; tasks: HierarchyItem[] }> }>();
    hierarchy.forEach((item) => {
      if (filter) {
        const s = filter.toLowerCase();
        if (!item.project_name.toLowerCase().includes(s) && !item.phase_name.toLowerCase().includes(s) && !item.task_name.toLowerCase().includes(s)) return;
      }
      if (!projMap.has(item.project_id)) projMap.set(item.project_id, { name: item.project_name, phases: new Map() });
      const proj = projMap.get(item.project_id)!;
      if (!proj.phases.has(item.phase_id)) proj.phases.set(item.phase_id, { name: item.phase_name, tasks: [] });
      proj.phases.get(item.phase_id)!.tasks.push(item);
    });
    return projMap;
  }, [hierarchy, filter]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <div>
      <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by project, phase, or task…" style={{ width: '100%', marginBottom: '0.5rem', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.35rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
              {['', 'Project / Phase / Task', 'Lead', 'Variance', 'SPI', 'Critical', 'Trending Δ', 'Margin', 'Remaining', 'Progress'].map((h) => (
                <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['', 'Project / Phase / Task', 'Lead'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects
              .filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()))
              .map((p) => {
                const proj = grouped.get(p.id);
                const projTasks = proj ? [...proj.phases.values()].flatMap((ph) => ph.tasks) : [];
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      onClick={() => { setExpandedProject((prev) => (prev === p.id ? null : p.id)); setExpandedPhase(null); setCommentText(''); }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td style={{ padding: '0.4rem 0.5rem', width: 20 }}><span style={{ fontSize: '0.55rem', color: expandedProject === p.id ? '#6366f1' : '#64748b' }}>{expandedProject === p.id ? '▼' : '▶'}</span></td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.owner}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: Math.abs(p.variance_pct) > 15 ? '#ef4444' : '#94a3b8' }}>{p.variance_pct > 0 ? '+' : ''}{p.variance_pct.toFixed(1)}%</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: rygLight(p.spi), fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{p.critical_open}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: (p.trend_hours_pct ?? 0) > 10 ? '#ef4444' : '#10b981' }}>{(p.trend_hours_pct ?? 0) > 0 ? '+' : ''}{(p.trend_hours_pct ?? 0).toFixed(1)}%</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: (p.margin_pct ?? 0) >= 15 ? '#10b981' : (p.margin_pct ?? 0) >= 5 ? '#f59e0b' : '#ef4444' }}>{(p.margin_pct ?? 0).toFixed(1)}%</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{p.remaining_hours.toLocaleString()}h</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <div style={{ width: 35, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, p.avg_progress)}%`, height: '100%', background: p.avg_progress >= 80 ? '#10b981' : '#f59e0b', borderRadius: 2 }} />
                          </div>
                          {p.avg_progress.toFixed(0)}%
                        </div>
                      </td>
                    </tr>
                    {expandedProject === p.id && (
                      <>
                        {proj ? [...proj.phases.entries()].map(([phaseId, phase]) => {
                          const phaseVariance = phase.tasks.reduce((s, t) => s + t.variance, 0);
                          const phaseBaseline = phase.tasks.reduce((s, t) => s + t.baseline_hours, 0);
                          const phaseActual = phase.tasks.reduce((s, t) => s + t.actual_hours, 0);
                          const phaseSpi = phaseBaseline > 0 ? Math.round((phaseActual / phaseBaseline) * 100) : 0;
                          const phaseCritical = phase.tasks.filter((t) => t.is_critical && t.percent_complete < 100).length;
                          return (
                            <React.Fragment key={phaseId}>
                              <tr
                                onClick={() => setExpandedPhase((prev) => (prev === phaseId ? null : phaseId))}
                                style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.04)', background: 'rgba(30,41,59,0.3)' }}
                              >
                                <td style={{ padding: '0.35rem 0.5rem' }} />
                                <td style={{ padding: '0.35rem 0.5rem', color: '#cbd5e1', fontWeight: 500, paddingLeft: '1.5rem' }}>↳ {phase.name}</td>
                                <td style={{ padding: '0.35rem 0.5rem', color: '#64748b' }}>—</td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: phaseVariance > 0 ? '#ef4444' : '#10b981' }}>{phaseVariance > 0 ? '+' : ''}{Math.round(phaseVariance)}h</td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{phaseSpi}%</td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: phaseCritical > 0 ? '#ef4444' : '#94a3b8' }}>{phaseCritical}</td>
                                <td style={{ padding: '0.35rem 0.5rem' }} />
                                <td style={{ padding: '0.35rem 0.5rem' }} />
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{phase.tasks.length} tasks</td>
                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}><span style={{ fontSize: '0.55rem', color: expandedPhase === phaseId ? '#6366f1' : '#64748b' }}>{expandedPhase === phaseId ? '▼' : '▶'}</span></td>
                              </tr>
                              {expandedPhase === phaseId && phase.tasks.map((task) => (
                                <tr key={task.task_id} style={{ borderBottom: '1px solid rgba(148,163,184,0.03)', background: 'rgba(15,23,42,0.6)' }}>
                                  <td style={{ padding: '0.3rem 0.5rem' }} />
                                  <td style={{ padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem', paddingLeft: '2.5rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {task.is_critical && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#14b8a6', flexShrink: 0 }} />}
                                    {task.task_name}
                                    {task.subtask_count > 0 && <span style={{ fontSize: '0.55rem', color: '#64748b' }}>({task.subtask_count})</span>}
                                  </td>
                                  <td style={{ padding: '0.3rem 0.5rem', color: '#64748b' }}>—</td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: task.variance > 0 ? '#ef4444' : task.variance < 0 ? '#10b981' : '#64748b', fontWeight: 600 }}>{task.variance > 0 ? '+' : ''}{Math.round(task.variance)}h</td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{task.baseline_hours > 0 ? Math.round((task.actual_hours / task.baseline_hours) * 100) : 0}%</td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: task.is_critical ? '#ef4444' : '#64748b' }}>{task.is_critical ? '1' : '—'}</td>
                                  <td style={{ padding: '0.3rem 0.5rem' }} />
                                  <td style={{ padding: '0.3rem 0.5rem' }} />
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontSize: '0.68rem' }}>{Math.round(task.baseline_hours)}h base</td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                                      <div style={{ width: 28, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                        <div style={{ width: `${Math.min(100, task.percent_complete)}%`, height: '100%', background: task.percent_complete >= 90 ? '#10b981' : task.percent_complete >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 2 }} />
                                      </div>
                                      {task.percent_complete}%
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        }) : null}
                        <tr>
                          <td colSpan={10} style={{ padding: '0.5rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add an intervention note…" style={{ flex: 1, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} onKeyDown={(e) => { if (e.key === 'Enter') saveComment(p.id); }} />
                              <button onClick={() => saveComment(p.id)} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.68rem', cursor: 'pointer' }}>Save</button>
                            </div>
                          </td>
                        </tr>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function DeliveryRiskPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    fetch('/api/senior-manager/delivery-risk', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const rootCauseChart = useMemo<EChartsOption>(() => {
    if (!data?.rootCauses.length) return {};
    const colorMap: Record<string, string> = { 'Scope Creep': '#ef4444', 'Critical Path Delay': '#f97316', 'Rework': '#f59e0b', 'Unplanned Work': '#8b5cf6', 'Execution Variance': '#3b82f6', 'Quality / Rework': '#ef4444', 'Non-Execute': '#8b5cf6', 'Execute': '#3b82f6' };
    return { tooltip: { trigger: 'item', formatter: (p: unknown) => { const d = (p as { data?: { name?: string; value?: number }; dataIndex?: number }).data; const idx = (p as { dataIndex?: number }).dataIndex ?? 0; return `${d?.name ?? ''}<br/>${(d?.value ?? 0).toLocaleString()} hrs<br/>${data.rootCauses[idx]?.project_count ?? 0} projects`; } }, series: [{ type: 'pie', radius: ['35%', '70%'], label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {d}%' }, data: data.rootCauses.map((r) => ({ name: r.root_cause, value: r.impact_hours, itemStyle: { color: colorMap[r.root_cause] || '#6366f1' } })) }] };
  }, [data]);

  const weeklyChart = useMemo<EChartsOption>(() => {
    if (!data?.weeklyThroughput.length) return {};
    const avg = data.weeklyThroughput.reduce((s, w) => s + w.hours, 0) / data.weeklyThroughput.length;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 55, right: 40, top: 20, bottom: 35 },
      xAxis: { type: 'category', data: data.weeklyThroughput.map((w) => w.week), axisLabel: { color: '#94a3b8', fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{
        type: 'bar', data: data.weeklyThroughput.map((w) => w.hours), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.55)' },
        markLine: { silent: true, data: [{ yAxis: Math.round(avg), lineStyle: { color: '#f59e0b', type: 'dashed' as const }, label: { formatter: `Avg: ${Math.round(avg)}`, color: '#f59e0b', fontSize: 9 } }] },
      }],
      dataZoom: [{ type: 'inside', start: 60, end: 100 }, { type: 'slider', height: 18, bottom: 4, textStyle: { color: '#94a3b8', fontSize: 9 } }],
    };
  }, [data]);

  const varianceMatrix = useMemo<EChartsOption>(() => {
    if (!data?.projects.length) return {};
    const top = [...data.projects].sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct)).slice(0, 15);
    return {
      tooltip: { trigger: 'item', formatter: (p: unknown) => { const d = (p as { data?: number[] }).data; if (!Array.isArray(d)) return ''; return `${d[3]}<br/>SPI: ${d[0]}<br/>Variance: ${d[1]}%<br/>Critical: ${d[2]}`; } },
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: 'SPI', nameLocation: 'middle', nameGap: 25, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      yAxis: { type: 'value', name: 'Variance %', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'scatter', symbolSize: (d: number[]) => Math.max(8, Math.min(Math.abs(d[2]) * 6, 36)), data: top.map((p) => [p.spi, p.variance_pct, p.critical_open, p.name]), itemStyle: { color: (params: unknown) => { const p = params as { data?: number[] }; const v = p.data?.[1] ?? 0; return v > 15 ? 'rgba(239,68,68,0.7)' : v > 0 ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.6)'; } } }],
    } as EChartsOption;
  }, [data]);

  const varianceByProject = useMemo<EChartsOption>(() => {
    if (!data?.projects.length) return {};
    const top = [...data.projects].filter((p) => Math.abs(p.variance_hours) > 0).sort((a, b) => b.variance_hours - a.variance_hours).slice(0, 12);
    return {
      tooltip: { trigger: 'axis', formatter: (params: unknown) => { const d = (params as { 0?: { dataIndex?: number } })?.[0]?.dataIndex ?? 0; const p = top[d]; return p ? `${p.name}<br/>Variance: ${p.variance_hours > 0 ? '+' : ''}${Math.round(p.variance_hours)} hrs<br/>SPI: ${p.spi}<br/>Lead: ${p.owner}` : ''; } },
      grid: { left: 120, right: 40, top: 20, bottom: 30 },
      yAxis: { type: 'category', data: top.map((p) => p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: top.map((p) => ({ value: Math.round(p.variance_hours), itemStyle: { borderRadius: p.variance_hours >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3], color: p.variance_hours > 0 ? 'rgba(239,68,68,0.6)' : 'rgba(16,185,129,0.6)' } })) }],
    };
  }, [data]);

  const saveComment = useCallback(async (projectId: string) => {
    if (!commentText.trim()) return;
    await fetch('/api/senior-manager/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'delivery-risk', scope: 'project', recordId: projectId, metricKey: 'sm_comment_project', comment: commentText }) });
    setCommentText('');
  }, [commentText]);

  if (loading) {
    return (<div><h1 className="page-title">Delivery Risk</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={400} /></div>);
  }

  if (!data?.success) return <div><h1 className="page-title">Delivery Risk</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load data.</div></div>;

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">Delivery Risk</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Active Projects" value={k.totalProjects} />
        <KpiCard label="At Risk" value={k.projectsAtRisk} color={k.projectsAtRisk > 0 ? '#ef4444' : '#10b981'} detail="Var ≥15% or Crit ≥3" />
        <KpiCard label="Total Variance" value={`${k.totalVarianceHours.toLocaleString()} hrs`} color={Math.abs(k.totalVarianceHours) > 500 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Avg SPI" value={k.avgSpi.toFixed(2)} color={rygLight(k.avgSpi)} />
        <KpiCard label="Critical Open" value={k.totalCriticalOpen} color={k.totalCriticalOpen > 10 ? '#ef4444' : '#f59e0b'} />
        <KpiCard label="Remaining Hours" value={k.totalRemainingHours.toLocaleString()} />
        <KpiCard label="Avg Progress" value={`${k.avgProgress}%`} color={k.avgProgress >= 60 ? '#10b981' : k.avgProgress >= 30 ? '#f59e0b' : '#ef4444'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Root Cause Concentration</h3>
          <ChartWrapper option={rootCauseChart} height={220} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Risk Quadrant (SPI × Variance)</h3>
          <ChartWrapper option={varianceMatrix} height={220} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Variance by Project (Hours)</h3>
          <ChartWrapper option={varianceByProject} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Weekly Throughput</h3>
          <ChartWrapper option={weeklyChart} height={240} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Dependency & Risk Calendar</h3>
        <DependencyCalendar hierarchy={data.hierarchy || []} predecessors={data.predecessors || []} />
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Delivery Risk Register</h3>
        <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Expand projects to drill down to phases and tasks.</p>
        <DeliveryRiskRegister projects={data.projects} hierarchy={data.hierarchy || []} commentText={commentText} setCommentText={setCommentText} saveComment={saveComment} />
      </div>
    </div>
  );
}
