'use client';

/**
 * @fileoverview Hours & Labor Analysis Page for PPC V3 Insights.
 * 
 * Enhanced labor analytics with:
 * - Combined stacked bar chart with view switching (By Charge Code, By Project, By Role)
 * - Expanded Hours Variance Waterfall with non-overlapping filters
 * - Task hours efficiency chart (actual vs estimated)
 * - Quality hours breakdown (productive, rework, idle)
 * - Non-execute hours pie chart (overhead analysis)
 * - Interactive filtering and cross-chart highlighting
 * 
 * @module app/insights/hours/page
 */

import React, { useState, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import TaskHoursEfficiencyChart from '@/components/charts/TaskHoursEfficiencyChart';
import QualityHoursChart from '@/components/charts/QualityHoursChart';
import NonExecutePieChart from '@/components/charts/NonExecutePieChart';
import LaborBreakdownChart from '@/components/charts/LaborBreakdownChart';
import HoursWaterfallChart from '@/components/charts/HoursWaterfallChart';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import CompareButton from '@/components/ui/CompareButton';
import SnapshotComparisonModal from '@/components/ui/SnapshotComparisonModal';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

/** View type for the combined stacked bar chart */
type StackedViewType = 'chargeCode' | 'project' | 'role';

/**
 * Format week date to readable label
 */
function formatWeekLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function HoursPage() {
  const { filteredData } = useData();
  const data = filteredData;
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedChargeCodes, setSelectedChargeCodes] = useState<Set<string>>(new Set());
  const [chargeType, setChargeType] = useState<'all' | 'billable' | 'non-billable'>('all');
  const [stackedView, setStackedView] = useState<StackedViewType>('chargeCode');
  const [workerTableSort, setWorkerTableSort] = useState<SortState | null>(null);
  const [roleTableSort, setRoleTableSort] = useState<SortState | null>(null);
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    visualId: string;
    visualTitle: string;
    visualType: 'chart' | 'table';
    currentData: any;
  } | null>(null);

  // Calculate overall efficiency - no hardcoded fallback
  const overallEfficiency = useMemo(() => {
    if (!data?.taskHoursEfficiency?.actualWorked?.length) return null;
    const totalActual = data.taskHoursEfficiency.actualWorked.reduce((a, b) => a + b, 0) || 0;
    const totalEstimated = data.taskHoursEfficiency.estimatedAdded?.reduce((a, b) => a + b, 0) || 0;
    const total = totalActual + totalEstimated;
    return total > 0 ? Math.round((totalActual / total) * 100) : null;
  }, [data?.taskHoursEfficiency]);

  // Calculate quality hours percentage - no hardcoded fallback
  const qualityHoursPercent = useMemo(() => {
    if (!data?.qualityHours?.data?.length) return null;
    const total = data.qualityHours.data.reduce((sum, row) => {
      return sum + row.reduce((rowSum, val) => rowSum + val, 0);
    }, 0);
    const qcTotal = data.qualityHours.data.reduce((sum, row) => {
      return sum + (row[1] || 0);
    }, 0);
    return total > 0 ? Math.round((qcTotal / total) * 100) : null;
  }, [data?.qualityHours]);

  // Calculate non-execute percentage - no hardcoded fallback
  const nonExecutePercent = useMemo(() => {
    if (!data?.nonExecuteHours?.percent && data?.nonExecuteHours?.percent !== 0) return null;
    return data.nonExecuteHours.percent;
  }, [data?.nonExecuteHours]);

  // Handle chart bar clicks for filtering
  const handleBarClick = (params: { name: string; dataIndex: number; value?: number }) => {
    setActiveFilters((prev) => {
      if (prev.includes(params.name)) {
        return prev.filter((f) => f !== params.name);
      }
      return [...prev, params.name];
    });
  };

  const clearFilters = () => {
    setActiveFilters([]);
    setSelectedEmployees(new Set());
    setSelectedRoles(new Set());
    setSelectedChargeCodes(new Set());
    setChargeType('all');
  };

  // Get unique employees from labor breakdown
  const employees = useMemo(() => {
    if (!data?.laborBreakdown?.byWorker || data.laborBreakdown.byWorker.length === 0) {
      return [];
    }
    return [...new Set(data.laborBreakdown.byWorker.map((w) => w.name).filter(Boolean))].sort();
  }, [data?.laborBreakdown]);

  // Get unique roles from labor breakdown
  const roles = useMemo(() => {
    if (!data?.laborBreakdown?.byWorker || data.laborBreakdown.byWorker.length === 0) {
      return [];
    }
    return [...new Set(data.laborBreakdown.byWorker.map((w) => w.role).filter(Boolean))].sort();
  }, [data?.laborBreakdown]);

  // Get unique charge codes from labor breakdown
  const chargeCodes = useMemo(() => {
    if (!data?.laborBreakdown?.byWorker || data.laborBreakdown.byWorker.length === 0) {
      return [];
    }
    return [...new Set(data.laborBreakdown.byWorker.map((w) => w.chargeCode).filter(Boolean))].sort();
  }, [data?.laborBreakdown]);

  // Filter labor breakdown by all selected filters
  const filteredLaborBreakdown = useMemo(() => {
    if (!data?.laborBreakdown?.byWorker) return [];
    
    return data.laborBreakdown.byWorker.filter((w) => {
      // Filter by employee
      if (selectedEmployees.size > 0 && !selectedEmployees.has(w.name)) return false;
      // Filter by role
      if (selectedRoles.size > 0 && !selectedRoles.has(w.role)) return false;
      // Filter by charge code
      if (selectedChargeCodes.size > 0 && !selectedChargeCodes.has(w.chargeCode)) return false;
      // Filter by charge type
      if (chargeType === 'billable' && w.chargeCode !== 'BILLABLE' && w.chargeCode !== 'EX') return false;
      if (chargeType === 'non-billable' && (w.chargeCode === 'BILLABLE' || w.chargeCode === 'EX')) return false;
      return true;
    });
  }, [data?.laborBreakdown, selectedEmployees, selectedRoles, selectedChargeCodes, chargeType]);
  
  // Count active filters
  const activeFilterCount = selectedEmployees.size + selectedRoles.size + selectedChargeCodes.size + (chargeType !== 'all' ? 1 : 0);

  // Prepare labor breakdown chart data - empty state when no data
  const laborByChargeCode = useMemo(() => {
    // Check if we have valid data
    const hasValidData = data?.laborBreakdown?.byWorker && 
                         data.laborBreakdown.byWorker.length > 0 &&
                         data.laborBreakdown.weeks && 
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }
    
    // Get all unique charge codes that have data
    const allChargeCodes = [...new Set(
      data.laborBreakdown.byWorker
        .map((w) => w.chargeCode)
        .filter((code): code is string => !!code && code.length > 0)
    )];
    
    const weeks = data.laborBreakdown.weeks;
    const months = weeks.map(formatWeekLabel);

    const dataByCategory: Record<string, number[]> = {};
    
    if (allChargeCodes.length === 0) {
      return { months, dataByCategory: {} };
    }
    
    allChargeCodes.forEach((code) => {
      dataByCategory[code] = new Array(months.length).fill(0);
      data.laborBreakdown.byWorker
        .filter((w) => w.chargeCode === code)
        .forEach((worker) => {
          if (worker.data && Array.isArray(worker.data)) {
            worker.data.forEach((val, idx) => {
              if (idx < dataByCategory[code].length) {
                dataByCategory[code][idx] += typeof val === 'number' ? val : 0;
              }
            });
          }
        });
    });

    return { months, dataByCategory };
  }, [data?.laborBreakdown]);

  const laborByProject = useMemo(() => {
    // Check if we have valid data
    const hasValidData = data?.laborBreakdown?.byPhase && 
                         data.laborBreakdown.byPhase.length > 0 &&
                         data.laborBreakdown.weeks && 
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }
    
    const allProjects = [...new Set(
      data.laborBreakdown.byPhase
        .map((p) => p.project)
        .filter((proj): proj is string => !!proj && proj.length > 0)
    )];
    
    const weeks = data.laborBreakdown.weeks;
    const months = weeks.map(formatWeekLabel);

    const dataByCategory: Record<string, number[]> = {};
    
    if (allProjects.length === 0) {
      return { months, dataByCategory: {} };
    }
    
    allProjects.forEach((project) => {
      dataByCategory[project] = new Array(months.length).fill(0);
      data.laborBreakdown.byPhase
        .filter((p) => p.project === project)
        .forEach((phase) => {
          if (phase.data && Array.isArray(phase.data)) {
            phase.data.forEach((val, idx) => {
              if (idx < dataByCategory[project].length) {
                dataByCategory[project][idx] += typeof val === 'number' ? val : 0;
              }
            });
          }
        });
    });

    return { months, dataByCategory };
  }, [data?.laborBreakdown]);

  const laborByRole = useMemo(() => {
    // Check if we have valid data
    const hasValidData = data?.laborBreakdown?.byWorker && 
                         data.laborBreakdown.byWorker.length > 0 &&
                         data.laborBreakdown.weeks && 
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }
    
    const allRoles = [...new Set(
      data.laborBreakdown.byWorker
        .map((w) => w.role)
        .filter((role): role is string => !!role && role.length > 0)
    )];
    
    const weeks = data.laborBreakdown.weeks;
    const months = weeks.map(formatWeekLabel);

    const dataByCategory: Record<string, number[]> = {};
    
    if (allRoles.length === 0) {
      return { months, dataByCategory: {} };
    }
    
    allRoles.forEach((role) => {
      dataByCategory[role] = new Array(months.length).fill(0);
      data.laborBreakdown.byWorker
        .filter((w) => w.role === role)
        .forEach((worker) => {
          if (worker.data && Array.isArray(worker.data)) {
            worker.data.forEach((val, idx) => {
              if (idx < dataByCategory[role].length) {
                dataByCategory[role][idx] += typeof val === 'number' ? val : 0;
              }
            });
          }
        });
    });

    return { months, dataByCategory };
  }, [data?.laborBreakdown]);

  // Get current stacked chart data based on view
  const currentStackedData = useMemo(() => {
    switch (stackedView) {
      case 'chargeCode': return laborByChargeCode;
      case 'project': return laborByProject;
      case 'role': return laborByRole;
    }
  }, [stackedView, laborByChargeCode, laborByProject, laborByRole]);

  // View labels for the toggle
  const stackedViewLabels: { key: StackedViewType; label: string }[] = [
    { key: 'chargeCode', label: 'By Charge Code' },
    { key: 'project', label: 'By Project' },
    { key: 'role', label: 'By Role' }
  ];

  // Get weeks for table header
  const tableWeeks = useMemo(() => {
    if (!data?.laborBreakdown?.weeks || data.laborBreakdown.weeks.length === 0) {
      return [];
    }
    return data.laborBreakdown.weeks;
  }, [data?.laborBreakdown]);

  const sortedLaborBreakdown = useMemo(() => {
    return sortByState(filteredLaborBreakdown, workerTableSort, (worker, key) => {
      if (key.startsWith('week-')) {
        const weekIdx = Number(key.replace('week-', ''));
        return typeof worker.data?.[weekIdx] === 'number' ? worker.data[weekIdx] : 0;
      }
      switch (key) {
        case 'name':
          return worker.name;
        case 'role':
          return worker.role;
        case 'project':
          return worker.project;
        case 'total':
          return worker.total;
        default:
          return null;
      }
    });
  }, [filteredLaborBreakdown, workerTableSort]);

  const roleRows = useMemo(() => {
    return roles.map((role) => {
      const roleWorkers = data?.laborBreakdown?.byWorker?.filter((w) => w.role === role) || [];
      const employeeCount = new Set(roleWorkers.map(w => w.name)).size;
      const weeklyTotals = tableWeeks.map((_, weekIdx) => {
        return roleWorkers.reduce((sum, w) => sum + ((w.data || [])[weekIdx] || 0), 0);
      });
      const total = weeklyTotals.reduce((sum, h) => sum + h, 0);
      return { role, employeeCount, weeklyTotals, total };
    });
  }, [roles, data?.laborBreakdown, tableWeeks]);

  const sortedRoleRows = useMemo(() => {
    return sortByState(roleRows, roleTableSort, (row, key) => {
      if (key.startsWith('week-')) {
        const weekIdx = Number(key.replace('week-', ''));
        return row.weeklyTotals[weekIdx] ?? 0;
      }
      switch (key) {
        case 'role':
          return row.role;
        case 'employeeCount':
          return row.employeeCount;
        case 'total':
          return row.total;
        default:
          return null;
      }
    });
  }, [roleRows, roleTableSort]);

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 100px)', overflow: 'auto' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Hours & Labor Analysis</h1>
        </div>
        
        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Charge Type Filter */}
          <select
            value={chargeType}
            onChange={(e) => setChargeType(e.target.value as 'all' | 'billable' | 'non-billable')}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Charge Types</option>
            <option value="billable">Billable Only</option>
            <option value="non-billable">Non-Billable Only</option>
          </select>
          
          {/* Role Filter Dropdown */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                const newSet = new Set(selectedRoles);
                if (newSet.has(e.target.value)) {
                  newSet.delete(e.target.value);
                } else {
                  newSet.add(e.target.value);
                }
                setSelectedRoles(newSet);
                e.target.value = '';
              }
            }}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="">Filter by Role {selectedRoles.size > 0 ? `(${selectedRoles.size})` : ''}</option>
            {roles.map(role => (
              <option key={role} value={role}>{selectedRoles.has(role) ? '✓ ' : ''}{role}</option>
            ))}
          </select>
          
          {/* Charge Code Filter Dropdown */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                const newSet = new Set(selectedChargeCodes);
                if (newSet.has(e.target.value)) {
                  newSet.delete(e.target.value);
                } else {
                  newSet.add(e.target.value);
                }
                setSelectedChargeCodes(newSet);
                e.target.value = '';
              }
            }}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="">Filter by Charge Code {selectedChargeCodes.size > 0 ? `(${selectedChargeCodes.size})` : ''}</option>
            {chargeCodes.map(code => (
              <option key={code} value={code}>{selectedChargeCodes.has(code) ? '✓ ' : ''}{code}</option>
            ))}
          </select>
          
          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--pinnacle-teal)',
                color: '#000',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Clear Filters ({activeFilterCount}) ✕
            </button>
          )}
        </div>
      </div>

      {/* Row 1: Task Efficiency (Full Width - Expanded) */}
      <div className="chart-card" style={{ marginBottom: '1rem', minHeight: '700px' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '12px 16px' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M12 20V10M18 20V4M6 20v-4"></path>
            </svg>
            Task Hours Efficiency
            {overallEfficiency !== null && <strong style={{ marginLeft: '8px', color: 'var(--pinnacle-teal)' }}>{overallEfficiency}%</strong>}
          </h3>
          <CompareButton
            onClick={() => {
              // Build the ECharts option from TaskHoursEfficiencyChart data
              const taskData = data?.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] };
              const validTasks = taskData.tasks?.filter((t: string, i: number) => 
                (taskData.actualWorked?.[i] > 0 || taskData.estimatedAdded?.[i] > 0)
              ) || [];
              
              const chartOption: EChartsOption = {
                backgroundColor: 'transparent',
                animation: true,
                animationDuration: 500,
                tooltip: {
                  trigger: 'axis',
                  axisPointer: { type: 'shadow' },
                },
                legend: {
                  bottom: 10,
                  textStyle: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
                },
                grid: { 
                  left: 220,
                  right: 90,
                  top: 20, 
                  bottom: 50,
                },
                xAxis: {
                  type: 'value',
                  axisLine: { show: false },
                  axisLabel: { 
                    color: 'rgba(255,255,255,0.6)', 
                    fontSize: 10,
                  },
                  splitLine: { 
                    lineStyle: { 
                      color: 'rgba(255,255,255,0.06)', 
                      type: 'dashed' 
                    } 
                  },
                },
                yAxis: {
                  type: 'category',
                  data: validTasks,
                  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                  axisLabel: {
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: 11,
                    fontWeight: 500,
                    width: 200,
                    overflow: 'truncate',
                  },
                },
                series: [
                  {
                    name: 'Actual Worked',
                    type: 'bar',
                    stack: 'total',
                    data: validTasks.map((t: string, i: number) => {
                      const idx = taskData.tasks?.indexOf(t) ?? i;
                      return taskData.actualWorked?.[idx] || 0;
                    }),
                    itemStyle: { color: '#40E0D0' },
                    barWidth: 24,
                  },
                  {
                    name: 'Remaining Budget',
                    type: 'bar',
                    stack: 'total',
                    data: validTasks.map((t: string, i: number) => {
                      const idx = taskData.tasks?.indexOf(t) ?? i;
                      return taskData.estimatedAdded?.[idx] || 0;
                    }),
                    itemStyle: { color: '#10B981' },
                    barWidth: 24,
                  },
                ],
              };
              
              setComparisonModal({
                isOpen: true,
                visualId: 'task-hours-efficiency-chart',
                visualTitle: 'Task Hours Efficiency',
                visualType: 'chart',
                currentData: chartOption,
              });
            }}
          />
        </div>
        <div style={{ padding: '16px', height: '620px' }}>
          <TaskHoursEfficiencyChart
            data={data?.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
            height="100%"
            onBarClick={handleBarClick}
            activeFilters={activeFilters}
          />
        </div>
      </div>

      {/* Row 2: Quality Hours + Non-Execute */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Quality Hours */}
        <div className="chart-card">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <EnhancedTooltip
              content={{
                title: 'Quality Hours by Charge Code',
                description: 'Breakdown of quality control hours by charge code, showing productive, rework, and idle time.',
                calculation: 'Quality Hours % = (QC Hours / Total Hours) × 100\n\nWhere:\n- QC Hours = Hours logged with QC-related charge codes\n- Total Hours = Sum of all hours in the period',
                details: [
                  'Shows distribution of quality hours across charge codes',
                  'Higher percentages indicate more time spent on quality activities',
                  'Includes productive, rework, and idle QC hours',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, cursor: 'help' }}>
                Quality Hours by Charge Code {qualityHoursPercent !== null && <strong style={{ marginLeft: '8px', color: 'var(--pinnacle-teal)' }}>{qualityHoursPercent}%</strong>}
              </h3>
            </EnhancedTooltip>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'quality-hours-chart',
                  visualTitle: 'Quality Hours by Charge Code',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div style={{ padding: '16px', height: '300px' }}>
            <QualityHoursChart
              data={data?.qualityHours || { tasks: [], categories: [], data: [], qcPercent: [], poorQualityPercent: [], project: [] }}
              height="100%"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        {/* Non-Execute Hours */}
        <div className="chart-card">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <EnhancedTooltip
              content={{
                title: 'Non-Execute Hours',
                description: 'Hours spent on non-execution activities such as overhead, TPW (The Pinnacle Way), and other indirect work.',
                calculation: 'Non-Execute % = (Non-Execute Hours / Total Hours) × 100\n\nWhere:\n- Non-Execute Hours = Hours with overhead/TPW charge codes\n- Total Hours = Sum of all logged hours',
                details: [
                  'Includes overhead project hours',
                  'TPW (The Pinnacle Way) methodology hours',
                  'Other indirect/non-billable activities',
                  'Lower percentages indicate more time on direct execution',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, cursor: 'help' }}>
                Non-Execute Hours {nonExecutePercent !== null && <strong style={{ marginLeft: '8px', color: '#F59E0B' }}>{nonExecutePercent}%</strong>}
              </h3>
            </EnhancedTooltip>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'non-execute-hours-chart',
                  visualTitle: 'Non-Execute Hours',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', padding: '1rem', height: '300px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>TPW Comparison</div>
              <NonExecutePieChart 
                data={data?.nonExecuteHours?.tpwComparison || []} 
                height="220px" 
                showLabels={true} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>Other Breakdown</div>
              <NonExecutePieChart 
                data={data?.nonExecuteHours?.otherBreakdown || []} 
                height="220px" 
                showLabels={true} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Hours Variance Waterfall - Full Width Expanded */}
      <div className="chart-card" style={{ marginBottom: '1rem', minHeight: '550px' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '12px 16px' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="4" y="14" width="4" height="6" rx="1"></rect>
              <rect x="10" y="8" width="4" height="12" rx="1"></rect>
              <rect x="16" y="4" width="4" height="16" rx="1"></rect>
            </svg>
            Hours Variance Waterfall
          </h3>
          <CompareButton
            onClick={() => {
              setComparisonModal({
                isOpen: true,
                visualId: 'hours-variance-waterfall-chart',
                visualTitle: 'Hours Variance Waterfall',
                visualType: 'chart',
                currentData: null,
              });
            }}
          />
        </div>
        <div style={{ padding: '16px', height: '470px' }}>
          <HoursWaterfallChart
            data={data?.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
            height="450px"
          />
        </div>
      </div>

      {/* Row 3: Combined Stacked Bar Chart - Full Width */}
      <div className="chart-card" style={{ marginBottom: '1rem', minHeight: '500px' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '12px 16px' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1"></rect>
              <rect x="14" y="8" width="7" height="13" rx="1"></rect>
            </svg>
            Labor Hours Distribution
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* View Toggle */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
            {stackedViewLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStackedView(key)}
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: stackedView === key ? 'var(--pinnacle-teal)' : 'transparent',
                  color: stackedView === key ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {label}
              </button>
            ))}
            </div>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'labor-hours-distribution-chart',
                  visualTitle: 'Labor Hours Distribution',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
        </div>
        <div style={{ padding: '16px', height: '420px' }}>
          <LaborBreakdownChart
            months={currentStackedData.months}
            dataByCategory={currentStackedData.dataByCategory}
            height="400px"
            onBarClick={handleBarClick}
            activeFilters={activeFilters}
          />
        </div>
      </div>

      {/* Row 4: Labor Breakdown by Worker - Full Width */}
      <div className="chart-card" style={{ marginBottom: '1rem', minHeight: '600px' }}>
        <div className="chart-card-header" style={{ 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '12px 16px'
        }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            Labor Breakdown by Worker
            {selectedEmployees.size > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--pinnacle-teal)', marginLeft: '8px' }}>
                ({selectedEmployees.size} selected)
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'labor-breakdown-worker-table',
                  visualTitle: 'Labor Breakdown by Worker',
                  visualType: 'table',
                  currentData: sortedLaborBreakdown,
                });
              }}
            />
            {/* Employee Filter Dropdown in Header */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === 'clear') {
                  setSelectedEmployees(new Set());
                } else if (e.target.value) {
                  const newSet = new Set(selectedEmployees);
                  if (newSet.has(e.target.value)) {
                    newSet.delete(e.target.value);
                  } else {
                    newSet.add(e.target.value);
                  }
                  setSelectedEmployees(newSet);
                  e.target.value = '';
                }
              }}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                minWidth: '180px'
              }}
            >
              <option value="">Filter by Employee {selectedEmployees.size > 0 ? `(${selectedEmployees.size})` : ''}</option>
              <option value="clear">— Clear All —</option>
              {employees.map(emp => (
                <option key={emp} value={emp}>{selectedEmployees.has(emp) ? '✓ ' : ''}{emp}</option>
              ))}
            </select>
            {selectedEmployees.size > 0 && (
              <button
                onClick={() => setSelectedEmployees(new Set())}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--pinnacle-teal)',
                  color: '#000',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clear ({selectedEmployees.size}) ✕
              </button>
            )}
          </div>
        </div>
        <div className="chart-card-body no-padding" style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
          <table className="data-table" id="table-labor-worker" style={{ fontSize: '0.75rem' }}>
            <thead>
              <tr>
                {[
                  { key: 'name', label: 'Worker', sticky: true },
                  { key: 'role', label: 'Role' },
                  { key: 'project', label: 'Project' },
                ].map(({ key, label, sticky }) => {
                  const indicator = formatSortIndicator(workerTableSort, key);
                  return (
                    <th
                      key={key}
                      style={{
                        position: 'sticky',
                        left: sticky ? 0 : undefined,
                        top: 0,
                        background: 'var(--bg-secondary)',
                        zIndex: sticky ? 10 : 5,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setWorkerTableSort(prev => getNextSortState(prev, key))}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {label}
                        {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                      </button>
                    </th>
                  );
                })}
                {tableWeeks.map((week, idx) => (
                  <th key={idx} className="number" style={{ minWidth: '65px', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                    <button
                      type="button"
                      onClick={() => setWorkerTableSort(prev => getNextSortState(prev, `week-${idx}`))}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {formatWeekLabel(week)}
                      {formatSortIndicator(workerTableSort, `week-${idx}`) && (
                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                          {formatSortIndicator(workerTableSort, `week-${idx}`)}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="number" style={{ fontWeight: 700, position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                  <button
                    type="button"
                    onClick={() => setWorkerTableSort(prev => getNextSortState(prev, 'total'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Total
                    {formatSortIndicator(workerTableSort, 'total') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(workerTableSort, 'total')}
                      </span>
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLaborBreakdown.length > 0 ? (
                sortedLaborBreakdown.map((worker, idx) => (
                  <tr key={idx}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 5, fontWeight: 500 }}>{worker.name}</td>
                    <td>{worker.role}</td>
                    <td>{worker.project}</td>
                    {(worker.data || []).map((hours, weekIdx) => (
                      <td key={weekIdx} className="number" style={{ color: hours > 40 ? '#F59E0B' : 'inherit' }}>
                        {typeof hours === 'number' ? hours.toFixed(1) : '0.0'}
                      </td>
                    ))}
                    <td className="number" style={{ fontWeight: 600, color: 'var(--pinnacle-teal)' }}>
                      {typeof worker.total === 'number' ? worker.total.toFixed(1) : '0.0'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableWeeks.length + 4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No labor data available. Adjust filters or load timecard data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: Labor Breakdown by Role - Full Width */}
      <div className="chart-card" style={{ marginBottom: '1rem', minHeight: '400px' }}>
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Labor Breakdown by Role
          </h3>
          <CompareButton
            onClick={() => {
              setComparisonModal({
                isOpen: true,
                visualId: 'labor-breakdown-role-table',
                visualTitle: 'Labor Breakdown by Role',
                visualType: 'table',
                currentData: sortedRoleRows,
              });
            }}
          />
        </div>
        <div className="chart-card-body no-padding" style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
          <table className="data-table" id="table-labor-role" style={{ fontSize: '0.75rem' }}>
            <thead>
              <tr>
                {[
                  { key: 'role', label: 'Role', sticky: true },
                  { key: 'employeeCount', label: 'Employees' },
                ].map(({ key, label, sticky }) => {
                  const indicator = formatSortIndicator(roleTableSort, key);
                  return (
                    <th
                      key={key}
                      style={{
                        position: 'sticky',
                        left: sticky ? 0 : undefined,
                        top: 0,
                        background: 'var(--bg-secondary)',
                        zIndex: sticky ? 10 : 5,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setRoleTableSort(prev => getNextSortState(prev, key))}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {label}
                        {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                      </button>
                    </th>
                  );
                })}
                {tableWeeks.map((week, idx) => (
                  <th key={idx} className="number" style={{ minWidth: '65px', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                    <button
                      type="button"
                      onClick={() => setRoleTableSort(prev => getNextSortState(prev, `week-${idx}`))}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {formatWeekLabel(week)}
                      {formatSortIndicator(roleTableSort, `week-${idx}`) && (
                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                          {formatSortIndicator(roleTableSort, `week-${idx}`)}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="number" style={{ fontWeight: 700, position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                  <button
                    type="button"
                    onClick={() => setRoleTableSort(prev => getNextSortState(prev, 'total'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Total
                    {formatSortIndicator(roleTableSort, 'total') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(roleTableSort, 'total')}
                      </span>
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.length > 0 ? (
                sortedRoleRows.map((row, idx) => {
                  return (
                    <tr key={idx}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 5, fontWeight: 500 }}>{row.role}</td>
                      <td>{row.employeeCount}</td>
                      {row.weeklyTotals.map((hours, weekIdx) => (
                        <td key={weekIdx} className="number" style={{ color: hours > 160 ? '#F59E0B' : 'inherit' }}>
                          {hours.toFixed(1)}
                        </td>
                      ))}
                      <td className="number" style={{ fontWeight: 600, color: 'var(--pinnacle-teal)' }}>
                        {row.total.toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={tableWeeks.length + 3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No role data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snapshot Comparison Modal */}
      {comparisonModal && (
        <SnapshotComparisonModal
          isOpen={comparisonModal.isOpen}
          onClose={() => setComparisonModal(null)}
          visualId={comparisonModal.visualId}
          visualTitle={comparisonModal.visualTitle}
          visualType={comparisonModal.visualType}
          currentData={comparisonModal.currentData}
          onRenderChart={(container: HTMLDivElement, chartOption: EChartsOption) => {
            try {
              const chart = echarts.init(container, 'dark', {
                renderer: 'canvas',
              });
              chart.setOption(chartOption);
              return chart;
            } catch (error) {
              console.error('Error rendering chart:', error);
              return null;
            }
          }}
        />
      )}
    </div>
  );
}
