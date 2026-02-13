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
import PageLoader from '@/components/ui/PageLoader';
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
  // Uses EnhancedPageLoader via route-level loading.tsx now
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
  const { filteredData, fullData, setData, refreshData, isLoading } = useData();

  // ── State ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'organization' | 'analytics' | 'heatmap'>('organization');
  const [heatmapView, setHeatmapView] = useState<'role' | 'employee'>('employee');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [levelingResult, setLevelingResult] = useState<LevelingResult | null>(null);
  const [orgSearch, setOrgSearch] = useState('');
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [heatmapRoleFilter, setHeatmapRoleFilter] = useState<string>('all');

  // ── Data ──────────────────────────────────────────────────────
  const data = useMemo(() => {
    const f: any = filteredData || {};
    const a: any = fullData || {};
    const rawPortfolios = (f.portfolios?.length ? f.portfolios : a.portfolios) ?? [];
    // Only show active portfolios on the Resourcing page. Data Management still
    // sees all portfolios (even inactive) for admin purposes.
    const activePortfolios = rawPortfolios.filter((p: any) => {
      const inactiveFlag = p.isActive === false || p.is_active === false || p.active === false;
      const status = (p.status || '').toString().toLowerCase();
      const name = (p.name || '').toString().toLowerCase();
      const hasInactiveWord =
        status.includes('inactive') ||
        status.includes('terminated') ||
        status.includes('archived') ||
        status.includes('closed') ||
        status.includes('cancelled') ||
        status.includes('canceled');
      const nameInactive =
        name.includes('inactive') ||
        name.includes('terminated');
      return !inactiveFlag && !hasInactiveWord && !nameInactive;
    });
    return {
      tasks: (f.tasks?.length ? f.tasks : a.tasks) ?? [],
      employees: (f.employees?.length ? f.employees : a.employees) ?? [],
      projects: (f.projects?.length ? f.projects : a.projects) ?? [],
      qctasks: (f.qctasks?.length ? f.qctasks : a.qctasks) ?? [],
      portfolios: activePortfolios,
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

  // ── Handle task assignment — updates database + creates notification
  const handleAssignTask = useCallback(async (task: any, emp: any) => {
    const taskId = task.id || task.taskId;
    const taskName = task.name || task.taskName || 'Unknown Task';
    const projectName = task.projectName || '';

    setAssignmentMessage(`Assigning "${taskName}" to ${emp.name}...`);

    try {
      // 1. Update the task assignment in the database
      const assignRes = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, employeeId: emp.id, employeeName: emp.name }),
      });
      const assignData = await assignRes.json();

      if (!assignData.success) {
        setAssignmentMessage(`Failed: ${assignData.error || 'Unknown error'}`);
        setTimeout(() => setAssignmentMessage(null), 4000);
        return;
      }

      // 2. Create a notification for the employee
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          role: emp.role,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have been assigned to "${taskName}"${projectName ? ` on project ${projectName}` : ''}.`,
          relatedTaskId: taskId,
          relatedProjectId: task.projectId || task.project_id || null,
        }),
      });

      // 3. Update local data context to reflect the change immediately
      if (typeof refreshData === 'function') {
        refreshData();
      }

      setAssignmentMessage(`"${taskName}" assigned to ${emp.name}`);
      setTimeout(() => setAssignmentMessage(null), 3000);
    } catch (err) {
      console.error('Assignment error:', err);
      setAssignmentMessage('Assignment failed — check connection');
      setTimeout(() => setAssignmentMessage(null), 4000);
    }
  }, [refreshData]);

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

  const buildManagerTree = useMemo((): any[] => {
    if (!employeeMetrics.length) return [];

    // Build employee lookup by name (lowercase) for manager matching
    const empByName = new Map<string, any>();
    employeeMetrics.forEach(emp => {
      empByName.set((emp.name || '').toLowerCase().trim(), emp);
    });

    // Find children of a given manager
    const getDirectReports = (managerName: string): any[] => {
      const mnLower = managerName.toLowerCase().trim();
      return employeeMetrics.filter(emp => {
        const mgr = (emp.manager || '').toLowerCase().trim();
        return mgr === mnLower && (emp.name || '').toLowerCase().trim() !== mnLower;
      });
    };

    // Recursively build tree nodes
    const visited = new Set<string>();
    const buildNode = (emp: any): any => {
      if (visited.has(emp.id)) return null;
      visited.add(emp.id);

      const reports = getDirectReports(emp.name);
      const childNodes = reports.map(r => buildNode(r)).filter(Boolean);
      const uc = getUtilColor(emp.utilization);

      // Compute group utilization for managers
      const groupUtil = childNodes.length > 0
        ? Math.round([emp, ...reports].reduce((s, e) => s + e.utilization, 0) / (1 + reports.length))
        : emp.utilization;

      const node: any = {
        name: emp.name,
        id: emp.id,
        emp,
        utilization: emp.utilization,
        isManager: childNodes.length > 0,
        reportCount: childNodes.length,
        groupUtilization: groupUtil,
        itemStyle: { color: uc, borderColor: uc, borderWidth: childNodes.length > 0 ? 2.5 : 1.5 },
        label: { backgroundColor: `${uc}15` },
        children: childNodes.length > 0 ? childNodes : undefined,
      };
      return node;
    };

    // Root employees: those whose manager field is empty, or whose manager name doesn't match any other employee
    const roots = employeeMetrics.filter(emp => {
      const mgr = (emp.manager || '').toLowerCase().trim();
      return !mgr || !empByName.has(mgr) || mgr === (emp.name || '').toLowerCase().trim();
    });

    const rootNodes = roots.map(r => buildNode(r)).filter(Boolean);

    // Catch any employees missed (circular references, etc.)
    const missedEmps = employeeMetrics.filter(e => !visited.has(e.id));
    if (missedEmps.length > 0) {
      missedEmps.forEach(emp => {
        const node = buildNode(emp);
        if (node) rootNodes.push(node);
      });
    }

    // Sort roots: managers first (by report count desc), then individuals
    rootNodes.sort((a: any, b: any) => (b.reportCount || 0) - (a.reportCount || 0));

    return rootNodes;
  }, [employeeMetrics]);

  const treeData = buildManagerTree;

  // Count leaves for proportional height allocation
  const countLeaves = (nodes: any[]): number =>
    nodes.reduce((sum: number, n: any) => {
      if (!n.children || n.children.length === 0) return sum + 1;
      return sum + countLeaves(n.children);
    }, 0);

  const treeLeafCounts = useMemo(() =>
    treeData.map(p => ({ name: p.name, leaves: countLeaves([p]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeData],
  );

  const totalLeaves = treeLeafCounts.reduce((s, p) => s + p.leaves, 0);
  // For vertical TB layout — cap dimensions to reasonable viewport sizes
  const dynamicTreeWidth = Math.max(1200, Math.min(totalLeaves * 120, 4000));
  const dynamicTreeHeight = Math.max(800, Math.min(treeData.length * 200 + totalLeaves * 32, 3000));

  // ── Register global action bridge for tooltip clicks ──────────
  useEffect(() => {
    (window as any).__resourcingOpenEmployee = (empId: string) => {
      const emp = employeeMetrics.find(e => e.id === empId);
      if (emp) { setSelectedEmployee(emp); setShowEmployeeModal(true); }
    };
    return () => { delete (window as any).__resourcingOpenEmployee; };
  }, [employeeMetrics]);

  // ── ECharts tree option — single series (manager hierarchy) with utilization legend ──
  const treeOption: EChartsOption = useMemo(() => {
    if (treeData.length === 0) return { series: [] };

    // Tooltip formatter
    const tooltipFormatter = (params: any) => {
      const d = params.data;
      if (d.emp) {
        const e = d.emp;
        const uc = getUtilColor(e.utilization);
        const managerLine = d.isManager
          ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">Manager · ${d.reportCount} direct report${d.reportCount !== 1 ? 's' : ''}</div>`
          : `<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">${e.role}</div>`;
        return `<div style="padding:14px 16px;min-width:240px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div><div style="font-weight:700;font-size:14px;">${e.name}</div>${managerLine}</div>
            <div style="width:40px;height:40px;border-radius:50%;border:2px solid ${uc};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${uc};background:${uc}15;">${e.utilization}%</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11px;margin-bottom:10px;">
            <div style="color:#9ca3af;">Role</div><div style="font-weight:600;">${e.role}</div>
            <div style="color:#9ca3af;">Tasks</div><div style="font-weight:600;">${e.taskCount}</div>
            <div style="color:#9ca3af;">Allocated</div><div style="font-weight:600;">${fmt(e.allocatedHours)} hrs</div>
            <div style="color:#9ca3af;">Available</div><div style="font-weight:600;color:#10B981;">${fmt(e.availableHours)} hrs</div>
            <div style="color:#9ca3af;">Projects</div><div style="font-weight:600;">${e.projects?.length || 0}</div>
            ${e.qcPassRate !== null ? `<div style="color:#9ca3af;">QC Rate</div><div style="font-weight:600;">${e.qcPassRate}%</div>` : ''}
          </div>
          <button onclick="window.__resourcingOpenEmployee('${e.id}')" style="width:100%;padding:8px;border:none;border-radius:6px;background:rgba(64,224,208,0.15);color:#40E0D0;font-weight:600;font-size:12px;cursor:pointer;transition:background 0.15s;">
            View Details &amp; Assign Tasks →
          </button>
        </div>`;
      }
      return `<div style="padding:8px 12px;"><strong>${d.name}</strong></div>`;
    };

    // Label config for TB (top-to-bottom) layout
    const sharedLabel = {
      position: 'bottom' as const,
      verticalAlign: 'top' as const,
      align: 'center' as const,
      fontSize: 10.5,
      color: '#f4f4f5',
      borderRadius: 5,
      padding: [5, 8] as [number, number],
      distance: 8,
      formatter: (params: any) => {
        const d = params.data;
        if (d.isManager) {
          return `{mgrName|${d.name}}\n{mgrSub|${d.reportCount} reports}\n{util|${d.utilization || 0}%}`;
        }
        if (d.emp) {
          return `{empName|${d.name}}\n{empRole|${d.emp?.role || ''}}\n{util|${d.utilization || 0}%}`;
        }
        return d.name;
      },
      rich: {
        mgrName: { fontWeight: 'bold' as any, fontSize: 12, lineHeight: 18, color: '#40E0D0', align: 'center' as const },
        mgrSub: { fontSize: 9, color: '#9ca3af', lineHeight: 13, align: 'center' as const },
        empName: { fontSize: 10.5, fontWeight: 'bold' as any, color: '#f4f4f5', lineHeight: 16, align: 'center' as const },
        empRole: { fontSize: 9, color: '#a1a1aa', lineHeight: 13, align: 'center' as const },
        util: { fontSize: 9, color: '#9ca3af', lineHeight: 13, align: 'center' as const },
      },
    };

    // Merge all root nodes under a virtual root for a single cohesive tree
    const mergedRoot = treeData.length === 1
      ? treeData[0]
      : { name: 'Organization', children: treeData, isManager: false, utilization: 0, itemStyle: { color: '#40E0D0', borderColor: '#40E0D0' } };

    return {
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
        formatter: tooltipFormatter,
      },
      toolbox: {
        show: true,
        orient: 'vertical' as const,
        right: 12,
        bottom: 12,
        feature: {
          dataZoom: { show: true, title: { zoom: 'Zoom', back: 'Reset Zoom' } },
          restore: { show: true, title: 'Restore' },
        },
        iconStyle: { borderColor: '#a1a1aa' },
        emphasis: { iconStyle: { borderColor: '#40E0D0' } },
      },
      // Utilization-level legend instead of portfolio names
      legend: {
        top: '1%',
        left: 'center',
        orient: 'horizontal' as const,
        selectedMode: false,
        data: [
          { name: 'Available (< 50%)', icon: 'roundRect', itemStyle: { color: UTIL_COLORS.available } },
          { name: 'Optimal (50-85%)', icon: 'roundRect', itemStyle: { color: UTIL_COLORS.optimal } },
          { name: 'Busy (85-100%)', icon: 'roundRect', itemStyle: { color: UTIL_COLORS.busy } },
          { name: 'Overloaded (> 100%)', icon: 'roundRect', itemStyle: { color: UTIL_COLORS.overloaded } },
        ],
        textStyle: { color: '#a1a1aa', fontSize: 11 },
        itemGap: 24,
        itemWidth: 14,
        itemHeight: 10,
      },
      series: [{
        type: 'tree',
        name: 'Organization',
        data: [mergedRoot],
        top: '8%',
        left: '4%',
        bottom: '14%',
        right: '4%',
        orient: 'TB',
        layout: 'orthogonal',
        edgeShape: 'polyline',
        edgeForkPosition: '50%',
        initialTreeDepth: -1,
        expandAndCollapse: true,
        animationDuration: 400,
        animationDurationUpdate: 500,
        roam: true,
        symbolSize: (_value: any, params: any) => {
          const d = params?.data;
          if (d?.isManager && (d?.reportCount || 0) > 3) return 22;
          if (d?.isManager) return 18;
          return 12;
        },
        itemStyle: { color: UTIL_COLORS.available, borderColor: UTIL_COLORS.available, borderWidth: 1.5 },
        label: sharedLabel,
        leaves: { label: { position: 'bottom' as const, verticalAlign: 'top' as const, align: 'center' as const } },
        lineStyle: { color: '#3f3f4670', width: 1.5, curveness: 0.3 },
        emphasis: {
          focus: 'descendant',
          itemStyle: { borderWidth: 3, shadowBlur: 12, shadowColor: 'rgba(64,224,208,0.5)' },
        },
      }],
    };
  }, [treeData, treeLeafCounts]);

  // ── Analytics charts ──────────────────────────────────────────
  const sortedEmployeesByUtil = useMemo(() =>
    [...employeeMetrics].sort((a, b) => b.utilization - a.utilization),
    [employeeMetrics]);

  const capacityChartOption: EChartsOption = useMemo(() => {
    const cd = sortedEmployeesByUtil.map(e => ({ id: e.id, name: e.name, utilization: e.utilization, role: e.role, taskCount: e.taskCount, allocatedHours: e.allocatedHours, availableHours: e.availableHours }));
    const chartHeight = Math.max(420, cd.length * 28);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,27,34,0.97)', borderColor: '#3f3f46',
        textStyle: { color: '#fff', fontSize: 11 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.45);max-width:320px;',
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx == null) return '';
          const e = cd[idx];
          const uc = getUtilColor(e.utilization);
          return `<strong>${e.name}</strong><br/><span style="color:#9ca3af">${e.role}</span><br/>Utilization: <strong style="color:${uc}">${e.utilization}%</strong><br/>Tasks: ${e.taskCount} · Allocated: ${fmt(e.allocatedHours)} hrs<br/>Available: <span style="color:#10B981">${fmt(e.availableHours)} hrs</span><br/><span style="color:#40E0D0;font-size:10px">Click to view details & assign tasks</span>`;
        },
      },
      grid: { left: 120, right: 40, top: 30, bottom: 30 },
      yAxis: { type: 'category', data: cd.map(d => d.name), axisLabel: { color: '#a1a1aa', fontSize: 10 }, axisLine: { lineStyle: { color: '#3f3f46' } }, inverse: true },
      xAxis: { type: 'value', max: 150, axisLabel: { color: '#a1a1aa', fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#27272a', type: 'dashed' } } },
      series: [{ type: 'bar', data: cd.map(d => ({ value: d.utilization, _empId: d.id, itemStyle: { color: getUtilColor(d.utilization), borderRadius: [0, 4, 4, 0] } })), barWidth: '65%', markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100, lineStyle: { color: '#EF4444', type: 'dashed', width: 2 }, label: { formatter: 'Capacity', color: '#EF4444', fontSize: 9 } }] } }],
      _chartHeight: chartHeight,
    };
  }, [sortedEmployeesByUtil]);

  const utilizationPieOption: EChartsOption = useMemo(() => {
    const dist = { available: employeeMetrics.filter(e => e.status === 'available').length, optimal: employeeMetrics.filter(e => e.status === 'optimal').length, busy: employeeMetrics.filter(e => e.status === 'busy').length, overloaded: employeeMetrics.filter(e => e.status === 'overloaded').length };
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: '#3f3f46', textStyle: { color: '#fff' } },
      legend: { bottom: 0, textStyle: { color: '#a1a1aa', fontSize: 10 } },
      series: [{
        type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'], avoidLabelOverlap: false, itemStyle: { borderRadius: 6, borderColor: '#161b22', borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } }, labelLine: { show: false }, data: [
          { value: dist.available, name: 'Available', itemStyle: { color: UTIL_COLORS.available } },
          { value: dist.optimal, name: 'Optimal', itemStyle: { color: UTIL_COLORS.optimal } },
          { value: dist.busy, name: 'Busy', itemStyle: { color: UTIL_COLORS.busy } },
          { value: dist.overloaded, name: 'Overloaded', itemStyle: { color: UTIL_COLORS.overloaded } },
        ]
      }],
    };
  }, [employeeMetrics]);

  const runLeveling = useCallback(() => {
    const inputs = deriveLevelingInputs({ tasks: data.tasks, employees: data.employees, hours: data.hours });
    setLevelingResult(runResourceLeveling(inputs, DEFAULT_LEVELING_PARAMS));
  }, [data.tasks, data.employees, data.hours]);

  // ── Resource Heatmap — shared data layer for both views ──
  const heatmapSharedData = useMemo(() => {
    // Build employee lookup maps
    const empIdToName = new Map<string, string>();
    const empIdToRole = new Map<string, string>();
    const empNameToRole = new Map<string, string>();
    data.employees.forEach((e: any) => {
      const eid = e.id || e.employeeId;
      const name = e.name || 'Unknown';
      const role = e.jobTitle || e.role || 'Unknown';
      empIdToName.set(eid, name);
      empIdToRole.set(eid, role);
      empNameToRole.set(name.toLowerCase(), role);
    });

    // Only tasks with dates and hours (from project plan)
    const planTasks = data.tasks.filter((t: any) => {
      const s = t.startDate || t.start_date;
      const e = t.endDate || t.end_date || t.finishDate || t.finish_date;
      const hrs = Number(t.baselineHours || t.baseline_hours) || 0;
      return s && e && hrs > 0;
    });

    // When no tasks with dates/hours exist, create a stub grid using current quarter
    if (planTasks.length === 0) {
      // Generate 12 weeks from today as the display range
      const now = Date.now();
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const displayWeeks: { start: number; label: string }[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(now + i * msPerWeek);
        const mon = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const yr = d.getFullYear();
        displayWeeks.push({ start: d.getTime(), label: `${mon}/${day}/${yr}` });
      }
      // Create empty maps — employees will be added later in the by-employee chart
      return {
        displayWeeks,
        roleWeekHours: new Map<string, Map<number, number>>(),
        empWeekHours: new Map<string, Map<number, number>>(),
        empNameMap: new Map<string, string>(),
        empRoleMap: new Map<string, string>(),
        msPerWeek,
        empIdToRole,
      };
    }

    // Determine date range
    const allDates: number[] = [];
    planTasks.forEach((t: any) => {
      allDates.push(new Date(t.startDate || t.start_date).getTime());
      allDates.push(new Date(t.endDate || t.end_date || t.finishDate || t.finish_date).getTime());
    });
    const minDate = Math.min(...allDates);
    const maxDate = Math.max(...allDates);

    // Build weeks array with YEAR in labels
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeks: { start: number; label: string }[] = [];
    let cursor = minDate;
    while (cursor <= maxDate + msPerWeek) {
      const d = new Date(cursor);
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const yr = d.getFullYear();
      weeks.push({ start: cursor, label: `${mon}/${day}/${yr}` });
      cursor += msPerWeek;
    }
    // Cap to ~30 weeks max for readability
    const displayWeeks = weeks.length > 30
      ? weeks.filter((_, i) => i % Math.ceil(weeks.length / 30) === 0).slice(0, 30)
      : weeks;

    // Accumulate hours per role per week AND per employee per week
    const roleWeekHours = new Map<string, Map<number, number>>();
    const empWeekHours = new Map<string, Map<number, number>>();
    const empNameMap = new Map<string, string>(); // empKey → display name
    const empRoleMap = new Map<string, string>(); // empKey → role

    planTasks.forEach((t: any) => {
      const sMs = new Date(t.startDate || t.start_date).getTime();
      const eMs = new Date(t.endDate || t.end_date || t.finishDate || t.finish_date).getTime();
      const hrs = Number(t.baselineHours || t.baseline_hours) || 0;
      const durationWeeks = Math.max(1, Math.round((eMs - sMs) / msPerWeek));
      const hrsPerWeek = hrs / durationWeeks;

      // Determine employee(s) — split comma-separated resource lists
      const eid = t.employeeId || t.employee_id || '';
      const rawAssigned = (t.assignedTo || t.resource || t.assignedResource || '').trim();

      // Split into individual resource names (handle comma, semicolon, " and " separators)
      const resourceNames: string[] = rawAssigned
        ? rawAssigned.split(/[,;]|\band\b/i).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : [];

      // If we have an employeeId, use that as primary
      if (eid && empIdToRole.get(eid)) {
        const individuals = [{ eid, name: empIdToName.get(eid) || rawAssigned || 'Unknown', role: empIdToRole.get(eid)! }];

        // If there are additional comma-separated names, add those too
        if (resourceNames.length > 1) {
          resourceNames.forEach(rn => {
            const rnLower = rn.toLowerCase();
            if (rnLower === (empIdToName.get(eid) || '').toLowerCase()) return; // skip the primary
            const rnRole = empNameToRole.get(rnLower) || 'Unassigned';
            individuals.push({ eid: rn, name: rn, role: rnRole });
          });
        }

        const hrsPerPerson = hrsPerWeek / individuals.length;

        individuals.forEach(ind => {
          let role = ind.role;
          if (!role || role === 'N/A') role = 'Unassigned';

          // By role — individual role per person
          if (!roleWeekHours.has(role)) roleWeekHours.set(role, new Map());
          const roleMap = roleWeekHours.get(role)!;

          // By employee
          const empKey = ind.eid || ind.name;
          if (!empWeekHours.has(empKey)) empWeekHours.set(empKey, new Map());
          empNameMap.set(empKey, ind.name);
          empRoleMap.set(empKey, role);
          const empMap = empWeekHours.get(empKey)!;

          displayWeeks.forEach((w, wi) => {
            const wEnd = wi < displayWeeks.length - 1 ? displayWeeks[wi + 1].start : w.start + msPerWeek;
            if (sMs < wEnd && eMs >= w.start) {
              roleMap.set(wi, (roleMap.get(wi) || 0) + hrsPerPerson);
              empMap.set(wi, (empMap.get(wi) || 0) + hrsPerPerson);
            }
          });
        });
      } else if (resourceNames.length > 0) {
        // No employeeId — split by resource names
        const hrsPerPerson = hrsPerWeek / resourceNames.length;

        resourceNames.forEach(rn => {
          const rnLower = rn.toLowerCase();
          let role = empNameToRole.get(rnLower) || 'Unassigned';
          if (!role || role === 'N/A') role = 'Unassigned';

          // By role — individual role per person
          if (!roleWeekHours.has(role)) roleWeekHours.set(role, new Map());
          const roleMap = roleWeekHours.get(role)!;

          // By employee
          const empKey = rn;
          if (!empWeekHours.has(empKey)) empWeekHours.set(empKey, new Map());
          empNameMap.set(empKey, rn);
          empRoleMap.set(empKey, role);
          const empMap = empWeekHours.get(empKey)!;

          displayWeeks.forEach((w, wi) => {
            const wEnd = wi < displayWeeks.length - 1 ? displayWeeks[wi + 1].start : w.start + msPerWeek;
            if (sMs < wEnd && eMs >= w.start) {
              roleMap.set(wi, (roleMap.get(wi) || 0) + hrsPerPerson);
              empMap.set(wi, (empMap.get(wi) || 0) + hrsPerPerson);
            }
          });
        });
      } else {
        // No resource info at all — assign to 'Unassigned'
        const role = 'Unassigned';
        if (!roleWeekHours.has(role)) roleWeekHours.set(role, new Map());
        const roleMap = roleWeekHours.get(role)!;

        const empKey = 'unassigned';
        if (!empWeekHours.has(empKey)) empWeekHours.set(empKey, new Map());
        empNameMap.set(empKey, 'Unassigned');
        empRoleMap.set(empKey, role);
        const empMap = empWeekHours.get(empKey)!;

        displayWeeks.forEach((w, wi) => {
          const wEnd = wi < displayWeeks.length - 1 ? displayWeeks[wi + 1].start : w.start + msPerWeek;
          if (sMs < wEnd && eMs >= w.start) {
            roleMap.set(wi, (roleMap.get(wi) || 0) + hrsPerWeek);
            empMap.set(wi, (empMap.get(wi) || 0) + hrsPerWeek);
          }
        });
      }
    });

    return { displayWeeks, roleWeekHours, empWeekHours, empNameMap, empRoleMap, msPerWeek, empIdToRole };
  }, [data.tasks, data.employees]);

  // ── Heatmap by ROLE ──
  const heatmapByRoleOption: EChartsOption | null = useMemo(() => {
    if (!heatmapSharedData) return null;
    const { displayWeeks, roleWeekHours } = heatmapSharedData;

    // Each individual role gets its own row
    const sortedRoles = [...roleWeekHours.entries()]
      .map(([role, wm]) => ({ role, total: [...wm.values()].reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total)
      .map(r => r.role);

    const heatData: [number, number, number][] = [];
    let maxVal = 0;
    sortedRoles.forEach((role, ri) => {
      const weekMap = roleWeekHours.get(role)!;
      displayWeeks.forEach((_, wi) => {
        const val = Math.round(weekMap.get(wi) || 0);
        heatData.push([wi, ri, val]);
        if (val > maxVal) maxVal = val;
      });
    });

    const dynamicHeight = Math.max(520, sortedRoles.length * 36 + 140);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top', confine: true,
        backgroundColor: 'rgba(22,27,34,0.97)', borderColor: '#3f3f46',
        textStyle: { color: '#fff', fontSize: 11 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;white-space:normal;',
        formatter: (params: any) => {
          const [wi, ri, val] = params.data;
          const role = sortedRoles[ri];
          const week = displayWeeks[wi]?.label;
          const utilPct = HOURS_PER_WEEK > 0 ? Math.round((val / HOURS_PER_WEEK) * 100) : 0;
          const uc = getUtilColor(utilPct);
          const statusLabel = utilPct > 100 ? 'Overloaded' : utilPct > 85 ? 'Busy' : utilPct > 50 ? 'Optimal' : 'Available';
          return `<div style="padding:8px 10px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${role}</div>
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Week of ${week}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:11px">
              <span style="color:#9ca3af">Planned</span><span style="font-weight:600">${fmt(val)} hrs</span>
              <span style="color:#9ca3af">Capacity</span><span>${HOURS_PER_WEEK} hrs/week</span>
              <span style="color:#9ca3af">Utilization</span><span style="font-weight:700;color:${uc}">${utilPct}% — ${statusLabel}</span>
            </div>
          </div>`;
        },
      },
      grid: { top: 60, left: 200, right: 60, bottom: 80 },
      xAxis: {
        type: 'category',
        data: displayWeeks.map(w => w.label),
        axisLabel: { color: '#a1a1aa', fontSize: 9, rotate: 55, interval: 0 },
        axisLine: { lineStyle: { color: '#3f3f46' } },
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.01)', 'rgba(255,255,255,0.03)'] } },
      },
      yAxis: {
        type: 'category',
        data: sortedRoles,
        axisLabel: {
          color: '#d4d4d8', fontSize: 11, interval: 0,
          formatter: (v: string) => v.length > 28 ? v.substring(0, 26) + '...' : v,
        },
        axisLine: { lineStyle: { color: '#3f3f46' } },
      },
      visualMap: {
        min: 0, max: Math.max(maxVal, HOURS_PER_WEEK),
        calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
        itemWidth: 14, itemHeight: 120,
        textStyle: { color: '#a1a1aa', fontSize: 9 },
        inRange: { color: ['#161b22', '#1a3a3a', '#10B981', '#F59E0B', '#EF4444'] },
      },
      series: [{ type: 'heatmap', data: heatData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(64,224,208,0.5)' } } }],
      _dynamicHeight: dynamicHeight,
    } as any;
  }, [heatmapSharedData]);

  // Collect all unique roles for the filter dropdown
  const allHeatmapRoles = useMemo(() => {
    if (!heatmapSharedData) return [];
    const roles = new Set<string>();
    heatmapSharedData.empRoleMap.forEach(r => { if (r) roles.add(r); });
    heatmapSharedData.empIdToRole.forEach(r => { if (r) roles.add(r); });
    data.employees.forEach((e: any) => {
      const role = e.jobTitle || e.role;
      if (role) roles.add(role);
    });
    return [...roles].sort();
  }, [heatmapSharedData, data.employees]);

  // ── Heatmap by EMPLOYEE ──
  const heatmapByEmployeeOption: EChartsOption | null = useMemo(() => {
    if (!heatmapSharedData) return null;
    const { displayWeeks, empWeekHours, empNameMap, empRoleMap, empIdToRole } = heatmapSharedData;

    // Include ALL employees, even those without tasks
    const allEmpEntries: { key: string; name: string; role: string; total: number }[] = [];
    const addedKeys = new Set<string>();

    // First add employees that appear in task data
    empWeekHours.forEach((wm, key) => {
      const name = empNameMap.get(key) || key;
      const role = empRoleMap.get(key) || empIdToRole.get(key) || '';
      const total = [...wm.values()].reduce((s, v) => s + v, 0);
      allEmpEntries.push({ key, name, role, total });
      addedKeys.add(key);
      addedKeys.add(name.toLowerCase());
    });

    // Then add employees from the master list that weren't already included
    data.employees.forEach((e: any) => {
      const eid = e.id || e.employeeId;
      const name = e.name || 'Unknown';
      if (addedKeys.has(eid) || addedKeys.has(name.toLowerCase())) return;
      const role = e.jobTitle || e.role || 'Unknown';
      allEmpEntries.push({ key: eid, name, role, total: 0 });
      addedKeys.add(eid);
    });

    // Apply role filter
    const filteredEntries = heatmapRoleFilter === 'all'
      ? allEmpEntries
      : allEmpEntries.filter(e => e.role === heatmapRoleFilter);

    // Sort: employees with hours first (desc), then alphabetical
    filteredEntries.sort((a, b) => {
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    const empLabels = filteredEntries.map(e => e.name);

    const heatData: [number, number, number][] = [];
    let maxVal = 0;
    filteredEntries.forEach((emp, ei) => {
      const weekMap = empWeekHours.get(emp.key);
      displayWeeks.forEach((_, wi) => {
        const val = Math.round(weekMap?.get(wi) || 0);
        heatData.push([wi, ei, val]);
        if (val > maxVal) maxVal = val;
      });
    });

    const dynamicHeight = Math.max(520, filteredEntries.length * 32 + 140);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top', confine: true,
        backgroundColor: 'rgba(22,27,34,0.97)', borderColor: '#3f3f46',
        textStyle: { color: '#fff', fontSize: 11 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;white-space:normal;',
        formatter: (params: any) => {
          const [wi, ei, val] = params.data;
          const emp = filteredEntries[ei];
          const week = displayWeeks[wi]?.label;
          const utilPct = HOURS_PER_WEEK > 0 ? Math.round((val / HOURS_PER_WEEK) * 100) : 0;
          const uc = getUtilColor(utilPct);
          const statusLabel = utilPct > 100 ? 'Overloaded' : utilPct > 85 ? 'Busy' : utilPct > 50 ? 'Optimal' : val === 0 ? 'No tasks' : 'Available';
          return `<div style="padding:8px 10px">
            <div style="font-weight:700;font-size:13px;margin-bottom:2px">${emp.name}</div>
            ${emp.role ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${emp.role}</div>` : ''}
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Week of ${week}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:11px">
              <span style="color:#9ca3af">Planned</span><span style="font-weight:600">${fmt(val)} hrs</span>
              <span style="color:#9ca3af">Capacity</span><span>${HOURS_PER_WEEK} hrs/week</span>
              <span style="color:#9ca3af">Status</span><span style="font-weight:700;color:${uc}">${utilPct}% — ${statusLabel}</span>
            </div>
          </div>`;
        },
      },
      grid: { top: 60, left: 200, right: 60, bottom: 80 },
      xAxis: {
        type: 'category',
        data: displayWeeks.map(w => w.label),
        axisLabel: { color: '#a1a1aa', fontSize: 9, rotate: 55, interval: 0 },
        axisLine: { lineStyle: { color: '#3f3f46' } },
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.01)', 'rgba(255,255,255,0.03)'] } },
      },
      yAxis: {
        type: 'category',
        data: empLabels,
        axisLabel: {
          color: '#d4d4d8', fontSize: 11, interval: 0,
          formatter: (v: string) => v.length > 28 ? v.substring(0, 26) + '...' : v,
        },
        axisLine: { lineStyle: { color: '#3f3f46' } },
      },
      visualMap: {
        min: 0, max: Math.max(maxVal, HOURS_PER_WEEK),
        calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
        itemWidth: 14, itemHeight: 120,
        textStyle: { color: '#a1a1aa', fontSize: 9 },
        inRange: { color: ['#161b22', '#1a3a3a', '#10B981', '#F59E0B', '#EF4444'] },
      },
      series: [{ type: 'heatmap', data: heatData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(64,224,208,0.5)' } } }],
      _dynamicHeight: dynamicHeight,
    } as any;
  }, [heatmapSharedData, data.employees, heatmapRoleFilter]);

  // ── Loading state ───────────────────────────────────────────────
  if (isLoading) return <PageLoader />;

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
                      <button onClick={async () => {
                        setAssignmentMessage(`Suggesting move: ${selectedEmployee.name} → ${team.name}...`);
                        try {
                          await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              employeeId: selectedEmployee.id,
                              role: selectedEmployee.role,
                              type: 'resource_change',
                              title: 'Team Move Suggested',
                              message: `${selectedEmployee.name} (${selectedEmployee.role}) has been suggested to move to project "${team.name}" — ${team.roleMatch} role-matched tasks, ${team.criticalCount} critical tasks, ${fmt(team.unassignedHours)} hrs of unassigned work.`,
                              relatedProjectId: team.id,
                            }),
                          });
                          setAssignmentMessage(`Move suggested: ${selectedEmployee.name} → ${team.name}`);
                        } catch {
                          setAssignmentMessage(`Suggested move: ${selectedEmployee.name} → ${team.name} (notification failed)`);
                        }
                        setTimeout(() => setAssignmentMessage(null), 3000);
                      }} style={{ padding: '0.35rem 0.75rem', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', color: '#8B5CF6', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
            {([
              { key: 'organization' as const, label: 'Organization' },
              { key: 'analytics' as const, label: 'Analytics' },
              { key: 'heatmap' as const, label: 'Resource Heatmap' },
            ]).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '0.45rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: activeTab === tab.key ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeTab === tab.key ? '#000' : 'var(--text-primary)',
                fontWeight: 600, fontSize: '0.8rem',
              }}>{tab.label}</button>
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
        {activeTab === 'heatmap' && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {heatmapView === 'role'
              ? `${heatmapSharedData ? [...heatmapSharedData.roleWeekHours.keys()].length : 0} roles`
              : `${Math.max(heatmapSharedData ? [...heatmapSharedData.empWeekHours.keys()].length : 0, data.employees.length)} employees`
            } across {heatmapSharedData ? heatmapSharedData.displayWeeks.length : 0} weeks
          </div>
        )}
      </div>

      {/* ═══ TABS CONTENT ══════════════════════════════════════════ */}
      {activeTab === 'organization' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'auto', minHeight: 0 }}>
          {/* ── Search bar ── */}
          <input
            type="text" value={orgSearch} onChange={e => setOrgSearch(e.target.value)}
            placeholder="Search employees, projects, or portfolios..."
            style={{ padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', width: '100%', maxWidth: 360, transition: 'border-color 0.2s', flexShrink: 0 }}
          />

          {/* ── Tree chart ── */}
          <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'auto', minHeight: '70vh' }}>
            {treeData.length > 0 ? (
              <div style={{ minWidth: `${dynamicTreeWidth}px`, minHeight: `${dynamicTreeHeight}px` }}>
                <ChartWrapper option={treeOption} height={`${dynamicTreeHeight}px`} />
              </div>
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
        </div>
      ) : activeTab === 'analytics' ? (
        /* ═══ ANALYTICS TAB ═════════════════════════════════════════════════ */
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

          {/* Employee Utilization — Horizontal bar, ALL employees */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>Employee Utilization</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sortedEmployeesByUtil.length} employees - Click a bar to view details</div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '500px' }}>
              <ChartWrapper option={capacityChartOption} height={`${Math.max(420, sortedEmployeesByUtil.length * 28)}px`} onClick={(params: any) => {
                const idx = params?.dataIndex;
                if (idx != null && sortedEmployeesByUtil[idx]) {
                  setSelectedEmployee(sortedEmployeesByUtil[idx]);
                  setShowEmployeeModal(true);
                }
              }} />
            </div>
          </div>

          {/* Utilization Distribution + Utilization by Role */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Utilization Distribution</div>
              <ChartWrapper option={utilizationPieOption} height="280px" />
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Utilization by Role</div>
              {(() => {
                const roleMap = new Map<string, { total: number; count: number }>();
                employeeMetrics.forEach(e => {
                  const role = e.role || 'Unassigned';
                  const existing = roleMap.get(role) || { total: 0, count: 0 };
                  roleMap.set(role, { total: existing.total + e.utilization, count: existing.count + 1 });
                });
                const roleData = [...roleMap.entries()]
                  .map(([role, { total, count }]) => ({ role, avgUtil: Math.round(total / count), count }))
                  .sort((a, b) => b.avgUtil - a.avgUtil);
                if (roleData.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No role data available</div>;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                    {roleData.map(r => (
                      <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '120px', fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={r.role}>{r.role}</div>
                        <div style={{ flex: 1, height: '20px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${Math.min(r.avgUtil, 150) / 1.5}%`, background: getUtilColor(r.avgUtil), borderRadius: '4px', transition: 'width 0.4s ease' }} />
                        </div>
                        <div style={{ width: '50px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: getUtilColor(r.avgUtil) }}>{r.avgUtil}%</div>
                        <div style={{ width: '30px', textAlign: 'right', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{r.count}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800, color: getUtilColor((levelingResult as any).overallUtilization) }}>{(levelingResult as any).overallUtilization}%</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overall Utilization</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800 }}>{(levelingResult as any).totalMoves}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Suggested Moves</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800 }}>{(levelingResult as any).tasksMoved || 0}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tasks to Shift</div></div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px' }}><div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recommendation</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{(levelingResult as any).summary}</div></div>
              </div>
            ) : <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Click "Run Analysis" to get resource leveling recommendations</div>}
          </div>

          {/* Employee Table with Search */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)', flex: 1, minHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Employee Details</div>
              <input
                type="text" value={analyticsSearch} onChange={e => setAnalyticsSearch(e.target.value)}
                placeholder="Search by name or role..."
                style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.78rem', width: '240px' }}
              />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Name', 'Role', 'Utilization', 'Tasks', 'Allocated', 'Available', 'QC Rate', 'Projects'].map(h => (
                    <th key={h} style={{ padding: '0.6rem', textAlign: h === 'Name' || h === 'Role' ? 'left' : 'center', borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {employeeMetrics
                    .filter(emp => {
                      if (!analyticsSearch) return true;
                      const q = analyticsSearch.toLowerCase();
                      return emp.name.toLowerCase().includes(q) || (emp.role || '').toLowerCase().includes(q);
                    })
                    .map((emp: any, idx: number) => (
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
      ) : activeTab === 'heatmap' ? (
        /* ═══ RESOURCE HEATMAP TAB ═══════════════════════════════════ */
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Header with view toggle */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>Resource Heatmap</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Weekly planned hours derived from project plan task schedules — {heatmapView === 'employee' ? 'grouped by individual employee' : 'grouped by individual role'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Role filter (employee view only) */}
                {heatmapView === 'employee' && allHeatmapRoles.length > 0 && (
                  <select
                    value={heatmapRoleFilter}
                    onChange={e => setHeatmapRoleFilter(e.target.value)}
                    style={{
                      padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.72rem',
                      cursor: 'pointer', maxWidth: 200,
                    }}
                  >
                    <option value="all">All Roles</option>
                    {allHeatmapRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                {/* View toggle — Employee first, then Role */}
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px' }}>
                  {(['employee', 'role'] as const).map(v => (
                    <button key={v} onClick={() => setHeatmapView(v)} style={{
                      padding: '0.35rem 0.85rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      background: heatmapView === v ? 'rgba(64,224,208,0.2)' : 'transparent',
                      color: heatmapView === v ? '#40E0D0' : 'var(--text-muted)',
                      fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize',
                    }}>By {v}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Heatmap chart — full width */}
            {heatmapView === 'employee' ? (
              heatmapByEmployeeOption ? (
                <ChartWrapper option={heatmapByEmployeeOption} height={`${(heatmapByEmployeeOption as any)._dynamicHeight || 600}px`} />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.4 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" />
                  </svg>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No heatmap data available</div>
                  <div style={{ fontSize: '0.85rem' }}>Import project plans with task schedules and baseline hours to generate the resource heatmap.</div>
                </div>
              )
            ) : (
              heatmapByRoleOption ? (
                <ChartWrapper option={heatmapByRoleOption} height={`${(heatmapByRoleOption as any)._dynamicHeight || 600}px`} />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.4 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" />
                  </svg>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No heatmap data available</div>
                  <div style={{ fontSize: '0.85rem' }}>Import project plans with task schedules and baseline hours to generate the resource heatmap.</div>
                </div>
              )
            )}
          </div>
        </div>
      ) : null}
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
