'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import PageLoader from '@/components/ui/PageLoader';
import { useData } from '@/lib/data-context';

const C = {
  bg: '#18181b',
  border: '#3f3f46',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  teal: '#40E0D0',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
  grid: '#27272a',
};

const TT = {
  backgroundColor: 'rgba(15,15,18,0.96)',
  borderColor: C.border,
  borderWidth: 1,
  textStyle: { color: '#fff', fontSize: 12 },
  extraCssText: 'z-index:99999!important;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
  appendToBody: true,
  confine: false,
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtH = (v: number) => `${Math.round(v).toLocaleString()}h`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString()}`;
const riskColor = (score: number) => (score >= 25 ? C.red : score >= 12 ? C.amber : C.green);

function SectionCard({ title, subtitle, children, right }: { title: string; subtitle: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: C.text, fontSize: '1rem', fontWeight: 800 }}>{title}</h2>
          <p style={{ margin: '0.4rem 0 0', color: C.muted, fontSize: '0.75rem', lineHeight: 1.55 }}>{subtitle}</p>
        </div>
        {right}
      </div>
      <div style={{ padding: '0.9rem 1rem' }}>{children}</div>
    </section>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem' }}>
      <div style={{ fontSize: '0.65rem', color: C.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 800, color: C.text }}>{value}</div>
      {hint ? <div style={{ marginTop: 3, fontSize: '0.6rem', color: C.muted }}>{hint}</div> : null}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  onRowClick,
  activeRow,
}: {
  headers: string[];
  rows: Array<{ key: string; cells: React.ReactNode[] }>;
  onRowClick?: (key: string) => void;
  activeRow?: string | null;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left' }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((r) => (
            <tr
              key={r.key}
              onClick={() => onRowClick?.(r.key)}
              style={{
                borderBottom: `1px solid ${C.border}`,
                background: activeRow && activeRow === r.key ? 'rgba(64,224,208,0.08)' : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              {r.cells.map((c, j) => <td key={`${r.key}-${j}`} style={{ padding: '0.5rem 0.35rem', color: C.text }}>{c}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={headers.length} style={{ textAlign: 'center', color: C.muted, padding: '0.8rem' }}>No data in current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MosPage() {
  const { filteredData, isLoading } = useData();
  const [projectFocus, setProjectFocus] = useState<string>('all');

  const m = useMemo(() => {
    const tasks = filteredData.tasks || [];
    const projects = filteredData.projects || [];
    const deliverables = filteredData.deliverables || [];
    const qctasks = filteredData.qctasks || [];
    const milestones = [...(filteredData.milestones || []), ...(filteredData.milestonesTable || [])];
    const hours = filteredData.hours || [];
    const docs = filteredData.projectDocuments || [];
    const employees = filteredData.employees || [];

    const projectName = new Map<string, string>();
    const projectOwner = new Map<string, string>();
    projects.forEach((p: any) => {
      const id = String(p.id || p.projectId || '');
      projectName.set(id, String(p.name || p.projectName || id));
      projectOwner.set(id, String(p.manager || p.employeeName || p.employeeId || 'Unassigned'));
    });

    const employeeName = new Map<string, string>();
    employees.forEach((e: any) => {
      employeeName.set(String(e.id || e.employeeId), String(e.name || e.employeeId || 'Unknown'));
    });

    const byProject = new Map<string, any>();
    tasks.forEach((t: any) => {
      const pid = String(t.projectId || t.project_id || 'Unassigned');
      if (!byProject.has(pid)) {
        byProject.set(pid, {
          id: pid,
          name: projectName.get(pid) || pid,
          owner: projectOwner.get(pid) || 'Unassigned',
          baselineHours: 0,
          actualHours: 0,
          remainingHours: 0,
          baselineCost: 0,
          actualCost: 0,
          remainingCost: 0,
          taskCount: 0,
          completeCount: 0,
          riskTagged: 0,
          criticalCount: 0,
        });
      }
      const row = byProject.get(pid);
      const bl = num(t.baselineHours || t.baseline_hours || 0);
      const ac = num(t.actualHours || t.actual_hours || 0);
      const rem = t.remainingHours != null ? num(t.remainingHours) : Math.max(0, bl - ac);
      const blc = num(t.baselineCost || t.baseline_cost || 0);
      const acc = num(t.actualCost || t.actual_cost || 0);
      const remc = num(t.remainingCost || t.remaining_cost || 0);
      const pc = num(t.percentComplete || t.percent_complete || 0);
      const status = String(t.status || '').toLowerCase();

      row.baselineHours += bl;
      row.actualHours += ac;
      row.remainingHours += rem;
      row.baselineCost += blc;
      row.actualCost += acc;
      row.remainingCost += remc;
      row.taskCount += 1;
      row.completeCount += pc >= 100 ? 1 : 0;
      row.riskTagged += (status.includes('risk') || status.includes('late') || status.includes('delay')) ? 1 : 0;
      row.criticalCount += (t.isCritical || num(t.totalFloat) <= 0) ? 1 : 0;
    });

    const projectRows = Array.from(byProject.values()).map((r: any) => {
      const work = r.actualHours + r.remainingHours;
      const scheduleCost = r.actualCost + r.remainingCost;
      const workVariance = work - r.baselineHours;
      const overrunPct = r.baselineHours > 0 ? (workVariance / r.baselineHours) * 100 : 0;
      const costVariance = scheduleCost - r.baselineCost;
      const performanceMetric = r.completeCount > 0 ? r.actualHours / r.completeCount : 0;
      const riskScore = Math.max(0, overrunPct) * 0.4 + r.riskTagged * 3 + r.criticalCount * 2 + Math.max(0, costVariance / 10000);
      return { ...r, work, scheduleCost, workVariance, overrunPct, costVariance, performanceMetric, riskScore };
    });

    const taskToProject = new Map<string, string>();
    tasks.forEach((t: any) => taskToProject.set(String(t.id || t.taskId), String(t.projectId || t.project_id || '')));

    const qcByProject = new Map<string, { records: number; critical: number; nonCritical: number; qcHours: number }>();
    qctasks.forEach((q: any) => {
      const pid = taskToProject.get(String(q.parentTaskId || q.parent_task_id || '')) || '';
      const cur = qcByProject.get(pid) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 };
      cur.records += 1;
      cur.critical += num(q.qcCriticalErrors || q.qc_critical_errors || 0);
      cur.nonCritical += num(q.qcNonCriticalErrors || q.qc_non_critical_errors || 0);
      cur.qcHours += num(q.qcHours || q.qc_hours || 0);
      qcByProject.set(pid, cur);
    });

    const milestoneByProject = new Map<string, { total: number; delayed: number; avgDrift: number; driftSum: number }>();
    milestones.forEach((mm: any) => {
      const pid = String(mm.projectId || mm.project_id || '');
      const planned = new Date(mm.plannedDate || mm.planned_date || mm.baselineEndDate || '');
      const forecast = new Date(mm.forecastedDate || mm.forecasted_date || mm.endDate || '');
      const drift = (!Number.isNaN(planned.getTime()) && !Number.isNaN(forecast.getTime()))
        ? Math.round((forecast.getTime() - planned.getTime()) / (24 * 3600 * 1000))
        : num(mm.varianceDays || mm.variance_days || 0);
      const cur = milestoneByProject.get(pid) || { total: 0, delayed: 0, avgDrift: 0, driftSum: 0 };
      cur.total += 1;
      cur.delayed += drift > 0 ? 1 : 0;
      cur.driftSum += drift;
      milestoneByProject.set(pid, cur);
    });
    milestoneByProject.forEach((v) => {
      v.avgDrift = v.total > 0 ? v.driftSum / v.total : 0;
    });

    const monthKey = (dateRaw: any) => {
      const d = new Date(dateRaw || '');
      if (Number.isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    };

    const monthlyWork = new Map<string, { ex: number; qc: number; rework: number }>();
    hours.forEach((h: any) => {
      const mKey = monthKey(h.date || h.entryDate || h.createdAt);
      if (mKey === 'Unknown') return;
      const ct = String(h.chargeType || '').toUpperCase();
      const row = monthlyWork.get(mKey) || { ex: 0, qc: 0, rework: 0 };
      if (ct === 'EX') row.ex += num(h.hours);
      if (ct === 'QC') row.qc += num(h.hours);
      if (ct === 'CR' || ct === 'SC') row.rework += num(h.hours);
      monthlyWork.set(mKey, row);
    });

    const reworkHours = Array.from(monthlyWork.values()).reduce((s, x) => s + x.rework, 0);
    const executeHours = Array.from(monthlyWork.values()).reduce((s, x) => s + x.ex, 0);
    const qcHours = Array.from(monthlyWork.values()).reduce((s, x) => s + x.qc, 0);

    const demandByAssignee = new Map<string, { id: string; name: string; demand: number; capacity: number }>();
    tasks.forEach((t: any) => {
      const assigneeId = String(t.assignedResourceId || t.employeeId || t.assignedResource || 'Unassigned');
      const assigneeName = employeeName.get(assigneeId) || assigneeId;
      const rem = t.remainingHours != null ? num(t.remainingHours) : Math.max(0, num(t.baselineHours) - num(t.actualHours));
      const cur = demandByAssignee.get(assigneeId) || { id: assigneeId, name: assigneeName, demand: 0, capacity: 160 };
      cur.demand += rem;
      demandByAssignee.set(assigneeId, cur);
    });

    const readiness = {
      workflowPlan: tasks.length > 0,
      deliverablesDefined: deliverables.length,
      deliverablesPerProject: projects.length > 0 ? deliverables.length / projects.length : 0,
      clientAgreed: docs.filter((d: any) => String(d.status || d.approvalStatus || '').toLowerCase().includes('approved')).length,
      procedures: deliverables.filter((d: any) => String(d.name || d.type || '').toLowerCase().includes('procedure')).length,
      qmp: deliverables.filter((d: any) => String(d.name || d.type || '').toLowerCase().includes('qmp') || String(d.name || d.type || '').toLowerCase().includes('quality')).length,
      qcLogged: qctasks.length,
      milestones: milestones.length,
      progressUpdated: tasks.filter((t: any) => num(t.percentComplete || t.percent_complete) > 0).length,
      demandRosterAligned: executeHours > 0 ? Math.max(0, Math.min(100, (executeHours / Math.max(executeHours + reworkHours + qcHours, 1)) * 100)) : 0,
    };

    const totals = {
      baselineHours: projectRows.reduce((s, r) => s + r.baselineHours, 0),
      actualHours: projectRows.reduce((s, r) => s + r.actualHours, 0),
      remainingHours: projectRows.reduce((s, r) => s + r.remainingHours, 0),
      baselineCost: projectRows.reduce((s, r) => s + r.baselineCost, 0),
      scheduleCost: projectRows.reduce((s, r) => s + r.scheduleCost, 0),
      executeHours,
      qcHours,
      reworkHours,
      monthlyWork,
    };

    return {
      tasks,
      projects,
      projectRows,
      qcByProject,
      milestoneByProject,
      demandByAssignee,
      readiness,
      totals,
    };
  }, [filteredData]);

  useEffect(() => {
    if (projectFocus !== 'all' && !m.projectRows.some((r: any) => r.id === projectFocus)) {
      setProjectFocus('all');
    }
  }, [projectFocus, m.projectRows]);

  if (isLoading) return <PageLoader />;

  const focusedRows = projectFocus === 'all' ? m.projectRows : m.projectRows.filter((r: any) => r.id === projectFocus);

  const topProgressRows = [...focusedRows].sort((a: any, b: any) => b.workVariance - a.workVariance).slice(0, 12);
  const forecastRows = [...focusedRows].map((p: any) => {
    const mm = m.milestoneByProject.get(p.id) || { total: 0, delayed: 0, avgDrift: 0 };
    return { ...p, ...mm };
  }).sort((a: any, b: any) => b.delayed - a.delayed || b.avgDrift - a.avgDrift).slice(0, 12);
  const productivityRows = [...focusedRows].sort((a: any, b: any) => b.performanceMetric - a.performanceMetric).slice(0, 12);
  const overrunRows = [...focusedRows].sort((a: any, b: any) => b.overrunPct - a.overrunPct).slice(0, 12);
  const qualityRows = [...focusedRows].map((p: any) => ({ ...p, ...(m.qcByProject.get(p.id) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 }) }))
    .sort((a: any, b: any) => (b.critical + b.nonCritical) - (a.critical + a.nonCritical)).slice(0, 12);
  const riskRows = [...focusedRows].sort((a: any, b: any) => b.riskScore - a.riskScore).slice(0, 15);

  const overviewMixOption: EChartsOption = {
    tooltip: { ...TT, trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: C.muted, fontSize: 10 } },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['50%', '45%'],
      label: { color: C.muted, fontSize: 10 },
      data: [
        { name: 'Execution Hours', value: m.totals.executeHours, itemStyle: { color: C.blue } },
        { name: 'QC Hours', value: m.totals.qcHours, itemStyle: { color: C.purple } },
        { name: 'Rework Hours', value: m.totals.reworkHours, itemStyle: { color: C.amber } },
      ],
    }],
  };

  const riskBarRows = [...m.projectRows].sort((a: any, b: any) => b.riskScore - a.riskScore).slice(0, 10);
  const riskRankOption: EChartsOption = {
    tooltip: { ...TT, trigger: 'axis' },
    grid: { top: 16, left: 90, right: 14, bottom: 24, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: 'category', data: riskBarRows.map((r: any) => r.name), axisLabel: { color: C.muted, fontSize: 10 } },
    series: [{
      type: 'bar',
      data: riskBarRows.map((r: any) => ({ value: Number(r.riskScore.toFixed(1)), projectId: r.id, itemStyle: { color: riskColor(r.riskScore) } })),
    }],
  };

  const monthlyRows = Array.from(m.totals.monthlyWork.entries())
    .sort((a, b) => new Date(`${a[0]} 1`).getTime() - new Date(`${b[0]} 1`).getTime())
    .slice(-12);
  const monthlyTrendOption: EChartsOption = {
    tooltip: { ...TT, trigger: 'axis' },
    legend: { top: 0, textStyle: { color: C.muted, fontSize: 10 } },
    grid: { top: 30, left: 42, right: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: monthlyRows.map(([k]) => k), axisLabel: { color: C.muted, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
    series: [
      { name: 'Execution', type: 'line', data: monthlyRows.map(([, v]) => Number(v.ex.toFixed(1))), itemStyle: { color: C.blue }, smooth: true },
      { name: 'QC', type: 'line', data: monthlyRows.map(([, v]) => Number(v.qc.toFixed(1))), itemStyle: { color: C.purple }, smooth: true },
      { name: 'Rework', type: 'line', data: monthlyRows.map(([, v]) => Number(v.rework.toFixed(1))), itemStyle: { color: C.amber }, smooth: true },
    ],
  };

  const capacityRows = Array.from(m.demandByAssignee.values())
    .map((r: any) => ({ ...r, gap: r.demand - r.capacity }))
    .sort((a: any, b: any) => b.gap - a.gap)
    .slice(0, 12);

  const capacityOption: EChartsOption = {
    tooltip: { ...TT, trigger: 'axis' },
    legend: { top: 0, textStyle: { color: C.muted, fontSize: 10 } },
    grid: { top: 30, left: 78, right: 12, bottom: 22, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: 'category', data: capacityRows.map((r: any) => r.name), axisLabel: { color: C.muted, fontSize: 10 } },
    series: [
      { name: 'Demand', type: 'bar', data: capacityRows.map((r: any) => Number(r.demand.toFixed(1))), itemStyle: { color: C.red } },
      { name: 'Capacity', type: 'bar', data: capacityRows.map((r: any) => r.capacity), itemStyle: { color: C.green } },
    ],
  };

  const focusedProject = projectFocus === 'all'
    ? [...m.projectRows].sort((a: any, b: any) => b.riskScore - a.riskScore)[0]
    : m.projectRows.find((r: any) => r.id === projectFocus);

  const focusedQC = focusedProject ? (m.qcByProject.get(focusedProject.id) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 }) : null;
  const focusedMilestone = focusedProject ? (m.milestoneByProject.get(focusedProject.id) || { total: 0, delayed: 0, avgDrift: 0 }) : null;

  return (
    <div style={{ padding: '1.2rem 1.4rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 'calc(100vh - 96px)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 980 }}>
          <h1 style={{ margin: 0, color: C.text, fontSize: '2rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
          <p style={{ margin: 0, color: C.muted, fontSize: '0.82rem', lineHeight: 1.6 }}>
            This dashboard combines structured executive explanations with interactive visuals and deep tables. You can focus a single project
            from charts or tables to inspect the same sections through a project-specific lens.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: C.muted, fontSize: '0.7rem' }}>Project Focus</label>
          <select
            value={projectFocus}
            onChange={(e) => setProjectFocus(e.target.value)}
            style={{ background: '#101014', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
          >
            <option value="all">All Projects</option>
            {[...m.projectRows].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const highest = [...m.projectRows].sort((a: any, b: any) => b.riskScore - a.riskScore)[0];
              if (highest) setProjectFocus(highest.id);
            }}
            style={{ background: 'rgba(239,68,68,0.15)', color: C.red, border: `1px solid ${C.red}66`, borderRadius: 8, padding: '0.35rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            Focus Highest Risk
          </button>
          <button
            onClick={() => setProjectFocus('all')}
            style={{ background: 'rgba(64,224,208,0.15)', color: C.teal, border: `1px solid ${C.teal}66`, borderRadius: 8, padding: '0.35rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <SectionCard title="Effort Composition" subtitle="Distribution of execution, quality, and rework effort.">
          <ChartWrapper option={overviewMixOption} height={240} />
        </SectionCard>
        <SectionCard title="Risk Ranking" subtitle="Current comparative risk score by project. Click a bar to focus that project.">
          <ChartWrapper option={riskRankOption} height={240} onClick={(p) => {
            const pid = (p.data as any)?.projectId;
            if (pid) setProjectFocus(String(pid));
          }} />
        </SectionCard>
        <SectionCard title="Monthly Work Trend" subtitle="Execution, QC, and rework history over the latest months.">
          <ChartWrapper option={monthlyTrendOption} height={240} />
        </SectionCard>
      </div>

      <SectionCard
        title="Focused Detail"
        subtitle="A concise project-level profile that updates with current focus and allows quick interpretation before diving into section tables."
        right={focusedProject ? <span style={{ color: riskColor(focusedProject.riskScore), fontWeight: 800, fontSize: '0.78rem' }}>{focusedProject.name}</span> : null}
      >
        {focusedProject ? (
          <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <StatTile label="Owner" value={focusedProject.owner} />
            <StatTile label="Work Variance" value={fmtH(focusedProject.workVariance)} />
            <StatTile label="Cost Variance" value={fmtMoney(focusedProject.costVariance)} />
            <StatTile label="Overrun" value={fmtPct(focusedProject.overrunPct)} />
            <StatTile label="Risk Score" value={focusedProject.riskScore.toFixed(1)} />
            <StatTile label="Performance Metric" value={focusedProject.performanceMetric.toFixed(2)} hint="Actual hours per completed task" />
            <StatTile label="QC Records" value={String(focusedQC?.records || 0)} />
            <StatTile label="QC Critical" value={String(focusedQC?.critical || 0)} />
            <StatTile label="Milestones" value={String(focusedMilestone?.total || 0)} />
            <StatTile label="Delayed Milestones" value={String(focusedMilestone?.delayed || 0)} />
            <StatTile label="Avg Milestone Drift" value={`${(focusedMilestone?.avgDrift || 0).toFixed(1)}d`} />
            <StatTile label="Task Completion" value={`${focusedProject.completeCount}/${focusedProject.taskCount}`} />
          </div>
        ) : <div style={{ color: C.muted, fontSize: '0.75rem' }}>No project-level data under current filters.</div>}
      </SectionCard>

      <SectionCard
        title="Executive-Level Questions: Overall Health & Predictability"
        subtitle="This section summarizes planning completeness, deliverable governance, quality governance, progress reporting hygiene, and staffing alignment using current filtered data."
      >
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <StatTile label="Workflow / Plan" value={m.readiness.workflowPlan ? 'Available' : 'Missing'} />
          <StatTile label="Deliverables" value={`${m.readiness.deliverablesDefined}`} hint={`${m.readiness.deliverablesPerProject.toFixed(1)} per project`} />
          <StatTile label="Client-Approved Docs" value={`${m.readiness.clientAgreed}`} />
          <StatTile label="Procedure Coverage" value={`${m.readiness.procedures}`} />
          <StatTile label="QMP Coverage" value={`${m.readiness.qmp}`} />
          <StatTile label="QC Logs" value={`${m.readiness.qcLogged}`} />
          <StatTile label="Milestones Defined" value={`${m.readiness.milestones}`} />
          <StatTile label="Tasks with Progress" value={`${m.readiness.progressUpdated}`} hint={`${m.tasks.length} total tasks`} />
          <StatTile label="Demand vs Roster" value={fmtPct(m.readiness.demandRosterAligned)} hint="Share of execution hours within total logged effort" />
        </div>
      </SectionCard>

      <SectionCard
        title="1. Progress vs Plan"
        subtitle="Progress vs Plan compares total expected work (baseline) to current workload (actual + remaining). Work variance indicates whether the total effort envelope has expanded or contracted."
      >
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
          <StatTile label="Baseline Work" value={fmtH(m.totals.baselineHours)} />
          <StatTile label="Current Work (Actual + Remaining)" value={fmtH(m.totals.actualHours + m.totals.remainingHours)} />
          <StatTile label="Added / Reduced Work" value={fmtH((m.totals.actualHours + m.totals.remainingHours) - m.totals.baselineHours)} />
          <StatTile label="Completion (Tasks)" value={fmtPct(m.tasks.length > 0 ? (focusedRows.reduce((s: number, r: any) => s + r.completeCount, 0) / Math.max(1, focusedRows.reduce((s: number, r: any) => s + r.taskCount, 0))) * 100 : 0)} />
        </div>
        <DataTable
          headers={["Project", "Owner", "Baseline", "Current Work", "Work Variance", "Overrun %"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={topProgressRows.map((r: any) => ({
            key: r.id,
            cells: [
              r.name,
              r.owner,
              fmtH(r.baselineHours),
              fmtH(r.work),
              <span key="wv" style={{ color: r.workVariance > 0 ? C.red : r.workVariance < 0 ? C.green : C.muted }}>{fmtH(r.workVariance)}</span>,
              <span key="ov" style={{ color: r.overrunPct > 10 ? C.red : r.overrunPct > 0 ? C.amber : C.green }}>{fmtPct(r.overrunPct)}</span>,
            ],
          }))}
        />
      </SectionCard>

      <SectionCard
        title="2. Forecast Reliability"
        subtitle="Forecast reliability evaluates milestone drift behavior. Delayed milestone counts and average drift days indicate whether schedule movement is isolated to specific projects or recurring across the portfolio."
      >
        <DataTable
          headers={["Project", "Owner", "Milestones", "Delayed", "Avg Drift (days)", "Interpretation"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={forecastRows.map((r: any) => {
            const note = r.total === 0
              ? 'No milestone set; forecast confidence cannot be assessed.'
              : r.delayed === 0
                ? 'Milestone forecasts are stable against baseline plan.'
                : r.avgDrift > 7
                  ? 'Frequent and material schedule movement; forecasting discipline needs tightening.'
                  : 'Delays exist but are currently moderate.';
            return {
              key: r.id,
              cells: [
                r.name,
                r.owner,
                String(r.total),
                <span key="d" style={{ color: r.delayed > 0 ? C.amber : C.green }}>{String(r.delayed)}</span>,
                <span key="a" style={{ color: r.avgDrift > 7 ? C.red : r.avgDrift > 0 ? C.amber : C.green }}>{r.avgDrift.toFixed(1)}</span>,
                note,
              ],
            };
          })}
        />
      </SectionCard>

      <SectionCard
        title="3. Resource Efficiency and Productivity"
        subtitle="Productivity is measured using effort consumed per completed output at project level. Higher values indicate more hours required per completed unit and lower conversion efficiency."
      >
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
          <StatTile label="Total Actual Hours" value={fmtH(m.totals.actualHours)} />
          <StatTile label="Execution Hours" value={fmtH(m.totals.executeHours)} />
          <StatTile label="QC Hours" value={fmtH(m.totals.qcHours)} />
          <StatTile label="Rework-Oriented Hours" value={fmtH(m.totals.reworkHours)} />
        </div>
        <DataTable
          headers={["Project", "Owner", "Actual Hours", "Completed Tasks", "Performance Metric", "Efficiency Reading"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={productivityRows.map((r: any) => ({
            key: r.id,
            cells: [
              r.name,
              r.owner,
              fmtH(r.actualHours),
              String(r.completeCount),
              <span key="pm" style={{ color: r.performanceMetric > 80 ? C.red : r.performanceMetric > 40 ? C.amber : C.green }}>{r.performanceMetric.toFixed(2)}</span>,
              r.performanceMetric > 80
                ? 'High effort per completed unit.'
                : r.performanceMetric > 40
                  ? 'Moderate conversion efficiency.'
                  : 'Stronger conversion efficiency.',
            ],
          }))}
        />
      </SectionCard>

      <SectionCard
        title="4. Cost and Hours Overrun Risk"
        subtitle="This section compares projected final consumption to original baseline for both hours and cost. It highlights where expansion in scope or effort is likely to pressure financial outcomes."
      >
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
          <StatTile label="Baseline Cost" value={fmtMoney(m.totals.baselineCost)} />
          <StatTile label="Projected Schedule Cost" value={fmtMoney(m.totals.scheduleCost)} />
          <StatTile label="Cost Variance" value={fmtMoney(m.totals.scheduleCost - m.totals.baselineCost)} />
          <StatTile label="Hours Overrun" value={fmtH((m.totals.actualHours + m.totals.remainingHours) - m.totals.baselineHours)} />
        </div>
        <DataTable
          headers={["Project", "Owner", "Overrun %", "Cost Variance", "Risk Score", "Trend"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={overrunRows.map((r: any) => ({
            key: r.id,
            cells: [
              r.name,
              r.owner,
              <span key="op" style={{ color: r.overrunPct > 15 ? C.red : r.overrunPct > 5 ? C.amber : C.green }}>{fmtPct(r.overrunPct)}</span>,
              <span key="cv" style={{ color: r.costVariance > 0 ? C.red : C.green }}>{fmtMoney(r.costVariance)}</span>,
              <span key="rs" style={{ color: riskColor(r.riskScore), fontWeight: 700 }}>{r.riskScore.toFixed(1)}</span>,
              r.overrunPct > 15 ? 'Exposure is elevated and compounding risk is likely.' : r.overrunPct > 5 ? 'Watchlist; corrective pressure should continue.' : 'Currently stable vs baseline.',
            ],
          }))}
        />
      </SectionCard>

      <SectionCard
        title="5. Quality Impact on Performance"
        subtitle="Quality impact is shown through issue volumes, criticality mix, and quality-related effort. It helps distinguish whether performance losses are execution-driven or quality-cycle-driven."
      >
        <DataTable
          headers={["Project", "QC Records", "Critical", "Non-Critical", "QC Hours", "Quality Interpretation"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={qualityRows.map((r: any) => {
            const issueCount = r.critical + r.nonCritical;
            const note = issueCount === 0
              ? 'No recorded QC issue load in current filter scope.'
              : r.critical > 0
                ? 'Critical defects present; quality risk materially affects delivery confidence.'
                : 'Issues are present but currently non-critical.';
            return {
              key: r.id,
              cells: [
                r.name,
                String(r.records || 0),
                <span key="c" style={{ color: r.critical > 0 ? C.red : C.green }}>{String(r.critical || 0)}</span>,
                String(r.nonCritical || 0),
                fmtH(r.qcHours || 0),
                note,
              ],
            };
          })}
        />
      </SectionCard>

      <SectionCard
        title="6. Resource Capacity vs Demand"
        subtitle="Capacity vs demand compares remaining assigned effort against an assumed monthly capacity baseline. Positive gap indicates overload pressure; negative gap indicates available room."
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: '0.9rem' }}>
          <div>
            <DataTable
              headers={["Resource", "Demand", "Capacity", "Gap", "Capacity State"]}
              rows={capacityRows.map((r: any) => ({
                key: r.id,
                cells: [
                  r.name,
                  fmtH(r.demand),
                  fmtH(r.capacity),
                  <span key="gap" style={{ color: r.gap > 0 ? C.red : C.green }}>{fmtH(r.gap)}</span>,
                  r.gap > 40 ? 'Significant overload.' : r.gap > 0 ? 'Moderate overload.' : 'Within available capacity.',
                ],
              }))}
            />
          </div>
          <div style={{ minHeight: 320 }}>
            <ChartWrapper option={capacityOption} height={320} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="7. Predictability and Risk Exposure"
        subtitle="Risk exposure consolidates schedule pressure, overrun behavior, and critical path density into a single comparative ranking to prioritize leadership attention."
      >
        <DataTable
          headers={["Project", "Owner", "Risk Score", "Critical Tasks", "At-Risk Tasks", "Executive Summary"]}
          activeRow={projectFocus === 'all' ? null : projectFocus}
          onRowClick={(id) => setProjectFocus((prev) => prev === id ? 'all' : id)}
          rows={riskRows.map((r: any) => ({
            key: r.id,
            cells: [
              r.name,
              r.owner,
              <span key="r" style={{ color: riskColor(r.riskScore), fontWeight: 700 }}>{r.riskScore.toFixed(1)}</span>,
              String(r.criticalCount),
              String(r.riskTagged),
              r.riskScore >= 25
                ? 'High volatility profile; requires immediate schedule-cost containment plan.'
                : r.riskScore >= 12
                  ? 'Material but manageable exposure; maintain active mitigation cadence.'
                  : 'Lower relative risk in current view.',
            ],
          }))}
        />
      </SectionCard>
    </div>
  );
}
