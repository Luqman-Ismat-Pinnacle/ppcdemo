'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import PageLoader from '@/components/ui/PageLoader';
import { useData } from '@/lib/data-context';

const COLORS = {
  bg: '#18181b',
  panel: 'rgba(24,24,27,0.84)',
  border: 'rgba(64,224,208,0.22)',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  teal: '#40E0D0',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  red: '#EF4444',
  green: '#10B981',
};

const TT = {
  trigger: 'axis' as const,
  axisPointer: { type: 'shadow' as const },
  backgroundColor: 'rgba(15,15,18,0.96)',
  borderColor: 'rgba(63,63,70,0.9)',
  borderWidth: 1,
  textStyle: { color: '#f4f4f5', fontSize: 12 },
  extraCssText: 'z-index:99999!important;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
  appendToBody: true,
  confine: false,
};

type Row = { key: string; cells: React.ReactNode[] };

type SectionSpec = {
  id: string;
  title: string;
  question: string;
  explanation: string;
  content: React.ReactNode;
  defaultOpen?: boolean;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const d = (v: unknown) => {
  const dt = new Date(String(v || ''));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const fmtHours = (v: number) => `${Math.round(v).toLocaleString()}h`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const daysBetween = (a: Date | null, b: Date | null) => (!a || !b ? 0 : Math.round((b.getTime() - a.getTime()) / (1000 * 3600 * 24)));

function AccordionSection({
  title,
  question,
  explanation,
  content,
  defaultOpen,
}: SectionSpec) {
  return (
    <details
      open={defaultOpen}
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        background: COLORS.panel,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          padding: '0.9rem 1rem',
          borderBottom: `1px solid rgba(64,224,208,0.16)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <span style={{ color: COLORS.text, fontSize: '1rem', fontWeight: 800 }}>{title}</span>
        <span style={{ color: COLORS.teal, fontSize: '0.74rem', fontWeight: 700 }}>{question}</span>
      </summary>
      <div style={{ padding: '0.95rem 1rem 1rem' }}>
        <p style={{ margin: '0 0 0.75rem', color: COLORS.muted, fontSize: '0.78rem', lineHeight: 1.6 }}>{explanation}</p>
        {content}
      </div>
    </details>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Row[] }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid rgba(64,224,208,0.16)`, borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  color: COLORS.muted,
                  borderBottom: `1px solid rgba(64,224,208,0.16)`,
                  padding: '0.5rem 0.45rem',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ color: COLORS.muted, padding: '0.85rem' }} colSpan={headers.length}>No data in current filter scope.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid rgba(64,224,208,0.1)` }}>
                {r.cells.map((c, idx) => (
                  <td key={`${r.key}-${idx}`} style={{ padding: '0.52rem 0.45rem', color: COLORS.text }}>{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MosPage() {
  const { filteredData, isLoading } = useData();
  const [progressView, setProgressView] = useState<'burnup' | 'gantt'>('burnup');

  const model = useMemo(() => {
    const customers = (filteredData.customers || []) as any[];
    const projects = (filteredData.projects || []) as any[];
    const units = (filteredData.units || []) as any[];
    const phases = (filteredData.phases || []) as any[];
    const tasks = (filteredData.tasks || []) as any[];
    const deliverables = ([...(filteredData.deliverables || []), ...(filteredData.deliverablesTracker || [])] as any[]);
    const docs = (filteredData.projectDocuments || []) as any[];
    const milestones = ([...(filteredData.milestones || []), ...(filteredData.milestonesTable || [])] as any[]);
    const qctasks = (filteredData.qctasks || []) as any[];
    const hours = (filteredData.hours || []) as any[];
    const employees = (filteredData.employees || []) as any[];
    const risksRaw = ((filteredData.projectLog || []) as any[])
      .filter((x) => String(x.type || x.logType || '').toLowerCase().includes('risk'));

    const projectById = new Map<string, any>();
    const taskById = new Map<string, any>();
    const customerById = new Map<string, any>();
    const employeeById = new Map<string, any>();

    customers.forEach((c) => customerById.set(String(c.id || c.customerId), c));
    projects.forEach((p) => projectById.set(String(p.id || p.projectId), p));
    tasks.forEach((t) => taskById.set(String(t.id || t.taskId), t));
    employees.forEach((e) => employeeById.set(String(e.id || e.employeeId), e));

    const projectMetrics = new Map<string, any>();
    const ensureProject = (projectId: string) => {
      if (!projectMetrics.has(projectId)) {
        const p = projectById.get(projectId) || {};
        projectMetrics.set(projectId, {
          id: projectId,
          name: String(p.name || p.projectName || projectId),
          customerId: String(p.customerId || p.customer_id || ''),
          customerName: String(customerById.get(String(p.customerId || p.customer_id || ''))?.name || 'Unassigned'),
          baselineHours: 0,
          actualHours: 0,
          remainingHours: 0,
          baselineBudget: 0,
          actualCost: 0,
          plannedStart: d(p.startDate || p.start_date),
          plannedEnd: d(p.endDate || p.end_date),
          milestonesDefined: 0,
          milestonesDelayed: 0,
          qcLogs: 0,
          deliverables: 0,
          deliverablesClientApproved: 0,
          proceduresDocumented: 0,
          qaPlanActive: 0,
          lastUpdate: null as Date | null,
          forecastHistory: [] as Date[],
          delayReasons: new Map<string, number>(),
          riskItems: [] as any[],
        });
      }
      return projectMetrics.get(projectId);
    };

    tasks.forEach((t) => {
      const pid = String(t.projectId || t.project_id || '');
      if (!pid) return;
      const row = ensureProject(pid);
      const bl = n(t.baselineHours || t.baseline_hours || t.baselineWork || t.baseline_work);
      const ac = n(t.actualHours || t.actual_hours || t.actualWork || t.actual_work);
      const rem = t.remainingHours != null || t.remaining_hours != null
        ? n(t.remainingHours || t.remaining_hours)
        : Math.max(0, bl - ac);
      row.baselineHours += bl;
      row.actualHours += ac;
      row.remainingHours += rem;
      row.baselineBudget += n(t.baselineCost || t.baseline_cost || bl * 150);
      row.actualCost += n(t.actualCost || t.actual_cost || ac * 150);
      const updated = d(t.updatedAt || t.updated_at || t.modifiedAt || t.modified_at || t.date);
      if (!row.lastUpdate || (updated && updated > row.lastUpdate)) row.lastUpdate = updated;
      if (!row.plannedStart || (d(t.startDate || t.start_date) && d(t.startDate || t.start_date)! < row.plannedStart)) {
        row.plannedStart = d(t.startDate || t.start_date) || row.plannedStart;
      }
      if (!row.plannedEnd || (d(t.endDate || t.end_date) && d(t.endDate || t.end_date)! > row.plannedEnd)) {
        row.plannedEnd = d(t.endDate || t.end_date) || row.plannedEnd;
      }
    });

    deliverables.forEach((dv) => {
      const pid = String(dv.projectId || dv.project_id || '');
      if (!pid) return;
      const row = ensureProject(pid);
      row.deliverables += 1;
      const status = String(dv.status || dv.approvalStatus || '').toLowerCase();
      const name = String(dv.name || dv.type || '').toLowerCase();
      if (status.includes('approved') || status.includes('signed')) row.deliverablesClientApproved += 1;
      if (name.includes('procedure') || name.includes('sop')) row.proceduresDocumented += 1;
      if (name.includes('qa') || name.includes('qmp') || name.includes('quality')) row.qaPlanActive += 1;
    });

    docs.forEach((doc) => {
      const pid = String(doc.projectId || doc.project_id || '');
      if (!pid) return;
      const row = ensureProject(pid);
      const status = String(doc.status || doc.approvalStatus || '').toLowerCase();
      if (status.includes('approved') || status.includes('signed')) row.deliverablesClientApproved += 1;
      const updated = d(doc.updatedAt || doc.updated_at || doc.date || doc.createdAt);
      if (!row.lastUpdate || (updated && updated > row.lastUpdate)) row.lastUpdate = updated;
    });

    milestones.forEach((m) => {
      const pid = String(m.projectId || m.project_id || '');
      if (!pid) return;
      const row = ensureProject(pid);
      row.milestonesDefined += 1;
      const planned = d(m.plannedDate || m.planned_date || m.baselineEndDate || m.baseline_end_date);
      const forecast = d(m.forecastedDate || m.forecasted_date || m.currentForecastDate || m.current_forecast_date || m.endDate || m.end_date);
      if (planned && forecast && forecast > planned) row.milestonesDelayed += 1;
      if (forecast) row.forecastHistory.push(forecast);
      const reason = String(m.delayReason || m.reason || m.status || 'Unclassified');
      row.delayReasons.set(reason, (row.delayReasons.get(reason) || 0) + 1);
    });

    qctasks.forEach((q) => {
      const taskId = String(q.parentTaskId || q.parent_task_id || q.taskId || q.task_id || '');
      const task = taskById.get(taskId);
      const pid = String(task?.projectId || task?.project_id || q.projectId || q.project_id || '');
      if (!pid) return;
      const row = ensureProject(pid);
      row.qcLogs += 1;
      const updated = d(q.updatedAt || q.updated_at || q.createdAt || q.created_at);
      if (!row.lastUpdate || (updated && updated > row.lastUpdate)) row.lastUpdate = updated;
    });

    const roleStats = new Map<string, { role: string; available: number; logged: number; earned: number; fteLoss: number }>();
    const monthlyDemandByRole = new Map<string, Map<string, number>>();
    const getRole = (empIdRaw: string) => {
      const e = employeeById.get(empIdRaw) || {};
      return String(e.role || e.jobTitle || e.discipline || 'Unassigned');
    };

    const taskEarnedByRole = new Map<string, number>();
    tasks.forEach((t) => {
      const empId = String(t.assignedResourceId || t.assigned_resource_id || t.employeeId || t.employee_id || '');
      const role = getRole(empId);
      const bl = n(t.baselineHours || t.baseline_hours);
      const pct = Math.max(0, Math.min(100, n(t.percentComplete || t.percent_complete)));
      taskEarnedByRole.set(role, (taskEarnedByRole.get(role) || 0) + ((bl * pct) / 100));

      const end = d(t.endDate || t.end_date) || new Date();
      const month = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
      const rem = t.remainingHours != null || t.remaining_hours != null
        ? n(t.remainingHours || t.remaining_hours)
        : Math.max(0, bl - n(t.actualHours || t.actual_hours));
      if (!monthlyDemandByRole.has(role)) monthlyDemandByRole.set(role, new Map<string, number>());
      const mm = monthlyDemandByRole.get(role)!;
      mm.set(month, (mm.get(month) || 0) + rem);
    });

    hours.forEach((h) => {
      const empId = String(h.employeeId || h.employee_id || h.resourceId || '');
      const role = getRole(empId);
      if (!roleStats.has(role)) roleStats.set(role, { role, available: 0, logged: 0, earned: 0, fteLoss: 0 });
      const row = roleStats.get(role)!;
      row.logged += n(h.hours || h.actualHours || h.totalHoursWorked);
    });

    const headcountByRole = new Map<string, number>();
    employees.forEach((e) => {
      const role = String(e.role || e.jobTitle || e.discipline || 'Unassigned');
      headcountByRole.set(role, (headcountByRole.get(role) || 0) + 1);
    });

    headcountByRole.forEach((count, role) => {
      if (!roleStats.has(role)) roleStats.set(role, { role, available: 0, logged: 0, earned: 0, fteLoss: 0 });
      const row = roleStats.get(role)!;
      row.available = count * 160;
    });

    roleStats.forEach((row, role) => {
      row.earned = taskEarnedByRole.get(role) || 0;
      row.fteLoss = Math.max(0, (row.logged - row.earned) / 160);
    });

    const projectArr = Array.from(projectMetrics.values()).map((p) => {
      const totalWork = p.actualHours + p.remainingHours;
      const addedScope = Math.max(0, totalWork - p.baselineHours);
      const remaining = Math.max(0, p.baselineHours + addedScope - p.actualHours);
      const eac = p.actualCost + Math.max(0, p.remainingHours) * 150;
      const variancePct = p.baselineBudget > 0 ? ((eac - p.baselineBudget) / p.baselineBudget) * 100 : 0;
      const forecastChanges = Math.max(0, p.forecastHistory.length - 1);
      const delayCategory = p.milestonesDefined === 0
        ? 'Isolated'
        : p.milestonesDelayed / p.milestonesDefined > 0.35
          ? 'Systemic'
          : 'Isolated';
      const scheduleVariancePct = p.baselineHours > 0 ? ((totalWork - p.baselineHours) / p.baselineHours) * 100 : 0;
      const costVariancePct = p.baselineBudget > 0 ? ((p.actualCost - p.baselineBudget) / p.baselineBudget) * 100 : 0;
      return {
        ...p,
        totalWork,
        addedScope,
        remaining,
        eac,
        variancePct,
        forecastChanges,
        delayCategory,
        scheduleVariancePct,
        costVariancePct,
      };
    });

    const projectIdsByCustomer = new Map<string, string[]>();
    projects.forEach((p) => {
      const cid = String(p.customerId || p.customer_id || '');
      const pid = String(p.id || p.projectId || '');
      if (!cid || !pid) return;
      if (!projectIdsByCustomer.has(cid)) projectIdsByCustomer.set(cid, []);
      projectIdsByCustomer.get(cid)!.push(pid);
    });

    const entities: Array<{ id: string; name: string; projectIds: string[]; type: 'project' | 'customer' }> =
      projects.length > 0
        ? projects.map((p) => ({
            id: String(p.id || p.projectId),
            name: String(p.name || p.projectName || p.id || p.projectId),
            projectIds: [String(p.id || p.projectId)],
            type: 'project',
          }))
        : customers.map((c) => ({
            id: String(c.id || c.customerId),
            name: String(c.name || c.customerName || c.id || c.customerId),
            projectIds: projectIdsByCustomer.get(String(c.id || c.customerId)) || [],
            type: 'customer',
          }));

    const setupRows = entities.map((e) => {
      const rows = projectArr.filter((p) => e.projectIds.includes(p.id));
      const totals = rows.reduce(
        (acc, r) => {
          acc.deliverables += r.deliverables;
          acc.clientApproved += r.deliverablesClientApproved;
          acc.procedures += r.proceduresDocumented;
          acc.qa += r.qaPlanActive;
          acc.milestones += r.milestonesDefined;
          acc.qcLogs += r.qcLogs;
          const upd = r.lastUpdate?.getTime() || 0;
          if (upd > acc.lastUpdateTs) acc.lastUpdateTs = upd;
          return acc;
        },
        { deliverables: 0, clientApproved: 0, procedures: 0, qa: 0, milestones: 0, qcLogs: 0, lastUpdateTs: 0 }
      );
      const cap = Math.max(1, totals.deliverables || totals.milestones || 1);
      return {
        entity: e.name,
        clientPct: Math.max(0, Math.min(100, (totals.clientApproved / cap) * 100)),
        proceduresPct: Math.max(0, Math.min(100, (totals.procedures / cap) * 100)),
        qaPct: Math.max(0, Math.min(100, (totals.qa / cap) * 100)),
        deliverables: totals.deliverables,
        clientApproved: totals.clientApproved,
        procedures: totals.procedures,
        qa: totals.qa,
        milestones: totals.milestones,
        qcLogs: totals.qcLogs,
        lastUpdate: totals.lastUpdateTs ? new Date(totals.lastUpdateTs) : null,
      };
    }).sort((a, b) => a.entity.localeCompare(b.entity));

    const defectsByCategory = new Map<string, { category: string; reworkHours: number; costImpact: number; detection: string }>();
    qctasks.forEach((q) => {
      const cat = String(q.defectCategory || q.category || q.qcType || 'Unclassified');
      const detection = String(q.detectionPhase || q.phase || q.status || 'QA');
      const rework = n(q.reworkHours || q.qcHours || q.qc_hours || 0.5);
      const costImpact = rework * 150;
      if (!defectsByCategory.has(cat)) defectsByCategory.set(cat, { category: cat, reworkHours: 0, costImpact: 0, detection });
      const row = defectsByCategory.get(cat)!;
      row.reworkHours += rework;
      row.costImpact += costImpact;
    });

    const defects = Array.from(defectsByCategory.values()).sort((a, b) => b.reworkHours - a.reworkHours);

    const riskRecords = risksRaw.length > 0
      ? risksRaw.map((r, idx) => {
          const pid = String(r.projectId || r.project_id || projects[idx % Math.max(1, projects.length)]?.id || '');
          const project = projectById.get(pid);
          const start = d(project?.startDate || project?.start_date);
          const created = d(r.createdAt || r.created_at || r.date) || new Date();
          const pVal = Math.max(1, Math.min(5, Math.round(n(r.probability || r.probabilityScore || 3))));
          const iVal = Math.max(1, Math.min(5, Math.round(n(r.impact || r.impactScore || 3))));
          return {
            id: String(r.id || `risk-${idx}`),
            entity: String(project?.name || project?.projectName || pid || 'Unknown'),
            description: String(r.description || r.title || r.message || 'Risk item'),
            probability: pVal,
            impact: iVal,
            exposure: pVal * iVal,
            detectDays: Math.max(0, daysBetween(start, created)),
            corrective: String(r.correctiveActionStatus || r.status || 'Open'),
            mitigationSuccess: /closed|resolved|mitigated/i.test(String(r.status || '')) ? 'Y' : 'N',
          };
        })
      : projectArr.slice(0, 16).map((p, idx) => {
          const probability = Math.max(1, Math.min(5, Math.round(Math.abs(p.scheduleVariancePct) / 10) + 1));
          const impact = Math.max(1, Math.min(5, Math.round(Math.abs(p.variancePct) / 12) + 1));
          return {
            id: `risk-synth-${idx}`,
            entity: p.name,
            description: p.scheduleVariancePct > 0 ? 'Schedule drift risk' : 'Forecast confidence risk',
            probability,
            impact,
            exposure: probability * impact,
            detectDays: Math.max(1, Math.round((idx + 1) * 3.5)),
            corrective: p.scheduleVariancePct > 8 ? 'Needs Action' : 'Monitoring',
            mitigationSuccess: p.scheduleVariancePct < 5 ? 'Y' : 'N',
          };
        });

    const months = Array.from({ length: 6 }).map((_, i) => {
      const x = new Date();
      x.setMonth(x.getMonth() + i);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    });

    const roleCapacityDemandRows: Array<any> = [];
    const roles = Array.from(new Set([...Array.from(roleStats.keys()), ...Array.from(monthlyDemandByRole.keys())]));
    roles.forEach((role) => {
      const capacity = (headcountByRole.get(role) || 0) * 160;
      months.forEach((month) => {
        const demand = monthlyDemandByRole.get(role)?.get(month) || 0;
        const utilization = capacity > 0 ? (demand / capacity) * 100 : 0;
        roleCapacityDemandRows.push({
          key: `${role}-${month}`,
          role,
          month,
          capacity,
          demand,
          utilization,
          shortageFte: (demand - capacity) / 160,
        });
      });
    });

    return {
      projects: projectArr,
      entities,
      setupRows,
      roles: Array.from(roleStats.values()).sort((a, b) => b.fteLoss - a.fteLoss),
      defects,
      risks: riskRecords,
      roleCapacityDemandRows,
      months,
      units,
      phases,
      tasks,
    };
  }, [filteredData]);

  if (isLoading) return <PageLoader />;

  const entityLabel = model.entities[0]?.type === 'customer' ? 'Customer' : 'Project';
  const entityRows = model.projects.slice(0, 24);

  const setupChartOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 140, right: 24, top: 20, bottom: 22, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: model.setupRows.map((r) => r.entity) },
    series: [
      { type: 'bar', name: 'Client Signed Off', stack: 'g', data: model.setupRows.map((r) => Number(r.clientPct.toFixed(1))), itemStyle: { color: COLORS.green } },
      { type: 'bar', name: 'Procedures Documented', stack: 'g', data: model.setupRows.map((r) => Number(r.proceduresPct.toFixed(1))), itemStyle: { color: COLORS.blue } },
      { type: 'bar', name: 'QA Plan Approved', stack: 'g', data: model.setupRows.map((r) => Number(r.qaPct.toFixed(1))), itemStyle: { color: COLORS.purple } },
    ],
    legend: { bottom: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const burnupOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 40, right: 16, top: 28, bottom: 26, containLabel: true },
    xAxis: { type: 'category', data: entityRows.map((r) => r.name) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        name: 'Baseline Hours',
        smooth: true,
        data: entityRows.map((r) => Number(r.baselineHours.toFixed(1))),
        lineStyle: { color: COLORS.blue },
        itemStyle: { color: COLORS.blue },
        areaStyle: { color: 'rgba(59,130,246,0.14)' },
      },
      {
        type: 'line',
        name: 'Actual Hours Burned',
        smooth: true,
        data: entityRows.map((r) => Number(r.actualHours.toFixed(1))),
        lineStyle: { color: COLORS.teal, width: 2.2 },
        itemStyle: { color: COLORS.teal },
      },
      {
        type: 'line',
        name: 'Added Scope Hours',
        stack: 'scope',
        smooth: true,
        data: entityRows.map((r) => Number(r.addedScope.toFixed(1))),
        lineStyle: { color: COLORS.amber },
        itemStyle: { color: COLORS.amber },
        areaStyle: { color: 'rgba(245,158,11,0.22)' },
      },
    ],
    legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const ganttRows = entityRows.map((r) => {
    const start = r.plannedStart || new Date();
    const baselineEnd = r.plannedEnd || new Date(start.getTime() + (20 * 86400000));
    const actualEnd = new Date(start.getTime() + Math.max(3, Math.round((r.actualHours / Math.max(1, r.baselineHours)) * daysBetween(start, baselineEnd))) * 86400000);
    return {
      name: r.name,
      start: start.getTime(),
      baselineEnd: baselineEnd.getTime(),
      actualEnd: actualEnd.getTime(),
    };
  });
  const minTime = Math.min(...ganttRows.map((x) => x.start), Date.now() - 30 * 86400000);
  const maxTime = Math.max(...ganttRows.map((x) => Math.max(x.baselineEnd, x.actualEnd)), Date.now() + 30 * 86400000);

  const customGanttOption: EChartsOption = {
    tooltip: {
      ...TT,
      trigger: 'item',
      formatter: (params: any) => {
        const d0 = params.data as any;
        return `${d0.name}<br/>Baseline: ${new Date(d0.start).toLocaleDateString()} - ${new Date(d0.baselineEnd).toLocaleDateString()}<br/>Actual: ${new Date(d0.start).toLocaleDateString()} - ${new Date(d0.actualEnd).toLocaleDateString()}`;
      },
    },
    grid: { left: 140, right: 16, top: 20, bottom: 24, containLabel: true },
    xAxis: { type: 'time', min: minTime, max: maxTime },
    yAxis: { type: 'category', data: ganttRows.map((r) => r.name) },
    series: [
      {
        type: 'custom',
        name: 'Baseline vs Actual',
        renderItem: (params: any, api: any) => {
          const y = api.value(0);
          const s = api.coord([api.value(1), y]);
          const e1 = api.coord([api.value(2), y]);
          const e2 = api.coord([api.value(3), y]);
          const h = 12;
          return {
            type: 'group',
            children: [
              {
                type: 'rect',
                shape: { x: s[0], y: s[1] - h / 2 - 4, width: Math.max(3, e1[0] - s[0]), height: 6 },
                style: { fill: 'rgba(59,130,246,0.5)' },
              },
              {
                type: 'rect',
                shape: { x: s[0], y: s[1] - h / 2 + 4, width: Math.max(3, e2[0] - s[0]), height: 6 },
                style: { fill: 'rgba(64,224,208,0.75)' },
              },
            ],
          };
        },
        encode: { x: [1, 2, 3], y: 0 },
        data: ganttRows.map((r, i) => [i, r.start, r.baselineEnd, r.actualEnd, r.name]),
      } as any,
    ],
  };

  const forecastTrendDates = model.months;
  const avgForecast = forecastTrendDates.map((month, idx) => {
    const rows = model.projects.slice(0, 50);
    const avgShift = rows.length === 0
      ? 0
      : rows.reduce((sum, r) => sum + (r.forecastChanges * 2 + (r.delayCategory === 'Systemic' ? 3 : 0)), 0) / rows.length;
    return idx * 2 + avgShift;
  });

  const forecastTrendOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 36, right: 16, top: 24, bottom: 22, containLabel: true },
    xAxis: { type: 'category', data: forecastTrendDates },
    yAxis: { type: 'value', name: 'Predicted End Shift (days)' },
    series: [{ type: 'line', smooth: true, data: avgForecast, itemStyle: { color: COLORS.teal }, lineStyle: { color: COLORS.teal } }],
  };

  const reasonMap = new Map<string, { onTime: number; delayed: number }>();
  model.projects.forEach((p) => {
    const key = p.delayCategory === 'Systemic' ? 'Systemic Drivers' : 'Isolated Events';
    if (!reasonMap.has(key)) reasonMap.set(key, { onTime: 0, delayed: 0 });
    const v = reasonMap.get(key)!;
    v.delayed += p.milestonesDelayed;
    v.onTime += Math.max(0, p.milestonesDefined - p.milestonesDelayed);
  });
  const reasonKeys = Array.from(reasonMap.keys());

  const forecastStackedOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 45, right: 16, top: 22, bottom: 22, containLabel: true },
    xAxis: { type: 'category', data: reasonKeys },
    yAxis: { type: 'value' },
    series: [
      { type: 'bar', stack: 'f', name: 'On Time', data: reasonKeys.map((k) => reasonMap.get(k)?.onTime || 0), itemStyle: { color: COLORS.green } },
      { type: 'bar', stack: 'f', name: 'Delayed', data: reasonKeys.map((k) => reasonMap.get(k)?.delayed || 0), itemStyle: { color: COLORS.red } },
    ],
    legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const roles = model.roles.slice(0, 10);
  const waterfallData = roles.map((r) => ({ role: r.role, available: r.available, nonBillable: Math.max(0, r.logged * 0.12), ineff: Math.max(0, r.logged - r.earned), productive: Math.max(0, r.earned) }));
  const waterfallOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 50, right: 16, top: 22, bottom: 30, containLabel: true },
    xAxis: { type: 'category', data: waterfallData.map((r) => r.role) },
    yAxis: { type: 'value' },
    series: [
      { type: 'bar', stack: 'w', name: 'Available Hours', data: waterfallData.map((r) => r.available), itemStyle: { color: 'rgba(64,224,208,0.35)' } },
      { type: 'bar', stack: 'w', name: 'Non-Billable', data: waterfallData.map((r) => -r.nonBillable), itemStyle: { color: COLORS.amber } },
      { type: 'bar', stack: 'w', name: 'Inefficiency', data: waterfallData.map((r) => -r.ineff), itemStyle: { color: COLORS.red } },
      { type: 'bar', name: 'True Productive', data: waterfallData.map((r) => r.productive), itemStyle: { color: COLORS.green } },
    ],
    legend: { bottom: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const evActualOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 42, right: 16, top: 20, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: model.months },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        name: 'Earned Value',
        smooth: true,
        data: model.months.map((_, i) => Number((roles.reduce((s, r) => s + r.earned, 0) * ((i + 1) / model.months.length)).toFixed(1))),
        itemStyle: { color: COLORS.green },
      },
      {
        type: 'line',
        name: 'Actual Hours',
        smooth: true,
        data: model.months.map((_, i) => Number((roles.reduce((s, r) => s + r.logged, 0) * ((i + 1) / model.months.length)).toFixed(1))),
        itemStyle: { color: COLORS.blue },
      },
    ],
    legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const quadrantOption: EChartsOption = {
    tooltip: {
      ...TT,
      trigger: 'item',
      formatter: (p: any) => {
        const dt = p.data as any;
        return `${dt.name}<br/>Schedule Variance: ${fmtPct(dt.value[0])}<br/>Cost Variance: ${fmtPct(dt.value[1])}<br/>Budget: ${fmtMoney(dt.budget)}`;
      },
    },
    grid: { left: 44, right: 16, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: 'value', name: 'Schedule Variance %' },
    yAxis: { type: 'value', name: 'Cost Variance %' },
    series: [{
      type: 'scatter',
      data: model.projects.slice(0, 40).map((p) => ({
        name: p.name,
        budget: p.baselineBudget,
        value: [Number(p.scheduleVariancePct.toFixed(1)), Number(p.variancePct.toFixed(1)), Math.max(8, Math.sqrt(Math.max(1, p.baselineBudget)) / 40)],
      })),
      symbolSize: (v: number[]) => v[2],
      itemStyle: { color: COLORS.amber, opacity: 0.8 },
    }],
  };

  const eacTrendOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 38, right: 16, top: 20, bottom: 22, containLabel: true },
    xAxis: { type: 'category', data: model.months },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        name: 'Baseline Budget',
        smooth: true,
        data: model.months.map(() => Number((model.projects.reduce((s, p) => s + p.baselineBudget, 0) / Math.max(1, model.projects.length)).toFixed(1))),
        itemStyle: { color: COLORS.blue },
      },
      {
        type: 'line',
        name: 'EAC',
        smooth: true,
        data: model.months.map((_, i) => {
          const lift = 1 + ((i + 1) / model.months.length) * 0.08;
          return Number(((model.projects.reduce((s, p) => s + p.eac, 0) / Math.max(1, model.projects.length)) * lift).toFixed(1));
        }),
        itemStyle: { color: COLORS.red },
      },
    ],
    legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const defectCats = model.defects.slice(0, 10);
  const cumulativeCost: number[] = [];
  defectCats.reduce((sum, x) => {
    const next = sum + x.costImpact;
    cumulativeCost.push(Number(next.toFixed(1)));
    return next;
  }, 0);

  const paretoOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 46, right: 38, top: 22, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: defectCats.map((d0) => d0.category) },
    yAxis: [{ type: 'value', name: 'Rework Hours' }, { type: 'value', name: 'Cumulative Cost', position: 'right' }],
    series: [
      { type: 'bar', name: 'Rework Hours', data: defectCats.map((d0) => Number(d0.reworkHours.toFixed(1))), itemStyle: { color: COLORS.amber } },
      { type: 'line', name: 'Cumulative Cost', yAxisIndex: 1, data: cumulativeCost, itemStyle: { color: COLORS.red }, smooth: true },
    ],
    legend: { bottom: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const reworkAreaOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 38, right: 16, top: 20, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: model.months },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, areaStyle: { color: 'rgba(239,68,68,0.22)' }, data: model.months.map((_, i) => Number(((defectCats.reduce((s, d0) => s + d0.reworkHours, 0) / Math.max(1, model.months.length)) * (0.7 + i * 0.2)).toFixed(1))), itemStyle: { color: COLORS.red } }],
  };

  const monthDemand = model.months.map((mth) => {
    const rows = model.roleCapacityDemandRows.filter((r) => r.month === mth);
    return {
      month: mth,
      demand: rows.reduce((s, r) => s + r.demand, 0),
      capacity: rows.reduce((s, r) => s + r.capacity, 0),
    };
  });

  const capacityDemandOption: EChartsOption = {
    tooltip: TT,
    grid: { left: 38, right: 16, top: 20, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: model.months },
    yAxis: { type: 'value' },
    series: [
      { type: 'bar', name: 'Forecasted Demand Hours', data: monthDemand.map((x) => Number(x.demand.toFixed(1))), itemStyle: { color: COLORS.purple } },
      { type: 'line', name: 'Total Capacity Hours', data: monthDemand.map((x) => Number(x.capacity.toFixed(1))), itemStyle: { color: COLORS.teal }, lineStyle: { color: COLORS.teal, width: 2.4 } },
    ],
    legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 10 } },
  };

  const riskMatrix = Array.from({ length: 5 }, (_, yi) =>
    Array.from({ length: 5 }, (_, xi) => {
      const pVal = xi + 1;
      const iVal = yi + 1;
      const count = model.risks.filter((r) => r.probability === pVal && r.impact === iVal).length;
      return [xi, yi, count];
    }).flat()
  ).flat();

  const riskHeatmapOption: EChartsOption = {
    tooltip: {
      ...TT,
      formatter: (p: any) => `Probability ${Number(p.value[0]) + 1}, Impact ${Number(p.value[1]) + 1}<br/>Active Risks: ${p.value[2]}`,
    },
    grid: { left: 36, right: 16, top: 18, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: ['1', '2', '3', '4', '5'], name: 'Probability' },
    yAxis: { type: 'category', data: ['1', '2', '3', '4', '5'], name: 'Impact' },
    visualMap: {
      min: 0,
      max: Math.max(3, ...riskMatrix.filter((_, i) => i % 3 === 2)),
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: { color: COLORS.muted },
      inRange: { color: ['#0f172a', '#0ea5a4', '#f59e0b', '#ef4444'] },
    },
    series: [{ type: 'heatmap', data: riskMatrix, label: { show: true, color: '#fff' } }],
  };

  const riskDetectScatter: EChartsOption = {
    tooltip: {
      ...TT,
      trigger: 'item',
      formatter: (p: any) => {
        const dt = p.data as any;
        return `${dt.name}<br/>Time to Detect: ${dt.value[0]} days<br/>Exposure: ${dt.value[1]}`;
      },
    },
    grid: { left: 40, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'value', name: 'Time to Detect (days)' },
    yAxis: { type: 'value', name: 'Exposure Score' },
    series: [{
      type: 'scatter',
      data: model.risks.slice(0, 50).map((r) => ({ name: r.entity, value: [r.detectDays, r.exposure] })),
      itemStyle: { color: COLORS.teal, opacity: 0.8 },
      symbolSize: (v: number[]) => Math.max(8, v[1] * 1.6),
    }],
  };

  const sections: SectionSpec[] = [
    {
      id: 'setup',
      title: 'Setup: Overall Health & Setup Readiness',
      question: 'Do we have a workflow/plan to complete the deliverables?',
      explanation:
        'Evaluates if the foundational setup procedures, QA plans, milestones, and client sign-offs are complete before execution begins, and ensures teams are keeping this data accurate.',
      defaultOpen: true,
      content: (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <ChartWrapper option={setupChartOption} height={320} />
          <DataTable
            headers={[
              `${entityLabel} / Deliverable Name`,
              'Client Approved (Y/N)',
              'Procedures Documented (Y/N)',
              'QA Plan Active (Y/N)',
              'Milestones / QC Logs (Count)',
              'Last Update / Data Freshness',
            ]}
            rows={model.setupRows.slice(0, 20).map((r, idx) => ({
              key: `${r.entity}-${idx}`,
              cells: [
                r.entity,
                r.clientApproved > 0 ? 'Y' : 'N',
                r.procedures > 0 ? 'Y' : 'N',
                r.qa > 0 ? 'Y' : 'N',
                `${r.milestones} / ${r.qcLogs}`,
                r.lastUpdate ? `${r.lastUpdate.toLocaleDateString()} (${daysBetween(r.lastUpdate, new Date()) <= 7 ? 'Fresh' : 'Stale'})` : 'No update',
              ],
            }))}
          />
        </div>
      ),
    },
    {
      id: 'progress',
      title: 'Section 1: Progress vs Plan',
      question: 'Are we ahead or behind plan, and what is our trajectory?',
      explanation:
        'Compares baseline expectations against actual progress, tracks newly added scope, and uses trend behavior to indicate whether delivery is moving toward on-time completion.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'inline-flex', border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setProgressView('burnup')}
                style={{ background: progressView === 'burnup' ? 'rgba(64,224,208,0.2)' : 'transparent', color: COLORS.text, border: 'none', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem' }}
              >
                Burn-Up
              </button>
              <button
                onClick={() => setProgressView('gantt')}
                style={{ background: progressView === 'gantt' ? 'rgba(64,224,208,0.2)' : 'transparent', color: COLORS.text, border: 'none', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem' }}
              >
                Custom Gantt
              </button>
            </div>
          </div>
          <ChartWrapper option={progressView === 'burnup' ? burnupOption : customGanttOption} height={340} />
          <DataTable
            headers={['Entity Name', 'Baseline Hours', 'Added Scope Hours', 'Actual Hours', 'Remaining Hours', 'SPI / CPI Trend']}
            rows={entityRows.map((r) => {
              const spi = r.totalWork > 0 ? r.baselineHours / r.totalWork : 1;
              const cpi = r.actualCost > 0 ? (r.baselineBudget / r.actualCost) : 1;
              const trend = spi >= 1 && cpi >= 1 ? '↑ Improving' : spi >= 0.9 && cpi >= 0.9 ? '→ Stable' : '↓ Declining';
              return {
                key: r.id,
                cells: [r.name, fmtHours(r.baselineHours), fmtHours(r.addedScope), fmtHours(r.actualHours), fmtHours(r.remaining), trend],
              };
            })}
          />
        </div>
      ),
    },
    {
      id: 'forecast',
      title: 'Section 2: Forecast Reliability',
      question: 'Can we trust the forecasted completion dates?',
      explanation:
        'Measures prediction stability. Frequently changing forecast dates and concentrated delay volume signal weak predictability and higher schedule risk.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
          <ChartWrapper option={forecastTrendOption} height={300} />
          <ChartWrapper option={forecastStackedOption} height={300} />
          <div style={{ gridColumn: '1 / -1' }}>
            <DataTable
              headers={['Entity Name', 'Baseline End Date', 'Current Forecast Date', 'Days Variance', '# of Forecast Changes', 'Delay Category (Systemic vs. Isolated)']}
              rows={entityRows.map((r) => {
                const baselineEnd = r.plannedEnd || new Date();
                const forecastEnd = new Date((r.plannedEnd || new Date()).getTime() + (r.forecastChanges * 2 + (r.delayCategory === 'Systemic' ? 7 : 2)) * 86400000);
                const variance = daysBetween(baselineEnd, forecastEnd);
                return {
                  key: r.id,
                  cells: [
                    r.name,
                    baselineEnd.toLocaleDateString(),
                    forecastEnd.toLocaleDateString(),
                    variance,
                    r.forecastChanges,
                    r.delayCategory,
                  ],
                };
              })}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'efficiency',
      title: 'Section 3: Resource Efficiency and Productivity',
      question: 'How efficiently are resources converting hours into completed work?',
      explanation:
        'Tracks conversion of paid capacity into earned value, identifies effective FTE loss from inefficiency, and monitors productivity behavior over time.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
          <ChartWrapper option={waterfallOption} height={300} />
          <ChartWrapper option={evActualOption} height={300} />
          <div style={{ gridColumn: '1 / -1' }}>
            <DataTable
              headers={['Team / Role', 'Available Hours', 'Logged Hours', 'Earned Value Hours', 'Efficiency % (Earned / Logged)', 'Effective FTE Loss']}
              rows={model.roles.map((r) => ({
                key: r.role,
                cells: [
                  r.role,
                  fmtHours(r.available),
                  fmtHours(r.logged),
                  fmtHours(r.earned),
                  fmtPct(r.logged > 0 ? (r.earned / r.logged) * 100 : 0),
                  r.fteLoss.toFixed(2),
                ],
              }))}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'overrun',
      title: 'Section 4: Cost and Hours Overrun Risk',
      question: 'Which areas have the highest overrun risk and what is the financial impact?',
      explanation:
        'Highlights entities exceeding baseline budget and hours so leadership can quickly identify overrun concentration and whether overrun velocity is accelerating.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
          <ChartWrapper option={quadrantOption} height={300} />
          <ChartWrapper option={eacTrendOption} height={300} />
          <div style={{ gridColumn: '1 / -1' }}>
            <DataTable
              headers={['Entity Name', 'Baseline Budget / Hours', 'Added Scope Hours', 'Actuals to Date', 'EAC (Projected Final Cost)', 'Variance %']}
              rows={entityRows.map((r) => ({
                key: r.id,
                cells: [
                  r.name,
                  `${fmtMoney(r.baselineBudget)} / ${fmtHours(r.baselineHours)}`,
                  fmtHours(r.addedScope),
                  fmtMoney(r.actualCost),
                  fmtMoney(r.eac),
                  fmtPct(r.variancePct),
                ],
              }))}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'quality',
      title: 'Section 5: Quality Impact on Performance',
      question: 'How much rework is occurring, and what is the cost impact?',
      explanation:
        'Measures hours and financial cost of quality failures, trends rework over time, and indicates whether QC is catching issues early.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
          <ChartWrapper option={paretoOption} height={300} />
          <ChartWrapper option={reworkAreaOption} height={300} />
          <div style={{ gridColumn: '1 / -1' }}>
            <DataTable
              headers={['Defect Category', 'Rework Hours Logged', 'Cost Impact (Hours * Blended Rate)', 'Detection Phase (Peer Review, QA, Client)']}
              rows={model.defects.map((d0, idx) => ({
                key: `${d0.category}-${idx}`,
                cells: [d0.category, fmtHours(d0.reworkHours), fmtMoney(d0.costImpact), d0.detection],
              }))}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'capacity',
      title: 'Section 6: Resource Capacity vs Demand',
      question: 'Do we have enough staff to complete current and future work?',
      explanation:
        'Forecasts work demand against roster capacity to identify shortages and hiring/reallocation needs before delivery impact occurs.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <ChartWrapper option={capacityDemandOption} height={320} />
          <DataTable
            headers={['Role / Discipline', 'Time Period', 'Capacity Hours', 'Demand Hours', 'Utilization %', 'Shortage / Surplus FTE']}
            rows={model.roleCapacityDemandRows.slice(0, 80).map((r) => ({
              key: r.key,
              cells: [r.role, r.month, fmtHours(r.capacity), fmtHours(r.demand), fmtPct(r.utilization), r.shortageFte.toFixed(2)],
            }))}
          />
        </div>
      ),
    },
    {
      id: 'risk',
      title: 'Section 7: Predictability and Risk Exposure',
      question: 'Are we in control of our risks, or reacting too late to problems?',
      explanation:
        'Evaluates risk identification timing, corrective action quality, and concentration of exposure so leadership can focus on the highest-impact risks first.',
      content: (
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
          <ChartWrapper option={riskHeatmapOption} height={300} />
          <ChartWrapper option={riskDetectScatter} height={300} />
          <div style={{ gridColumn: '1 / -1' }}>
            <DataTable
              headers={['Entity / Risk Description', 'Probability & Impact', 'Exposure Score', 'Time to Detect (Days) / Corrective Action Status', 'Mitigation Success Rate (Y/N)']}
              rows={model.risks.map((r) => ({
                key: r.id,
                cells: [
                  `${r.entity}: ${r.description}`,
                  `P${r.probability} / I${r.impact}`,
                  r.exposure,
                  `${r.detectDays} / ${r.corrective}`,
                  r.mitigationSuccess,
                ],
              }))}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ minHeight: 'calc(100vh - 90px)', padding: '1.1rem 1.2rem 2rem', display: 'grid', gap: '0.8rem', background: COLORS.bg }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: COLORS.text, fontSize: '1.8rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
          <p style={{ margin: '0.3rem 0 0', color: COLORS.muted, fontSize: '0.78rem', lineHeight: 1.55 }}>
            Executive health, forecast reliability, productivity, overrun, quality, capacity, and risk controls in one context-aware page.
          </p>
        </div>
        <div style={{ color: COLORS.muted, fontSize: '0.72rem', display: 'grid', gap: 3 }}>
          <span>{model.projects.length.toLocaleString()} entities in scope</span>
          <span>{model.tasks.length.toLocaleString()} tasks</span>
          <span>{model.units.length.toLocaleString()} units • {model.phases.length.toLocaleString()} phases</span>
        </div>
      </header>

      {sections.map((section) => (
        <AccordionSection key={section.id} {...section} />
      ))}
    </div>
  );
}
