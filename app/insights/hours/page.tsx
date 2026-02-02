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

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';
import TaskHoursEfficiencyChart from '@/components/charts/TaskHoursEfficiencyChart';
import QualityHoursChart from '@/components/charts/QualityHoursChart';
import NonExecutePieChart from '@/components/charts/NonExecutePieChart';
import LaborBreakdownChart from '@/components/charts/LaborBreakdownChart';
import HoursWaterfallChart from '@/components/charts/HoursWaterfallChart';
import ChartCard from '@/components/charts/ChartCard';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import TableCompareExport from '@/components/ui/TableCompareExport';
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
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const [stackedView, setStackedView] = useState<StackedViewType>('chargeCode');
  const [workerTableSort, setWorkerTableSort] = useState<SortState | null>(null);
  const [roleTableSort, setRoleTableSort] = useState<SortState | null>(null);

  const selectedEmployees = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'employee').map((f) => f.value)), [pageFilters]);
  const selectedRoles = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'role').map((f) => f.value)), [pageFilters]);
  const selectedChargeCodes = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'chargeCode').map((f) => f.value)), [pageFilters]);
  const selectedProjects = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'project').map((f) => f.value)), [pageFilters]);
  const chargeType = useMemo((): 'all' | 'billable' | 'non-billable' => {
    const chip = pageFilters.find((f) => f.dimension === 'chargeType');
    return (chip?.value === 'billable' || chip?.value === 'non-billable') ? chip.value : 'all';
  }, [pageFilters]);
  const activeFilters = useMemo(() => pageFilters.map((f) => f.value), [pageFilters]);

  // Calculate overall efficiency - no hardcoded fallback
  const overallEfficiency = useMemo(() => {
    if (!data?.taskHoursEfficiency?.actualWorked?.length) return null;
    const totalActual = data.taskHoursEfficiency.actualWorked.reduce((a, b) => a + b, 0) || 0;
    const totalEstimated = data.taskHoursEfficiency.estimatedAdded?.reduce((a, b) => a + b, 0) || 0;
    const total = totalActual + totalEstimated;
    return total > 0 ? Math.round((totalActual / total) * 100) : null;
  }, [data?.taskHoursEfficiency]);

  // Calculate quality hours percentage - from buildQualityHours qcPercentOverall or fallback
  const qualityHoursPercent = useMemo(() => {
    const qh = data?.qualityHours as { qcPercentOverall?: number; data?: number[][]; tasks?: string[] } | undefined;
    if (qh?.qcPercentOverall != null) return qh.qcPercentOverall;
    if (!qh?.data?.length) return null;
    const total = qh.data.reduce((sum, row) => sum + (Array.isArray(row) ? row.reduce((s, v) => s + v, 0) : 0), 0);
    return total > 0 ? Math.round(((qh.data.reduce((s, row) => s + (row?.[1] ?? row?.[0] ?? 0), 0) / total) * 100)) : null;
  }, [data?.qualityHours]);

  // Calculate non-execute percentage - no hardcoded fallback
  const nonExecutePercent = useMemo(() => {
    if (!data?.nonExecuteHours?.percent && data?.nonExecuteHours?.percent !== 0) return null;
    return data.nonExecuteHours.percent;
  }, [data?.nonExecuteHours]);

  const handleBarClick = useCallback((params: { name: string; dataIndex: number; value?: number }) => {
    const dimension = stackedView === 'chargeCode' ? 'chargeCode' : stackedView === 'project' ? 'project' : 'role';
    setPageFilters((prev) => {
      const exists = prev.some((f) => f.dimension === dimension && f.value === params.name);
      if (exists) return prev.filter((f) => !(f.dimension === dimension && f.value === params.name));
      return [...prev, { dimension, value: params.name, label: params.name }];
    });
  }, [stackedView]);

  const clearFilters = useCallback(() => setPageFilters([]), []);

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
  
  const handleRemoveFilter = useCallback((dimension: string, value: string) => {
    setPageFilters((prev) => prev.filter((f) => !(f.dimension === dimension && f.value === value)));
  }, []);

  // Prepare labor breakdown chart data - use filtered workers so clicks apply page-wide
  const laborByChargeCode = useMemo(() => {
    const workers = filteredLaborBreakdown;
    const hasValidData = workers.length > 0 &&
                         data?.laborBreakdown?.weeks &&
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }
    
    const allChargeCodes = [...new Set(
      workers
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
      workers
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
  }, [filteredLaborBreakdown, data?.laborBreakdown?.weeks]);

  const laborByProject = useMemo(() => {
    const byPhase = data?.laborBreakdown?.byPhase || [];
    const hasValidData = byPhase.length > 0 &&
                         data?.laborBreakdown?.weeks &&
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }

    const filteredPhase = selectedProjects.size > 0
      ? byPhase.filter((p) => selectedProjects.has(p.project))
      : byPhase;
    
    const allProjects = [...new Set(
      filteredPhase
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
      filteredPhase
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
  }, [data?.laborBreakdown, selectedProjects]);

  const laborByRole = useMemo(() => {
    const workers = filteredLaborBreakdown;
    const hasValidData = workers.length > 0 &&
                         data?.laborBreakdown?.weeks &&
                         data.laborBreakdown.weeks.length > 0;
    
    if (!hasValidData) {
      return { months: [], dataByCategory: {} };
    }
    
    const allRoles = [...new Set(
      workers
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
      workers
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
  }, [filteredLaborBreakdown, data?.laborBreakdown?.weeks]);

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

  // Flatten table data for Compare modal and Excel export (proper columns)
  const flattenedWorkerData = useMemo(() => {
    return sortedLaborBreakdown.map((w) => {
      const row: Record<string, string | number> = { name: w.name, role: w.role, project: w.project };
      tableWeeks.forEach((week, i) => {
        row[formatWeekLabel(week)] = typeof (w.data || [])[i] === 'number' ? Number((w.data || [])[i].toFixed(1)) : 0;
      });
      row.Total = typeof w.total === 'number' ? Number(w.total.toFixed(1)) : 0;
      return row;
    });
  }, [sortedLaborBreakdown, tableWeeks]);

  const flattenedRoleData = useMemo(() => {
    return sortedRoleRows.map((r) => {
      const row: Record<string, string | number> = { role: r.role, Employees: r.employeeCount };
      tableWeeks.forEach((week, i) => {
        row[formatWeekLabel(week)] = typeof r.weeklyTotals[i] === 'number' ? Number(r.weeklyTotals[i].toFixed(1)) : 0;
      });
      row.Total = typeof r.total === 'number' ? Number(r.total.toFixed(1)) : 0;
      return row;
    });
  }, [sortedRoleRows, tableWeeks]);

  return (
    <div className="page-panel insights-page" style={{ height: 'calc(100vh - 100px)', overflow: 'auto', paddingBottom: '3rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Hours & Labor Analysis</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Labor distribution, efficiency, and variance
          </p>
        </div>
        
        {/* Filter Bar - Power BI style */}
        <div style={{ marginBottom: '1.5rem' }}>
          <InsightsFilterBar
            filters={pageFilters}
            onRemove={handleRemoveFilter}
            onClearAll={clearFilters}
            emptyMessage="Click any chart segment to filter the page"
          />
        </div>
      </div>

      {/* Metrics row - key numbers at a glance */}
      <div className="metrics-row-compact" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="metric-card" style={{ minWidth: 120 }}>
          <div className="metric-label">Total Hours</div>
          <div className="metric-value">
            {data?.taskHoursEfficiency?.actualWorked?.length
              ? data.taskHoursEfficiency.actualWorked.reduce((a: number, b: number) => a + b, 0).toLocaleString()
              : '—'}
          </div>
        </div>
        <div className="metric-card accent-lime" style={{ minWidth: 120 }}>
          <div className="metric-label">Efficiency</div>
          <div className="metric-value">{overallEfficiency !== null ? `${overallEfficiency}%` : '—'}</div>
        </div>
        <div className="metric-card" style={{ minWidth: 120 }}>
          <div className="metric-label">Quality Hours</div>
          <div className="metric-value">{qualityHoursPercent !== null ? `${qualityHoursPercent}%` : '—'}</div>
        </div>
        <div className="metric-card accent-orange" style={{ minWidth: 120 }}>
          <div className="metric-label">Non-Execute</div>
          <div className="metric-value">{nonExecutePercent !== null ? `${nonExecutePercent}%` : '—'}</div>
        </div>
      </div>

      {/* Row 1: Task Efficiency (Full Width) */}
      <div className="dashboard-grid">
      <ChartCard gridClass="grid-full" style={{ marginBottom: '1rem' }} title={
        <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
            <path d="M12 20V10M18 20V4M6 20v-4"></path>
          </svg>
          Task Hours Efficiency
          {overallEfficiency !== null && <strong style={{ marginLeft: '8px', color: 'var(--pinnacle-teal)' }}>{overallEfficiency}%</strong>}
        </h3>
      }>
        <div style={{ padding: '16px', flex: 1, minHeight: 380, overflow: 'auto' }}>
          <TaskHoursEfficiencyChart
            data={data?.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
            height={380}
            onBarClick={handleBarClick}
            activeFilters={activeFilters}
          />
        </div>
      </ChartCard>

      {/* Row 2: Quality Hours + Non-Execute (2-col, no empty space) */}
        <ChartCard gridClass="grid-half" title={
          <EnhancedTooltip
            placement="right"
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
        }>
          <div style={{ padding: '16px', minHeight: 340, overflow: 'auto' }}>
            <QualityHoursChart
              data={data?.qualityHours || { tasks: [], categories: [], data: [], qcPercent: [], poorQualityPercent: [], project: [] }}
              height={320}
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </ChartCard>
        <ChartCard gridClass="grid-half" title={
          <EnhancedTooltip
            placement="right"
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
        }>
          <div style={{ display: 'flex', gap: '1rem', padding: '1rem', minHeight: 320 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>TPW Comparison</div>
              <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
                <NonExecutePieChart 
                  data={data?.nonExecuteHours?.tpwComparison || []} 
                  height={300}
                  showLabels={true}
                  visualId="non-execute-tpw"
                />
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>Other Breakdown</div>
              <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
                <NonExecutePieChart 
                  data={data?.nonExecuteHours?.otherBreakdown || []} 
                  height={300}
                  showLabels={true}
                  visualId="non-execute-other"
                />
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Hours Variance Waterfall - Full Width */}
      <div className="dashboard-grid">
      <ChartCard gridClass="grid-full" style={{ marginBottom: '1rem' }} title={
        <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
            <rect x="4" y="14" width="4" height="6" rx="1"></rect>
            <rect x="10" y="8" width="4" height="12" rx="1"></rect>
            <rect x="16" y="4" width="4" height="16" rx="1"></rect>
          </svg>
          Hours Variance Waterfall
        </h3>
      }>
        <div style={{ padding: '16px', minHeight: 400 }}>
          <HoursWaterfallChart
            data={data?.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] }}
            height={380}
          />
        </div>
      </ChartCard>

      {/* Labor Hours Distribution */}
      <ChartCard
        gridClass="grid-full"
        style={{ marginBottom: '1rem' }}
        title={
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1"></rect>
              <rect x="14" y="8" width="7" height="13" rx="1"></rect>
            </svg>
            Labor Hours Distribution
          </h3>
        }
        subtitle={
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
        }
      >
        <div style={{ padding: '16px', minHeight: 400, overflow: 'auto' }}>
          <LaborBreakdownChart
            months={currentStackedData.months}
            dataByCategory={currentStackedData.dataByCategory}
            height={380}
            onBarClick={handleBarClick}
            activeFilters={activeFilters}
          />
        </div>
      </ChartCard>
      </div>

      <div className="dashboard-grid">
      {/* Labor Breakdown by Worker */}
      <ChartCard
        gridClass="grid-full"
        noPadding
        style={{ marginBottom: '1rem' }}
        title={
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
        }
        subtitle={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === 'clear') {
                  setPageFilters((prev) => prev.filter((f) => f.dimension !== 'employee'));
                } else if (e.target.value) {
                  const val = e.target.value;
                  setPageFilters((prev) => {
                    const exists = prev.some((f) => f.dimension === 'employee' && f.value === val);
                    if (exists) return prev.filter((f) => !(f.dimension === 'employee' && f.value === val));
                    return [...prev, { dimension: 'employee', value: val, label: val }];
                  });
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
                onClick={() => setPageFilters((prev) => prev.filter((f) => f.dimension !== 'employee'))}
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
        }
      >
        <TableCompareExport
          visualId="labor-by-worker"
          visualTitle="Labor Breakdown by Worker"
          data={flattenedWorkerData}
        >
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
          </TableCompareExport>
      </ChartCard>
      {/* Labor Breakdown by Role */}
      <ChartCard
        gridClass="grid-full"
        noPadding
        style={{ marginBottom: '1rem' }}
        title={
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Labor Breakdown by Role
          </h3>
        }
      >
        <TableCompareExport
          visualId="labor-by-role"
          visualTitle="Labor Breakdown by Role"
          data={flattenedRoleData}
        >
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
          </TableCompareExport>
      </ChartCard>
      </div>
    </div>
  );
}
