'use client';

/**
 * @fileoverview Redesigned Resourcing Page for PPC V3 Project Controls.
 * 
 * User-friendly resource management with:
 * - Overview dashboard with key metrics
 * - Resource Requirements Calculator (FTE based on baseline hours)
 * - Interactive resource utilization heatmap (by Role or by Task)
 * - Resource Gantt chart with assignment timelines
 * - Resource leveling analysis
 * 
 * Handles comma-separated roles in task assignments and defaults to viewing by role.
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';
import ResourceLevelingChart from '@/components/charts/ResourceLevelingChart';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

// FTE Constants
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK; // 40 hours
const WEEKS_PER_YEAR = 52;
const HOURS_PER_YEAR = HOURS_PER_WEEK * WEEKS_PER_YEAR; // 2080 hours

interface ResourceRequirement {
  resourceType: string;
  taskCount: number;
  totalBaselineHours: number;
  totalActualHours: number;
  remainingHours: number;
  fteRequired: number;
  fteMonthly: number;
  tasks: Array<{
    taskId: string;
    taskName: string;
    baselineHours: number;
    actualHours: number;
    percentComplete: number;
  }>;
}

interface RoleData {
  role: string;
  tasks: Array<{
    taskId: string;
    taskName: string;
    baselineHours: number;
    actualHours: number;
    startDate: string | null;
    endDate: string | null;
    percentComplete: number;
  }>;
  totalBaselineHours: number;
  totalActualHours: number;
}

type ActiveSection = 'overview' | 'requirements' | 'heatmap' | 'gantt' | 'leveling';
type ViewMode = 'role' | 'task';

// Helper: Parse roles from a string (handles comma-separated)
function parseRoles(resourceStr: string | null | undefined): string[] {
  if (!resourceStr || typeof resourceStr !== 'string') return ['Unassigned'];
  
  // Split by comma and clean up
  const roles = resourceStr
    .split(',')
    .map(r => r.trim())
    .filter(r => r.length > 0);
  
  return roles.length > 0 ? roles : ['Unassigned'];
}

// Loading fallback component
function ResourcingPageLoading() {
  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          width: '48px', 
          height: '48px', 
          border: '3px solid var(--border-color)', 
          borderTopColor: 'var(--pinnacle-teal)', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem',
        }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading Resourcing...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Main page wrapper with Suspense
export default function ResourcingPage() {
  return (
    <Suspense fallback={<ResourcingPageLoading />}>
      <ResourcingPageContent />
    </Suspense>
  );
}

// Inner component that uses useSearchParams
function ResourcingPageContent() {
  const searchParams = useSearchParams();
  const { filteredData, data: fullData } = useData();
  
  // Check if we came from Project Plan page with a specific project
  const projectIdParam = searchParams.get('projectId');
  const scrollToSection = searchParams.get('section');
  
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectIdParam);
  const [expandedResourceType, setExpandedResourceType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('role'); // Default to role view
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    if (scrollToSection === 'requirements') {
      setActiveSection('requirements');
    }
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
  }, [scrollToSection, projectIdParam]);

  // Use fullData fallback when filtered data is empty
  const data = useMemo(() => {
    const filtered = filteredData || {};
    const full = fullData || {};
    return {
      ...filtered,
      tasks: (filtered.tasks?.length ? filtered.tasks : full.tasks) ?? [],
      employees: (filtered.employees?.length ? filtered.employees : full.employees) ?? [],
      projects: (filtered.projects?.length ? filtered.projects : full.projects) ?? [],
      resourceLeveling: filtered.resourceLeveling ?? full.resourceLeveling,
    };
  }, [filteredData, fullData]);

  // Get available projects for filter
  const availableProjects = useMemo(() => {
    return (data.projects || []).map((p: any) => ({
      id: p.id || p.projectId,
      name: p.name,
    }));
  }, [data.projects]);

  // Filter tasks by project
  const filteredTasks = useMemo(() => {
    const tasks = data.tasks || [];
    return selectedProjectId 
      ? tasks.filter((t: any) => (t.projectId || t.project_id) === selectedProjectId)
      : tasks;
  }, [data.tasks, selectedProjectId]);

  // Extract and aggregate data by role (handles comma-separated roles)
  const roleData = useMemo((): RoleData[] => {
    const roleMap = new Map<string, RoleData>();

    filteredTasks.forEach((task: any) => {
      const resourceStr = task.assignedResource || task.assigned_resource || task.assignedResourceType || '';
      const roles = parseRoles(resourceStr);
      const baselineHours = task.baselineHours || task.baseline_hours || task.baselineWork || task.baseline_work || 0;
      const actualHours = task.actualHours || task.actual_hours || 0;
      const startDate = task.startDate || task.start_date || task.baselineStartDate || task.baseline_start_date || null;
      const endDate = task.endDate || task.end_date || task.baselineEndDate || task.baseline_end_date || null;
      const percentComplete = task.percentComplete || task.percent_complete || 0;
      
      // Distribute hours equally among roles if multiple
      const hoursPerRole = baselineHours / roles.length;
      const actualPerRole = actualHours / roles.length;
      
      roles.forEach(role => {
        if (!roleMap.has(role)) {
          roleMap.set(role, {
            role,
            tasks: [],
            totalBaselineHours: 0,
            totalActualHours: 0,
          });
        }
        
        const rd = roleMap.get(role)!;
        rd.tasks.push({
          taskId: task.taskId || task.id || task.task_id,
          taskName: task.taskName || task.name || task.task_name || 'Unnamed Task',
          baselineHours: hoursPerRole,
          actualHours: actualPerRole,
          startDate,
          endDate,
          percentComplete,
        });
        rd.totalBaselineHours += hoursPerRole;
        rd.totalActualHours += actualPerRole;
      });
    });

    return Array.from(roleMap.values()).sort((a, b) => b.totalBaselineHours - a.totalBaselineHours);
  }, [filteredTasks]);

  // Calculate Resource Requirements (FTE based on baseline hours)
  const resourceRequirements = useMemo((): ResourceRequirement[] => {
    return roleData.map(rd => ({
      resourceType: rd.role,
      taskCount: rd.tasks.length,
      totalBaselineHours: rd.totalBaselineHours,
      totalActualHours: rd.totalActualHours,
      remainingHours: Math.max(0, rd.totalBaselineHours - rd.totalActualHours),
      fteRequired: rd.totalBaselineHours / HOURS_PER_YEAR,
      fteMonthly: rd.totalBaselineHours / (HOURS_PER_YEAR / 12),
      tasks: rd.tasks.map(t => ({
        taskId: t.taskId,
        taskName: t.taskName,
        baselineHours: t.baselineHours,
        actualHours: t.actualHours,
        percentComplete: t.percentComplete,
      })),
    }));
  }, [roleData]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalBaselineHours = resourceRequirements.reduce((sum, r) => sum + r.totalBaselineHours, 0);
    const totalActualHours = resourceRequirements.reduce((sum, r) => sum + r.totalActualHours, 0);
    const totalRemainingHours = resourceRequirements.reduce((sum, r) => sum + r.remainingHours, 0);
    const totalFTE = totalBaselineHours / HOURS_PER_YEAR;
    const totalTasks = filteredTasks.length;
    const uniqueResourceTypes = resourceRequirements.length;
    const utilizationPercent = totalBaselineHours > 0 ? (totalActualHours / totalBaselineHours) * 100 : 0;

    return {
      totalBaselineHours,
      totalActualHours,
      totalRemainingHours,
      totalFTE,
      totalTasks,
      uniqueResourceTypes,
      utilizationPercent,
    };
  }, [resourceRequirements, filteredTasks.length]);

  // Build heatmap data from tasks by role
  const heatmapData = useMemo(() => {
    if (roleData.length === 0) return { resources: [], weeks: [], data: [] };

    // Get date range from all tasks
    const allDates: Date[] = [];
    roleData.forEach(rd => {
      rd.tasks.forEach(t => {
        if (t.startDate) {
          const d = new Date(t.startDate);
          if (!isNaN(d.getTime())) allDates.push(d);
        }
        if (t.endDate) {
          const d = new Date(t.endDate);
          if (!isNaN(d.getTime())) allDates.push(d);
        }
      });
    });

    if (allDates.length === 0) {
      // Use current quarter as fallback
      const now = new Date();
      const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const end = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
      allDates.push(start, end);
    }

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Generate weeks between min and max
    const weeks: string[] = [];
    const current = new Date(minDate);
    // Start from Monday of the week
    current.setDate(current.getDate() - current.getDay() + 1);
    
    while (current <= maxDate) {
      weeks.push(current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      current.setDate(current.getDate() + 7);
    }

    if (weeks.length === 0) weeks.push('Current');

    // Build utilization data per role per week
    const resources = roleData.map(rd => rd.role);
    const dataMatrix: number[][] = roleData.map(rd => {
      // Simple approximation: distribute hours evenly across task duration
      const weeklyUtilization = weeks.map(() => 0);
      
      rd.tasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);
        const taskDurationWeeks = Math.max(1, Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (7 * 24 * 60 * 60 * 1000)));
        const weeklyHours = task.baselineHours / taskDurationWeeks;
        
        weeks.forEach((weekLabel, weekIdx) => {
          // Parse week date
          const weekDate = new Date(minDate);
          weekDate.setDate(minDate.getDate() - minDate.getDay() + 1 + (weekIdx * 7));
          const weekEnd = new Date(weekDate);
          weekEnd.setDate(weekEnd.getDate() + 6);
          
          // Check if task overlaps with this week
          if (taskStart <= weekEnd && taskEnd >= weekDate) {
            weeklyUtilization[weekIdx] += weeklyHours;
          }
        });
      });
      
      // Convert to utilization percentage (assuming 40 hrs/week = 100%)
      return weeklyUtilization.map(h => Math.round((h / HOURS_PER_WEEK) * 100));
    });

    return { resources, weeks, data: dataMatrix };
  }, [roleData]);

  // Build gantt data
  const ganttData = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      type: 'role' | 'task';
      level: number;
      startDate: string | null;
      endDate: string | null;
      percentComplete: number;
      baselineHours: number;
      actualHours: number;
      utilization: number;
      parentId?: string;
    }> = [];

    roleData.forEach(rd => {
      // Get date range for role
      const roleDates = rd.tasks
        .flatMap(t => [t.startDate, t.endDate])
        .filter((d): d is string => !!d)
        .map(d => new Date(d).getTime())
        .filter(d => !isNaN(d));
      
      const roleStart = roleDates.length > 0 ? new Date(Math.min(...roleDates)).toISOString().split('T')[0] : null;
      const roleEnd = roleDates.length > 0 ? new Date(Math.max(...roleDates)).toISOString().split('T')[0] : null;
      const avgProgress = rd.tasks.length > 0 
        ? Math.round(rd.tasks.reduce((sum, t) => sum + t.percentComplete, 0) / rd.tasks.length)
        : 0;
      const utilization = rd.totalBaselineHours > 0 
        ? Math.round((rd.totalActualHours / rd.totalBaselineHours) * 100)
        : 0;

      // Add role row
      items.push({
        id: `role-${rd.role}`,
        name: rd.role,
        type: 'role',
        level: 0,
        startDate: roleStart,
        endDate: roleEnd,
        percentComplete: avgProgress,
        baselineHours: rd.totalBaselineHours,
        actualHours: rd.totalActualHours,
        utilization,
      });

      // Add task rows if expanded
      if (expandedRoles.has(rd.role)) {
        rd.tasks.forEach(task => {
          const taskUtil = task.baselineHours > 0 
            ? Math.round((task.actualHours / task.baselineHours) * 100)
            : 0;
          
          items.push({
            id: `task-${task.taskId}`,
            name: task.taskName,
            type: 'task',
            level: 1,
            startDate: task.startDate,
            endDate: task.endDate,
            percentComplete: task.percentComplete,
            baselineHours: task.baselineHours,
            actualHours: task.actualHours,
            utilization: taskUtil,
            parentId: `role-${rd.role}`,
          });
        });
      }
    });

    return items;
  }, [roleData, expandedRoles]);

  // Toggle role expansion
  const toggleRole = useCallback((role: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }, []);

  // Build heatmap chart option
  const heatmapOption = useMemo((): EChartsOption => {
    if (heatmapData.resources.length === 0) return { series: [] };

    const heatmapSeriesData: number[][] = [];
    heatmapData.data.forEach((row, yIdx) => {
      row.forEach((val, xIdx) => {
        heatmapSeriesData.push([xIdx, yIdx, val]);
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (!params?.data) return '';
          const [xIdx, yIdx, value] = params.data;
          const resource = heatmapData.resources[yIdx] || '';
          const period = heatmapData.weeks[xIdx] || '';
          
          let status = 'Underutilized';
          let color = '#1A9B8F';
          if (value > 100) { status = 'Overloaded'; color = '#E91E63'; }
          else if (value > 80) { status = 'Optimal'; color = '#CDDC39'; }
          else if (value > 50) { status = 'Building'; color = '#40E0D0'; }

          return `
            <div style="padding:8px 12px;">
              <div style="font-weight:600;color:#40E0D0;margin-bottom:8px;">${resource}</div>
              <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-bottom:8px;">${period}</div>
              <div style="display:flex;justify-content:space-between;">
                <span>Utilization:</span>
                <span style="font-weight:700;">${value}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <span>Status:</span>
                <span style="font-weight:600;color:${color}">${status}</span>
              </div>
            </div>
          `;
        },
        backgroundColor: 'rgba(20,20,20,0.96)',
        borderColor: 'rgba(64,224,208,0.3)',
        textStyle: { color: '#fff' },
      },
      grid: { left: 150, right: 30, top: 20, bottom: 60 },
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, bottom: 10, height: 20, fillerColor: 'rgba(64,224,208,0.2)' },
        { type: 'slider', yAxisIndex: 0, left: 5, width: 16, showDetail: false, fillerColor: 'rgba(64,224,208,0.2)' },
      ],
      xAxis: {
        type: 'category',
        data: heatmapData.weeks,
        axisLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, rotate: 45 },
      },
      yAxis: {
        type: 'category',
        data: heatmapData.resources,
        axisLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, width: 130, overflow: 'truncate' },
      },
      visualMap: {
        show: true,
        type: 'continuous',
        min: 0,
        max: 120,
        orient: 'horizontal',
        right: 20,
        top: -5,
        itemWidth: 10,
        itemHeight: 100,
        text: ['120%', '0%'],
        textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
        inRange: { color: ['#1a1a1a', '#1A9B8F', '#40E0D0', '#CDDC39', '#FF9800', '#E91E63'] },
      },
      series: [{
        type: 'heatmap',
        data: heatmapSeriesData,
        label: { show: true, formatter: (p: any) => p.data[2] > 0 ? `${p.data[2]}%` : '', fontSize: 9, color: '#fff' },
        itemStyle: { borderColor: 'rgba(10,10,10,0.95)', borderWidth: 2, borderRadius: 3 },
      }],
    };
  }, [heatmapData]);

  // Build gantt chart option
  const ganttOption = useMemo((): EChartsOption => {
    if (ganttData.length === 0) return { series: [] };

    const allDates = ganttData
      .flatMap(item => [item.startDate, item.endDate])
      .filter((d): d is string => !!d)
      .map(d => new Date(d).getTime())
      .filter(d => !isNaN(d));

    if (allDates.length === 0) return { series: [] };

    const minTime = Math.min(...allDates);
    const maxTime = Math.max(...allDates);
    const padding = (maxTime - minTime) * 0.05 || 7 * 24 * 60 * 60 * 1000;
    const today = new Date().getTime();

    const getBarColor = (util: number) => {
      if (util > 100) return '#FF9800';
      if (util >= 80) return '#CDDC39';
      if (util >= 50) return '#40E0D0';
      return '#1A9B8F';
    };

    const seriesData = ganttData.map((item, index) => ({
      name: item.name,
      value: [
        index,
        item.startDate ? new Date(item.startDate).getTime() : minTime,
        item.endDate ? new Date(item.endDate).getTime() : maxTime,
        item.percentComplete,
        item.utilization,
        item.type,
        item.id,
        item.baselineHours,
        item.actualHours,
      ],
      itemStyle: { color: getBarColor(item.utilization) },
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (!params?.value) return '';
          const idx = params.value[0];
          const item = ganttData[idx];
          if (!item) return '';
          
          const icon = item.type === 'role' ? '👥' : '📋';
          return `
            <div style="padding:8px 12px;">
              <div style="font-weight:600;color:#40E0D0;margin-bottom:8px;">${icon} ${item.name}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div><span style="color:rgba(255,255,255,0.5);font-size:10px;">Progress</span><br/><b>${item.percentComplete}%</b></div>
                <div><span style="color:rgba(255,255,255,0.5);font-size:10px;">Utilization</span><br/><b style="color:${getBarColor(item.utilization)}">${item.utilization}%</b></div>
                <div><span style="color:rgba(255,255,255,0.5);font-size:10px;">Baseline</span><br/><b>${item.baselineHours.toFixed(0)} hrs</b></div>
                <div><span style="color:rgba(255,255,255,0.5);font-size:10px;">Actual</span><br/><b>${item.actualHours.toFixed(0)} hrs</b></div>
              </div>
              ${item.startDate ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.7);">${item.startDate} → ${item.endDate || '?'}</div>` : ''}
            </div>
          `;
        },
        backgroundColor: 'rgba(20,20,20,0.96)',
        borderColor: 'rgba(64,224,208,0.3)',
        textStyle: { color: '#fff' },
      },
      grid: { left: 200, right: 30, top: 40, bottom: 50 },
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, bottom: 10, height: 20, fillerColor: 'rgba(64,224,208,0.2)' },
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', yAxisIndex: 0, left: 5, width: 16, showDetail: false, fillerColor: 'rgba(64,224,208,0.2)' },
      ],
      xAxis: {
        type: 'time',
        position: 'top',
        min: minTime - padding,
        max: maxTime + padding,
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
        axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: ganttData.map(item => item.id),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.85)',
          fontSize: 11,
          formatter: (id: string) => {
            const item = ganttData.find(i => i.id === id);
            if (!item) return '';
            const prefix = item.level > 0 ? '    ' : '';
            const icon = item.type === 'role' ? '▶ ' : '  ';
            const name = item.name.length > 25 ? item.name.slice(0, 25) + '...' : item.name;
            return `${prefix}${icon}${name}`;
          },
        },
      },
      series: [
        {
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const progress = api.value(3);
            const utilization = api.value(4);
            const itemType = api.value(5);
            
            const h = itemType === 'role' ? 22 : 16;
            const barWidth = Math.max(end[0] - start[0], 4);
            const color = getBarColor(utilization);
            
            const children: any[] = [];
            
            // Background
            children.push({
              type: 'rect',
              shape: { x: start[0], y: start[1] - h/2, width: barWidth, height: h },
              style: { fill: color, opacity: 0.25, stroke: 'rgba(255,255,255,0.15)', lineWidth: 1 },
            });
            
            // Progress fill
            if (progress > 0) {
              children.push({
                type: 'rect',
                shape: { x: start[0], y: start[1] - h/2, width: barWidth * (progress / 100), height: h },
                style: { fill: color, opacity: 1 },
              });
            }
            
            // Text
            if (barWidth > 40) {
              children.push({
                type: 'text',
                style: {
                  text: `${utilization}%`,
                  x: start[0] + 6,
                  y: start[1],
                  fill: '#fff',
                  fontSize: 9,
                  fontWeight: 600,
                  align: 'left',
                  verticalAlign: 'middle',
                },
              });
            }
            
            return { type: 'group', children };
          },
          encode: { x: [1, 2], y: 0 },
          data: seriesData,
          clip: true,
        },
        // Today line
        {
          type: 'line',
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [{
              xAxis: today,
              lineStyle: { color: '#ef4444', width: 2 },
              label: { formatter: 'Today', position: 'start', color: '#ef4444', fontSize: 10 },
            }],
          },
        },
      ],
    };
  }, [ganttData]);

  // Handle gantt chart click
  const handleGanttClick = useCallback((params: any) => {
    if (params?.value) {
      const itemId = params.value[6] as string;
      if (itemId?.startsWith('role-')) {
        const role = itemId.replace('role-', '');
        toggleRole(role);
      }
    }
  }, [toggleRole]);

  // Navigation tabs
  const sections: { id: ActiveSection; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { id: 'requirements', label: 'Resource Requirements', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
    { id: 'heatmap', label: 'Utilization Heatmap', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /><rect x="7" y="14" width="3" height="3" /><rect x="14" y="14" width="3" height="3" /></svg> },
    { id: 'gantt', label: 'Resource Gantt', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><rect x="6" y="6" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" /><rect x="10" y="12" width="10" height="6" rx="1" fill="currentColor" opacity="0.3" /></svg> },
    { id: 'leveling', label: 'Resource Leveling', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg> },
  ];

  const formatNumber = (num: number, decimals = 0) => {
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Resourcing</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Plan, analyze, and optimize resource allocation across your projects
          </p>
        </div>
        
        {/* Project Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter by Project:</label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              minWidth: '200px',
            }}
          >
            <option value="">All Projects</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexShrink: 0, overflowX: 'auto' }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              background: activeSection === section.id ? 'var(--pinnacle-teal)' : 'transparent',
              color: activeSection === section.id ? '#000' : 'var(--text-secondary)',
              fontSize: '0.875rem',
              fontWeight: activeSection === section.id ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        
        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="metric-card accent-teal" style={{ padding: '1.25rem' }}>
                <div className="metric-label">Total FTE Required</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.totalFTE, 1)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Based on {formatNumber(summaryMetrics.totalBaselineHours)} baseline hours
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Resource Types</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{summaryMetrics.uniqueResourceTypes}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Unique roles assigned</div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Total Tasks</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.totalTasks)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>With resource assignments</div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Hours Progress</div>
                <div className="metric-value" style={{ fontSize: '2rem' }}>{formatNumber(summaryMetrics.utilizationPercent, 0)}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {formatNumber(summaryMetrics.totalActualHours)} of {formatNumber(summaryMetrics.totalBaselineHours)} hrs
                </div>
              </div>
              
              <div className="metric-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Remaining Hours</div>
                <div className="metric-value" style={{ fontSize: '2rem', color: '#F59E0B' }}>{formatNumber(summaryMetrics.totalRemainingHours)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {formatNumber(summaryMetrics.totalRemainingHours / HOURS_PER_YEAR, 1)} FTE remaining
                </div>
              </div>
            </div>

            {/* Quick Access Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              <div className="chart-card" style={{ cursor: 'pointer' }} onClick={() => setActiveSection('requirements')}>
                <div className="chart-card-body" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--pinnacle-teal), var(--pinnacle-lime))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#000" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Resource Requirements Calculator</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Calculate FTE needs by role based on baseline hours</p>
                  </div>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginLeft: 'auto' }}><path d="M9 18l6-6-6-6" /></svg>
                </div>
              </div>

              <div className="chart-card" style={{ cursor: 'pointer' }} onClick={() => setActiveSection('heatmap')}>
                <div className="chart-card-body" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'linear-gradient(135deg, #E91E63, #F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /><rect x="7" y="14" width="3" height="3" /><rect x="14" y="14" width="3" height="3" /></svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Utilization Heatmap</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Visualize resource utilization by role over time</p>
                  </div>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginLeft: 'auto' }}><path d="M9 18l6-6-6-6" /></svg>
                </div>
              </div>
            </div>

            {/* Top Resource Types Preview */}
            {resourceRequirements.length > 0 && (
              <div className="chart-card">
                <div className="chart-card-header">
                  <h3 className="chart-card-title">Top Resource Requirements by Role</h3>
                  <button onClick={() => setActiveSection('requirements')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--pinnacle-teal)', fontSize: '0.8rem', cursor: 'pointer' }}>View All →</button>
                </div>
                <div className="chart-card-body" style={{ padding: '1rem' }}>
                  <table className="data-table" style={{ fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th style={{ textAlign: 'right' }}>Tasks</th>
                        <th style={{ textAlign: 'right' }}>Baseline Hours</th>
                        <th style={{ textAlign: 'right' }}>FTE Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceRequirements.slice(0, 5).map((req) => (
                        <tr key={req.resourceType}>
                          <td style={{ fontWeight: 500 }}>{req.resourceType}</td>
                          <td style={{ textAlign: 'right' }}>{req.taskCount}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(req.totalBaselineHours)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontWeight: 600 }}>{formatNumber(req.fteRequired, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resource Requirements Calculator Section */}
        {activeSection === 'requirements' && (
          <div id="requirements-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Explanation Banner */}
            <div className="chart-card" style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(205,220,57,0.05) 100%)' }}>
              <div className="chart-card-body" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'var(--pinnacle-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#000" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Resource Requirements Calculator</h3>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Calculates FTE (Full-Time Equivalent) by role. Tasks with comma-separated roles have hours distributed equally among roles.
                    </p>
                    <div style={{ display: 'flex', gap: '2rem', marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.8rem' }}>
                      <div><strong style={{ color: 'var(--pinnacle-teal)' }}>{HOURS_PER_DAY}</strong> hours/day</div>
                      <div><strong style={{ color: 'var(--pinnacle-teal)' }}>{DAYS_PER_WEEK}</strong> days/week</div>
                      <div><strong style={{ color: 'var(--pinnacle-teal)' }}>{HOURS_PER_WEEK}</strong> hours/week</div>
                      <div><strong style={{ color: 'var(--pinnacle-teal)' }}>{formatNumber(HOURS_PER_YEAR)}</strong> hours/year</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div className="metric-card accent-teal" style={{ padding: '1rem' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total FTE Required</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalFTE, 2)}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total Baseline Hours</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalBaselineHours)}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Resource Types (Roles)</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{summaryMetrics.uniqueResourceTypes}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label" style={{ fontSize: '0.75rem' }}>Total Tasks</div>
                <div className="metric-value" style={{ fontSize: '1.75rem' }}>{formatNumber(summaryMetrics.totalTasks)}</div>
              </div>
            </div>

            {/* Resource Requirements Table */}
            <div className="chart-card">
              <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h3 className="chart-card-title">FTE Requirements by Role</h3>
              </div>
              <div className="chart-card-body" style={{ padding: 0 }}>
                {resourceRequirements.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.5 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    <p>No tasks found with resource assignments.</p>
                    <p style={{ fontSize: '0.85rem' }}>Upload an MPP file with resource assignments to see FTE requirements.</p>
                  </div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '0.875rem', margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}></th>
                          <th style={{ textAlign: 'left' }}>Role</th>
                          <th style={{ textAlign: 'right' }}>Tasks</th>
                          <th style={{ textAlign: 'right' }}>Baseline Hrs</th>
                          <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                          <th style={{ textAlign: 'right' }}>Remaining</th>
                          <th style={{ textAlign: 'right' }}>FTE (Annual)</th>
                          <th style={{ textAlign: 'right' }}>FTE (Monthly)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceRequirements.map((req) => (
                          <React.Fragment key={req.resourceType}>
                            <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedResourceType(expandedResourceType === req.resourceType ? null : req.resourceType)}>
                              <td style={{ textAlign: 'center' }}>
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: expandedResourceType === req.resourceType ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M9 18l6-6-6-6" /></svg>
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: req.resourceType === 'Unassigned' ? '#F59E0B' : 'var(--pinnacle-teal)' }} />
                                  {req.resourceType}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>{req.taskCount}</td>
                              <td style={{ textAlign: 'right' }}>{formatNumber(req.totalBaselineHours)}</td>
                              <td style={{ textAlign: 'right' }}>{formatNumber(req.totalActualHours)}</td>
                              <td style={{ textAlign: 'right', color: req.remainingHours > 0 ? '#F59E0B' : '#10B981' }}>{formatNumber(req.remainingHours)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontWeight: 700, fontSize: '1rem' }}>{formatNumber(req.fteRequired, 2)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--pinnacle-lime)', fontWeight: 600 }}>{formatNumber(req.fteMonthly, 2)}</td>
                            </tr>
                            {expandedResourceType === req.resourceType && (
                              <tr>
                                <td colSpan={8} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                  <div style={{ padding: '1rem 1rem 1rem 3rem', maxHeight: '300px', overflow: 'auto' }}>
                                    <table className="data-table" style={{ fontSize: '0.8rem', margin: 0 }}>
                                      <thead><tr><th style={{ textAlign: 'left' }}>Task Name</th><th style={{ textAlign: 'right' }}>Baseline Hrs</th><th style={{ textAlign: 'right' }}>Actual Hrs</th><th style={{ textAlign: 'right' }}>% Complete</th></tr></thead>
                                      <tbody>
                                        {req.tasks.map((task) => (
                                          <tr key={task.taskId}>
                                            <td>{task.taskName}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(task.baselineHours)}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(task.actualHours)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                <div style={{ width: '60px', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                                                  <div style={{ width: `${Math.min(100, task.percentComplete)}%`, height: '100%', background: task.percentComplete >= 100 ? '#10B981' : 'var(--pinnacle-teal)' }} />
                                                </div>
                                                {formatNumber(task.percentComplete)}%
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                          <td></td>
                          <td>TOTAL</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalTasks)}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalBaselineHours)}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(summaryMetrics.totalActualHours)}</td>
                          <td style={{ textAlign: 'right', color: '#F59E0B' }}>{formatNumber(summaryMetrics.totalRemainingHours)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-teal)', fontSize: '1.1rem' }}>{formatNumber(summaryMetrics.totalFTE, 2)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--pinnacle-lime)' }}>{formatNumber(summaryMetrics.totalBaselineHours / (HOURS_PER_YEAR / 12), 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Heatmap Section */}
        {activeSection === 'heatmap' && (
          <div className="chart-card" style={{ height: 'calc(100% - 20px)', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /><rect x="7" y="14" width="3" height="3" /><rect x="14" y="14" width="3" height="3" /></svg>
                Resource Utilization Heatmap (by Role)
              </h3>
            </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
              {heatmapData.resources.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /></svg>
                  <p style={{ fontWeight: 600 }}>No heatmap data available</p>
                  <p style={{ fontSize: '0.85rem' }}>Upload an MPP file with tasks that have dates and resource assignments.</p>
                </div>
              ) : (
                <ChartWrapper option={heatmapOption} height="100%" enableExport enableFullscreen visualId="resource-heatmap-role" visualTitle="Resource Heatmap by Role" />
              )}
            </div>
          </div>
        )}

        {/* Gantt Section */}
        {activeSection === 'gantt' && (
          <div className="chart-card" style={{ height: 'calc(100% - 20px)', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /></svg>
                Resource Gantt Chart (by Role)
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setExpandedRoles(new Set(roleData.map(r => r.role)))} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Expand All</button>
                <button onClick={() => setExpandedRoles(new Set())} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Collapse All</button>
              </div>
            </div>
            <div className="chart-card-body" style={{ flex: 1, padding: '1rem', overflow: 'hidden' }}>
              {ganttData.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  <p style={{ fontWeight: 600 }}>No Gantt data available</p>
                  <p style={{ fontSize: '0.85rem' }}>Upload an MPP file with tasks that have dates and resource assignments.</p>
                </div>
              ) : (
                <ChartWrapper option={ganttOption} height="100%" onClick={handleGanttClick} enableExport enableFullscreen visualId="resource-gantt-role" visualTitle="Resource Gantt by Role" />
              )}
            </div>
          </div>
        )}

        {/* Leveling Section */}
        {activeSection === 'leveling' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">Project Resource Leveling</h3>
              </div>
              <div className="chart-card-body" style={{ padding: '1rem' }}>
                {data.resourceLeveling?.quarterly && data.resourceLeveling.quarterly.length > 0 ? (
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Quarterly Summary</h4>
                    <table className="data-table" style={{ width: '100%', marginBottom: '1rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Metric</th>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (<th key={idx} style={{ textAlign: 'right' }}>{q.quarterLabel}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Total Project Hours</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (<td key={idx} style={{ textAlign: 'right' }}>{q.totalProjectHours.toLocaleString()}</td>))}
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Projected FTE</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => (<td key={idx} style={{ textAlign: 'right' }}>{q.projectedFTEUtilization.toFixed(2)}</td>))}
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Variance %</td>
                          {data.resourceLeveling.quarterly.map((q: any, idx: number) => {
                            const color = q.variancePercent < -10 ? '#F59E0B' : q.variancePercent > 10 ? '#E91E63' : '#10B981';
                            return (<td key={idx} style={{ textAlign: 'right', color, fontWeight: 600 }}>{q.variancePercent > 0 ? '+' : ''}{q.variancePercent.toFixed(0)}%</td>);
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No quarterly leveling data available</div>
                )}
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Monthly View</h4>
                  <ResourceLevelingChart data={data.resourceLeveling || { monthly: [], quarterly: [] }} height="400px" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
