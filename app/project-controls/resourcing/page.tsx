'use client';

/**
 * @fileoverview Unified Resourcing Page - Org Chart Tree Visualization
 * 
 * Full-page interactive organization chart showing:
 * - Tree structure by portfolio with manager hierarchy
 * - Nodes colored by utilization (gradient: blue/green/orange/red)
 * - Click to view employee details and reassign tasks
 * - Capacity analysis panel
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useEffect, Suspense, useCallback } from 'react';
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

// Loading fallback
function ResourcingPageLoading() {
  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid var(--border-color)', borderTopColor: 'var(--pinnacle-teal)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading Resourcing...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Tree node interface
interface OrgTreeNode {
  name: string;
  id: string;
  title?: string;
  managementLevel?: string;
  utilization?: number;
  status?: string;
  allocatedHours?: number;
  availableHours?: number;
  taskCount?: number;
  qcPassRate?: number | null;
  children?: OrgTreeNode[];
  itemStyle?: { color?: string; borderColor?: string };
  label?: { backgroundColor?: string };
  emp?: any;
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
function ResourcingPageContent() {
  const searchParams = useSearchParams();
  const { filteredData, fullData } = useData();
  
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showCapacityPanel, setShowCapacityPanel] = useState(true);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('all');
  const [levelingParams, setLevelingParams] = useState<LevelingParams>(DEFAULT_LEVELING_PARAMS);
  const [levelingResult, setLevelingResult] = useState<LevelingResult | null>(null);
  const [reassignMode, setReassignMode] = useState(false);
  const [taskToReassign, setTaskToReassign] = useState<any>(null);
  
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
  
  const hasData = data.employees.length > 0;

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
        projects: [...new Set(empTasks.map((t: any) => getProjectName(t.projectId || t.project_id)))],
      };
    });
  }, [data.employees, data.tasks, data.qctasks, getProjectName]);

  // Build organization hierarchy
  const orgHierarchy = useMemo(() => {
    if (!employeeMetrics.length) return { roots: [], byManager: new Map() };
    
    const employeeByName = new Map<string, any>();
    employeeMetrics.forEach(emp => {
      employeeByName.set(emp.name.toLowerCase(), emp);
    });
    
    // Build children map (manager -> direct reports)
    const byManager = new Map<string, any[]>();
    
    employeeMetrics.forEach(emp => {
      const managerName = (emp.manager || '').trim().toLowerCase();
      if (managerName) {
        if (!byManager.has(managerName)) {
          byManager.set(managerName, []);
        }
        byManager.get(managerName)!.push(emp);
      }
    });
    
    // Find root employees (managers not in employee list or top management)
    const roots = employeeMetrics.filter(emp => {
      const empManager = (emp.manager || '').trim().toLowerCase();
      const level = (emp.managementLevel || '').toLowerCase();
      return (
        !empManager || 
        !employeeByName.has(empManager) ||
        level.includes('senior manager') ||
        level.includes('director') ||
        level.includes('executive') ||
        level.includes('vp')
      );
    });
    
    return { roots, byManager, employeeByName };
  }, [employeeMetrics]);

  // Build tree recursively with utilization coloring
  const buildTree = useCallback((emp: any, depth: number = 0): OrgTreeNode => {
    const children = orgHierarchy.byManager.get(emp.name?.toLowerCase()) || [];
    const color = getUtilizationColor(emp.utilization || 0);
    
    return {
      name: emp.name || 'Unknown',
      id: emp.id,
      title: emp.role,
      managementLevel: emp.managementLevel,
      utilization: emp.utilization,
      status: emp.status,
      allocatedHours: emp.allocatedHours,
      availableHours: emp.availableHours,
      taskCount: emp.taskCount,
      qcPassRate: emp.qcPassRate,
      emp,
      itemStyle: { color, borderColor: color },
      label: { backgroundColor: `${color}20` },
      children: depth < 6 ? children.map(c => buildTree(c, depth + 1)) : undefined,
    };
  }, [orgHierarchy.byManager]);

  // Filter by portfolio and build tree data
  const treeData = useMemo(() => {
    let roots = orgHierarchy.roots;
    
    if (selectedPortfolio !== 'all' && data.portfolios.length > 0) {
      const portfolio = data.portfolios.find((p: any) => 
        (p.portfolioId || p.id) === selectedPortfolio || p.name === selectedPortfolio
      );
      if (portfolio) {
        const portfolioManager = (portfolio.manager || '').toLowerCase();
        roots = roots.filter(emp => 
          emp.name?.toLowerCase() === portfolioManager ||
          emp.name?.toLowerCase().includes(portfolioManager)
        );
      }
    }
    
    if (roots.length === 0) return [];
    return roots.map(root => buildTree(root));
  }, [orgHierarchy.roots, selectedPortfolio, data.portfolios, buildTree]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const totalCapacity = employeeMetrics.length * HOURS_PER_YEAR;
    const totalAllocated = employeeMetrics.reduce((s, e) => s + e.allocatedHours, 0);
    const avgUtilization = employeeMetrics.length > 0 
      ? Math.round(employeeMetrics.reduce((s, e) => s + e.utilization, 0) / employeeMetrics.length) 
      : 0;
    const overloaded = employeeMetrics.filter(e => e.status === 'overloaded').length;
    const available = employeeMetrics.filter(e => e.status === 'available').length;
    const unassignedTasks = data.tasks.filter((t: any) => !t.assignedTo && !t.employeeId).length;
    
    return {
      totalEmployees: employeeMetrics.length,
      totalCapacity,
      totalAllocated,
      avgUtilization,
      overloaded,
      available,
      unassignedTasks,
      totalFTE: totalAllocated / HOURS_PER_YEAR,
      managers: new Set(employeeMetrics.map(e => e.manager).filter(Boolean)).size,
    };
  }, [employeeMetrics, data.tasks]);

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
          if (!d.emp) return `<strong>${d.name}</strong>`;
          const emp = d.emp;
          return `
            <div style="min-width:180px;font-family:inherit;">
              <div style="font-weight:600;margin-bottom:4px;">${emp.name}</div>
              <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">${emp.role || ''}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
                <div>Utilization:</div><div style="color:${getUtilizationColor(emp.utilization)};font-weight:600;">${emp.utilization}%</div>
                <div>Allocated:</div><div>${formatNumber(emp.allocatedHours)} hrs</div>
                <div>Available:</div><div>${formatNumber(emp.availableHours)} hrs</div>
                <div>Tasks:</div><div>${emp.taskCount}</div>
                ${emp.qcPassRate !== null ? `<div>QC Pass:</div><div>${emp.qcPassRate}%</div>` : ''}
              </div>
              <div style="margin-top:8px;font-size:10px;color:#6B7280;">Click to view details</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: 'tree',
          data: treeData,
          top: '8%',
          left: '10%',
          bottom: '8%',
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
              if (d.emp) {
                const shortName = d.name.split(' ').map((n: string, i: number) => i === 0 ? n : n[0] + '.').join(' ');
                return `${shortName}\n${d.utilization || 0}%`;
              }
              return d.name;
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
      setSelectedTask(null);
    }
  }, []);

  // Unassigned tasks
  const unassignedTasks = useMemo(() => {
    return data.tasks.filter((t: any) => !t.assignedTo && !t.employeeId && !t.employee_id);
  }, [data.tasks]);

  // Handle task reassignment
  const handleReassign = useCallback((task: any, newEmployee: any) => {
    console.log('Reassigning task', task.name, 'to', newEmployee.name);
    setTaskToReassign(null);
    setReassignMode(false);
    alert(`Task "${task.name || task.taskName}" would be reassigned to ${newEmployee.name}`);
  }, []);

  // Run resource leveling
  const runLeveling = useCallback(() => {
    const inputs = deriveLevelingInputs({ tasks: data.tasks, employees: data.employees, hours: data.hours });
    const result = runResourceLeveling(inputs, levelingParams);
    setLevelingResult(result);
  }, [data.tasks, data.employees, data.hours, levelingParams]);

  // Capacity chart
  const capacityChartOption: EChartsOption = useMemo(() => {
    const chartData = employeeMetrics.slice(0, 15).map(emp => ({
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
      grid: { left: 60, right: 20, top: 10, bottom: 30 },
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
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 600 }}>No Employee Data Available</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px' }}>
            Import employee data from the Data Management page to view the organization chart.
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

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Resource Management</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Organization chart with utilization - Click employees to view details
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Portfolio Filter */}
          <select
            value={selectedPortfolio}
            onChange={(e) => setSelectedPortfolio(e.target.value)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem',
            }}
          >
            <option value="all">All Portfolios</option>
            {data.portfolios.map((p: any) => (
              <option key={p.portfolioId || p.id} value={p.portfolioId || p.id}>{p.name}</option>
            ))}
          </select>
          
          {/* Analytics Panel Toggle */}
          <button
            onClick={() => setShowCapacityPanel(!showCapacityPanel)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
              background: showCapacityPanel ? 'var(--bg-tertiary)' : 'transparent',
              border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem',
            }}
          >
            {showCapacityPanel ? 'Hide' : 'Show'} Analytics
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1rem', flexShrink: 0 }}>
        <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, rgba(64,224,208,0.15), rgba(64,224,208,0.05))', borderRadius: '10px', border: '1px solid rgba(64,224,208,0.3)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Employees</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{summaryMetrics.totalEmployees}</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Managers</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{summaryMetrics.managers}</div>
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
        <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Available</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3B82F6' }}>{summaryMetrics.available}</div>
        </div>
        <div style={{ padding: '0.75rem', background: summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${summaryMetrics.unassignedTasks > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}` }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Unassigned</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>{summaryMetrics.unassignedTasks}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden' }}>
        {/* Organization Chart - Main Area */}
        <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Legend */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Organization Chart</div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#3B82F6', marginRight: '4px' }}></span>Available (&lt;50%)</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', marginRight: '4px' }}></span>Optimal (50-85%)</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', marginRight: '4px' }}></span>Busy (85-100%)</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', marginRight: '4px' }}></span>Overloaded (&gt;100%)</span>
            </div>
          </div>
          <div style={{ flex: 1, padding: '0.5rem' }}>
            {treeData.length > 0 ? (
              <ChartWrapper option={treeOption} height="100%" onClick={handleTreeClick} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <div style={{ textAlign: 'center' }}>
                  <p>No hierarchy found for the selected portfolio.</p>
                  <p style={{ fontSize: '0.85rem' }}>Employee manager relationships may not be defined.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel - Analytics & Details */}
        {showCapacityPanel && (
          <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'auto' }}>
            
            {/* Selected Employee Details */}
            {selectedEmployee && (
              <div style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1), rgba(205,220,57,0.05))', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(64,224,208,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedEmployee.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedEmployee.role}</div>
                    {selectedEmployee.manager && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Reports to: {selectedEmployee.manager}</div>}
                  </div>
                  <button onClick={() => setSelectedEmployee(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                
                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: getUtilizationColor(selectedEmployee.utilization) }}>{selectedEmployee.utilization}%</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Utilization</div>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedEmployee.taskCount}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Tasks</div>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatNumber(selectedEmployee.allocatedHours)}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Allocated Hrs</div>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10B981' }}>{formatNumber(selectedEmployee.availableHours)}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Available Hrs</div>
                  </div>
                  {selectedEmployee.qcPassRate !== null && (
                    <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: selectedEmployee.qcPassRate >= 80 ? '#10B981' : '#F59E0B' }}>{selectedEmployee.qcPassRate}%</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>QC Pass Rate ({selectedEmployee.totalQcTasks} reviews)</div>
                    </div>
                  )}
                </div>

                {/* Tasks List */}
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>Assigned Tasks ({selectedEmployee.tasks.length})</div>
                <div style={{ maxHeight: '180px', overflow: 'auto' }}>
                  {selectedEmployee.tasks.slice(0, 10).map((task: any, idx: number) => (
                    <div 
                      key={idx} 
                      onClick={() => { setSelectedTask(task); setTaskToReassign(task); }}
                      style={{ 
                        padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '0.25rem', 
                        fontSize: '0.75rem', cursor: 'pointer', border: selectedTask?.id === task.id ? '1px solid var(--pinnacle-teal)' : '1px solid transparent',
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{task.name || task.taskName}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                        <span>{task.baselineHours || 0} hrs</span>
                        <span>{task.percentComplete || 0}% complete</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reassign Button */}
                {selectedTask && (
                  <button
                    onClick={() => setReassignMode(true)}
                    style={{
                      width: '100%', marginTop: '0.75rem', padding: '0.6rem', borderRadius: '8px',
                      background: 'var(--pinnacle-teal)', color: '#000', border: 'none', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.8rem',
                    }}
                  >
                    Reassign Selected Task
                  </button>
                )}
              </div>
            )}

            {/* Reassign Modal */}
            {reassignMode && taskToReassign && (
              <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Reassign Task</div>
                  <button onClick={() => { setReassignMode(false); setTaskToReassign(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.8rem' }}>
                  <strong>{taskToReassign.name || taskToReassign.taskName}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{taskToReassign.baselineHours || 0} hrs</div>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>Select New Assignee</div>
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {employeeMetrics.filter(e => e.id !== selectedEmployee?.id).slice(0, 15).map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => handleReassign(taskToReassign, emp)}
                      style={{
                        padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '0.25rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{emp.name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{emp.role}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: getUtilizationColor(emp.utilization) }}>{emp.utilization}%</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatNumber(emp.availableHours)} hrs avail</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Capacity Chart */}
            {!selectedEmployee && (
              <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>Team Utilization</div>
                <ChartWrapper option={capacityChartOption} height="200px" />
              </div>
            )}

            {/* Unassigned Tasks */}
            {unassignedTasks.length > 0 && !selectedEmployee && (
              <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(245,158,11,0.3)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#F59E0B' }}>
                  Unassigned Tasks ({unassignedTasks.length})
                </div>
                <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                  {unassignedTasks.slice(0, 8).map((task: any, idx: number) => (
                    <div key={idx} style={{ padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: '4px', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                      <div style={{ fontWeight: 500 }}>{task.name || task.taskName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{task.baselineHours || 0} hrs</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resource Leveling */}
            {!selectedEmployee && (
              <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Resource Leveling</div>
                  <button
                    onClick={runLeveling}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
                      background: 'var(--pinnacle-teal)', color: '#000', border: 'none', fontSize: '0.75rem', fontWeight: 600,
                    }}
                  >
                    Run Analysis
                  </button>
                </div>
                {levelingResult && (
                  <div style={{ fontSize: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#10B981' }}>{levelingResult.overallUtilization}%</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Overall Util</div>
                      </div>
                      <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{levelingResult.totalMoves}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Suggested Moves</div>
                      </div>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Recommendation</div>
                      <div style={{ fontSize: '0.75rem' }}>{levelingResult.summary}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper with Suspense
export default function ResourcingPage() {
  return (
    <Suspense fallback={<ResourcingPageLoading />}>
      <ResourcingPageContent />
    </Suspense>
  );
}
