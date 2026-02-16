'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import PageLoader from '@/components/ui/PageLoader';
import { useData } from '@/lib/data-context';

const C = {
  teal: '#40E0D0',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  green: '#10B981',
  red: '#EF4444',
  cyan: '#06B6D4',
  bg: '#18181b',
  border: '#3f3f46',
  text: '#f4f4f5',
  muted: '#a1a1aa',
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

const toMonth = (dateRaw: any) => {
  const d = new Date(dateRaw || '');
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '0.85rem 1rem', borderBottom: `1px solid ${C.border}` }}>
        <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h3>
        <div style={{ color: C.muted, fontSize: '0.7rem', marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: '0.85rem 1rem' }}>{children}</div>
    </section>
  );
}

function ReadinessTile({ label, value, target = '100%' }: { label: string; value: string; target?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem' }}>
      <div style={{ fontSize: '0.65rem', color: C.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 800, color: C.text }}>{value}</div>
      <div style={{ marginTop: 2, fontSize: '0.58rem', color: C.muted }}>Target: {target}</div>
    </div>
  );
}

export default function MosPage() {
  const { filteredData, isLoading } = useData();

  const model = useMemo(() => {
    const tasks = filteredData.tasks || [];
    const projects = filteredData.projects || [];
    const qctasks = filteredData.qctasks || [];
    const deliverables = filteredData.deliverables || [];
    const milestones = [
      ...(filteredData.milestones || []),
      ...(filteredData.milestonesTable || []),
    ];
    const hours = filteredData.hours || [];
    const employees = filteredData.employees || [];
    const docs = filteredData.projectDocuments || [];

    const projectName = new Map<string, string>();
    const projectOwner = new Map<string, string>();
    projects.forEach((p: any) => {
      const pid = String(p.id || p.projectId || '');
      projectName.set(pid, String(p.name || p.projectName || pid));
      projectOwner.set(pid, String(p.manager || p.employeeName || p.employeeId || 'Unassigned'));
    });

    const empName = new Map<string, string>();
    employees.forEach((e: any) => {
      empName.set(String(e.id || e.employeeId), String(e.name || e.employeeId || 'Unknown'));
    });

    const byProject = new Map<string, {
      projectId: string;
      name: string;
      owner: string;
      baselineHours: number;
      actualHours: number;
      remainingHours: number;
      baselineCost: number;
      actualCost: number;
      remainingCost: number;
      completedCount: number;
      taskCount: number;
      criticalTasks: number;
      lateTasks: number;
    }>();

    tasks.forEach((t: any) => {
      const pid = String(t.projectId || t.project_id || 'Unassigned');
      if (!byProject.has(pid)) {
        byProject.set(pid, {
          projectId: pid,
          name: projectName.get(pid) || pid,
          owner: projectOwner.get(pid) || 'Unassigned',
          baselineHours: 0,
          actualHours: 0,
          remainingHours: 0,
          baselineCost: 0,
          actualCost: 0,
          remainingCost: 0,
          completedCount: 0,
          taskCount: 0,
          criticalTasks: 0,
          lateTasks: 0,
        });
      }
      const row = byProject.get(pid)!;
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
      if (pc >= 100) row.completedCount += 1;
      if (t.isCritical || num(t.totalFloat) <= 0) row.criticalTasks += 1;
      if (status.includes('late') || status.includes('delay') || status.includes('risk')) row.lateTasks += 1;
    });

    const projectRows = Array.from(byProject.values()).map((r) => {
      const work = r.actualHours + r.remainingHours;
      const scheduleCost = r.actualCost + r.remainingCost;
      const workVar = work - r.baselineHours;
      const costVar = scheduleCost - r.baselineCost;
      const perfMetric = r.completedCount > 0 ? r.actualHours / r.completedCount : 0;
      const efficiency = r.baselineHours > 0 ? r.actualHours / r.baselineHours : 1;
      const overrunPct = r.baselineHours > 0 ? (workVar / r.baselineHours) * 100 : 0;
      const riskScore = (Math.max(0, overrunPct) * 0.35) + (r.lateTasks * 3) + (r.criticalTasks * 2) + (Math.max(0, costVar / 10000));
      return {
        ...r,
        work,
        scheduleCost,
        workVar,
        costVar,
        perfMetric,
        efficiency,
        overrunPct,
        riskScore,
      };
    });

    const totalBaselineHours = projectRows.reduce((s, p) => s + p.baselineHours, 0);
    const totalActualHours = projectRows.reduce((s, p) => s + p.actualHours, 0);
    const totalRemainingHours = projectRows.reduce((s, p) => s + p.remainingHours, 0);
    const totalWork = totalActualHours + totalRemainingHours;
    const totalBaselineCost = projectRows.reduce((s, p) => s + p.baselineCost, 0);
    const totalScheduleCost = projectRows.reduce((s, p) => s + p.scheduleCost, 0);

    const qcByProject = new Map<string, { records: number; critical: number; nonCritical: number; qcHours: number }>();
    const taskProjectMap = new Map<string, string>();
    tasks.forEach((t: any) => taskProjectMap.set(String(t.id || t.taskId), String(t.projectId || t.project_id || '')));
    qctasks.forEach((q: any) => {
      const pid = taskProjectMap.get(String(q.parentTaskId || q.parent_task_id || '')) || '';
      const prev = qcByProject.get(pid) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 };
      prev.records += 1;
      prev.critical += num(q.qcCriticalErrors || q.qc_critical_errors || 0);
      prev.nonCritical += num(q.qcNonCriticalErrors || q.qc_non_critical_errors || 0);
      prev.qcHours += num(q.qcHours || q.qc_hours || 0);
      qcByProject.set(pid, prev);
    });

    const nonExecute = hours.filter((h: any) => {
      const ct = String(h.chargeType || '').toUpperCase();
      return ct === 'QC' || ct === 'CR' || ct === 'SC';
    }).reduce((s: number, h: any) => s + num(h.hours), 0);

    const execute = hours.filter((h: any) => String(h.chargeType || '').toUpperCase() === 'EX').reduce((s: number, h: any) => s + num(h.hours), 0);

    const productivityByMonth = new Map<string, { actual: number; completed: number; efficiency: number }>();
    tasks.forEach((t: any) => {
      const month = toMonth(t.updatedAt || t.actualEndDate || t.actual_end || t.endDate || t.end_date);
      const prev = productivityByMonth.get(month) || { actual: 0, completed: 0, efficiency: 0 };
      prev.actual += num(t.actualHours || t.actual_hours || 0);
      prev.completed += num(t.completedCount || t.completed_count || 0);
      productivityByMonth.set(month, prev);
    });
    Array.from(productivityByMonth.values()).forEach((m) => {
      m.efficiency = m.completed > 0 ? m.actual / m.completed : 0;
    });

    const milestoneRisk = milestones.map((m: any) => {
      const pid = String(m.projectId || m.project_id || '');
      const planned = new Date(m.plannedDate || m.planned_date || m.baselineEndDate || '');
      const forecast = new Date(m.forecastedDate || m.forecasted_date || m.endDate || '');
      const varianceDays = Number.isNaN(planned.getTime()) || Number.isNaN(forecast.getTime())
        ? num(m.varianceDays)
        : Math.round((forecast.getTime() - planned.getTime()) / (24 * 3600 * 1000));
      return {
        projectId: pid,
        projectName: projectName.get(pid) || pid,
        owner: projectOwner.get(pid) || 'Unassigned',
        varianceDays,
        status: String(m.status || '').toLowerCase(),
      };
    });

    const readiness = {
      workflowPlan: tasks.length > 0 ? 100 : 0,
      deliverablesDefined: projects.length > 0 ? Math.round((deliverables.length / Math.max(1, projects.length)) * 100) : 0,
      clientAgreed: docs.filter((d: any) => String(d.status || '').toLowerCase().includes('approved') || String(d.approvalStatus || '').toLowerCase().includes('approved')).length,
      proceduresCoverage: deliverables.filter((d: any) => String(d.type || '').toLowerCase().includes('procedure') || String(d.name || '').toLowerCase().includes('procedure')).length,
      qmpCoverage: deliverables.filter((d: any) => String(d.type || '').toLowerCase().includes('qmp') || String(d.name || '').toLowerCase().includes('quality')).length,
      qcLogged: qctasks.length,
      milestonesDefined: milestones.length,
      progressUpdated: tasks.filter((t: any) => num(t.percentComplete || t.percent_complete || 0) > 0).length,
      demandRosterAligned: execute > 0 ? Math.max(0, Math.min(100, Math.round((execute / Math.max(execute + nonExecute, 1)) * 100))) : 0,
    };

    const topAttention = [...projectRows]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 12)
      .map((p) => {
        const qc = qcByProject.get(p.projectId) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 };
        const milestoneDelays = milestoneRisk.filter((m) => m.projectId === p.projectId && m.varianceDays > 0).length;
        const trigger = [
          p.overrunPct > 10 ? `Overrun +${p.overrunPct.toFixed(1)}%` : '',
          p.lateTasks > 0 ? `${p.lateTasks} late/risk tasks` : '',
          milestoneDelays > 0 ? `${milestoneDelays} delayed milestones` : '',
          qc.critical > 0 ? `${qc.critical} critical QC errors` : '',
        ].filter(Boolean).join(' | ') || 'Watchlist';

        const recommendedAction = p.overrunPct > 20
          ? 'Scope freeze and recovery plan in 48h'
          : p.lateTasks > 0
            ? 'Daily unblock standup with PM + leads'
            : qc.critical > 0
              ? 'QC gate escalation and root-cause review'
              : 'Maintain weekly executive check-in';

        return {
          ...p,
          trigger,
          recommendedAction,
          qcCritical: qc.critical,
        };
      });

    return {
      tasks,
      projects,
      projectRows,
      productivityByMonth: Array.from(productivityByMonth.entries()),
      milestoneRisk,
      readiness,
      topAttention,
      totals: {
        totalBaselineHours,
        totalActualHours,
        totalRemainingHours,
        totalWork,
        totalBaselineCost,
        totalScheduleCost,
        execute,
        nonExecute,
      },
      empName,
      hours,
    };
  }, [filteredData]);

  const progressVsPlanOption: EChartsOption = useMemo(() => {
    const rows = [...model.projectRows].sort((a, b) => Math.abs(b.workVar) - Math.abs(a.workVar)).slice(0, 12);
    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { top: 34, left: 60, right: 20, bottom: 55, containLabel: true },
      xAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { color: C.muted, rotate: 20, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      series: [
        { name: 'Baseline Hrs', type: 'bar', data: rows.map((r) => Math.round(r.baselineHours)), itemStyle: { color: C.blue } },
        { name: 'Work (Act+Rem)', type: 'bar', data: rows.map((r) => Math.round(r.work)), itemStyle: { color: C.teal } },
        { name: 'Work Variance', type: 'line', data: rows.map((r) => Math.round(r.workVar)), itemStyle: { color: C.amber }, lineStyle: { width: 2 } },
      ],
    };
  }, [model.projectRows]);

  const forecastReliabilityOption: EChartsOption = useMemo(() => {
    const byProject = new Map<string, number[]>();
    model.milestoneRisk.forEach((m) => {
      const list = byProject.get(m.projectName) || [];
      list.push(m.varianceDays);
      byProject.set(m.projectName, list);
    });
    const rows = Array.from(byProject.entries()).map(([name, variances]) => {
      const avg = variances.reduce((s, v) => s + v, 0) / Math.max(1, variances.length);
      const unstable = variances.filter((v) => Math.abs(v) > 7).length;
      return { name, avg, unstable, count: variances.length };
    }).slice(0, 20);

    return {
      tooltip: {
        ...TT,
        formatter: (p: any) => `${p.data.name}<br/>Avg Forecast Drift: ${p.data.value[0].toFixed(1)} days<br/>Unstable Milestones: ${p.data.value[1]}<br/>Total Milestones: ${p.data.value[2]}`,
      },
      grid: { top: 20, left: 60, right: 20, bottom: 50, containLabel: true },
      xAxis: { name: 'Avg Forecast Drift (days)', type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { name: 'Unstable Milestones', type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      series: [
        {
          type: 'scatter',
          data: rows.map((r) => ({
            name: r.name,
            value: [r.avg, r.unstable, r.count],
            symbolSize: Math.max(12, Math.min(48, r.count * 4)),
            itemStyle: { color: r.avg > 5 ? C.red : r.avg > 0 ? C.amber : C.green },
          })),
        },
      ],
    };
  }, [model.milestoneRisk]);

  const efficiencyOption: EChartsOption = useMemo(() => {
    const months = model.productivityByMonth
      .filter(([m]) => m !== 'Unknown')
      .sort((a, b) => new Date(`${a[0]} 1`).getTime() - new Date(`${b[0]} 1`).getTime())
      .slice(-12);
    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { top: 34, left: 55, right: 20, bottom: 45, containLabel: true },
      xAxis: { type: 'category', data: months.map(([m]) => m), axisLabel: { color: C.muted } },
      yAxis: [
        { type: 'value', name: 'Actual Hrs', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
        { type: 'value', name: 'Hrs/Completed Count', axisLabel: { color: C.muted }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Actual Hours', type: 'bar', data: months.map(([, v]) => Math.round(v.actual)), itemStyle: { color: C.blue } },
        { name: 'Performing Metric', type: 'line', yAxisIndex: 1, data: months.map(([, v]) => Number(v.efficiency.toFixed(2))), itemStyle: { color: C.teal }, lineStyle: { width: 2 } },
      ],
    };
  }, [model.productivityByMonth]);

  const overrunRiskOption: EChartsOption = useMemo(() => {
    const rows = [...model.projectRows].sort((a, b) => b.overrunPct - a.overrunPct).slice(0, 12);
    return {
      tooltip: { ...TT, trigger: 'axis' },
      grid: { top: 20, left: 60, right: 20, bottom: 55, containLabel: true },
      xAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { color: C.muted, rotate: 20, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: C.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: C.grid } } },
      series: [
        { type: 'bar', data: rows.map((r) => Number(r.overrunPct.toFixed(1))), itemStyle: { color: C.red } },
      ],
    };
  }, [model.projectRows]);

  const qualityImpactOption: EChartsOption = useMemo(() => {
    const byMonth = new Map<string, { rework: number; qc: number; issues: number }>();
    model.hours.forEach((h: any) => {
      const month = toMonth(h.date || h.entryDate || h.createdAt);
      const row = byMonth.get(month) || { rework: 0, qc: 0, issues: 0 };
      const ct = String(h.chargeType || '').toUpperCase();
      if (ct === 'CR' || ct === 'SC') row.rework += num(h.hours);
      if (ct === 'QC') row.qc += num(h.hours);
      byMonth.set(month, row);
    });
    (filteredData.qctasks || []).forEach((q: any) => {
      const month = toMonth(q.qcEndDate || q.qc_end_date || q.updatedAt);
      const row = byMonth.get(month) || { rework: 0, qc: 0, issues: 0 };
      row.issues += num(q.qcCriticalErrors) + num(q.qcNonCriticalErrors);
      byMonth.set(month, row);
    });
    const series = Array.from(byMonth.entries())
      .filter(([m]) => m !== 'Unknown')
      .sort((a, b) => new Date(`${a[0]} 1`).getTime() - new Date(`${b[0]} 1`).getTime())
      .slice(-12);

    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { top: 34, left: 60, right: 20, bottom: 45, containLabel: true },
      xAxis: { type: 'category', data: series.map(([m]) => m), axisLabel: { color: C.muted } },
      yAxis: [
        { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
        { type: 'value', axisLabel: { color: C.muted }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Rework Hours', type: 'bar', data: series.map(([, v]) => Number(v.rework.toFixed(1))), itemStyle: { color: C.amber } },
        { name: 'QC Hours', type: 'bar', data: series.map(([, v]) => Number(v.qc.toFixed(1))), itemStyle: { color: C.purple } },
        { name: 'QC Issues', type: 'line', yAxisIndex: 1, data: series.map(([, v]) => v.issues), itemStyle: { color: C.red }, lineStyle: { width: 2 } },
      ],
    };
  }, [model.hours, filteredData.qctasks]);

  const capacityDemandOption: EChartsOption = useMemo(() => {
    const demand = new Map<string, number>();
    model.tasks.forEach((t: any) => {
      const assignee = String(t.assignedResourceId || t.employeeId || t.assignedResource || 'Unassigned');
      demand.set(assignee, (demand.get(assignee) || 0) + (num(t.remainingHours) || Math.max(0, num(t.baselineHours) - num(t.actualHours))));
    });
    const rows = Array.from(demand.entries()).map(([id, rem]) => {
      const name = model.empName.get(id) || id;
      const cap = 160;
      const gap = rem - cap;
      return { name, rem, cap, gap };
    }).sort((a, b) => b.gap - a.gap).slice(0, 15);

    return {
      tooltip: { ...TT, trigger: 'axis' },
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { top: 34, left: 70, right: 20, bottom: 30, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { color: C.muted } },
      series: [
        { name: 'Demand (Remaining Hrs)', type: 'bar', data: rows.map((r) => Number(r.rem.toFixed(1))), itemStyle: { color: C.red } },
        { name: 'Capacity (Monthly)', type: 'bar', data: rows.map((r) => r.cap), itemStyle: { color: C.green } },
      ],
    };
  }, [model.tasks, model.empName]);

  const riskExposureOption: EChartsOption = useMemo(() => {
    const rows = [...model.projectRows].slice(0, 25);
    return {
      tooltip: {
        ...TT,
        formatter: (p: any) => {
          const d = p.data;
          return `${d.name}<br/>Schedule Risk: ${d.value[0].toFixed(1)}<br/>Cost Risk: ${d.value[1].toFixed(1)}<br/>Total Risk: ${d.value[2].toFixed(1)}<br/>Owner: ${d.owner}`;
        },
      },
      grid: { top: 20, left: 55, right: 20, bottom: 45, containLabel: true },
      xAxis: { name: 'Schedule Risk', type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { name: 'Cost Risk', type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
      series: [
        {
          type: 'scatter',
          data: rows.map((r) => ({
            name: r.name,
            owner: r.owner,
            value: [Math.max(0, r.lateTasks + r.criticalTasks), Math.max(0, r.overrunPct), r.riskScore],
            symbolSize: Math.max(10, Math.min(48, r.riskScore * 1.4)),
            itemStyle: { color: r.riskScore > 25 ? C.red : r.riskScore > 12 ? C.amber : C.green },
          })),
        },
      ],
    };
  }, [model.projectRows]);

  if (isLoading) return <PageLoader />;

  return (
    <div style={{ padding: '1.2rem 1.4rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 'calc(100vh - 96px)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: C.text, fontSize: '2rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
          <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>
            Executive answer board for &quot;who do I need to talk to&quot; across schedule, forecast, productivity, quality, and risk.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>Total Projects: <span style={{ color: C.text, fontWeight: 700 }}>{model.projects.length}</span></div>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>Total Tasks: <span style={{ color: C.text, fontWeight: 700 }}>{model.tasks.length}</span></div>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>Forecast Work: <span style={{ color: C.text, fontWeight: 700 }}>{Math.round(model.totals.totalWork).toLocaleString()}h</span></div>
        </div>
      </header>

      <SectionCard title="Executive-Level Questions: Overall Health & Predictability" subtitle="Readiness checks for workflow, deliverables, client alignment, quality controls, milestones, and demand alignment.">
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <ReadinessTile label="Workflow / Plan Exists" value={`${model.readiness.workflowPlan}%`} />
          <ReadinessTile label="Deliverables Defined" value={`${model.readiness.deliverablesDefined}%`} />
          <ReadinessTile label="Client-Agreed Deliverables" value={String(model.readiness.clientAgreed)} target="All signed" />
          <ReadinessTile label="Procedures Mapped" value={String(model.readiness.proceduresCoverage)} target=">= Deliverables" />
          <ReadinessTile label="QMP Coverage" value={String(model.readiness.qmpCoverage)} target=">= Deliverables" />
          <ReadinessTile label="QC Logs" value={String(model.readiness.qcLogged)} target="Active logging" />
          <ReadinessTile label="Milestones Defined" value={String(model.readiness.milestonesDefined)} target="> 0" />
          <ReadinessTile label="Tasks Updating Progress" value={String(model.readiness.progressUpdated)} target="> 0" />
          <ReadinessTile label="Demand vs Roster Alignment" value={`${model.readiness.demandRosterAligned}%`} target=">= 80%" />
        </div>
      </SectionCard>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <SectionCard title="1) Progress vs Plan" subtitle="Ahead/behind plan, added work beyond baseline, remaining work, and trend direction.">
          <ChartWrapper option={progressVsPlanOption} height={340} />
        </SectionCard>
        <SectionCard title="2) Forecast Reliability" subtitle="Forecast trustworthiness, delayed volume, systemic vs isolated delays, and stability.">
          <ChartWrapper option={forecastReliabilityOption} height={340} />
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <SectionCard title="3) Resource Efficiency and Productivity" subtitle="How efficiently teams convert effort into completion over time.">
          <ChartWrapper option={efficiencyOption} height={340} />
        </SectionCard>
        <SectionCard title="4) Cost and Hours Overrun Risk" subtitle="Hours added beyond baseline, overrun %, projected final cost vs plan, acceleration/stability.">
          <ChartWrapper option={overrunRiskOption} height={340} />
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <SectionCard title="5) Quality Impact on Performance" subtitle="Rework, quality-related hours, issue trend, and effectiveness of QC prevention.">
          <ChartWrapper option={qualityImpactOption} height={340} />
        </SectionCard>
        <SectionCard title="6) Resource Capacity vs Demand" subtitle="Who is overloaded/underutilized, where shortages will hit, and where to reallocate.">
          <ChartWrapper option={capacityDemandOption} height={340} />
        </SectionCard>
      </div>

      <SectionCard title="7) Predictability and Risk Exposure" subtitle="Highest schedule/cost risk projects and whether action is early enough.">
        <ChartWrapper option={riskExposureOption} height={360} />
      </SectionCard>

      <SectionCard title="Who To Talk To Now" subtitle="Priority escalation list based on risk score, overrun, milestone drift, and QC severity.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left' }}>
                <th style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600 }}>Project</th>
                <th style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600 }}>Owner</th>
                <th style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600 }}>Trigger</th>
                <th style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600 }}>Recommended Action</th>
                <th style={{ padding: '0.45rem 0.35rem', color: C.muted, fontWeight: 600, textAlign: 'right' }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {model.topAttention.map((r) => (
                <tr key={r.projectId} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.5rem 0.35rem', color: C.text, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: '0.5rem 0.35rem', color: C.text }}>{r.owner}</td>
                  <td style={{ padding: '0.5rem 0.35rem', color: C.muted }}>{r.trigger}</td>
                  <td style={{ padding: '0.5rem 0.35rem', color: C.text }}>{r.recommendedAction}</td>
                  <td style={{ padding: '0.5rem 0.35rem', textAlign: 'right', color: r.riskScore > 25 ? C.red : r.riskScore > 12 ? C.amber : C.green, fontWeight: 700 }}>
                    {r.riskScore.toFixed(1)}
                  </td>
                </tr>
              ))}
              {model.topAttention.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '0.8rem', textAlign: 'center', color: C.muted }}>
                    No risk exposure found under current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
