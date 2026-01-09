'use client';

/**
 * @fileoverview Data Context Provider for PPC V3 Application.
 * 
 * This context provides centralized data access for the entire application.
 * Data is automatically fetched from Supabase on app initialization.
 * All pages read from filteredData via the useData() hook.
 * 
 * Data Flow:
 * 1. App loads → DataProvider fetches all data from Supabase
 * 2. All pages access data via useData() hook
 * 3. Data Management page can edit/upload data and sync to Supabase
 * 4. updateData() refreshes the context with new data
 * 
 * @module lib/data-context
 */

import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import type { SampleData, HierarchyFilter, DateFilter } from '@/types/data';
import { isSupabaseConfigured, fetchAllData } from '@/lib/supabase';
import { transformData } from '@/lib/data-transforms';

// ============================================================================
// EMPTY DATA STRUCTURE
// ============================================================================

/**
 * Create empty SampleData structure
 * This is the initial state - all arrays empty, all computed views empty
 */
function createEmptyData(): SampleData {
  return {
    hierarchy: { portfolios: [] },
    sCurve: { dates: [], planned: [], actual: [] },
    budgetVariance: [],
    milestoneStatus: [],
    countMetricsAnalysis: [],
    projectsEfficiencyMetrics: [],
    taskHoursEfficiency: { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] },
    qualityHours: { tasks: [], categories: [], data: [], qcPercent: [], poorQualityPercent: [], project: [] },
    nonExecuteHours: { total: 0, fte: 0, percent: 0, tpwComparison: [], otherBreakdown: [] },
    employees: [],
    portfolios: [],
    customers: [],
    sites: [],
    units: [],
    projects: [],
    subprojects: [],
    phases: [],
    chargecodes: [],
    tasks: [],
    subTasks: [],
    qctasks: [],
    hours: [],
    milestonesTable: [],
    deliverables: [],
    deliverablesTracker: [],
    laborBreakdown: { weeks: [], byWorker: [], byPhase: [], byTask: [] },
    laborChartData: { months: [], byEmployee: {} },
    qcTransactionByGate: [],
    qcTransactionByProject: [],
    qcByGateStatus: [],
    qcByNameAndRole: [],
    qcBySubproject: [],
    milestoneStatusPie: [],
    planVsForecastVsActual: { dates: [], statusDate: 0, cumulativeActual: [], cumulativeForecasted: [], cumulativePlanned: [] },
    milestoneScoreboard: [],
    milestones: [],
    documentSignoffGauges: [],
    deliverableByStatus: { drd: [], workflow: [], sop: [], qmp: [] },
    resourceHeatmap: { resources: [], weeks: [], data: [] },
    resourceGantt: { items: [] },
    forecast: { months: [], baseline: [], actual: [], forecast: [] },
    wbsData: { items: [] },
    changeLog: [],
    projectHealth: [],
  };
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Shape of the Data Context.
 * Provides access to both raw and filtered data, plus filter controls.
 */
interface DataContextType {
  data: SampleData;
  filteredData: SampleData;
  isLoading: boolean;
  hierarchyFilter: HierarchyFilter | null;
  dateFilter: DateFilter | null;
  setHierarchyFilter: (filter: HierarchyFilter | null) => void;
  setDateFilter: (filter: DateFilter | null) => void;
  updateData: (updates: Partial<SampleData>) => void;
  resetData: () => void;
  refreshData: () => Promise<void>;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const DataContext = createContext<DataContextType | undefined>(undefined);

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access the Data Context.
 * Must be used within a DataProvider component.
 */
export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface DataProviderProps {
  children: ReactNode;
}

/**
 * Data Provider component that wraps the application.
 * Automatically fetches data from Supabase on initialization.
 */
export function DataProvider({ children }: DataProviderProps) {
  // State starts EMPTY - populated from Supabase on mount
  const [data, setData] = useState<SampleData>(createEmptyData);
  const [isLoading, setIsLoading] = useState(true);
  
  // State for active filters
  const [hierarchyFilter, setHierarchyFilter] = useState<HierarchyFilter | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);

