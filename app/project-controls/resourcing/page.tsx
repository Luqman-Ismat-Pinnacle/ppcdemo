'use client';

/**
 * @fileoverview Resourcing Page - Comprehensive Resource Management
 * 
 * Features:
 * - Portfolio-based org chart view with all portfolios visible by default
 * - Project-based view showing employees per project
 * - Collapsible unassigned tasks section sorted by criticality
 * - Drag & drop task assignment to employee nodes
 * - Drag & drop employee reassignment between projects
 * - Analytics tab with utilization charts
 * - Real-time data updates
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useEffect, Suspense, useCallback, useRef } from 'react';
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

// FTE Constants
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
const WEEKS_PER_YEAR = 52;
const HOURS_PER_YEAR = HOURS_PER_WEEK * WEEKS_PER_YEAR;

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
function ResourcingPageContent() {
  const searchParams = useSearchParams();
  const { filteredData, fullData, setData, isLoading: dataLoading } = useData();
  
  // UI State
  const [activeTab, setActiveTab] = useState<'organization' | 'analytics'>('organization');
  const [viewMode, setViewMode] = useState<'portfolio' | 'project'>('portfolio');
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('all');
  const [showUnassignedTasks, setShowUnassignedTasks] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [draggedTask, setDraggedTask] = useState<any>(null);
  const [draggedEmployee, setDraggedEmployee] = useState<any>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [levelingResult, setLevelingResult] = useState<LevelingResult | null>(null);
  const chartRef = useRef<any>(null);
  
  // Data from context
  const data = useMemo(() => {
    const filtered = filteredData || {};
    const full = fullData || {};
    return {
      tasks: (filtered.tasks?.length ? filtered.tasks : full.tasks) ?? [],
      employees: (filtered.employees?.length ? filtered.employees : full.employees) ?? [],
      projects: (filtered.projects?.length ? filtered.projects : full.projects) ?? [],
      qctasks: (filtered.qctasks?.length ? filtered.qctasks : full.qctasks) ?? [],
      portfolios: (filtered.portfolios?.length ? filtered.portfolios : full.portfolios) ?? [],
      hours: (filtered.hours?.length ? filtered.hours : full.hours) ?? [],
    };
  }, [filteredData, fullData]);
  
  const hasData = data.employees.length > 0 || data.projects.length > 0;

  // Helper functions
  const formatNumber = (num: number, decimals = 0) => 
    num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const getProjectName = useCallback((projectId: string | null | undefined) => {
    if (!projectId) return 'Unknown';
    const project = data.projects.find((p: any) => p.id === projectId || p.projectId === projectId);
    return project?.name || project?.projectName || projectId;
  }, [data.projects]);

  // Get utilization color
  const getUtilizationColor = (utilization: number) => {
    if (utilization > 100) return '#EF4444'; // Red - overloaded
    if (utilization > 85) return '#F59E0B';  // Orange - busy
    if (utilization > 50) return '#10B981';  // Green - optimal
    return '#3B82F6'; // Blue - available
  };

  // Calculate employee metrics
  const employeeMetrics = useMemo(() => {
    return data.employees.map((emp: any) => {
      const empTasks = data.tasks.filter((t: any) => 
        (t.employeeId || t.employee_id) === (emp.id || emp.employeeId) || 
        (t.assignedTo || '').toLowerCase().includes((emp.name || '').toLowerCase())
      );
      const allocatedHours = empTasks.reduce((s: number, t: any) => s + (t.baselineHours || 0), 0);
      const actualHours = empTasks.reduce((s: number, t: any) => s + (t.actualHours || 0), 0);
      const taskCount = empTasks.length;
      const completedTasks = empTasks.filter((t: any) => (t.percentComplete || 0) >= 100).length;
      
      const efficiency = allocatedHours > 0 ? Math.round((actualHours / allocatedHours) * 100) : 100;
      
      // QC pass rate
      const empQcTasks = data.qctasks.filter((qc: any) => 
        (qc.employeeId || qc.employee_id || qc.qcResourceId) === (emp.id || emp.employeeId) ||
        (qc.qcResourceId || '').toLowerCase().includes((emp.name || '').toLowerCase())
      );
      const totalQcTasks = empQcTasks.length;
      const passedQcTasks = empQcTasks.filter((qc: any) => 
        (qc.qcStatus || '').toLowerCase() === 'pass' || (qc.qcScore || 0) >= 80
      ).length;
      const qcPassRate = totalQcTasks > 0 ? Math.round((passedQcTasks / totalQcTasks) * 100) : null;
      
      // Utilization
      const annualCapacity = HOURS_PER_YEAR;
      const workHours = allocatedHours > 0 ? allocatedHours : actualHours;
      const utilization = annualCapacity > 0 ? Math.round((workHours / annualCapacity) * 100) : 0;
      const availableHours = Math.max(0, annualCapacity - workHours);
      
      // Get projects employee is assigned to
      const projectIds = [...new Set(empTasks.map((t: any) => t.projectId || t.project_id).filter(Boolean))];
      const projects = projectIds.map(pid => {
        const proj = data.projects.find((p: any) => p.id === pid || p.projectId === pid);
        return proj ? { id: pid, name: proj.name || proj.projectName } : { id: pid, name: pid };
      });
      
      // Status
      let status: 'available' | 'optimal' | 'busy' | 'overloaded' = 'available';
      if (utilization > 100) status = 'overloaded';
      else if (utilization > 85) status = 'busy';
      else if (utilization > 50) status = 'optimal';
      
      return {
        id: emp.id || emp.employeeId,
        name: emp.name || 'Unknown',
        role: emp.jobTitle || emp.role || 'N/A',
        manager: emp.manager || '',
        managementLevel: emp.managementLevel || '',
        portfolio: emp.portfolio || '',
        allocatedHours,
        actualHours,
        taskCount,
        completedTasks,
        efficiency,
        qcPassRate,
        totalQcTasks,
        utilization,
        availableHours,
        status,
        tasks: empTasks,
        projects,
        projectIds,
      };
    });
  }, [data.employees, data.tasks, data.qctasks, data.projects]);

  // Get projects with their employees
  const projectsWithEmployees = useMemo(() => {
    return data.projects.map((proj: any) => {
      const projectId = proj.id || proj.projectId;
      const projectTasks = data.tasks.filter((t: any) => 
        (t.projectId || t.project_id) === projectId
      );
      const assignedEmployees = employeeMetrics.filter(emp => 
        emp.projectIds.includes(projectId)
      );
      const portfolioId = proj.portfolioId || proj.portfolio_id;
      const portfolio = data.portfolios.find((p: any) => 
        (p.id || p.portfolioId) === portfolioId || p.name === portfolioId
      );
      
      return {
        id: projectId,
        name: proj.name || proj.projectName || projectId,
        portfolioId,
        portfolioName: portfolio?.name || portfolioId || 'Unassigned',
        taskCount: projectTasks.length,
        employees: assignedEmployees,
        employeeCount: assignedEmployees.length,
        totalHours: projectTasks.reduce((s: number, t: any) => s + (t.baselineHours || 0), 0),
      };
    });
  }, [data.projects, data.tasks, employeeMetrics, data.portfolios]);

  // Unassigned tasks sorted by criticality
  const unassignedTasks = useMemo(() => {
    let tasks = data.tasks.filter((t: any) => !t.assignedTo && !t.employeeId && !t.employee_id);
    
    // Filter by selected portfolio if not "all"
    if (selectedPortfolio !== 'all') {
      const portfolioProjects = projectsWithEmployees
        .filter(p => p.portfolioId === selectedPortfolio || p.portfolioName === selectedPortfolio)
        .map(p => p.id);
      tasks = tasks.filter((t: any) => portfolioProjects.includes(t.projectId || t.project_id));
    }
    
    // Sort by criticality/importance
    return tasks.sort((a: any, b: any) => {
      // Priority: Critical > Linchpin > High > Normal
      const getPriority = (task: any) => {
        const isCritical = task.isCritical || task.critical || (task.totalFloat || task.float || 999) <= 0;
        const isLinchpin = task.isLinchpin || task.linchpin || (task.successors?.length || 0) > 3;
        const isHighPriority = (task.priority || '').toLowerCase() === 'high';
        
        if (isCritical) return 4;
        if (isLinchpin) return 3;
        if (isHighPriority) return 2;
        return 1;
      };
      return getPriority(b) - getPriority(a);
    });
  }, [data.tasks, selectedPortfolio, projectsWithEmployees]);

  // Get task criticality label
  const getTaskCriticality = (task: any) => {
    const isCritical = task.isCritical || task.critical || (task.totalFloat || task.float || 999) <= 0;
    const isLinchpin = task.isLinchpin || task.linchpin || (task.successors?.length || 0) > 3;
    const isHighPriority = (task.priority || '').toLowerCase() === 'high';
    
    if (isCritical) return { label: 'Critical', color: '#EF4444' };
    if (isLinchpin) return { label: 'Linchpin', color: '#8B5CF6' };
    if (isHighPriority) return { label: 'High', color: '#F59E0B' };
    return { label: 'Normal', color: '#6B7280' };
  };

  // Helper: create employee node for ECharts tree
  const makeEmpNode = (emp: any) => ({
    name: emp.name,
    id: emp.id,
    emp,
    utilization: emp.utilization,
    itemStyle: { color: getUtilizationColor(emp.utilization), borderColor: getUtilizationColor(emp.utilization) },
    label: { backgroundColor: `${getUtilizationColor(emp.utilization)}20` },
  });

  // Build tree for ECharts - Portfolio View (uses manager hierarchy from employees)
  const buildPortfolioTree = useMemo((): any[] => {
    if (viewMode !== 'portfolio') return [];
    if (employeeMetrics.length === 0) return [];
    
    const employeeByName = new Map<string, any>();
    employeeMetrics.forEach(emp => employeeByName.set(emp.name.toLowerCase(), emp));
    
    // Build manager -> reports map
    const byManager = new Map<string, any[]>();
    employeeMetrics.forEach(emp => {
      const mgrName = (emp.manager || '').trim().toLowerCase();
      if (mgrName) {
        if (!byManager.has(mgrName)) byManager.set(mgrName, []);
        byManager.get(mgrName)!.push(emp);
      }
    });
    
    // Identify root employees (managers not in employee list, or top-level management)
    const rootEmps = employeeMetrics.filter(emp => {
      const mgrName = (emp.manager || '').trim().toLowerCase();
      const level = (emp.managementLevel || '').toLowerCase();
      return (
        !mgrName || 
        !employeeByName.has(mgrName) ||
        level.includes('senior manager') ||
        level.includes('director') ||
        level.includes('executive') ||
        level.includes('vp')
      );
    });
    
    // Recursive tree builder
    const buildBranch = (emp: any, depth: number): any => {
      const reports = byManager.get(emp.name.toLowerCase()) || [];
      const node = makeEmpNode(emp);
      if (depth < 6 && reports.length > 0) {
        (node as any).children = reports.map(r => buildBranch(r, depth + 1));
      }
      return node;
    };
    
    // If we have portfolios, group roots under portfolio nodes
    if (data.portfolios.length > 0) {
      const portfolioNodes: any[] = [];
      const assignedRoots = new Set<string>();
      
      let portfolios = data.portfolios;
      if (selectedPortfolio !== 'all') {
        portfolios = portfolios.filter((p: any) => 
          (p.id || p.portfolioId) === selectedPortfolio || p.name === selectedPortfolio
        );
      }
      
      portfolios.forEach((portfolio: any) => {
        const portfolioId = portfolio.id || portfolio.portfolioId;
        const portfolioName = portfolio.name || portfolioId;
        const portfolioManagerName = (portfolio.manager || '').trim().toLowerCase();
        
        // Find portfolio projects
        const portfolioProjects = projectsWithEmployees.filter(p => 
          p.portfolioId === portfolioId
        );
        
        // Find employees that belong to this portfolio:
        // 1. The portfolio manager themselves
        // 2. Their reports
        // 3. Anyone assigned to this portfolio's projects
        const portfolioEmpIds = new Set<string>();
        
        // Add employees assigned to portfolio projects
        portfolioProjects.forEach(proj => {
          proj.employees.forEach((emp: any) => portfolioEmpIds.add(emp.id));
        });
        
        // Find roots relevant to this portfolio
        const portfolioRoots = rootEmps.filter(emp => {
          const empNameLower = emp.name.toLowerCase();
          // Direct match on portfolio manager
          if (portfolioManagerName && (empNameLower === portfolioManagerName || empNameLower.includes(portfolioManagerName) || portfolioManagerName.includes(empNameLower))) {
            return true;
          }
          // Employee assigned to one of the portfolio's projects
          if (portfolioEmpIds.has(emp.id)) return true;
          return false;
        });
        
        portfolioRoots.forEach(r => assignedRoots.add(r.id));
        
        const children = portfolioRoots.length > 0 
          ? portfolioRoots.map(r => buildBranch(r, 0))
          : portfolioProjects.map(proj => ({
              name: proj.name,
              id: proj.id,
              isProject: true,
              employeeCount: proj.employeeCount,
              totalHours: proj.totalHours,
              children: proj.employees.map((emp: any) => makeEmpNode(emp)),
            }));
        
        if (children.length > 0) {
          portfolioNodes.push({
            name: portfolioName,
            id: portfolioId,
            isPortfolio: true,
            projectCount: portfolioProjects.length,
            children,
          });
        }
      });
      
      // Add unassigned roots if showing all
      if (selectedPortfolio === 'all') {
        const unassignedRoots = rootEmps.filter(r => !assignedRoots.has(r.id));
        if (unassignedRoots.length > 0) {
          portfolioNodes.push({
            name: 'Unassigned',
            id: 'unassigned-portfolio',
            isPortfolio: true,
            children: unassignedRoots.map(r => buildBranch(r, 0)),
          });
        }
      }
      
      return portfolioNodes;
    }
    
    // No portfolios: just show a flat manager hierarchy
    if (selectedPortfolio !== 'all') return [];
    
    // Group by manager for a cleaner tree
    if (rootEmps.length > 0) {
      return rootEmps.map(r => buildBranch(r, 0));
    }
    
    // Last fallback: flat list of all employees
    return employeeMetrics.map(emp => makeEmpNode(emp));
  }, [employeeMetrics, viewMode, data.portfolios, selectedPortfolio, projectsWithEmployees]);

  // Build tree for ECharts - Project View
  const buildProjectTree = useMemo((): any[] => {
    if (viewMode !== 'project') return [];
    if (projectsWithEmployees.length === 0 && employeeMetrics.length === 0) return [];
    
    let projects = projectsWithEmployees;
    
    if (selectedPortfolio !== 'all') {
      projects = projects.filter(p => p.portfolioId === selectedPortfolio || p.portfolioName === selectedPortfolio);
    }
    
    // Group by portfolio
    const byPortfolio = new Map<string, any[]>();
    projects.forEach(proj => {
      const portfolioName = proj.portfolioName || 'Unassigned';
      if (!byPortfolio.has(portfolioName)) {
        byPortfolio.set(portfolioName, []);
      }
      byPortfolio.get(portfolioName)!.push(proj);
    });
    
    const result = Array.from(byPortfolio.entries()).map(([portfolioName, projs]) => ({
      name: portfolioName,
      id: `portfolio-${portfolioName}`,
      isPortfolio: true,
      children: projs.map(proj => ({
        name: proj.name,
        id: proj.id,
        isProject: true,
        employeeCount: proj.employeeCount,
        totalHours: proj.totalHours,
        children: proj.employees.length > 0 
          ? proj.employees.map((emp: any) => makeEmpNode(emp))
          : [{ name: 'No employees assigned', id: `empty-${proj.id}`, isPlaceholder: true }],
      })),
    }));
    
    // If no portfolio grouping produced results, show projects directly
    if (result.length === 0 && projects.length > 0) {
      return projects.map(proj => ({
        name: proj.name,
        id: proj.id,
        isProject: true,
        employeeCount: proj.employeeCount,
        totalHours: proj.totalHours,
        children: proj.employees.length > 0 
          ? proj.employees.map((emp: any) => makeEmpNode(emp))
          : [{ name: 'No employees assigned', id: `empty-${proj.id}`, isPlaceholder: true }],
      }));
    }
    
    return result;
  }, [projectsWithEmployees, viewMode, selectedPortfolio, employeeMetrics]);

  // Combined tree data based on view mode
  const treeData = useMemo(() => {
    const data = viewMode === 'portfolio' ? buildPortfolioTree : buildProjectTree;
    return data;
  }, [viewMode, buildPortfolioTree, buildProjectTree]);

  // ECharts tree option
  const treeOption: EChartsOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const d = params.data;
          
          if (d.isPortfolio) {
            return `<div style="min-width:150px;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${d.name}</div>
              <div style="font-size:11px;color:#9ca3af;">Portfolio</div>
              ${d.projectCount ? `<div style="margin-top:4px;font-size:11px;">${d.projectCount} projects</div>` : ''}
            </div>`;
          }
          
          if (d.isProject) {
            return `<div style="min-width:150px;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${d.name}</div>
              <div style="font-size:11px;color:#9ca3af;">Project</div>
              <div style="margin-top:4px;font-size:11px;">${d.employeeCount || 0} employees assigned</div>
              ${d.totalHours ? `<div style="font-size:11px;">${formatNumber(d.totalHours)} total hours</div>` : ''}
            </div>`;
          }
          
          if (d.isManager) {
            return `<div style="min-width:150px;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${d.name}</div>
              <div style="font-size:11px;color:#9ca3af;">Manager</div>
              <div style="margin-top:4px;font-size:11px;">${d.children?.length || 0} direct reports</div>
            </div>`;
          }
          
          if (d.emp) {
            const emp = d.emp;
            return `<div style="min-width:200px;font-family:inherit;">
              <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${emp.name}</div>
              <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">${emp.role || ''}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
                <div>Utilization:</div><div style="color:${getUtilizationColor(emp.utilization)};font-weight:600;">${emp.utilization}%</div>
                <div>Tasks:</div><div>${emp.taskCount}</div>
                <div>Allocated:</div><div>${formatNumber(emp.allocatedHours)} hrs</div>
                <div>Available:</div><div style="color:#10B981;">${formatNumber(emp.availableHours)} hrs</div>
                ${emp.qcPassRate !== null ? `<div>QC Rate:</div><div>${emp.qcPassRate}%</div>` : ''}
                <div>Projects:</div><div>${emp.projects?.length || 0}</div>
              </div>
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;font-size:10px;color:#6B7280;">
                Click to view details | Drag tasks here to assign
              </div>
            </div>`;
          }
          
          return `<strong>${d.name}</strong>`;
        },
      },
      series: [
        {
          type: 'tree',
          data: treeData,
          top: '5%',
          left: '10%',
          bottom: '5%',
          right: '10%',
          symbolSize: 14,
          orient: 'TB',
          layout: 'orthogonal',
          initialTreeDepth: 4,
          expandAndCollapse: true,
          animationDurationUpdate: 500,
          roam: true,
          label: {
            position: 'bottom',
            verticalAlign: 'middle',
            align: 'center',
            fontSize: 10,
            color: 'var(--text-primary)',
            borderRadius: 4,
            padding: [4, 6],
            formatter: (params: any) => {
              const d = params.data;
              if (d.isPortfolio) return `{bold|${d.name}}`;
              if (d.isProject) return `{project|${d.name.substring(0, 18)}${d.name.length > 18 ? '...' : ''}}`;
              if (d.isPlaceholder) return `{muted|${d.name}}`;
              if (d.emp) {
                const shortName = d.name.split(' ').map((n: string, i: number) => i === 0 ? n : n[0] + '.').join(' ');
                return `${shortName}\n${d.utilization || 0}%`;
              }
              return d.name;
            },
            rich: {
              bold: { fontWeight: 'bold' as any, fontSize: 12 },
              project: { fontSize: 10, color: '#60A5FA' },
              muted: { fontSize: 9, color: '#6B7280', fontStyle: 'italic' as any },
            },
          },
          leaves: {
            label: {
              position: 'bottom',
              verticalAlign: 'middle',
              align: 'center',
            },
          },
          lineStyle: {
            color: 'var(--border-color)',
            width: 1.5,
            curveness: 0.5,
          },
          emphasis: {
            focus: 'descendant',
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 10,
              shadowColor: 'rgba(64, 224, 208, 0.5)',
            },
          },
        },
      ],
    };
  }, [treeData]);

  // Handle tree node click
  const handleTreeClick = useCallback((params: any) => {
    if (params.data?.emp) {
      setSelectedEmployee(params.data.emp);
      setShowEmployeeModal(true);
    }
  }, []);

  // Drag handlers for tasks
  const handleTaskDragStart = useCallback((e: React.DragEvent, task: any) => {
    setDraggedTask(task);
    setDraggedEmployee(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'task', id: task.id || task.taskId }));
  }, []);

  const handleEmployeeDragStart = useCallback((e: React.DragEvent, employee: any) => {
    setDraggedEmployee(employee);
    setDraggedTask(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'employee', id: employee.id }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
    setDraggedEmployee(null);
    setDropTargetId(null);
  }, []);

  // Handle task assignment
  const handleAssignTask = useCallback((task: any, employee: any) => {
    console.log('Assigning task', task.name || task.taskName, 'to', employee.name);
    
    // Show success message
    setAssignmentMessage(`Task "${task.name || task.taskName}" assigned to ${employee.name}`);
    setTimeout(() => setAssignmentMessage(null), 3000);
    
    // Clear drag state
    setDraggedTask(null);
    setDropTargetId(null);
    
    // TODO: Update data context and persist to database
    // This would update the task's assignedTo field and refresh the data
  }, []);

  // Handle employee project reassignment
  const handleReassignToProject = useCallback((employee: any, projectId: string) => {
    const project = projectsWithEmployees.find(p => p.id === projectId);
    if (project) {
      console.log('Reassigning', employee.name, 'to project', project.name);
      setAssignmentMessage(`${employee.name} assigned to project "${project.name}"`);
      setTimeout(() => setAssignmentMessage(null), 3000);
    }
    setDraggedEmployee(null);
    setDropTargetId(null);
  }, [projectsWithEmployees]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const totalCapacity = employeeMetrics.length * HOURS_PER_YEAR;
    const totalAllocated = employeeMetrics.reduce((s, e) => s + e.allocatedHours, 0);
    const avgUtilization = employeeMetrics.length > 0 
      ? Math.round(employeeMetrics.reduce((s, e) => s + e.utilization, 0) / employeeMetrics.length) 
      : 0;
    const overloaded = employeeMetrics.filter(e => e.status === 'overloaded').length;
    const available = employeeMetrics.filter(e => e.status === 'available').length;
    
    return {
      totalEmployees: employeeMetrics.length,
      totalProjects: data.projects.length,
      totalPortfolios: data.portfolios.length,
      totalCapacity,
      totalAllocated,
      avgUtilization,
      overloaded,
      available,
      unassignedTasks: unassignedTasks.length,
      criticalTasks: unassignedTasks.filter((t: any) => getTaskCriticality(t).label === 'Critical').length,
    };
  }, [employeeMetrics, data.projects, data.portfolios, unassignedTasks]);

  // Capacity chart for analytics
  const capacityChartOption: EChartsOption = useMemo(() => {
    const chartData = employeeMetrics
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 20)
      .map(emp => ({
        name: emp.name.split(' ')[0],
        utilization: emp.utilization,
        status: emp.status,
      }));
    
    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,27,34,0.95)', 
        borderColor: 'var(--border-color)', 
        textStyle: { color: '#fff', fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
      xAxis: { 
        type: 'category', 
        data: chartData.map(d => d.name),
        axisLabel: { color: 'var(--text-muted)', fontSize: 9, rotate: 45 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: { 
        type: 'value', 
        max: 150,
        axisLabel: { color: 'var(--text-muted)', fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [{
        type: 'bar',
        data: chartData.map(d => ({
          value: d.utilization,
          itemStyle: { color: getUtilizationColor(d.utilization) },
        })),
        barWidth: '60%',
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 100, lineStyle: { color: '#EF4444', type: 'dashed', width: 2 } }] },
      }],
    };
  }, [employeeMetrics]);

  // Utilization distribution pie chart
  const utilizationPieOption: EChartsOption = useMemo(() => {
    const distribution = {
      available: employeeMetrics.filter(e => e.status === 'available').length,
      optimal: employeeMetrics.filter(e => e.status === 'optimal').length,
      busy: employeeMetrics.filter(e => e.status === 'busy').length,
      overloaded: employeeMetrics.filter(e => e.status === 'overloaded').length,
    };
    
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(22,27,34,0.95)', borderColor: 'var(--border-color)', textStyle: { color: '#fff' } },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: 'var(--bg-card)', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        labelLine: { show: false },
        data: [
          { value: distribution.available, name: 'Available', itemStyle: { color: '#3B82F6' } },
          { value: distribution.optimal, name: 'Optimal', itemStyle: { color: '#10B981' } },
          { value: distribution.busy, name: 'Busy', itemStyle: { color: '#F59E0B' } },
          { value: distribution.overloaded, name: 'Overloaded', itemStyle: { color: '#EF4444' } },
        ],
      }],
    };
  }, [employeeMetrics]);

  // Run resource leveling
  const runLeveling = useCallback(() => {
    const inputs = deriveLevelingInputs({ tasks: data.tasks, employees: data.employees, hours: data.hours });
    const result = runResourceLeveling(inputs, DEFAULT_LEVELING_PARAMS);
    setLevelingResult(result);
  }, [data.tasks, data.employees, data.hours]);

  // Empty state
  if (!hasData) {
    return (
      <div className="page-panel" style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Resourcing</h1>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600 }}>No Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px' }}>
            Import employee and project data from the Data Management page to view resource allocation.
          </p>
          <a href="/project-controls/data-management" style={{
            padding: '0.75rem 1.5rem', background: 'var(--pinnacle-teal)', color: '#000',
            borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
          }}>
            Go to Data Management
          </a>
        </div>
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>
          Loading resourcing data...
        </div>
      </div>
    );
  }

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Assignment Success Message */}
      {assignmentMessage && (
        <div style={{
          position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)',
          padding: '1rem 2rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(16,185,129,0.8))',
          borderRadius: '12px', color: '#fff', fontWeight: 600, zIndex: 2000,
          boxShadow: '0 10px 40px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {assignmentMessage}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Resource Management</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Assign resources, manage capacity, and optimize utilization
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Tab Buttons */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={() => setActiveTab('organization')}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: activeTab === 'organization' ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeTab === 'organization' ? '#000' : 'var(--text-primary)',
                fontWeight: 600, fontSize: '0.8rem',
              }}
            >
              Organization
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: activeTab === 'analytics' ? 'var(--pinnacle-teal)' : 'transparent',
                color: activeTab === 'analytics' ? '#000' : 'var(--text-primary)',
                fontWeight: 600, fontSize: '0.8rem',
              }}
            >
              Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1rem', flexShrink: 0 }}>
        <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Portfolios</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{summaryMetrics.totalPortfolios}</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Projects</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{summaryMetrics.totalProjects}</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, rgba(64,224,208,0.15), rgba(64,224,208,0.05))', borderRadius: '10px', border: '1px solid rgba(64,224,208,0.3)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Employees</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{summaryMetrics.totalEmployees}</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Avg Utilization</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: getUtilizationColor(summaryMetrics.avgUtilization) }}>
            {summaryMetrics.avgUtilization}%
          </div>
        </div>
        <div style={{ padding: '0.75rem', background: summaryMetrics.overloaded > 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${summaryMetrics.overloaded > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}` }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Overloaded</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444' }}>{summaryMetrics.overloaded}</div>
        </div>
        <div style={{ padding: '0.75rem', background: summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}` }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Unassigned Tasks</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>{summaryMetrics.unassignedTasks}</div>
        </div>
      </div>

      {/* Employee Detail Modal */}
      {showEmployeeModal && selectedEmployee && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '2rem',
          }}
          onClick={() => setShowEmployeeModal(false)}
        >
          <div 
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '1.5rem',
              maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'auto',
              border: '1px solid var(--border-color)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{selectedEmployee.name}</h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{selectedEmployee.role}</p>
              </div>
              <button 
                onClick={() => setShowEmployeeModal(false)} 
                style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', background: `linear-gradient(135deg, ${getUtilizationColor(selectedEmployee.utilization)}20, transparent)`, borderRadius: '12px', border: `1px solid ${getUtilizationColor(selectedEmployee.utilization)}40`, textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: getUtilizationColor(selectedEmployee.utilization) }}>{selectedEmployee.utilization}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Utilization</div>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{selectedEmployee.taskCount}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tasks</div>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatNumber(selectedEmployee.allocatedHours)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allocated Hrs</div>
              </div>
              <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>{formatNumber(selectedEmployee.availableHours)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Available Hrs</div>
              </div>
            </div>

            {/* Projects */}
            {selectedEmployee.projects?.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Assigned Projects</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedEmployee.projects.map((proj: any, idx: number) => (
                    <span key={idx} style={{ padding: '0.35rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>{proj.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Task List */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Assigned Tasks ({selectedEmployee.tasks?.length || 0})</div>
              <div style={{ maxHeight: '200px', overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.5rem' }}>
                {selectedEmployee.tasks?.length > 0 ? (
                  selectedEmployee.tasks.map((task: any, idx: number) => (
                    <div key={idx} style={{ padding: '0.5rem', background: 'var(--bg-card)', borderRadius: '6px', marginBottom: '0.35rem', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{task.name || task.taskName}</div>
                        <span style={{ 
                          fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px',
                          background: (task.percentComplete || 0) >= 100 ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
                          color: (task.percentComplete || 0) >= 100 ? '#10B981' : '#3B82F6',
                        }}>
                          {task.percentComplete || 0}%
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {task.baselineHours || 0} hrs | {getProjectName(task.projectId || task.project_id)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No tasks assigned</div>
                )}
              </div>
            </div>

            <button 
              onClick={() => setShowEmployeeModal(false)}
              style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'organization' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1rem' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {/* View Mode Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
                <button
                  onClick={() => setViewMode('portfolio')}
                  style={{
                    padding: '0.4rem 0.75rem', borderRadius: '5px', border: 'none', cursor: 'pointer',
                    background: viewMode === 'portfolio' ? 'var(--bg-card)' : 'transparent',
                    color: viewMode === 'portfolio' ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
                    fontWeight: 500, fontSize: '0.75rem',
                  }}
                >
                  By Portfolio
                </button>
                <button
                  onClick={() => setViewMode('project')}
                  style={{
                    padding: '0.4rem 0.75rem', borderRadius: '5px', border: 'none', cursor: 'pointer',
                    background: viewMode === 'project' ? 'var(--bg-card)' : 'transparent',
                    color: viewMode === 'project' ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
                    fontWeight: 500, fontSize: '0.75rem',
                  }}
                >
                  By Project
                </button>
              </div>
              
              {/* Portfolio Filter */}
              <select
                value={selectedPortfolio}
                onChange={(e) => setSelectedPortfolio(e.target.value)}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem',
                }}
              >
                <option value="all">All Portfolios</option>
                {data.portfolios.map((p: any) => (
                  <option key={p.portfolioId || p.id} value={p.portfolioId || p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#3B82F6', marginRight: '4px' }}></span>Available</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', marginRight: '4px' }}></span>Optimal</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', marginRight: '4px' }}></span>Busy</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', marginRight: '4px' }}></span>Overloaded</span>
            </div>
          </div>

          {/* Collapsible Unassigned Tasks Section */}
          <div style={{ 
            background: unassignedTasks.length > 0 ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)', 
            borderRadius: '12px', 
            border: unassignedTasks.length > 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border-color)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {/* Header - Always Visible */}
            <button
              onClick={() => setShowUnassignedTasks(!showUnassignedTasks)}
              style={{
                width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg 
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ transform: showUnassignedTasks ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Unassigned Tasks</span>
                <span style={{ 
                  padding: '0.2rem 0.6rem', background: unassignedTasks.length > 0 ? '#F59E0B' : 'var(--bg-secondary)', 
                  borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, 
                  color: unassignedTasks.length > 0 ? '#000' : 'var(--text-muted)',
                }}>
                  {unassignedTasks.length}
                </span>
                {summaryMetrics.criticalTasks > 0 && (
                  <span style={{ 
                    padding: '0.2rem 0.6rem', background: '#EF4444', 
                    borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                  }}>
                    {summaryMetrics.criticalTasks} Critical
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {showUnassignedTasks ? 'Click to collapse' : 'Click to expand'} | Drag tasks to employee nodes to assign
              </span>
            </button>
            
            {/* Expandable Content */}
            {showUnassignedTasks && unassignedTasks.length > 0 && (
              <div style={{ padding: '0 1rem 1rem', maxHeight: '200px', overflow: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                  {unassignedTasks.slice(0, 20).map((task: any, idx: number) => {
                    const criticality = getTaskCriticality(task);
                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => handleTaskDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        style={{
                          padding: '0.6rem 0.75rem',
                          background: draggedTask?.id === task.id ? 'var(--pinnacle-teal)' : 'var(--bg-card)',
                          borderRadius: '8px',
                          border: `1px solid ${criticality.color}40`,
                          borderLeft: `3px solid ${criticality.color}`,
                          cursor: 'grab',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                          <div style={{ fontWeight: 500, fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }}>
                            {task.name || task.taskName}
                          </div>
                          <span style={{
                            padding: '0.1rem 0.4rem', background: `${criticality.color}20`, 
                            borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, color: criticality.color,
                          }}>
                            {criticality.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          <span>{task.baselineHours || 0} hrs</span>
                          <span>{getProjectName(task.projectId || task.project_id)}</span>
                          {task.resource && <span style={{ color: '#3B82F6' }}>{task.resource}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {unassignedTasks.length > 20 && (
                  <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    +{unassignedTasks.length - 20} more tasks
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tree Visualization */}
          <div 
            style={{ 
              flex: 1, 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              border: draggedTask ? '2px dashed var(--pinnacle-teal)' : '1px solid var(--border-color)', 
              overflow: 'hidden',
              position: 'relative',
            }}
            onDragOver={(e) => { if (draggedTask) { e.preventDefault(); } }}
          >
            {/* Drag Overlay */}
            {draggedTask && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(22,27,34,0.95)', zIndex: 100, padding: '1.5rem', overflow: 'auto',
              }}>
                {/* Task being assigned */}
                <div style={{ 
                  padding: '1rem', 
                  background: 'linear-gradient(135deg, rgba(64,224,208,0.2), rgba(64,224,208,0.05))', 
                  borderRadius: '12px', marginBottom: '1rem',
                  border: '1px solid rgba(64,224,208,0.4)',
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assigning Task</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{draggedTask.name || draggedTask.taskName}</div>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{draggedTask.baselineHours || 0} hrs</span>
                    <span>{getProjectName(draggedTask.projectId || draggedTask.project_id)}</span>
                    {draggedTask.resource && <span style={{ color: '#3B82F6' }}>Requires: {draggedTask.resource}</span>}
                  </div>
                </div>
                
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Select Employee to Assign</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {employeeMetrics.map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => handleAssignTask(draggedTask, emp)}
                      onMouseEnter={() => setDropTargetId(emp.id)}
                      onMouseLeave={() => setDropTargetId(null)}
                      style={{
                        padding: '1rem',
                        background: dropTargetId === emp.id ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)',
                        borderRadius: '12px',
                        border: dropTargetId === emp.id ? '2px solid var(--pinnacle-teal)' : '2px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{emp.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.role}</div>
                        </div>
                        <div style={{ 
                          width: '36px', height: '36px', borderRadius: '50%', 
                          background: `${getUtilizationColor(emp.utilization)}20`,
                          border: `2px solid ${getUtilizationColor(emp.utilization)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.7rem', fontWeight: 700, color: getUtilizationColor(emp.utilization),
                        }}>
                          {emp.utilization}%
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span>{emp.taskCount} tasks</span>
                        <span style={{ color: '#10B981' }}>{formatNumber(emp.availableHours)} hrs avail</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => setDraggedTask(null)}
                  style={{
                    marginTop: '1.5rem', padding: '0.75rem 2rem',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            
            {/* Tree Chart */}
            {treeData.length > 0 ? (
              <ChartWrapper option={treeOption} height="100%" onClick={handleTreeClick} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.4 }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No organization data to display</p>
                  <p style={{ fontSize: '0.85rem' }}>
                    {viewMode === 'portfolio' 
                      ? 'No employees or portfolios found. Import data from Data Management.'
                      : 'No projects found. Import project data from Data Management.'
                    }
                  </p>
                  {selectedPortfolio !== 'all' && (
                    <button
                      onClick={() => setSelectedPortfolio('all')}
                      style={{
                        marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '6px',
                        background: 'var(--pinnacle-teal)', color: '#000', border: 'none',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                      }}
                    >
                      Show All Portfolios
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Analytics Tab */
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Utilization Charts Row */}
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
              <button
                onClick={runLeveling}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer',
                  background: 'var(--pinnacle-teal)', color: '#000', border: 'none', fontWeight: 600, fontSize: '0.8rem',
                }}
              >
                Run Analysis
              </button>
            </div>
            {levelingResult ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: getUtilizationColor(levelingResult.overallUtilization) }}>
                    {levelingResult.overallUtilization}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overall Utilization</div>
                </div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800 }}>{levelingResult.totalMoves}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Suggested Moves</div>
                </div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800 }}>{levelingResult.tasksMoved || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tasks to Shift</div>
                </div>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recommendation</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{levelingResult.summary}</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Click "Run Analysis" to get resource leveling recommendations
              </div>
            )}
          </div>
          
          {/* Employee Details Table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)', flex: 1, minHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Employee Details</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Name</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Role</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Utilization</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Tasks</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Allocated</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Available</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>QC Rate</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeMetrics.map((emp, idx) => (
                    <tr 
                      key={emp.id} 
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', cursor: 'pointer' }}
                      onClick={() => { setSelectedEmployee(emp); setShowEmployeeModal(true); }}
                    >
                      <td style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color)' }}>{emp.name}</td>
                      <td style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{emp.role}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ 
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600,
                          background: `${getUtilizationColor(emp.utilization)}20`, color: getUtilizationColor(emp.utilization),
                        }}>
                          {emp.utilization}%
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{emp.taskCount}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{formatNumber(emp.allocatedHours)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#10B981' }}>{formatNumber(emp.availableHours)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>
                        {emp.qcPassRate !== null ? `${emp.qcPassRate}%` : '-'}
                      </td>
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

// Wrapper with Suspense
export default function ResourcingPage() {
  return (
    <Suspense fallback={null}>
      <ResourcingPageContent />
    </Suspense>
  );
}
