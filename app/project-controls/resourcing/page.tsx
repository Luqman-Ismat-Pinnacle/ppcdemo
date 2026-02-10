'use client';

/**
 * @fileoverview Resourcing Page — Comprehensive Resource Management.
 *
 * Redesigned with the org-chart Tree as the primary component.
 * - Single root (COO) with all portfolios, always fully expanded
 * - Utilization-coloured nodes matching the legend
 * - Interactive hover cards on employee nodes (click-through to details)
 * - Employee detail card: role-matched suggested tasks + cross-team demand
 * - Analytics tab: scorecards, utilization charts, leveling, employee table
 *
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useCallback, Suspense, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import {
  runResourceLeveling,
  deriveLevelingInputs,
  DEFAULT_LEVELING_PARAMS,
  type LevelingParams,
  type LevelingResult,
} from '@/lib/resource-leveling-engine';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
const HOURS_PER_YEAR = HOURS_PER_WEEK * 52;

const UTIL_COLORS = {
  available: '#3B82F6',
  optimal: '#10B981',
  busy: '#F59E0B',
  overloaded: '#EF4444',
};

const getUtilColor = (u: number) =>
  u > 100 ? UTIL_COLORS.overloaded : u > 85 ? UTIL_COLORS.busy : u > 50 ? UTIL_COLORS.optimal : UTIL_COLORS.available;

const fmt = (n: number, d = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

// ═══════════════════════════════════════════════════════════════════
// LOADING FALLBACK
// ═══════════════════════════════════════════════════════════════════

function ResourcingPageLoading() {
  return (
    <div className="page-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid var(--border-color)', borderTopColor: 'var(--pinnacle-teal)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading Resourcing...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CONTENT
// ═══════════════════════════════════════════════════════════════════

function ResourcingPageContent() {
  const searchParams = useSearchParams();
  const { filteredData, fullData, setData } = useData();

  // ── State ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'organization' | 'analytics'>('organization');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [levelingResult, setLevelingResult] = useState<LevelingResult | null>(null);

  // ── Data ──────────────────────────────────────────────────────
  const data = useMemo(() => {
    const f = filteredData || {};
    const a = fullData || {};
    return {
      tasks: (f.tasks?.length ? f.tasks : a.tasks) ?? [],
      employees: (f.employees?.length ? f.employees : a.employees) ?? [],
      projects: (f.projects?.length ? f.projects : a.projects) ?? [],
      qctasks: (f.qctasks?.length ? f.qctasks : a.qctasks) ?? [],
      portfolios: (f.portfolios?.length ? f.portfolios : a.portfolios) ?? [],
      hours: (f.hours?.length ? f.hours : a.hours) ?? [],
    };
  }, [filteredData, fullData]);

  const hasData = data.employees.length > 0 || data.projects.length > 0;

  const getProjectName = useCallback((pid: string | null | undefined) => {
    if (!pid) return 'Unknown';
    const p = data.projects.find((p: any) => p.id === pid || p.projectId === pid);
    return p?.name || p?.projectName || pid;
  }, [data.projects]);

  // ── Employee metrics ──────────────────────────────────────────
  const employeeMetrics = useMemo(() =>
    data.employees.map((emp: any) => {
      const eid = emp.id || emp.employeeId;
      const ename = (emp.name || '').toLowerCase();
      const empTasks = data.tasks.filter((t: any) =>
        (t.employeeId || t.employee_id) === eid ||
        (t.assignedTo || '').toLowerCase().includes(ename)
      );
      const allocatedHours = empTasks.reduce((s: number, t: any) => s + (Number(t.baselineHours) || 0), 0);
      const actualHours = empTasks.reduce((s: number, t: any) => s + (Number(t.actualHours) || 0), 0);
      const taskCount = empTasks.length;
      const completedTasks = empTasks.filter((t: any) => (Number(t.percentComplete) || 0) >= 100).length;
      const efficiency = allocatedHours > 0 ? Math.round((actualHours / allocatedHours) * 100) : 100;

      // QC pass rate
      const empQc = data.qctasks.filter((qc: any) =>
        (qc.employeeId || qc.employee_id || qc.qcResourceId) === eid ||
        (qc.qcResourceId || '').toLowerCase().includes(ename)
      );
      const qcPassRate = empQc.length > 0 ? Math.round(empQc.filter((q: any) => (q.qcStatus || '').toLowerCase() === 'pass' || (Number(q.qcScore) || 0) >= 80).length / empQc.length * 100) : null;

      const workHours = allocatedHours > 0 ? allocatedHours : actualHours;
      const utilization = Math.round((workHours / HOURS_PER_YEAR) * 100);
      const availableHours = Math.max(0, HOURS_PER_YEAR - workHours);

      const projectIds = [...new Set(empTasks.map((t: any) => t.projectId || t.project_id).filter(Boolean))];
      const projects = projectIds.map(pid => {
        const p = data.projects.find((pp: any) => pp.id === pid || pp.projectId === pid);
        return p ? { id: pid, name: p.name || p.projectName } : { id: pid, name: pid };
      });

      let status: 'available' | 'optimal' | 'busy' | 'overloaded' = 'available';
      if (utilization > 100) status = 'overloaded';
      else if (utilization > 85) status = 'busy';
      else if (utilization > 50) status = 'optimal';

      return {
        id: eid, name: emp.name || 'Unknown',
        role: emp.jobTitle || emp.role || 'N/A',
        manager: emp.manager || '', managementLevel: emp.managementLevel || '',
        portfolio: emp.portfolio || '',
        allocatedHours, actualHours, taskCount, completedTasks, efficiency,
        qcPassRate, totalQcTasks: empQc.length,
        utilization, availableHours, status, tasks: empTasks, projects, projectIds,
      };
    }),
    [data.employees, data.tasks, data.qctasks, data.projects],
  );

  // ── Projects with employees ───────────────────────────────────
  const projectsWithEmployees = useMemo(() =>
    data.projects.map((proj: any) => {
      const pid = proj.id || proj.projectId;
      const ptasks = data.tasks.filter((t: any) => (t.projectId || t.project_id) === pid);
      const emps = employeeMetrics.filter(e => e.projectIds.includes(pid));
      const portId = proj.portfolioId || proj.portfolio_id;
      const port = data.portfolios.find((p: any) => (p.id || p.portfolioId) === portId || p.name === portId);
      return {
        id: pid, name: proj.name || proj.projectName || pid,
        portfolioId: portId, portfolioName: port?.name || portId || 'Unassigned',
        taskCount: ptasks.length, employees: emps, employeeCount: emps.length,
        totalHours: ptasks.reduce((s: number, t: any) => s + (Number(t.baselineHours) || 0), 0),
      };
    }),
    [data.projects, data.tasks, employeeMetrics, data.portfolios],
  );

  // ── Unassigned tasks sorted by criticality ────────────────────
  const getTaskCriticality = useCallback((task: any) => {
    const isCrit = task.isCritical || task.critical || (Number(task.totalFloat ?? task.float ?? 999)) <= 0;
    const isLinch = task.isLinchpin || task.linchpin || (task.successors?.length || 0) > 3;
    const isHigh = (task.priority || '').toLowerCase() === 'high';
    if (isCrit) return { label: 'Critical', color: '#EF4444', score: 4 };
    if (isLinch) return { label: 'Linchpin', color: '#8B5CF6', score: 3 };
    if (isHigh) return { label: 'High', color: '#F59E0B', score: 2 };
    return { label: 'Normal', color: '#6B7280', score: 1 };
  }, []);

  const unassignedTasks = useMemo(() => {
    const tasks = data.tasks.filter((t: any) => !t.assignedTo && !t.employeeId && !t.employee_id);
    return tasks.sort((a: any, b: any) => getTaskCriticality(b).score - getTaskCriticality(a).score);
  }, [data.tasks, getTaskCriticality]);

  // ── Summary metrics ───────────────────────────────────────────
  const summaryMetrics = useMemo(() => ({
    totalEmployees: employeeMetrics.length,
    totalProjects: data.projects.length,
    totalPortfolios: data.portfolios.length,
    totalCapacity: employeeMetrics.length * HOURS_PER_YEAR,
    totalAllocated: employeeMetrics.reduce((s, e) => s + e.allocatedHours, 0),
    avgUtilization: employeeMetrics.length > 0 ? Math.round(employeeMetrics.reduce((s, e) => s + e.utilization, 0) / employeeMetrics.length) : 0,
    overloaded: employeeMetrics.filter(e => e.status === 'overloaded').length,
    available: employeeMetrics.filter(e => e.status === 'available').length,
    unassignedTasks: unassignedTasks.length,
    criticalTasks: unassignedTasks.filter((t: any) => getTaskCriticality(t).label === 'Critical').length,
  }), [employeeMetrics, data.projects, data.portfolios, unassignedTasks, getTaskCriticality]);

  // ── Suggested tasks for an employee (role-matched only) ───────
  const getSuggestedTasks = useCallback((emp: any) => {
    const empRole = (emp.role || '').toLowerCase();
    const empProjects = new Set(emp.projectIds || []);

    return unassignedTasks
      .filter((t: any) => {
        // Only suggest tasks that match this employee's role
        const taskResource = (t.resource || t.assignedResource || '').toLowerCase();
        // Include if: no specific role required, OR role matches
        return !taskResource || !empRole || taskResource.includes(empRole) || empRole.includes(taskResource);
      })
      .map((t: any) => {
        const crit = getTaskCriticality(t);
        let matchScore = crit.score * 10;
        const tProjectId = t.projectId || t.project_id;

        // Boost if task is on employee's existing project
        if (empProjects.has(tProjectId)) matchScore += 20;

        // Boost if task resource role explicitly matches
        const taskResource = (t.resource || t.assignedResource || '').toLowerCase();
        if (taskResource && empRole && (taskResource.includes(empRole) || empRole.includes(taskResource))) matchScore += 15;

        // Boost if employee has availability
        const taskHrs = Number(t.baselineHours) || 0;
        if (taskHrs <= emp.availableHours) matchScore += 10;

        return { ...t, matchScore, criticality: crit, projectName: getProjectName(tProjectId) };
      })
      .sort((a: any, b: any) => b.matchScore - a.matchScore)
      .slice(0, 8);
  }, [unassignedTasks, getTaskCriticality, getProjectName]);

  // ── Other teams/projects needing this employee ────────────────
  const getTeamsNeedingEmployee = useCallback((emp: any) => {
    const empRole = (emp.role || '').toLowerCase();
    const empProjects = new Set(emp.projectIds || []);

    return projectsWithEmployees
      .filter(p => !empProjects.has(p.id))
      .map(proj => {
        const projTasks = data.tasks.filter((t: any) => (t.projectId || t.project_id) === proj.id);
        const unassignedOnProj = projTasks.filter((t: any) => !t.assignedTo && !t.employeeId && !t.employee_id);

        const roleMatch = unassignedOnProj.filter((t: any) => {
          const res = (t.resource || t.assignedResource || '').toLowerCase();
          return res && empRole && (res.includes(empRole) || empRole.includes(res));
        }).length;

        const criticalCount = unassignedOnProj.filter((t: any) => getTaskCriticality(t).label === 'Critical').length;
        const totalUnassigned = unassignedOnProj.length;
        const demand = roleMatch * 3 + criticalCount * 5 + totalUnassigned;

        // FIX: ensure numeric addition (database values may be strings)
        const unassignedHours = unassignedOnProj.reduce((s: number, t: any) => s + (Number(t.baselineHours) || 0), 0);

        return {
          ...proj, roleMatch, criticalCount, totalUnassigned, demand, unassignedHours,
        };
      })
      .filter(p => p.demand > 0)
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 5);
  }, [projectsWithEmployees, data.tasks, getTaskCriticality]);

  // ── Handle task assignment ────────────────────────────────────
  const handleAssignTask = useCallback((task: any, emp: any) => {
    setAssignmentMessage(`Task "${task.name || task.taskName}" assigned to ${emp.name}`);
    setTimeout(() => setAssignmentMessage(null), 3000);
  }, []);

  // ── Build ECharts Tree ────────────────────────────────────────
  const makeEmpNode = useCallback((emp: any) => ({
    name: emp.name, id: emp.id, emp, utilization: emp.utilization,
    itemStyle: { color: getUtilColor(emp.utilization), borderColor: getUtilColor(emp.utilization) },
    label: { backgroundColor: `${getUtilColor(emp.utilization)}15` },
  }), []);

  /** Compute average utilization for a group of employee IDs */
  const getGroupUtilization = useCallback((empIds: Set<string>) => {
    const emps = employeeMetrics.filter(e => empIds.has(e.id));
    if (emps.length === 0) return 0;
    return Math.round(emps.reduce((s, e) => s + e.utilization, 0) / emps.length);
  }, [employeeMetrics]);

  const buildPortfolioTree = useMemo((): any[] => {
    if (!employeeMetrics.length) return [];
    const byName = new Map(employeeMetrics.map(e => [e.name.toLowerCase(), e]));
    const byMgr = new Map<string, any[]>();
    employeeMetrics.forEach(e => {
      const m = (e.manager || '').trim().toLowerCase();
      if (m) { if (!byMgr.has(m)) byMgr.set(m, []); byMgr.get(m)!.push(e); }
    });
    const roots = employeeMetrics.filter(e => {
      const m = (e.manager || '').trim().toLowerCase();
      const lv = (e.managementLevel || '').toLowerCase();
      return !m || !byName.has(m) || lv.includes('senior manager') || lv.includes('director') || lv.includes('executive') || lv.includes('vp');
    });
    const branch = (emp: any, d: number): any => {
      const reps = byMgr.get(emp.name.toLowerCase()) || [];
      const n = makeEmpNode(emp);
      if (d < 6 && reps.length) (n as any).children = reps.map(r => branch(r, d + 1));
      return n;
    };

    // Build all portfolio nodes — each becomes a separate root
    const portfolioNodes: any[] = [];
    const used = new Set<string>();

    data.portfolios.forEach((port: any) => {
      const pid = port.id || port.portfolioId;
      const pname = port.name || pid;
      const pmgr = (port.manager || '').trim().toLowerCase();
      const pProjs = projectsWithEmployees.filter(p => p.portfolioId === pid);
      const pEmpIds = new Set<string>();
      pProjs.forEach(pr => pr.employees.forEach((e: any) => pEmpIds.add(e.id)));
      const pRoots = roots.filter(e => {
        const en = e.name.toLowerCase();
        if (pmgr && (en === pmgr || en.includes(pmgr) || pmgr.includes(en))) return true;
        return pEmpIds.has(e.id);
      });
      pRoots.forEach(r => used.add(r.id));
      const children = pRoots.length > 0
        ? pRoots.map(r => branch(r, 0))
        : pProjs.map(pr => ({ name: pr.name, id: pr.id, isProject: true, employeeCount: pr.employeeCount, totalHours: pr.totalHours, children: pr.employees.map((e: any) => makeEmpNode(e)) }));

      // Portfolio node with utilization color
      const portUtil = getGroupUtilization(pEmpIds);
      const portColor = getUtilColor(portUtil);
      if (children.length) portfolioNodes.push({
        name: pname, id: pid, isPortfolio: true, projectCount: pProjs.length,
        utilization: portUtil,
        itemStyle: { color: portColor, borderColor: portColor, borderWidth: 2 },
        label: { backgroundColor: `${portColor}15` },
        children,
      });
    });

    // Add unassigned employees as a separate portfolio root
    const extra = roots.filter(r => !used.has(r.id));
    if (extra.length) {
      const extraIds = new Set(extra.map(e => e.id));
      const extraUtil = getGroupUtilization(extraIds);
      const extraColor = getUtilColor(extraUtil);
      portfolioNodes.push({
        name: 'Unassigned', id: 'unassigned-portfolio', isPortfolio: true,
        utilization: extraUtil,
        itemStyle: { color: extraColor, borderColor: extraColor, borderWidth: 2 },
        label: { backgroundColor: `${extraColor}15` },
        children: extra.map(r => branch(r, 0)),
      });
    }

    // Return all portfolio nodes as separate roots (no COO wrapper)
    return portfolioNodes;
  }, [employeeMetrics, data.portfolios, projectsWithEmployees, makeEmpNode, getGroupUtilization]);

  const treeData = buildPortfolioTree;

  // ── Register global action bridge for tooltip clicks ──────────
  useEffect(() => {
    (window as any).__resourcingOpenEmployee = (empId: string) => {
      const emp = employeeMetrics.find(e => e.id === empId);
      if (emp) { setSelectedEmployee(emp); setShowEmployeeModal(true); }
    };
    return () => { delete (window as any).__resourcingOpenEmployee; };
  }, [employeeMetrics]);

  // ── ECharts tree option ───────────────────────────────────────
  const treeOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      enterable: true,
      hideDelay: 400,
      backgroundColor: 'rgba(22,27,34,0.97)',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 0,
      textStyle: { color: '#fff', fontSize: 11 },
      extraCssText: 'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.5);max-width:320px;',
      formatter: (params: any) => {
        const d = params.data;
        if (d.isPortfolio) {
          const uc = getUtilColor(d.utilization || 0);
          return `<div style="padding:12px 16px;"><div style="font-weight:700;font-size:14px;margin-bottom:4px;">${d.name}</div><div style="font-size:11px;color:#9ca3af;">Portfolio${d.projectCount ? ' · ' + d.projectCount + ' projects' : ''}</div><div style="margin-top:6px;display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:50%;border:2px solid ${uc};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${uc};background:${uc}15;">${d.utilization}%</div><span style="font-size:10px;color:#9ca3af;">Avg Utilization</span></div></div>`;
        }
        if (d.isProject) return `<div style="padding:12px 16px;"><div style="font-weight:700;font-size:14px;margin-bottom:4px;">${d.name}</div><div style="font-size:11px;color:#9ca3af;">Project · ${d.employeeCount || 0} employees</div>${d.totalHours ? '<div style="font-size:11px;margin-top:4px;">' + fmt(d.totalHours) + ' total hours</div>' : ''}</div>`;
        if (d.isPlaceholder) return `<div style="padding:8px 12px;font-size:11px;color:#6B7280;">${d.name}</div>`;
        if (d.emp) {
          const e = d.emp;
          const uc = getUtilColor(e.utilization);
          return `<div style="padding:14px 16px;min-width:240px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <div><div style="font-weight:700;font-size:14px;">${e.name}</div><div style="font-size:11px;color:#9ca3af;">${e.role}</div></div>
              <div style="width:40px;height:40px;border-radius:50%;border:2px solid ${uc};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${uc};background:${uc}15;">${e.utilization}%</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11px;margin-bottom:10px;">
              <div style="color:#9ca3af;">Tasks</div><div style="font-weight:600;">${e.taskCount}</div>
              <div style="color:#9ca3af;">Allocated</div><div style="font-weight:600;">${fmt(e.allocatedHours)} hrs</div>
              <div style="color:#9ca3af;">Available</div><div style="font-weight:600;color:#10B981;">${fmt(e.availableHours)} hrs</div>
              <div style="color:#9ca3af;">Projects</div><div style="font-weight:600;">${e.projects?.length || 0}</div>
              ${e.qcPassRate !== null ? `<div style="color:#9ca3af;">QC Rate</div><div style="font-weight:600;">${e.qcPassRate}%</div>` : ''}
            </div>
            <button onclick="window.__resourcingOpenEmployee('${e.id}')" style="width:100%;padding:8px;border:none;border-radius:6px;background:rgba(64,224,208,0.15);color:#40E0D0;font-weight:600;font-size:12px;cursor:pointer;transition:background 0.15s;">
              View Details & Assign Tasks →
            </button>
          </div>`;
        }
        return `<div style="padding:8px 12px;"><strong>${d.name}</strong></div>`;
      },
    },
    series: [{
      type: 'tree',
      data: treeData,
      top: '2%', left: '3%', bottom: '2%', right: '15%',
      symbolSize: 18,
      orient: 'TB',
      layout: 'orthogonal',
      initialTreeDepth: -1,  // fully expand ALL nodes
      expandAndCollapse: true,
      animationDurationUpdate: 500,
      roam: true,
      label: {
        position: 'bottom', verticalAlign: 'middle', align: 'center',
        fontSize: 10, color: 'var(--text-primary)', borderRadius: 4, padding: [4, 8],
        formatter: (params: any) => {
          const d = params.data;
          if (d.isPortfolio) return `{bold|${d.name}}`;
          if (d.isProject) return `{project|${d.name.substring(0, 20)}${d.name.length > 20 ? '...' : ''}}`;
          if (d.isPlaceholder) return `{muted|${d.name}}`;
          if (d.emp) {
            const sn = d.name.split(' ').map((n: string, i: number) => i === 0 ? n : n[0] + '.').join(' ');
            return `${sn}\n{util|${d.utilization || 0}%}`;
          }
          return d.name;
        },
        rich: {
          bold: { fontWeight: 'bold' as any, fontSize: 12, lineHeight: 16 },
          role: { fontSize: 9, color: '#9ca3af', lineHeight: 14 },
          project: { fontSize: 10, color: '#60A5FA' },
          muted: { fontSize: 9, color: '#6B7280', fontStyle: 'italic' as any },
          util: { fontSize: 9, color: '#9ca3af', lineHeight: 14 },
        },
      },
      leaves: { label: { position: 'bottom', verticalAlign: 'middle', align: 'center' } },
      lineStyle: { color: 'var(--border-color)', width: 1.5, curveness: 0.5 },
      emphasis: {
        focus: 'descendant',
        itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(64,224,208,0.5)' },
      },
    }],
  }), [treeData]);

  // ── Analytics charts ──────────────────────────────────────────
  const capacityChartOption: EChartsOption = useMemo(() => {
    const cd = employeeMetrics.sort((a, b) => b.utilization - a.utilization).slice(0, 20).map(e => ({ name: e.name.split(' ')[0], utilization: e.utilization }));
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff', fontSize: 11 } },
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
      xAxis: { type: 'category', data: cd.map(d => d.name), axisLabel: { color: 'var(--text-muted)', fontSize: 9, rotate: 45 }, axisLine: { lineStyle: { color: 'var(--border-color)' } } },
      yAxis: { type: 'value', max: 150, axisLabel: { color: 'var(--text-muted)', fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } } },
      series: [{ type: 'bar', data: cd.map(d => ({ value: d.utilization, itemStyle: { color: getUtilColor(d.utilization) } })), barWidth: '60%', markLine: { silent: true, symbol: 'none', data: [{ yAxis: 100, lineStyle: { color: '#EF4444', type: 'dashed', width: 2 } }] } }],
    };
  }, [employeeMetrics]);

  const utilizationPieOption: EChartsOption = useMemo(() => {
    const dist = { available: employeeMetrics.filter(e => e.status === 'available').length, optimal: employeeMetrics.filter(e => e.status === 'optimal').length, busy: employeeMetrics.filter(e => e.status === 'busy').length, overloaded: employeeMetrics.filter(e => e.status === 'overloaded').length };
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'], avoidLabelOverlap: false, itemStyle: { borderRadius: 6, borderColor: 'var(--bg-card)', borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } }, labelLine: { show: false }, data: [
        { value: dist.available, name: 'Available', itemStyle: { color: UTIL_COLORS.available } },
        { value: dist.optimal, name: 'Optimal', itemStyle: { color: UTIL_COLORS.optimal } },
        { value: dist.busy, name: 'Busy', itemStyle: { color: UTIL_COLORS.busy } },
        { value: dist.overloaded, name: 'Overloaded', itemStyle: { color: UTIL_COLORS.overloaded } },
      ] }],
    };
  }, [employeeMetrics]);

  const runLeveling = useCallback(() => {
    const inputs = deriveLevelingInputs({ tasks: data.tasks, employees: data.employees, hours: data.hours });
    setLevelingResult(runResourceLeveling(inputs, DEFAULT_LEVELING_PARAMS));
  }, [data.tasks, data.employees, data.hours]);

  // ── Empty state ───────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="page-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600 }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px' }}>Import employee and project data from the Data Management page to view resource allocation.</p>
          <a href="/project-controls/data-management" style={{ padding: '0.75rem 1.5rem', background: 'var(--pinnacle-teal)', color: '#000', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>Go to Data Management</a>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden', padding: '0.5rem 1rem 0.25rem', gap: '0.35rem' }}>
      {/* Success Toast */}
      {assignmentMessage && (
        <div style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', padding: '1rem 2rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(16,185,129,0.8))', borderRadius: '12px', color: '#fff', fontWeight: 600, zIndex: 2000, boxShadow: '0 10px 40px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
          {assignmentMessage}
        </div>
      )}

      {/* ── Employee Detail Modal ──────────────────────────────── */}
      {showEmployeeModal && selectedEmployee && (() => {
        const suggestedTasks = getSuggestedTasks(selectedEmployee);
        const teamsNeeding = getTeamsNeedingEmployee(selectedEmployee);
        const uc = getUtilColor(selectedEmployee.utilization);
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }} onClick={() => setShowEmployeeModal(false)}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '1.5rem', maxWidth: '700px', width: '100%', maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{selectedEmployee.name}</h2>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{selectedEmployee.role}</p>
                </div>
                <button onClick={() => setShowEmployeeModal(false)} style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              {/* Metrics Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.75rem', background: `linear-gradient(135deg, ${uc}20, transparent)`, borderRadius: '10px', border: `1px solid ${uc}40`, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: uc }}>{selectedEmployee.utilization}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Utilization</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{selectedEmployee.taskCount}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tasks</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{fmt(selectedEmployee.allocatedHours)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Allocated Hrs</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10B981' }}>{fmt(selectedEmployee.availableHours)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available Hrs</div>
                </div>
              </div>

              {/* Projects */}
              {selectedEmployee.projects?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Projects</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedEmployee.projects.map((p: any, i: number) => (
                      <span key={i} style={{ padding: '0.3rem 0.65rem', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border-color)' }}>{p.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Suggested Priority Tasks (role-matched) ─────────── */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Suggested Tasks to Assign
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.5rem', maxHeight: '220px', overflow: 'auto' }}>
                  {suggestedTasks.length > 0 ? suggestedTasks.map((t: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-card)', borderRadius: '8px', marginBottom: '0.35rem', border: `1px solid ${t.criticality.color}25`, borderLeft: `3px solid ${t.criticality.color}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name || t.taskName}</div>
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <span>{fmt(Number(t.baselineHours) || 0)} hrs</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{t.projectName}</span>
                          <span style={{ color: t.criticality.color, fontWeight: 600 }}>{t.criticality.label}</span>
                        </div>
                      </div>
                      <button onClick={() => handleAssignTask(t, selectedEmployee)} style={{ padding: '0.35rem 0.75rem', background: 'rgba(64,224,208,0.15)', border: '1px solid rgba(64,224,208,0.3)', borderRadius: '6px', color: 'var(--pinnacle-teal)', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Assign
                      </button>
                    </div>
                  )) : (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No matching unassigned tasks for this role</div>
                  )}
                </div>
              </div>

              {/* ── Teams Needing This Employee ───────────────────── */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Other Teams That Need This Employee
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
                  {teamsNeeding.length > 0 ? teamsNeeding.map((team: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-card)', borderRadius: '8px', marginBottom: '0.35rem', border: '1px solid var(--border-color)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <span>{team.totalUnassigned} unassigned</span>
                          {team.roleMatch > 0 && <span style={{ color: '#8B5CF6' }}>{team.roleMatch} match role</span>}
                          {team.criticalCount > 0 && <span style={{ color: '#EF4444' }}>{team.criticalCount} critical</span>}
                          <span>{fmt(team.unassignedHours)} hrs</span>
                        </div>
                      </div>
                      <button onClick={() => { setAssignmentMessage(`Suggested move: ${selectedEmployee.name} → ${team.name}`); setTimeout(() => setAssignmentMessage(null), 3000); }} style={{ padding: '0.35rem 0.75rem', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', color: '#8B5CF6', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Suggest Move
                      </button>
                    </div>
                  )) : (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No other teams currently need this role</div>
                  )}
                </div>
              </div>

              <button onClick={() => setShowEmployeeModal(false)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        );
      })()}

      {/* ═══ TAB HEADER + CONTROLS ════════════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
            {(['organization', 'analytics'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '0.45rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: activeTab === tab ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeTab === tab ? '#000' : 'var(--text-primary)',
                fontWeight: 600, fontSize: '0.8rem', textTransform: 'capitalize',
              }}>{tab}</button>
            ))}
          </div>
          
        </div>
        {activeTab === 'organization' && (
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', alignItems: 'center' }}>
            {Object.entries(UTIL_COLORS).map(([label, color]) => (
              <span key={label}><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: color, marginRight: '4px' }} />{label.charAt(0).toUpperCase() + label.slice(1)}</span>
            ))}
          </div>
        )}
      </div>

      {/* ═══ ORGANIZATION TAB ══════════════════════════════════════ */}
      {activeTab === 'organization' ? (
        <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', minHeight: 0 }}>
          {treeData.length > 0 ? (
            <ChartWrapper option={treeOption} height="100%" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.4 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No organization data to display</p>
                <p style={{ fontSize: '0.85rem' }}>No employees or portfolios found. Import data from Data Management.</p>
                
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ═══ ANALYTICS TAB ═══════════════════════════════════════ */
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Scorecards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', flexShrink: 0 }}>
            {[
              { label: 'Portfolios', value: summaryMetrics.totalPortfolios },
              { label: 'Projects', value: summaryMetrics.totalProjects },
              { label: 'Employees', value: summaryMetrics.totalEmployees, accent: 'var(--pinnacle-teal)', bg: 'linear-gradient(135deg, rgba(64,224,208,0.15), rgba(64,224,208,0.05))', border: 'rgba(64,224,208,0.3)' },
              { label: 'Avg Utilization', value: `${summaryMetrics.avgUtilization}%`, accent: getUtilColor(summaryMetrics.avgUtilization) },
              { label: 'Overloaded', value: summaryMetrics.overloaded, accent: '#EF4444', bg: summaryMetrics.overloaded > 0 ? 'rgba(239,68,68,0.1)' : undefined, border: summaryMetrics.overloaded > 0 ? 'rgba(239,68,68,0.3)' : undefined },
              { label: 'Unassigned Tasks', value: summaryMetrics.unassignedTasks, accent: '#F59E0B', bg: summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.1)' : undefined, border: summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.3)' : undefined },
            ].map(m => (
              <div key={m.label} style={{ padding: '0.75rem', background: m.bg || 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${m.border || 'var(--border-color)'}` }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: m.accent }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Employee Utilization</div>
              <ChartWrapper option={capacityChartOption} height="250px" />
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Utilization Distribution</div>
              <ChartWrapper option={utilizationPieOption} height="250px" />
            </div>
          </div>

          {/* Resource Leveling */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Resource Leveling Analysis</div>
              <button onClick={runLeveling} style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', background: 'var(--pinnacle-teal)', color: '#000', border: 'none', fontWeight: 600, fontSize: '0.8rem' }}>Run Analysis</button>
            </div>
            {levelingResult ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800, color: getUtilColor(levelingResult.overallUtilization) }}>{levelingResult.overallUtilization}%</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overall Utilization</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800 }}>{levelingResult.totalMoves}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Suggested Moves</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800 }}>{levelingResult.tasksMoved || 0}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tasks to Shift</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px' }}><div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recommendation</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{levelingResult.summary}</div></div>
              </div>
            ) : <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Click "Run Analysis" to get resource leveling recommendations</div>}
          </div>

          {/* Employee Table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)', flex: 1, minHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Employee Details</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Name', 'Role', 'Utilization', 'Tasks', 'Allocated', 'Available', 'QC Rate', 'Projects'].map(h => (
                    <th key={h} style={{ padding: '0.6rem', textAlign: h === 'Name' || h === 'Role' ? 'left' : 'center', borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {employeeMetrics.map((emp, idx) => (
                    <tr key={emp.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', cursor: 'pointer' }} onClick={() => { setSelectedEmployee(emp); setShowEmployeeModal(true); }}>
                      <td style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color)' }}>{emp.name}</td>
                      <td style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{emp.role}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600, background: `${getUtilColor(emp.utilization)}20`, color: getUtilColor(emp.utilization) }}>{emp.utilization}%</span>
                      </td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{emp.taskCount}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{fmt(emp.allocatedHours)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#10B981' }}>{fmt(emp.availableHours)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{emp.qcPassRate !== null ? `${emp.qcPassRate}%` : '-'}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{emp.projects?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT (with Suspense boundary)
// ═══════════════════════════════════════════════════════════════════

export default function ResourcingPage() {
  return (
    <Suspense fallback={<ResourcingPageLoading />}>
      <ResourcingPageContent />
    </Suspense>
  );
}
