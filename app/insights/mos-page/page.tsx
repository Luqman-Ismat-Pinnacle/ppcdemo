'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo } from 'react';
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
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtH = (v: number) => `${Math.round(v).toLocaleString()}h`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString()}`;

const riskColor = (score: number) => (score >= 25 ? C.red : score >= 12 ? C.amber : C.green);

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, color: C.text, fontSize: '1rem', fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: '0.4rem 0 0', color: C.muted, fontSize: '0.75rem', lineHeight: 1.55 }}>{subtitle}</p>
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

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
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
          {rows.length > 0 ? rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              {r.map((c, j) => <td key={`${i}-${j}`} style={{ padding: '0.5rem 0.35rem', color: C.text }}>{c}</td>)}
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

    const reworkHours = hours.reduce((sum: number, h: any) => {
      const ct = String(h.chargeType || '').toUpperCase();
      return sum + ((ct === 'CR' || ct === 'SC') ? num(h.hours) : 0);
    }, 0);
    const executeHours = hours.reduce((sum: number, h: any) => {
      const ct = String(h.chargeType || '').toUpperCase();
      return sum + (ct === 'EX' ? num(h.hours) : 0);
    }, 0);
    const qcHours = hours.reduce((sum: number, h: any) => {
      const ct = String(h.chargeType || '').toUpperCase();
      return sum + (ct === 'QC' ? num(h.hours) : 0);
    }, 0);

    const demandByAssignee = new Map<string, { name: string; demand: number; capacity: number }>();
    tasks.forEach((t: any) => {
      const assigneeId = String(t.assignedResourceId || t.employeeId || t.assignedResource || 'Unassigned');
      const assigneeName = employeeName.get(assigneeId) || assigneeId;
      const rem = t.remainingHours != null ? num(t.remainingHours) : Math.max(0, num(t.baselineHours) - num(t.actualHours));
      const cur = demandByAssignee.get(assigneeId) || { name: assigneeName, demand: 0, capacity: 160 };
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
    };

    return {
      tasks,
      projects,
      deliverables,
      qctasks,
      milestones,
      projectRows,
      qcByProject,
      milestoneByProject,
      demandByAssignee,
      readiness,
      totals,
    };
  }, [filteredData]);

  if (isLoading) return <PageLoader />;

  const topProgressRows = [...m.projectRows].sort((a, b) => b.workVariance - a.workVariance).slice(0, 12);
  const forecastRows = [...m.projectRows].map((p) => {
    const mm = m.milestoneByProject.get(p.id) || { total: 0, delayed: 0, avgDrift: 0 };
    return { ...p, ...mm };
  }).sort((a, b) => b.delayed - a.delayed || b.avgDrift - a.avgDrift).slice(0, 12);
  const productivityRows = [...m.projectRows].sort((a, b) => b.performanceMetric - a.performanceMetric).slice(0, 12);
  const overrunRows = [...m.projectRows].sort((a, b) => b.overrunPct - a.overrunPct).slice(0, 12);
  const qualityRows = [...m.projectRows].map((p) => ({ ...p, ...(m.qcByProject.get(p.id) || { records: 0, critical: 0, nonCritical: 0, qcHours: 0 }) }))
    .sort((a, b) => (b.critical + b.nonCritical) - (a.critical + a.nonCritical)).slice(0, 12);
  const capacityRows = Array.from(m.demandByAssignee.values()).map((r) => ({ ...r, gap: r.demand - r.capacity }))
    .sort((a, b) => b.gap - a.gap).slice(0, 12);
  const riskRows = [...m.projectRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 15);

  return (
    <div style={{ padding: '1.2rem 1.4rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 'calc(100vh - 96px)' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, color: C.text, fontSize: '2rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
        <p style={{ margin: 0, color: C.muted, fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 980 }}>
          This dashboard is organized as a single executive narrative from overall readiness into schedule, forecast, productivity,
          overrun exposure, quality effects, capacity pressure, and consolidated risk. Each section includes definitions, current-state
          indicators, and a table designed for direct weekly operating review.
        </p>
      </header>

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
          <StatTile label="Completion (Tasks)" value={fmtPct(m.tasks.length > 0 ? (m.projectRows.reduce((s, r) => s + r.completeCount, 0) / m.tasks.length) * 100 : 0)} />
        </div>
        <DataTable
          headers={["Project", "Owner", "Baseline", "Current Work", "Work Variance", "Overrun %"]}
          rows={topProgressRows.map((r) => [
            r.name,
            r.owner,
            fmtH(r.baselineHours),
            fmtH(r.work),
            <span key="wv" style={{ color: r.workVariance > 0 ? C.red : r.workVariance < 0 ? C.green : C.muted }}>{fmtH(r.workVariance)}</span>,
            <span key="ov" style={{ color: r.overrunPct > 10 ? C.red : r.overrunPct > 0 ? C.amber : C.green }}>{fmtPct(r.overrunPct)}</span>,
          ])}
        />
      </SectionCard>

      <SectionCard
        title="2. Forecast Reliability"
        subtitle="Forecast reliability evaluates milestone drift behavior. Delayed milestone counts and average drift days indicate whether schedule movement is isolated to specific projects or recurring across the portfolio."
      >
        <DataTable
          headers={["Project", "Owner", "Milestones", "Delayed", "Avg Drift (days)", "Interpretation"]}
          rows={forecastRows.map((r) => {
            const note = r.total === 0
              ? 'No milestone set; forecast confidence cannot be assessed.'
              : r.delayed === 0
                ? 'Milestone forecasts are stable against baseline plan.'
                : r.avgDrift > 7
                  ? 'Frequent and material schedule movement; forecasting discipline needs tightening.'
                  : 'Delays exist but are currently moderate.';
            return [
              r.name,
              r.owner,
              String(r.total),
              <span key="d" style={{ color: r.delayed > 0 ? C.amber : C.green }}>{String(r.delayed)}</span>,
              <span key="a" style={{ color: r.avgDrift > 7 ? C.red : r.avgDrift > 0 ? C.amber : C.green }}>{r.avgDrift.toFixed(1)}</span>,
              note,
            ];
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
          rows={productivityRows.map((r) => [
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
          ])}
        />
      </SectionCard>

      <SectionCard
        title="4. Cost and Hours Overrun Risk"
        subtitle="This section compares projected final consumption to original baseline for both hours and cost. It highlights where expansion in scope/effort is likely to pressure financial outcomes."
      >
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
          <StatTile label="Baseline Cost" value={fmtMoney(m.totals.baselineCost)} />
          <StatTile label="Projected Schedule Cost" value={fmtMoney(m.totals.scheduleCost)} />
          <StatTile label="Cost Variance" value={fmtMoney(m.totals.scheduleCost - m.totals.baselineCost)} />
          <StatTile label="Hours Overrun" value={fmtH((m.totals.actualHours + m.totals.remainingHours) - m.totals.baselineHours)} />
        </div>
        <DataTable
          headers={["Project", "Owner", "Overrun %", "Cost Variance", "Risk Score", "Trend"]}
          rows={overrunRows.map((r) => [
            r.name,
            r.owner,
            <span key="op" style={{ color: r.overrunPct > 15 ? C.red : r.overrunPct > 5 ? C.amber : C.green }}>{fmtPct(r.overrunPct)}</span>,
            <span key="cv" style={{ color: r.costVariance > 0 ? C.red : C.green }}>{fmtMoney(r.costVariance)}</span>,
            <span key="rs" style={{ color: riskColor(r.riskScore), fontWeight: 700 }}>{r.riskScore.toFixed(1)}</span>,
            r.overrunPct > 15 ? 'Exposure is elevated and compounding risk is likely.' : r.overrunPct > 5 ? 'Watchlist; corrective pressure should continue.' : 'Currently stable vs baseline.',
          ])}
        />
      </SectionCard>

      <SectionCard
        title="5. Quality Impact on Performance"
        subtitle="Quality impact is shown through issue volumes, criticality mix, and quality-related effort. It helps distinguish whether performance losses are execution-driven or quality-cycle-driven."
      >
        <DataTable
          headers={["Project", "QC Records", "Critical", "Non-Critical", "QC Hours", "Quality Interpretation"]}
          rows={qualityRows.map((r) => {
            const issueCount = r.critical + r.nonCritical;
            const note = issueCount === 0
              ? 'No recorded QC issue load in current filter scope.'
              : r.critical > 0
                ? 'Critical defects present; quality risk materially affects delivery confidence.'
                : 'Issues are present but currently non-critical.';
            return [
              r.name,
              String(r.records || 0),
              <span key="c" style={{ color: r.critical > 0 ? C.red : C.green }}>{String(r.critical || 0)}</span>,
              String(r.nonCritical || 0),
              fmtH(r.qcHours || 0),
              note,
            ];
          })}
        />
      </SectionCard>

      <SectionCard
        title="6. Resource Capacity vs Demand"
        subtitle="Capacity vs demand compares remaining assigned effort against an assumed monthly capacity baseline. Positive gap indicates overload pressure; negative gap indicates available room."
      >
        <DataTable
          headers={["Resource", "Demand", "Capacity", "Gap", "Capacity State"]}
          rows={capacityRows.map((r) => [
            r.name,
            fmtH(r.demand),
            fmtH(r.capacity),
            <span key="gap" style={{ color: r.gap > 0 ? C.red : C.green }}>{fmtH(r.gap)}</span>,
            r.gap > 40 ? 'Significant overload.' : r.gap > 0 ? 'Moderate overload.' : 'Within available capacity.',
          ])}
        />
      </SectionCard>

      <SectionCard
        title="7. Predictability and Risk Exposure"
        subtitle="Risk exposure consolidates schedule pressure, overrun behavior, and critical path density into a single comparative ranking to prioritize leadership attention."
      >
        <DataTable
          headers={["Project", "Owner", "Risk Score", "Critical Tasks", "At-Risk Tasks", "Executive Summary"]}
          rows={riskRows.map((r) => [
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
          ])}
        />
      </SectionCard>
    </div>
  );
}