  /**
   * Fetch data from Supabase on app initialization
   */
  useEffect(() => {
    const loadData = async () => {
      if (!isSupabaseConfigured()) {
        console.log('Supabase not configured - running in local mode');
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching data from Supabase...');
        const supabaseData = await fetchAllData();
        
        if (Object.keys(supabaseData).length > 0) {
          // Merge fetched data with empty structure
          const mergedData: Partial<SampleData> = {};
          for (const [key, value] of Object.entries(supabaseData)) {
            if (Array.isArray(value) && value.length > 0) {
              (mergedData as any)[key] = value;
            }
          }
          
          if (Object.keys(mergedData).length > 0) {
            // Apply transformations to build computed views (wbsData, laborBreakdown, etc.)
            const transformedData = transformData(mergedData);
            setData(prev => ({ ...prev, ...mergedData, ...transformedData }));
            console.log('Loaded and transformed data from Supabase:', Object.keys(mergedData).map(k => `${(mergedData as any)[k]?.length || 0} ${k}`).join(', '));
          }
        }
      } catch (err) {
        console.error('Error fetching data from Supabase:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * Update data - called by Data Management page after edits
   * Automatically applies transformations to build computed views
   */
  const updateData = (updates: Partial<SampleData>) => {
    setData((prev) => {
      const merged = { ...prev, ...updates };
      // Re-apply transformations when raw data changes
      const transformedData = transformData(merged);
      return { ...merged, ...transformedData };
    });
  };

  /**
   * Reset data to empty state
   */
  const resetData = () => {
    setData(createEmptyData());
  };

  /**
   * Refresh data from Supabase
   */
  const refreshData = async () => {
    if (!isSupabaseConfigured()) return;
    
    setIsLoading(true);
    try {
      const supabaseData = await fetchAllData();
      const mergedData: Partial<SampleData> = {};
      for (const [key, value] of Object.entries(supabaseData)) {
        if (Array.isArray(value) && value.length > 0) {
          (mergedData as any)[key] = value;
        }
      }
      if (Object.keys(mergedData).length > 0) {
        // Apply transformations to build computed views
        const transformedData = transformData(mergedData);
        setData(prev => ({ ...prev, ...mergedData, ...transformedData }));
      }
    } catch (err) {
      console.error('Error refreshing data from Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Memoized filtered data computation.
   * Applies hierarchy and date filters to the raw data.
   */
  const filteredData = useMemo(() => {
    let filtered = { ...data };

    // =========================================================================
    // APPLY HIERARCHY FILTER
    // =========================================================================
    if (hierarchyFilter?.path && hierarchyFilter.path.length > 0) {
      const path = hierarchyFilter.path;
      
      // Filter milestones by hierarchy path
      if (filtered.milestones) {
        filtered.milestones = filtered.milestones.filter((m) => {
          if (path[0] && m.portfolio && !m.portfolio.toLowerCase().includes(path[0].toLowerCase().split(' ')[0])) {
            return false;
          }
          if (path[1] && m.customer !== path[1]) return false;
          if (path[2] && m.site !== path[2]) return false;
          if (path[3] && m.projectNum !== path[3]) return false;
          return true;
        });
      }

      // Filter deliverables
      if (filtered.deliverables) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered.deliverables = filtered.deliverables.filter((d: any) => {
          const customer = d.customer;
          const projectNum = d.projectNum || d.projectId;
          if (path[1] && customer && customer !== path[1]) return false;
          if (path[3] && projectNum && projectNum.toString() !== path[3]) return false;
          return true;
        });
      }

      // Filter QC transaction data by project
      if (filtered.qcTransactionByProject) {
        filtered.qcTransactionByProject = filtered.qcTransactionByProject.filter((p) => {
          if (path[3] && !p.projectId.toLowerCase().includes(path[3].toLowerCase())) {
            return false;
          }
          return true;
        });
      }

      // Filter projects efficiency metrics
      if (filtered.projectsEfficiencyMetrics) {
        filtered.projectsEfficiencyMetrics = filtered.projectsEfficiencyMetrics.filter((p) => {
          if (path[0] && p.portfolio && !p.portfolio.toLowerCase().includes(path[0].toLowerCase().split(' ')[0])) {
            return false;
          }
          if (path[3] && p.project !== path[3]) return false;
          return true;
        });
      }

      // Filter count metrics analysis
      if (filtered.countMetricsAnalysis) {
        filtered.countMetricsAnalysis = filtered.countMetricsAnalysis.filter((m) => {
          if (path[3] && m.project !== path[3]) return false;
          return true;
        });
      }

      // Filter labor breakdown (by worker, phase, and task)
      if (filtered.laborBreakdown) {
        filtered.laborBreakdown = {
          ...filtered.laborBreakdown,
          byWorker: filtered.laborBreakdown.byWorker.filter((w) => {
            if (path[0] && w.portfolio && !w.portfolio.toLowerCase().includes(path[0].toLowerCase().split(' ')[0])) {
              return false;
            }
            if (path[1] && w.customer !== path[1]) return false;
            if (path[2] && w.site !== path[2]) return false;
            if (path[3] && w.project !== path[3]) return false;
            return true;
          }),
          byPhase: filtered.laborBreakdown.byPhase.filter((p) => {
            if (path[3] && p.project !== path[3]) return false;
            return true;
          }),
          byTask: filtered.laborBreakdown.byTask.filter((t) => {
            if (path[3] && t.project !== path[3]) return false;
            return true;
          }),
        };
      }

      // Filter resource Gantt items
      if (filtered.resourceGantt) {
        filtered.resourceGantt = {
          ...filtered.resourceGantt,
          items: filtered.resourceGantt.items.filter((item) => {
            if (path[0] && item.portfolio && !item.portfolio.toLowerCase().includes(path[0].toLowerCase().split(' ')[0])) {
              return false;
            }
            if (path[3] && item.project !== path[3]) return false;
            return true;
          }),
        };
      }

      // =======================================================================
      // CASCADE FILTER: Portfolio → Customer → Site → Project → Phase → Task
      // Each level filters based on the previous level's valid IDs
      // =======================================================================
      
      // Helper to get owner name from employeeId
      const getOwnerName = (employeeId: string | null): string | null => {
        if (!employeeId || !filtered.employees?.length) return null;
        const owner = filtered.employees.find((e: any) => (e.id || e.employeeId) === employeeId);
        return owner?.name || null;
      };
      
      // Step 1: Filter portfolios by name (path[0])
      if (filtered.portfolios && path[0]) {
        filtered.portfolios = filtered.portfolios.filter((p: any) => {
          // Calculate the display name for comparison (Owner's Portfolio format)
          const ownerName = getOwnerName(p.employeeId);
          const displayName = ownerName 
            ? `${ownerName}'s Portfolio`
            : p.name;
          return displayName === path[0] || p.name === path[0];
        });
      }
      
      // Step 2: Filter customers by valid portfolio IDs + name (path[1])
      if (filtered.customers) {
        const validPortfolioIds = new Set(
          filtered.portfolios?.map((p: any) => p.id || p.portfolioId) || []
        );
        filtered.customers = filtered.customers.filter((c: any) => {
          // If portfolio filter is active, customer must belong to valid portfolio
          if (path[0] && validPortfolioIds.size > 0 && !validPortfolioIds.has(c.portfolioId)) {
            return false;
          }
          // If customer filter is active, must match name
          if (path[1] && c.name !== path[1]) return false;
          return true;
        });
      }
      
      // Step 3: Filter sites by valid customer IDs + name (path[2])
      if (filtered.sites) {
        const validCustomerIds = new Set(
          filtered.customers?.map((c: any) => c.id || c.customerId) || []
        );
        filtered.sites = filtered.sites.filter((s: any) => {
          // If portfolio or customer filter is active, site must belong to valid customer
          if ((path[0] || path[1]) && validCustomerIds.size > 0 && !validCustomerIds.has(s.customerId)) {
            return false;
          }
          // If site filter is active, must match name
          if (path[2] && s.name !== path[2]) return false;
          return true;
        });
      }
      
      // Step 4: Filter projects by valid site IDs + name (path[3])
      if (filtered.projects) {
        const validSiteIds = new Set(
          filtered.sites?.map((s: any) => s.id || s.siteId) || []
        );
        filtered.projects = filtered.projects.filter((p: any) => {
          // If any upstream filter is active, project must belong to valid site
          if ((path[0] || path[1] || path[2]) && validSiteIds.size > 0 && !validSiteIds.has(p.siteId)) {
            return false;
          }
          // If project filter is active, must match name
          if (path[3] && p.name !== path[3]) return false;
          return true;
        });
      }
      
      // Step 5: Filter phases by valid project IDs + name (path[4])
      if (filtered.phases) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        filtered.phases = filtered.phases.filter((ph: any) => {
          // If any upstream filter is active, phase must belong to valid project
          if ((path[0] || path[1] || path[2] || path[3]) && validProjectIds.size > 0 && !validProjectIds.has(ph.projectId)) {
            return false;
          }
          // If phase filter is active (path[4]), must match name
          if (path[4] && ph.name !== path[4]) return false;
          return true;
        });
      }
      
      // Step 6: Filter tasks by valid phase/project IDs
      if (filtered.tasks) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        const validPhaseIds = new Set(
          filtered.phases?.map((ph: any) => ph.id || ph.phaseId) || []
        );
        filtered.tasks = filtered.tasks.filter((t: any) => {
          // If project filter is active
          if (validProjectIds.size > 0 && t.projectId && !validProjectIds.has(t.projectId)) {
            return false;
          }
          // If phase filter is active
          if (path[4] && validPhaseIds.size > 0 && t.phaseId && !validPhaseIds.has(t.phaseId)) {
            return false;
          }
          return true;
        });
      }
      
      // Step 7: Filter sub-tasks by valid parent task IDs
      if (filtered.subTasks) {
        const validTaskIds = new Set(
          filtered.tasks?.map((t: any) => t.id || t.taskId) || []
        );
        filtered.subTasks = filtered.subTasks.filter((st: any) => {
          return validTaskIds.has(st.parentTaskId || '');
        });
      }
      
      // Step 8: Filter QC tasks by valid parent task IDs
      if (filtered.qctasks) {
        const validTaskIds = new Set(
          filtered.tasks?.map((t: any) => t.id || t.taskId) || []
        );
        filtered.qctasks = filtered.qctasks.filter((qc: any) => {
          return validTaskIds.has(qc.parentTaskId);
        });
      }
      
      // Step 9: Filter hours entries by valid project/task IDs
      if (filtered.hours) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        const validTaskIds = new Set(
          filtered.tasks?.map((t: any) => t.id || t.taskId) || []
        );
        filtered.hours = filtered.hours.filter((h: any) => {
          if (validProjectIds.size > 0 && h.projectId && !validProjectIds.has(h.projectId)) {
            return false;
          }
          if (validTaskIds.size > 0 && h.taskId && !validTaskIds.has(h.taskId)) {
            return false;
          }
          return true;
        });
      }

      // Step 10: Filter WBS data recursively (handles all hierarchy levels)
      if (filtered.wbsData) {
        const filterWBSItems = (items: typeof filtered.wbsData.items): typeof filtered.wbsData.items => {
          return items
            .filter((item) => {
              // Match by hierarchy level - path[0]=portfolio, path[1]=customer, path[2]=site, path[3]=project, path[4]=phase
              if (path[0] && item.type === 'portfolio' && item.name !== path[0]) return false;
              if (path[1] && item.type === 'customer' && item.name !== path[1]) return false;
              if (path[2] && item.type === 'site' && item.name !== path[2]) return false;
              if (path[3] && item.type === 'project' && item.name !== path[3]) return false;
              if (path[4] && item.type === 'phase' && item.name !== path[4]) return false;
              return true;
            })
            .map((item) => ({
              ...item,
              children: item.children ? filterWBSItems(item.children) : undefined,
            }));
        };
        filtered.wbsData = {
          ...filtered.wbsData,
          items: filterWBSItems(filtered.wbsData.items),
        };
      }
    }

    // =========================================================================
    // APPLY DATE FILTER
    // =========================================================================
    if (dateFilter && dateFilter.type !== 'all') {
      const now = new Date();
      let startDate: Date, endDate: Date;

      if (dateFilter.type === 'custom' && dateFilter.from && dateFilter.to) {
        startDate = new Date(dateFilter.from);
        endDate = new Date(dateFilter.to);
      } else {
        switch (dateFilter.type) {
          case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
          case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            break;
          case 'ytd':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = now;
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
          default:
            return filtered;
        }
      }

      const parseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      };

      // Filter tasks by date range
      if (filtered.tasks) {
        filtered.tasks = filtered.tasks.filter((t) => {
          const taskStart = parseDate(t.baselineStartDate || t.actualStartDate || '');
          const taskEnd = parseDate(t.baselineEndDate || t.actualEndDate || '');
          if (!taskStart && !taskEnd) return true;
          if (taskStart && taskEnd) return taskStart <= endDate && taskEnd >= startDate;
          if (taskStart) return taskStart <= endDate && taskStart >= startDate;
          if (taskEnd) return taskEnd >= startDate && taskEnd <= endDate;
          return true;
        });
      }
      
      // Filter hours entries by date
      if (filtered.hours) {
        filtered.hours = filtered.hours.filter((h) => {
          const entryDate = parseDate(h.date || '');
          if (!entryDate) return true;
          return entryDate >= startDate && entryDate <= endDate;
        });
      }
    }

    return filtered;
  }, [data, hierarchyFilter, dateFilter]);

  // Assemble context value
  const value: DataContextType = {
    data,
    filteredData,
    isLoading,
    hierarchyFilter,
    dateFilter,
    setHierarchyFilter,
    setDateFilter,
    updateData,
    resetData,
    refreshData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
