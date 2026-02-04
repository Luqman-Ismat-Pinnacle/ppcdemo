'use client';

/**
 * @fileoverview Redesigned Resourcing Page for PPC V3 Project Controls.
 * 
 * User-friendly resource management with:
 * - Overview dashboard with key metrics
 * - Resource Requirements Calculator (FTE based on baseline hours)
 * - Interactive resource utilization heatmap (by Role)
 * - Resource Gantt chart with assignment timelines (by Role)
 * - Resource leveling analysis
 * 
 * Handles comma-separated roles in task assignments and defaults to viewing by role.
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useMemo, useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  runResourceLeveling,
  deriveLevelingInputs,
  DEFAULT_LEVELING_PARAMS,
  LEVELING_PARAM_LABELS,
  type LevelingParams,
  type LevelingResult,
} from '@/lib/resource-leveling-engine';

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
    startDate: string | null;
    endDate: string | null;
  }>;
}

interface GanttItem {
  id: string;
  name: string;
  type: 'role' | 'task';
  level: number;
  startDate: Date | null;
  endDate: Date | null;
  percentComplete: number;
  baselineHours: number;
  actualHours: number;
}

type ActiveSection = 'overview' | 'requirements' | 'heatmap' | 'gantt' | 'leveling';

// Helper: Parse roles from a string (handles comma-separated)
function parseRoles(resourceStr: string | null | undefined): string[] {
  if (!resourceStr || typeof resourceStr !== 'string') return ['Unassigned'];
  
  const roles = resourceStr
    .split(',')
    .map(r => r.trim())
    .filter(r => r.length > 0);
  
  return roles.length > 0 ? roles : ['Unassigned'];
}

// Helper: Parse date safely
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// Helper: Format date for display (includes year)
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper: Format date short (for heatmap weeks)
function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
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
  
  const projectIdParam = searchParams.get('projectId');
  const scrollToSection = searchParams.get('section');
  
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectIdParam);
  const [expandedResourceType, setExpandedResourceType] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);
  
  // Resource Leveling state
  const [levelingParams, setLevelingParams] = useState<LevelingParams>(DEFAULT_LEVELING_PARAMS);
  const [levelingResult, setLevelingResult] = useState<LevelingResult | null>(null);
  const [isLevelingRunning, setIsLevelingRunning] = useState(false);
  const [isUtilizationExpanded, setIsUtilizationExpanded] = useState(true);
  const [isUnassignedExpanded, setIsUnassignedExpanded] = useState(true);
  
  // Track manual task assignments (taskId -> resourceId)
  const [taskAssignments, setTaskAssignments] = useState<Record<string, string>>({});

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

  // Build employee ID to name map for leveling results display
  const employeeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (data.employees || []).forEach((emp: any) => {
      const id = emp.employeeId || emp.id;
      const name = emp.name || emp.fullName || id;
      if (id) {
        map.set(id, name);
        map.set(id.toLowerCase(), name);
      }
    });
    return map;
  }, [data.employees]);

  // Helper to get resource name from ID
  const getResourceName = useCallback((resourceId: string): string => {
    return employeeNameMap.get(resourceId) || employeeNameMap.get(resourceId.toLowerCase()) || resourceId;
  }, [employeeNameMap]);

  // Helper to get resource names from an array of IDs
  const getResourceNames = useCallback((resourceIds: string[]): string => {
    if (!resourceIds || resourceIds.length === 0) return 'Unassigned';
    return resourceIds.map(id => getResourceName(id)).join(', ');
  }, [getResourceName]);

  // Filter tasks by project - MUST come before hooks that depend on it
  const filteredTasks = useMemo(() => {
    const tasks = data.tasks || [];
    return selectedProjectId 
      ? tasks.filter((t: any) => (t.projectId || t.project_id) === selectedProjectId)
      : tasks;
  }, [data.tasks, selectedProjectId]);

  // Get list of available employees for assignment dropdown
  const availableEmployees = useMemo(() => {
    return (data.employees || []).map((emp: any) => ({
      id: emp.employeeId || emp.id,
      name: emp.name || emp.fullName || emp.employeeId || 'Unknown',
    })).filter((e: { id: string; name: string }) => e.id);
  }, [data.employees]);

  // Get unassigned tasks (tasks with no assignedResource, employeeId, or manual assignment)
  const unassignedTasks = useMemo(() => {
    return filteredTasks.filter((task: any) => {
      const taskId = task.taskId || task.id || task.task_id;
      // Check if manually assigned
      if (taskAssignments[taskId]) return false;
      
      // Check if has assigned resource
      const assignedResource = task.assignedResource || task.assigned_resource || task.assignedResourceType || '';
      const employeeId = task.employeeId || task.employee_id || '';
      
      // A task is unassigned if it has no assigned resource AND no employeeId
      const hasAssignment = (assignedResource && assignedResource.trim() !== '' && assignedResource.toLowerCase() !== 'unassigned') ||
                           (employeeId && employeeId.trim() !== '');
      
      return !hasAssignment;
    }).map((task: any) => ({
      taskId: task.taskId || task.id || task.task_id,
      taskName: task.taskName || task.name || task.task_name || 'Unnamed Task',
      baselineHours: task.baselineHours || task.baseline_hours || task.baselineWork || 0,
      startDate: task.startDate || task.start_date || task.baselineStartDate || null,
      endDate: task.endDate || task.end_date || task.baselineEndDate || null,
    }));
  }, [filteredTasks, taskAssignments]);

  // Assign a resource to a task
  const assignResourceToTask = useCallback((taskId: string, resourceId: string) => {
    setTaskAssignments(prev => ({
      ...prev,
      [taskId]: resourceId
    }));
    // Clear leveling result so user can re-run with new assignments
    setLevelingResult(null);
  }, []);

  // Remove assignment from a task
  const unassignTask = useCallback((taskId: string) => {
    setTaskAssignments(prev => {
      const newAssignments = { ...prev };
      delete newAssignments[taskId];
      return newAssignments;
    });
    setLevelingResult(null);
  }, []);

  // Get tasks with manual assignments for display
  const manuallyAssignedTasks = useMemo(() => {
    return Object.entries(taskAssignments).map(([taskId, resourceId]) => {
      const task = filteredTasks.find((t: any) => (t.taskId || t.id || t.task_id) === taskId);
      return {
        taskId,
        taskName: task?.taskName || task?.name || task?.task_name || 'Unknown Task',
        baselineHours: task?.baselineHours || task?.baseline_hours || 0,
        resourceId,
        resourceName: getResourceName(resourceId),
      };
    });
  }, [taskAssignments, filteredTasks, getResourceName]);

  // Calculate Resource Requirements grouped by role (handles comma-separated roles)
  const resourceRequirements = useMemo((): ResourceRequirement[] => {
    const roleMap = new Map<string, ResourceRequirement>();

    filteredTasks.forEach((task: any) => {
      const resourceStr = task.assignedResource || task.assigned_resource || task.assignedResourceType || '';
      const roles = parseRoles(resourceStr);
      const baselineHours = task.baselineHours || task.baseline_hours || task.baselineWork || task.baseline_work || 0;
      const actualHours = task.actualHours || task.actual_hours || 0;
      const percentComplete = task.percentComplete || task.percent_complete || 0;
      const startDate = task.startDate || task.start_date || task.baselineStartDate || task.baseline_start_date || null;
      const endDate = task.endDate || task.end_date || task.baselineEndDate || task.baseline_end_date || null;
      
      // Distribute hours equally among roles if multiple
      const hoursPerRole = baselineHours / roles.length;
      const actualPerRole = actualHours / roles.length;
      
      roles.forEach(role => {
        if (!roleMap.has(role)) {
          roleMap.set(role, {
            resourceType: role,
            taskCount: 0,
            totalBaselineHours: 0,
            totalActualHours: 0,
            remainingHours: 0,
            fteRequired: 0,
            fteMonthly: 0,
            tasks: [],
          });
        }
        
        const req = roleMap.get(role)!;
        req.taskCount++;
        req.totalBaselineHours += hoursPerRole;
        req.totalActualHours += actualPerRole;
        req.remainingHours += Math.max(0, hoursPerRole - actualPerRole);
        req.tasks.push({
          taskId: task.taskId || task.id || task.task_id,
          taskName: task.taskName || task.name || task.task_name || 'Unnamed Task',
          baselineHours: hoursPerRole,
          actualHours: actualPerRole,
          percentComplete,
          startDate,
          endDate,
        });
      });
    });

    // Calculate FTE
    roleMap.forEach((req) => {
      req.fteRequired = req.totalBaselineHours / HOURS_PER_YEAR;
      req.fteMonthly = req.totalBaselineHours / (HOURS_PER_YEAR / 12);
    });

    return Array.from(roleMap.values()).sort((a, b) => b.totalBaselineHours - a.totalBaselineHours);
  }, [filteredTasks]);

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

  // ============================================================================
  // HEATMAP DATA & CHART
  // ============================================================================
  
  const heatmapChartData = useMemo(() => {
    if (resourceRequirements.length === 0) {
      return { roles: [] as string[], weeks: [] as string[], matrix: [] as number[][] };
    }

    // Collect all dates from tasks
    const allDates: Date[] = [];
    resourceRequirements.forEach(req => {
      req.tasks.forEach(t => {
        const start = parseDate(t.startDate);
        const end = parseDate(t.endDate);
        if (start) allDates.push(start);
        if (end) allDates.push(end);
      });
    });

    if (allDates.length === 0) {
      // Use current month as fallback
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      allDates.push(start, end);
    }

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Generate weeks
    const weeks: string[] = [];
    const weekDates: Date[] = [];
    const current = new Date(minDate);
    current.setDate(current.getDate() - current.getDay() + 1); // Start from Monday
    
    while (current <= maxDate) {
      weeks.push(formatDateShort(current));
      weekDates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    if (weeks.length === 0) {
      weeks.push('Week 1');
      weekDates.push(new Date());
    }

    // Build utilization matrix: roles x weeks
    const roles = resourceRequirements.map(r => r.resourceType);
    const matrix: number[][] = resourceRequirements.map(req => {
      const weeklyHours = new Array(weeks.length).fill(0);
      
      req.tasks.forEach(task => {
        const start = parseDate(task.startDate);
        const end = parseDate(task.endDate);
        if (!start || !end || task.baselineHours <= 0) return;
        
        const taskDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
        const hoursPerDay = task.baselineHours / taskDays;
        
        weekDates.forEach((weekStart, weekIdx) => {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          
          // Count overlapping days
          const overlapStart = Math.max(start.getTime(), weekStart.getTime());
          const overlapEnd = Math.min(end.getTime(), weekEnd.getTime());
          
          if (overlapStart <= overlapEnd) {
            const overlapDays = Math.ceil((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000)) + 1;
            weeklyHours[weekIdx] += hoursPerDay * Math.min(overlapDays, 5); // Max 5 work days
          }
        });
      });
      
      // Convert to utilization percentage (40 hrs/week = 100%)
      return weeklyHours.map(h => Math.round((h / HOURS_PER_WEEK) * 100));
    });

    return { roles, weeks, matrix };
  }, [resourceRequirements]);

  // Build ECharts heatmap option with scroll/zoom
  const heatmapOption = useMemo((): EChartsOption => {
    const { roles, weeks, matrix } = heatmapChartData;
    
    if (roles.length === 0 || weeks.length === 0) {
      return { series: [] };
    }

    // Convert to [x, y, value] format for ECharts heatmap
    const seriesData: number[][] = [];
    matrix.forEach((row, yIdx) => {
      row.forEach((val, xIdx) => {
        seriesData.push([xIdx, yIdx, val]);
      });
    });

    // Calculate default zoom ranges based on data size
    const maxVisibleWeeks = 12;
    const maxVisibleRoles = 10;
    const xZoomEnd = weeks.length > maxVisibleWeeks ? Math.round((maxVisibleWeeks / weeks.length) * 100) : 100;
    const yZoomEnd = roles.length > maxVisibleRoles ? Math.round((maxVisibleRoles / roles.length) * 100) : 100;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        position: 'top',
        confine: true,
        formatter: (params: any) => {
          if (!params?.data) return '';
          const [xIdx, yIdx, value] = params.data;
          const role = roles[yIdx] || '';
          const week = weeks[xIdx] || '';
          
          let status = 'Underutilized';
          let statusColor = '#1A9B8F';
          if (value > 110) { status = 'Overloaded'; statusColor = '#E91E63'; }
          else if (value > 100) { status = 'At Capacity'; statusColor = '#FF9800'; }
          else if (value >= 80) { status = 'Optimal'; statusColor = '#CDDC39'; }
          else if (value >= 50) { status = 'Building'; statusColor = '#40E0D0'; }

          return `
            <div style="padding:8px 12px;min-width:160px;">
              <div style="font-weight:600;color:#40E0D0;margin-bottom:6px;">${role}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:8px;">Week of ${week}</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span>Utilization:</span>
                <span style="font-weight:700;">${value}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span>Status:</span>
                <span style="font-weight:600;color:${statusColor}">${status}</span>
              </div>
            </div>
          `;
        },
        backgroundColor: 'rgba(20,20,20,0.96)',
        borderColor: 'rgba(64,224,208,0.3)',
        borderWidth: 1,
        textStyle: { color: '#fff' },
        extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.4);border-radius:8px;'
      },
      grid: {
        left: 180,
        right: 80,
        top: 30,
        bottom: 60,
        containLabel: false
      },
      // Horizontal and vertical scroll/zoom controls
      dataZoom: [
        // Horizontal slider at bottom
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 8,
          height: 20,
          start: 0,
          end: xZoomEnd,
          fillerColor: 'rgba(64,224,208,0.2)',
          borderColor: 'rgba(64,224,208,0.3)',
          handleStyle: { color: '#40E0D0', borderColor: '#40E0D0' },
          textStyle: { color: '#9ca3af', fontSize: 10 },
          dataBackground: {
            lineStyle: { color: 'rgba(64,224,208,0.3)' },
            areaStyle: { color: 'rgba(64,224,208,0.1)' }
          }
        },
        // Vertical slider on left
        {
          type: 'slider',
          yAxisIndex: 0,
          left: 8,
          width: 20,
          start: 0,
          end: yZoomEnd,
          fillerColor: 'rgba(64,224,208,0.2)',
          borderColor: 'rgba(64,224,208,0.3)',
          handleStyle: { color: '#40E0D0', borderColor: '#40E0D0' },
          showDetail: false
        },
        // Inside zoom for mouse wheel/drag
        {
          type: 'inside',
          xAxisIndex: 0,
          zoomOnMouseWheel: 'shift',
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          zoomOnMouseWheel: 'ctrl',
          moveOnMouseMove: true,
          moveOnMouseWheel: false
        }
      ],
      xAxis: {
        type: 'category',
        data: weeks,
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10,
          rotate: 45,
          interval: 0,
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category',
        data: roles,
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10,
          width: 150,
          overflow: 'truncate',
        },
        axisTick: { show: false }
      },
      visualMap: {
        min: 0,
        max: 120,
        calculable: true,
        orient: 'vertical',
        right: 10,
        top: 'center',
        itemHeight: 120,
        itemWidth: 12,
        inRange: {
          color: ['#1a1a1a', '#1A9B8F', '#40E0D0', '#CDDC39', '#FF9800', '#E91E63']
        },
        textStyle: { color: '#9ca3af', fontSize: 10 },
        formatter: (value: number) => `${Math.round(value)}%`,
      },
      series: [{
        name: 'Utilization',
        type: 'heatmap',
        data: seriesData,
        label: {
          show: true,
          formatter: (params: any) => params.data[2] > 0 ? `${params.data[2]}%` : '',
          fontSize: 9,
          fontWeight: 600,
          color: '#fff',
          textShadowColor: 'rgba(0,0,0,0.7)',
          textShadowBlur: 3
        },
        itemStyle: {
          borderColor: 'rgba(10,10,10,0.95)',
          borderWidth: 2,
          borderRadius: 3,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#40E0D0',
            borderWidth: 2,
            shadowBlur: 12,
            shadowColor: 'rgba(64,224,208,0.5)',
          }
        }
      }]
    };
  }, [heatmapChartData]);

  // ============================================================================
  // GANTT DATA & CHART (Based on EChartsGantt.tsx pattern)
  // ============================================================================

  const ganttItems = useMemo((): GanttItem[] => {
    const items: GanttItem[] = [];
    
    resourceRequirements.forEach(req => {
      // Calculate role date range
      const taskDates = req.tasks
        .flatMap(t => [parseDate(t.startDate), parseDate(t.endDate)])
        .filter((d): d is Date => d !== null);
      
      const roleStart = taskDates.length > 0 ? new Date(Math.min(...taskDates.map(d => d.getTime()))) : null;
      const roleEnd = taskDates.length > 0 ? new Date(Math.max(...taskDates.map(d => d.getTime()))) : null;
      const avgProgress = req.tasks.length > 0 
        ? Math.round(req.tasks.reduce((sum, t) => sum + t.percentComplete, 0) / req.tasks.length)
        : 0;

      // Add role row
      items.push({
        id: `role-${req.resourceType}`,
        name: req.resourceType,
        type: 'role',
        level: 0,
        startDate: roleStart,
        endDate: roleEnd,
        percentComplete: avgProgress,
        baselineHours: req.totalBaselineHours,
        actualHours: req.totalActualHours,
      });

      // Add task rows if expanded
      if (expandedRoles.has(req.resourceType)) {
        req.tasks.forEach(task => {
          items.push({
            id: `task-${task.taskId}`,
            name: task.taskName,
            type: 'task',
            level: 1,
            startDate: parseDate(task.startDate),
            endDate: parseDate(task.endDate),
            percentComplete: task.percentComplete,
            baselineHours: task.baselineHours,
            actualHours: task.actualHours,
          });
        });
      }
    });

    return items;
  }, [resourceRequirements, expandedRoles]);

  // Build ECharts Gantt option (EXACTLY like WBS Gantt - EChartsGantt.tsx)
  const ganttOption = useMemo((): EChartsOption => {
    if (ganttItems.length === 0) {
      return { series: [] };
    }

    // Get date range
    const allDates = ganttItems
      .flatMap(item => [item.startDate, item.endDate])
      .filter((d): d is Date => d !== null)
      .map(d => d.getTime());

    if (allDates.length === 0) {
      return { series: [] };
    }

    const minTime = Math.min(...allDates);
    const maxTime = Math.max(...allDates);
    const today = new Date().getTime();

    const categories = ganttItems.map(item => item.id);

    // Calculate zoom defaults based on item count
    const maxVisibleItems = 15;
    const yZoomEnd = ganttItems.length > maxVisibleItems 
      ? Math.round((maxVisibleItems / ganttItems.length) * 100) 
      : 100;

    // Prepare series data - matching WBS Gantt format exactly
    const seriesData = ganttItems.map((item, index) => {
      const utilization = item.baselineHours > 0 
        ? Math.round((item.actualHours / item.baselineHours) * 100)
        : 0;
      
      // Color logic matching WBS Gantt
      let color: string;
      if (utilization >= 100) color = '#40E0D0';      // Teal - on track or complete
      else if (utilization >= 90) color = '#CDDC39';  // Lime - nearly there
      else if (utilization >= 80) color = '#FF9800';  // Orange - needs attention
      else if (utilization > 0) color = '#E91E63';    // Pink - behind
      else {
        // Default colors by type
        color = item.type === 'role' ? '#40E0D0' : '#4A90E2';
      }

      return {
        name: item.name,
        value: [
          index,                                    // 0: category index
          item.startDate?.getTime() || minTime,    // 1: start time
          item.endDate?.getTime() || maxTime,      // 2: end time
          item.percentComplete,                     // 3: progress
          item.type,                               // 4: item type
          color,                                   // 5: color
          item.type === 'role',                    // 6: is role (like isCritical)
          item.id,                                 // 7: id
          `${item.baselineHours.toFixed(0)} hrs`,  // 8: resource text (hours)
          false                                    // 9: is milestone
        ],
        itemStyle: { normal: { color } }
      };
    });

    // Custom render function - EXACTLY matching WBS Gantt renderItem
    const renderItem = (params: any, api: any): any => {
      const categoryIndex = api.value(0);
      const start = api.coord([api.value(1), categoryIndex]);
      const end = api.coord([api.value(2), categoryIndex]);
      const progress = api.value(3);
      const color = api.value(5);
      const isRole = api.value(6);
      const resourceText = api.value(8);

      const h = 20; // Task bar height - same as WBS Gantt
      const barWidth = Math.max(end[0] - start[0], 2);

      // Base bar shape
      const rectShape = echarts.graphic.clipRectByRect(
        { x: start[0], y: start[1] - h / 2, width: barWidth, height: h },
        { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
      );

      if (!rectShape) return undefined;

      const children: any[] = [];

      // 1. Draw the background bar (planned duration) - matching WBS Gantt
      children.push({
        type: 'rect',
        shape: rectShape,
        style: {
          fill: color,
          opacity: 0.2,
          stroke: isRole ? '#40E0D0' : 'rgba(255,255,255,0.1)',
          lineWidth: isRole ? 2 : 1
        }
      });

      // 2. Draw the progress bar (actual completion) - matching WBS Gantt
      if (progress > 0) {
        const progressWidth = barWidth * (progress / 100);
        const progressRect = echarts.graphic.clipRectByRect(
          { x: start[0], y: start[1] - h / 2, width: progressWidth, height: h },
          { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
        );

        if (progressRect) {
          children.push({
            type: 'rect',
            shape: progressRect,
            style: { fill: color, opacity: 1 }
          });
        }
      }

      // 3. Draw Resource Text next to bar - matching WBS Gantt
      if (resourceText && barWidth > 10) {
        children.push({
          type: 'text',
          style: {
            text: resourceText,
            x: start[0] + barWidth + 10, // Offset from the bar
            y: start[1],
            fill: '#6b7280', // Text color matching WBS Gantt
            fontSize: 10,
            align: 'left',
            verticalAlign: 'middle'
          },
          silent: true
        });
      }

      return {
        type: 'group',
        children
      };
    };

    // Tooltip formatter matching WBS Gantt style
    const tooltipFormatter = (params: any) => {
      const index = params.value[0];
      const item = ganttItems[index];
      if (!item) return '';

      const utilization = item.baselineHours > 0 
        ? Math.round((item.actualHours / item.baselineHours) * 100)
        : 0;
      // Format dates with year
      const startStr = item.startDate ? formatDate(item.startDate) : 'N/A';
      const endStr = item.endDate ? formatDate(item.endDate) : 'N/A';
      const isRole = item.type === 'role';

      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-weight:bold;font-size:14px">${item.name}</span>
                ${isRole ? '<span style="background:#40E0D0;color:black;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:bold">ROLE</span>' : ''}
              </div>
              <div style="font-size:12px;color:rgba(255,255,255,0.7)">
                <div>Period: <span style="color:white">${startStr}</span> to <span style="color:white">${endStr}</span></div>
                <div style="margin-top:2px">Progress: <span style="color:white;font-weight:600">${item.percentComplete}%</span></div>
                <div style="margin-top:2px">Baseline: <span style="color:white">${item.baselineHours.toFixed(0)} hrs</span></div>
                <div style="margin-top:2px">Actual: <span style="color:white">${item.actualHours.toFixed(0)} hrs</span></div>
                ${utilization > 0 ? `<div style="margin-top:2px">Utilization: <span style="color:white;font-weight:600">${utilization}%</span></div>` : ''}
              </div>`;
    };

    return {
      tooltip: {
        trigger: 'item',
        formatter: tooltipFormatter
      },
      // Grid with space for dataZoom controls
      grid: { 
        left: 220, 
        right: 100, 
        top: 40, 
        bottom: 60,
        containLabel: false
      },
      // Horizontal and vertical zoom/scroll
      dataZoom: [
        // Horizontal slider at bottom
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 8,
          height: 20,
          start: 0,
          end: 100,
          fillerColor: 'rgba(64,224,208,0.2)',
          borderColor: 'rgba(64,224,208,0.3)',
          handleStyle: { color: '#40E0D0', borderColor: '#40E0D0' },
          textStyle: { color: '#9ca3af', fontSize: 10 },
          dataBackground: {
            lineStyle: { color: 'rgba(64,224,208,0.3)' },
            areaStyle: { color: 'rgba(64,224,208,0.1)' }
          }
        },
        // Vertical slider on left
        {
          type: 'slider',
          yAxisIndex: 0,
          left: 8,
          width: 20,
          start: 0,
          end: yZoomEnd,
          fillerColor: 'rgba(64,224,208,0.2)',
          borderColor: 'rgba(64,224,208,0.3)',
          handleStyle: { color: '#40E0D0', borderColor: '#40E0D0' },
          showDetail: false
        },
        // Inside zoom for mouse interaction
        {
          type: 'inside',
          xAxisIndex: 0,
          zoomOnMouseWheel: 'shift',
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          zoomOnMouseWheel: 'ctrl',
          moveOnMouseMove: false,
          moveOnMouseWheel: false
        }
      ],
      xAxis: {
        type: 'time',
        position: 'top',
        min: minTime,
        max: maxTime,
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { 
          color: '#9ca3af', 
          fontSize: 10,
          formatter: (value: number) => {
            const d = new Date(value);
            return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n${d.getFullYear()}`;
          }
        }
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10,
          formatter: (id: string) => {
            const item = ganttItems.find(i => i.id === id);
            if (!item) return '';
            // Indentation matching WBS Gantt style
            return `${' '.repeat(item.level * 2)}${item.name}`;
          }
        }
      },
      series: [
        {
          name: 'Gantt',
          type: 'custom',
          renderItem: renderItem,
          encode: { x: [1, 2], y: 0 },
          data: seriesData,
          clip: true
        },
        // Today line marker
        {
          type: 'line',
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [{
              xAxis: today,
              lineStyle: { color: '#ef4444', width: 2, type: 'solid' },
              label: {
                formatter: 'Today',
                position: 'start',
                color: '#ef4444',
                fontSize: 10,
                fontWeight: 'bold'
              }
            }]
          }
        }
      ]
    };
  }, [ganttItems]);

  // Handle gantt chart click to expand/collapse roles
  const handleGanttClick = useCallback((params: any) => {
    if (params?.value) {
      const index = params.value[0];
      const item = ganttItems[index];
      if (item?.type === 'role') {
        const role = item.name;
        setExpandedRoles(prev => {
          const next = new Set(prev);
          if (next.has(role)) {
            next.delete(role);
          } else {
            next.add(role);
          }
          return next;
        });
      }
    }
  }, [ganttItems]);

  // Run resource leveling
  const runLeveling = useCallback(() => {
    setIsLevelingRunning(true);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const inputs = deriveLevelingInputs(data, levelingParams);
        
        // Apply manual task assignments to the leveling inputs
        if (Object.keys(taskAssignments).length > 0) {
          inputs.tasks.forEach(task => {
            const manualAssignment = taskAssignments[task.id];
            if (manualAssignment) {
              // Clear existing resourcesMap and add only the manual assignment
              task.resourcesMap = { [manualAssignment]: task.sizingHours };
            }
          });
        }
        
        const result = runResourceLeveling(
          inputs.tasks,
          inputs.resources,
          inputs.project,
          levelingParams,
          inputs.warnings
        );
        setLevelingResult(result);
      } catch (error) {
        console.error('Leveling error:', error);
      } finally {
        setIsLevelingRunning(false);
      }
    }, 100);
  }, [data, levelingParams, taskAssignments]);

  // Auto-run leveling when tab is opened and data is available
  useEffect(() => {
    if (activeSection === 'leveling' && !levelingResult && data.tasks?.length > 0) {
      runLeveling();
    }
  }, [activeSection, levelingResult, data.tasks?.length, runLeveling]);

  // Update a single leveling parameter
  const updateLevelingParam = useCallback((key: keyof LevelingParams, value: number | boolean) => {
    setLevelingParams(prev => ({ ...prev, [key]: value }));
    setLevelingResult(null); // Clear result so user can re-run
  }, []);

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
          <div className="chart-card" style={{ height: 'calc(100vh - 280px)', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /><rect x="7" y="14" width="3" height="3" /><rect x="14" y="14" width="3" height="3" /></svg>
                Resource Utilization Heatmap (by Role)
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {heatmapChartData.roles.length} roles × {heatmapChartData.weeks.length} weeks
          </div>
        </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
              {heatmapChartData.roles.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /></svg>
                  <p style={{ fontWeight: 600 }}>No heatmap data available</p>
                  <p style={{ fontSize: '0.85rem' }}>Upload an MPP file with tasks that have dates and resource assignments.</p>
      </div>
              ) : (
                <ChartWrapper 
                  option={heatmapOption} 
                  height="100%" 
                  enableExport 
                  enableFullscreen 
                  visualId="resource-heatmap-role" 
                  visualTitle="Resource Heatmap by Role" 
                />
              )}
            </div>
          </div>
        )}

        {/* Gantt Section */}
        {activeSection === 'gantt' && (
          <div className="chart-card" style={{ height: 'calc(100vh - 280px)', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /></svg>
                Resource Gantt Chart (by Role)
            </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setExpandedRoles(new Set(resourceRequirements.map(r => r.resourceType)))} 
                  style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Expand All
                </button>
                        <button
                  onClick={() => setExpandedRoles(new Set())} 
                  style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Collapse All
                        </button>
              </div>
            </div>
            <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
              {ganttItems.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  <p style={{ fontWeight: 600 }}>No Gantt data available</p>
                  <p style={{ fontSize: '0.85rem' }}>Upload an MPP file with tasks that have dates and resource assignments.</p>
                      </div>
                    ) : (
                <ChartWrapper 
                  option={ganttOption} 
                  height="100%" 
                  onClick={handleGanttClick} 
                  enableExport 
                  enableFullscreen 
                  visualId="resource-gantt-role" 
                  visualTitle="Resource Gantt by Role" 
                />
              )}
            </div>
                      </div>
                    )}

        {/* Leveling Section - Comprehensive Resource Leveling */}
        {activeSection === 'leveling' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* What is Resource Leveling - Explanation */}
            <div className="chart-card" style={{ background: 'linear-gradient(135deg, rgba(64,224,208,0.1) 0%, rgba(59,130,246,0.05) 100%)' }}>
              <div className="chart-card-body" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'linear-gradient(135deg, #3B82F6, #40E0D0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>What is Resource Leveling?</h3>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Resource leveling optimizes your project schedule by distributing work evenly across available resources.
                      It resolves conflicts when resources are over-allocated and ensures tasks are scheduled based on priority and dependencies.
                    </p>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }} />
                        <span>Balances workload</span>
                  </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3B82F6' }} />
                        <span>Respects dependencies</span>
            </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B' }} />
                        <span>Optimizes by priority</span>
          </div>
        </div>
          </div>
              </div>
              </div>
            </div>

            {/* Configuration Panel */}
            <div className="chart-card">
              <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v10" /><path d="M21 12h-6m-6 0H1" />
                  </svg>
                  Leveling Configuration
                </h3>
                                <button
                  onClick={runLeveling}
                  disabled={isLevelingRunning || !data.tasks?.length}
                                  style={{
                    padding: '0.6rem 1.25rem',
                                    border: 'none',
                    borderRadius: '8px',
                    background: isLevelingRunning ? 'var(--bg-tertiary)' : 'var(--pinnacle-teal)',
                    color: isLevelingRunning ? 'var(--text-muted)' : '#000',
                                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isLevelingRunning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {isLevelingRunning ? (
                    <>
                      <div style={{ width: 14, height: 14, border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Running...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      Run Leveling
                    </>
                  )}
                </button>
              </div>
              <div className="chart-card-body" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                  
                  {/* Workday Hours */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                      {LEVELING_PARAM_LABELS.workdayHours.label}
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {LEVELING_PARAM_LABELS.workdayHours.description}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="range"
                        min={LEVELING_PARAM_LABELS.workdayHours.min}
                        max={LEVELING_PARAM_LABELS.workdayHours.max}
                        step={LEVELING_PARAM_LABELS.workdayHours.step}
                        value={levelingParams.workdayHours}
                        onChange={(e) => updateLevelingParam('workdayHours', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--pinnacle-teal)' }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '50px', textAlign: 'right', color: 'var(--pinnacle-teal)' }}>
                        {levelingParams.workdayHours} hrs
                      </span>
          </div>
        </div>

                  {/* Buffer Days */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                      {LEVELING_PARAM_LABELS.bufferDays.label}
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {LEVELING_PARAM_LABELS.bufferDays.description}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="range"
                        min={LEVELING_PARAM_LABELS.bufferDays.min}
                        max={LEVELING_PARAM_LABELS.bufferDays.max}
                        step={LEVELING_PARAM_LABELS.bufferDays.step}
                        value={levelingParams.bufferDays}
                        onChange={(e) => updateLevelingParam('bufferDays', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--pinnacle-teal)' }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '50px', textAlign: 'right', color: 'var(--pinnacle-teal)' }}>
                        {levelingParams.bufferDays} days
            </span>
          </div>
                  </div>

                  {/* Max Schedule Days */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                      {LEVELING_PARAM_LABELS.maxScheduleDays.label}
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {LEVELING_PARAM_LABELS.maxScheduleDays.description}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="range"
                        min={LEVELING_PARAM_LABELS.maxScheduleDays.min}
                        max={LEVELING_PARAM_LABELS.maxScheduleDays.max}
                        step={LEVELING_PARAM_LABELS.maxScheduleDays.step}
                        value={levelingParams.maxScheduleDays}
                        onChange={(e) => updateLevelingParam('maxScheduleDays', Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--pinnacle-teal)' }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '50px', textAlign: 'right', color: 'var(--pinnacle-teal)' }}>
                        {levelingParams.maxScheduleDays} days
                    </span>
                  </div>
                    </div>

                  {/* Toggle Options */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                      Options
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={levelingParams.preferSingleResource}
                          onChange={(e) => updateLevelingParam('preferSingleResource', e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: 'var(--pinnacle-teal)' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>Prefer single resource per task</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={levelingParams.allowSplits}
                          onChange={(e) => updateLevelingParam('allowSplits', e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: 'var(--pinnacle-teal)' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>Allow task splitting across resources</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={levelingParams.workdaysOnly}
                          onChange={(e) => updateLevelingParam('workdaysOnly', e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: 'var(--pinnacle-teal)' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>Workdays only (exclude weekends)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Unassigned Tasks Section */}
            {(unassignedTasks.length > 0 || manuallyAssignedTasks.length > 0) && (
              <div className="chart-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                <div 
                  className="chart-card-header" 
                  style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                  onClick={() => setIsUnassignedExpanded(!isUnassignedExpanded)}
                >
                  <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg 
                      viewBox="0 0 24 24" 
                      width="16" 
                      height="16" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                      style={{ transform: isUnassignedExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#F59E0B" strokeWidth="2" style={{ marginRight: '4px' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Task Assignments ({unassignedTasks.length} unassigned, {manuallyAssignedTasks.length} manually assigned)
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {isUnassignedExpanded ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </div>
                
                {isUnassignedExpanded && (
                  <div className="chart-card-body" style={{ padding: '1rem' }}>
                    {/* Explanation */}
                    <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                        <strong>Note:</strong> Tasks without assigned resources cannot be scheduled by the leveling algorithm. 
                        Assign a resource to each task below using the dropdown, then run leveling.
                      </p>
                    </div>

                    {/* Unassigned Tasks Table */}
                    {unassignedTasks.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#F59E0B' }}>
                          Unassigned Tasks ({unassignedTasks.length})
                        </h4>
                        <div style={{ overflow: 'auto', maxHeight: '300px' }}>
                          <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Task Name</th>
                                <th style={{ textAlign: 'right' }}>Hours</th>
                                <th style={{ textAlign: 'left' }}>Dates</th>
                                <th style={{ textAlign: 'left', minWidth: '200px' }}>Assign Resource</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unassignedTasks.map((task) => (
                                <tr key={task.taskId}>
                                  <td style={{ fontWeight: 500 }}>{task.taskName}</td>
                                  <td style={{ textAlign: 'right' }}>{formatNumber(task.baselineHours)}</td>
                                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {task.startDate && task.endDate 
                                      ? `${formatDate(new Date(task.startDate))} → ${formatDate(new Date(task.endDate))}`
                                      : 'No dates'}
                                  </td>
                                  <td>
                                    <select
                                      value=""
                                      onChange={(e) => e.target.value && assignResourceToTask(task.taskId, e.target.value)}
                                      style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <option value="">Select resource...</option>
                                      {availableEmployees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Manually Assigned Tasks */}
                    {manuallyAssignedTasks.length > 0 && (
                      <div>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#10B981' }}>
                          Manually Assigned ({manuallyAssignedTasks.length})
                        </h4>
                        <div style={{ overflow: 'auto', maxHeight: '200px' }}>
                          <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Task Name</th>
                                <th style={{ textAlign: 'right' }}>Hours</th>
                                <th style={{ textAlign: 'left' }}>Assigned To</th>
                                <th style={{ textAlign: 'center', width: '80px' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {manuallyAssignedTasks.map((task) => (
                                <tr key={task.taskId}>
                                  <td style={{ fontWeight: 500 }}>{task.taskName}</td>
                                  <td style={{ textAlign: 'right' }}>{formatNumber(task.baselineHours)}</td>
                                  <td style={{ color: '#10B981', fontWeight: 500 }}>{task.resourceName}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      onClick={() => unassignTask(task.taskId)}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid #ef4444',
                                        background: 'transparent',
                                        color: '#ef4444',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Quick assign all button */}
                    {unassignedTasks.length > 0 && availableEmployees.length > 0 && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Quick assign all unassigned to:</span>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                unassignedTasks.forEach(task => assignResourceToTask(task.taskId, e.target.value));
                                e.target.value = '';
                              }
                            }}
                            style={{
                              padding: '0.5rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">Select resource...</option>
                            {availableEmployees.map((emp) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Results Section */}
            {levelingResult && (
              <>
                {/* Summary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                  <div className="metric-card accent-teal" style={{ padding: '1rem' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Scheduled Tasks</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem' }}>
                      {levelingResult.summary.scheduledTasks} / {levelingResult.summary.totalTasks}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: levelingResult.summary.scheduledTasks === levelingResult.summary.totalTasks ? '#10B981' : '#F59E0B' }}>
                      {levelingResult.summary.scheduledTasks === levelingResult.summary.totalTasks ? 'All tasks scheduled' : `${levelingResult.summary.totalTasks - levelingResult.summary.scheduledTasks} unscheduled`}
                    </div>
                  </div>
                  
                  <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Total Hours</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem' }}>{formatNumber(levelingResult.summary.totalHours)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Project work effort</div>
                  </div>
                  
                  <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Avg Utilization</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: levelingResult.summary.averageUtilization > 80 ? '#10B981' : levelingResult.summary.averageUtilization > 50 ? '#F59E0B' : '#E91E63' }}>
                      {levelingResult.summary.averageUtilization.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Across all resources</div>
                  </div>
                  
                  <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Peak Utilization</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: levelingResult.summary.peakUtilization > 100 ? '#E91E63' : '#10B981' }}>
                      {levelingResult.summary.peakUtilization.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Maximum daily load</div>
                  </div>
                  
                  <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Max Delay</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: levelingResult.summary.maxDelayDays > 0 ? '#F59E0B' : '#10B981' }}>
                      {levelingResult.summary.maxDelayDays} days
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Longest task delay</div>
                  </div>
                  
                  <div className="metric-card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="metric-label" style={{ fontSize: '0.7rem' }}>Schedule Window</div>
                    <div className="metric-value" style={{ fontSize: '0.9rem' }}>
                      {levelingResult.projectWindow.startDate}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>to {levelingResult.projectWindow.endDate}</div>
                  </div>
                </div>

                {/* Warnings & Errors */}
                {(levelingResult.warnings.length > 0 || levelingResult.errors.length > 0) && (
                  <div className="chart-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                    <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <h3 className="chart-card-title" style={{ color: '#F59E0B' }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Warnings & Issues ({levelingResult.warnings.length + levelingResult.errors.length})
                      </h3>
                    </div>
                    <div className="chart-card-body" style={{ padding: '1rem', maxHeight: '200px', overflow: 'auto' }}>
                      {levelingResult.errors.map((err, idx) => (
                        <div key={`err-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>Error:</span>
                          <span style={{ fontSize: '0.85rem' }}>{err.name} - {err.message}</span>
                </div>
              ))}
                      {levelingResult.warnings.map((warn, idx) => (
                        <div key={`warn-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span style={{ color: '#F59E0B', fontWeight: 600 }}>Warning:</span>
                          <span style={{ fontSize: '0.85rem' }}>{warn}</span>
            </div>
                      ))}
          </div>
        </div>
                )}

                {/* Resource Utilization - Collapsible */}
                {levelingResult.resourceUtilization.length > 0 && (
                  <div className="chart-card">
                    <div 
                      className="chart-card-header" 
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                      onClick={() => setIsUtilizationExpanded(!isUtilizationExpanded)}
                    >
                      <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg 
                          viewBox="0 0 24 24" 
                          width="16" 
                          height="16" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                          style={{ transform: isUtilizationExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        Resource Utilization ({levelingResult.resourceUtilization.length})
                      </h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {isUtilizationExpanded ? 'Click to collapse' : 'Click to expand'}
                      </span>
                    </div>
                    {isUtilizationExpanded && (
                      <div className="chart-card-body" style={{ padding: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                          {levelingResult.resourceUtilization.map((res) => (
                            <div key={res.resourceId} style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{getResourceName(res.resourceId)}</span>
                                <span style={{ fontWeight: 700, fontSize: '1rem', color: res.utilizationPct > 80 ? '#10B981' : res.utilizationPct > 50 ? '#F59E0B' : '#E91E63' }}>
                                  {res.utilizationPct.toFixed(0)}%
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(100, res.utilizationPct)}%`,
                                  height: '100%',
                                  background: res.utilizationPct > 80 ? '#10B981' : res.utilizationPct > 50 ? '#F59E0B' : '#E91E63',
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <span>{formatNumber(res.totalAssigned)} hrs assigned</span>
                                <span>{formatNumber(res.totalAvailable)} hrs available</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Delayed Tasks */}
                {levelingResult.delayedTasks.length > 0 && (
                  <div className="chart-card">
                    <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <h3 className="chart-card-title" style={{ color: '#F59E0B' }}>
                        Delayed Tasks ({levelingResult.delayedTasks.length})
                      </h3>
                    </div>
                    <div className="chart-card-body" style={{ padding: 0 }}>
                      <div style={{ overflow: 'auto', maxHeight: '300px' }}>
                        <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>Task</th>
                              <th style={{ textAlign: 'right' }}>Delay</th>
                              <th style={{ textAlign: 'right' }}>Hours</th>
                              <th style={{ textAlign: 'left' }}>Scheduled</th>
                              <th style={{ textAlign: 'left' }}>Assigned To</th>
                            </tr>
                          </thead>
                          <tbody>
                            {levelingResult.delayedTasks.map((task) => (
                              <tr key={task.taskId}>
                                <td style={{ fontWeight: 500 }}>{task.name}</td>
                                <td style={{ textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>{task.delayDays} days</td>
                                <td style={{ textAlign: 'right' }}>{formatNumber(task.totalHours)}</td>
                                <td style={{ fontSize: '0.8rem' }}>{task.startDate} → {task.endDate}</td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getResourceNames(task.assignedResources)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scheduled Tasks Summary */}
                <div className="chart-card">
                  <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <h3 className="chart-card-title">Scheduled Tasks ({Object.keys(levelingResult.schedules).length})</h3>
                  </div>
                  <div className="chart-card-body" style={{ padding: 0 }}>
                    <div style={{ overflow: 'auto', maxHeight: '400px' }}>
                      <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Task</th>
                            <th style={{ textAlign: 'left' }}>Start</th>
                            <th style={{ textAlign: 'left' }}>End</th>
                            <th style={{ textAlign: 'right' }}>Hours</th>
                            <th style={{ textAlign: 'left' }}>Assigned To</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(levelingResult.schedules)
                            .sort((a, b) => a.startDate.localeCompare(b.startDate))
                            .map((schedule) => (
                              <tr key={schedule.taskId}>
                                <td style={{ fontWeight: 500 }}>{schedule.name}</td>
                                <td>{schedule.startDate}</td>
                                <td>{schedule.endDate}</td>
                                <td style={{ textAlign: 'right' }}>{formatNumber(schedule.totalHours)}</td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {getResourceNames(schedule.assignedResources)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* No Data State */}
            {!levelingResult && !isLevelingRunning && (
              <div className="chart-card">
                <div className="chart-card-body" style={{ padding: '3rem', textAlign: 'center' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.5 }}>
                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
                  <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    {data.tasks?.length ? 'Click "Run Leveling" to optimize your schedule' : 'No task data available'}
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {data.tasks?.length 
                      ? 'Adjust the configuration options above, then run the leveling algorithm to see results.'
                      : 'Upload an MPP file with tasks to use resource leveling.'}
                  </p>
        </div>
        </div>
            )}
                      </div>
        )}
      </div>
    </div>
  );
}
