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

import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode, useCallback, useRef } from 'react';
import type { SampleData, HierarchyFilter, DateFilter, Snapshot } from '@/types/data';
import { transformData } from '@/lib/data-transforms';
import { logger } from '@/lib/logger';
import { ensurePortfoliosForSeniorManagers } from '@/lib/sync-utils';
import { VariancePeriod, MetricsHistory } from '@/lib/variance-engine';
import { autoRecordMetricsIfNeeded } from '@/lib/metrics-recorder';
import { filterActiveEmployees, filterActiveProjects } from '@/lib/active-filters';
import { normalizeRuntimeData } from '@/lib/data-normalization';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import { filterEntitiesByProjectScope, selectRoleProjectIds } from '@/lib/role-data-selectors';

const DATA_BOOTSTRAP_CACHE_KEY = 'ppc:data-bootstrap:v1';
const DATA_BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000;
const TAB_SYNC_CHANNEL_NAME = 'ppc:data-sync:v1';
const TAB_SYNC_STORAGE_EVENT_KEY = 'ppc:data-sync:event:v1';
const DATA_FETCH_TIMEOUT_MS = 120 * 1000;
let memoryBootstrapCache: { savedAt: number; data: SampleData } | null = null;

// ============================================================================
// EMPTY DATA STRUCTURE
// ============================================================================

/**
 * Create empty SampleData structure
 * This is the initial state - all arrays empty, all computed views empty
 */
function createEmptyData(): SampleData {
  return {
    visualSnapshots: [],
    hierarchy: { portfolios: [] },
    sCurve: { dates: [], planned: [], actual: [], forecast: [] },
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
    costCategories: [],
    calendars: [],
    resourceCalendars: [],
    tasks: [],
    subTasks: [],
    qctasks: [],
    hours: [],
    costTransactions: [],
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
    executeHoursSinceLastQC: [],
    exHoursToQCRatio: [],
    executeHoursSinceLastQCByProject: [],
    qcHoursSinceLastQC: [],
    qcHoursToQCRatio: [],
    qcHoursSinceLastQCByProject: [],
    qcPassFailByTask: [],
    qcFeedbackTimeByTask: [],
    qcPassRatePerMonth: [],
    qcOutcomesByMonth: [],
    qcFeedbackTimeByMonth: [],
    kickoffFeedbackTimeByMonth: [],
    milestoneStatusPie: [],
    planVsForecastVsActual: { dates: [], statusDate: 0, cumulativeActual: [], cumulativeForecasted: [], cumulativePlanned: [] },
    milestoneScoreboard: [],
    milestones: [],
    documentSignoffGauges: [],
    deliverableByStatus: { drd: [], workflow: [], sop: [], qmp: [] },
    resourceHeatmap: { resources: [], weeks: [], data: [] },
    resourceGantt: { items: [] },
    resourceLeveling: { monthly: [], quarterly: [] },
    forecast: { months: [], baseline: [], actual: [], forecast: [] },
    snapshots: [],
    projectDocuments: [],
    projectDocumentRecords: [],
    projectDocumentVersions: [],
    moPeriodNotes: [],
    customerContracts: [],
    workdayPhases: [],
    changeRequests: [],
    changeImpacts: [],
    changeControlSummary: { byProject: [], byMonth: [] },
    taskQuantityEntries: [],
    approvalRecords: [],
    progressClaims: [],
    evmSeries: [],
    taskProductivity: [],
    phaseProductivity: [],
    projectProductivity: [],
    catchUpLog: [],
    projectHealth: [],
    projectLog: [],
    epics: [],
    features: [],
    userStories: [],
    sprints: [],
    scheduleHealth: [],
    wbsData: { items: [] },
    changeLog: [],
  };
}

/**
 * Enrich runtime rows with employee display names so UI surfaces names
 * instead of opaque IDs wherever employee references exist.
 */
function hydrateEmployeeNames(input: SampleData): SampleData {
  const employees = (input.employees || []) as unknown as Array<Record<string, unknown>>;
  const employeeById = new Map<string, string>();
  employees.forEach((employee) => {
    const id = String(employee.id || employee.employeeId || employee.employee_id || '');
    if (!id) return;
    const name = String(employee.name || employee.employeeName || employee.displayName || id);
    employeeById.set(id, name);
    const employeeCode = String(employee.employeeId || employee.employee_id || '');
    if (employeeCode) employeeById.set(employeeCode, name);
  });

  const withName = (row: Record<string, unknown>, idKeys: string[]): Record<string, unknown> => {
    const employeeId = idKeys.map((key) => String(row[key] || '')).find(Boolean) || '';
    const employeeName = employeeById.get(employeeId);
    if (!employeeName) return row;
    return {
      ...row,
      employeeName,
      employee_name: employeeName,
      assignedTo: String(row.assignedTo || row.assigned_to || employeeName),
      qcResource: String(row.qcResource || row.qc_resource || employeeName),
      qcResourceName: String(row.qcResourceName || row.qc_resource_name || employeeName),
    };
  };

  const hours = (input.hours || []).map((hour) => withName(hour as unknown as Record<string, unknown>, ['employeeId', 'employee_id']));
  const tasks = (input.tasks || []).map((task) => withName(task as unknown as Record<string, unknown>, ['employeeId', 'employee_id', 'assignedResourceId', 'assigned_resource_id']));
  const qctasks = (input.qctasks || []).map((qc) => withName(qc as unknown as Record<string, unknown>, ['employeeId', 'employee_id', 'qcResourceId', 'qc_resource_id']));

  return {
    ...input,
    hours: hours as unknown as SampleData['hours'],
    tasks: tasks as unknown as SampleData['tasks'],
    qctasks: qctasks as unknown as SampleData['qctasks'],
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
  refreshData: () => Promise<Partial<SampleData> | undefined>;
  saveVisualSnapshot: (snapshot: any) => Promise<boolean>;
  /** Create a snapshot from the app (popup). Persists to DB and appends to data.snapshots. */
  createSnapshot: (payload: CreateSnapshotPayload) => Promise<{ success: boolean; id?: string; error?: string }>;

  // Variance trending state
  variancePeriod: VariancePeriod;
  setVariancePeriod: (period: VariancePeriod) => void;
  varianceEnabled: boolean;
  setVarianceEnabled: (enabled: boolean) => void;
  metricsHistory: MetricsHistory[];
  refreshMetricsHistory: () => Promise<void>;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/** Payload for creating a snapshot from the app (e.g. Snapshot popup). */
export interface CreateSnapshotPayload {
  versionName: string;
  snapshotType?: 'baseline' | 'forecast' | 'manual' | 'auto';
  scope?: 'all' | 'portfolio' | 'project' | 'site' | 'customer';
  scopeId?: string | null;
  notes?: string | null;
  /** Totals and breakdowns computed from current filtered view */
  metrics: {
    planHours: number;
    planCost: number;
    actualHours: number;
    actualCost: number;
    totalProjects: number;
    totalTasks: number;
    totalEmployees?: number;
  };
  createdBy?: string;
  /** Optional breakdowns for variance-by-dimension */
  byProject?: Array<{ projectId: string; name: string; planHours: number; actualHours: number; planCost: number; actualCost: number }>;
  byPhase?: Array<{ phaseId: string; name: string; planHours: number; actualHours: number; planCost: number; actualCost: number }>;
  byPortfolio?: Array<{ portfolioId: string; name: string; planHours: number; actualHours: number; planCost: number; actualCost: number }>;
  /** Optional task-level for WBS variance */
  byTask?: Array<{ taskId: string; wbsCode: string; name: string; planHours: number; actualHours: number; planCost: number; actualCost: number }>;
}

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

interface TabSyncEvent {
  type: 'data-updated';
  sourceTabId: string;
  reason: string;
  at: number;
}

/**
 * Data Provider component that wraps the application.
 * Automatically fetches data from Supabase on initialization.
 */
export function DataProvider({ children }: DataProviderProps) {
  const { activeRole } = useRoleView();
  const { user } = useUser();

  // State starts EMPTY - populated from Supabase on mount
  const [data, setData] = useState<SampleData>(createEmptyData);
  const [isLoading, setIsLoading] = useState(true);

  // State for active filters
  const [hierarchyFilter, setHierarchyFilter] = useState<HierarchyFilter | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);

  // Variance trending state
  const [variancePeriod, setVariancePeriod] = useState<VariancePeriod>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('variancePeriod');
      if (stored && ['day', 'week', 'month', 'quarter', 'custom'].includes(stored)) {
        return stored as VariancePeriod;
      }
    }
    return 'week';
  });
  const [varianceEnabled, setVarianceEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('varianceEnabled');
      return stored !== 'false'; // Default to true
    }
    return true;
  });
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory[]>([]);
  const tabIdRef = useRef<string>('');
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const isRemoteRefreshInFlightRef = useRef(false);

  const getTabId = useCallback(() => {
    if (!tabIdRef.current) {
      tabIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return tabIdRef.current;
  }, []);

  const broadcastDataUpdated = useCallback((reason: string) => {
    if (typeof window === 'undefined') return;
    const event: TabSyncEvent = {
      type: 'data-updated',
      sourceTabId: getTabId(),
      reason,
      at: Date.now(),
    };
    try {
      syncChannelRef.current?.postMessage(event);
    } catch (error) {
      logger.warn('BroadcastChannel sync failed', error);
    }
    try {
      localStorage.setItem(TAB_SYNC_STORAGE_EVENT_KEY, JSON.stringify(event));
    } catch {
      // ignore localStorage quota/security errors
    }
  }, [getTabId]);

  const applyLoadedData = useCallback((dbData: Record<string, unknown>) => {
    const mergedData: Partial<SampleData> = {};
    for (const [key, value] of Object.entries(dbData)) {
      if (Array.isArray(value)) {
        (mergedData as Record<string, unknown>)[key] = value;
      } else if (value !== null && value !== undefined) {
        (mergedData as Record<string, unknown>)[key] = value;
      }
    }

    if (mergedData.employees && Array.isArray(mergedData.employees)) {
      mergedData.employees = filterActiveEmployees(mergedData.employees);
    }
    if (mergedData.projects && Array.isArray(mergedData.projects)) {
      mergedData.projects = filterActiveProjects(mergedData.projects);
    }

    if (mergedData.employees && mergedData.portfolios) {
      mergedData.portfolios = ensurePortfoliosForSeniorManagers(
        mergedData.employees as any[],
        mergedData.portfolios as any[]
      );

      const activeEmployeeNames = new Set(
        (mergedData.employees as any[]).map((e: any) => (e.name || '').toLowerCase())
      );
      mergedData.portfolios = (mergedData.portfolios as any[]).filter((p: any) => {
        const mgr = (p.manager || '').toLowerCase();
        if (!mgr) return true;
        if (String(p.id || '').startsWith('PRF-AUTO-')) return activeEmployeeNames.has(mgr);
        return true;
      });
    }

    const normalized = normalizeRuntimeData(mergedData);
    const transformedData = transformData(normalized);
    const finalData = hydrateEmployeeNames({ ...createEmptyData(), ...normalized, ...transformedData });
    setData(finalData);
    memoryBootstrapCache = { savedAt: Date.now(), data: finalData };

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          DATA_BOOTSTRAP_CACHE_KEY,
          JSON.stringify({ savedAt: Date.now(), data: finalData })
        );
      } catch (error) {
        logger.warn('Could not persist bootstrap cache', error);
      }
    }

    logger.debug('Loaded and transformed data from database:', Object.keys(mergedData).map(k => {
      const value = (mergedData as Record<string, unknown>)[k];
      const length = Array.isArray(value) ? value.length : (value ? 1 : 0);
      return `${length} ${k}`;
    }).join(', '));

    autoRecordMetricsIfNeeded(finalData).catch(err => {
      logger.warn('Failed to auto-record metrics:', err);
    });
  }, []);

  const hydrateFromBootstrapCache = useCallback((): boolean => {
    const now = Date.now();
    if (memoryBootstrapCache && (now - memoryBootstrapCache.savedAt) < DATA_BOOTSTRAP_CACHE_TTL_MS) {
      setData(memoryBootstrapCache.data);
      return true;
    }

    if (typeof window === 'undefined') return false;

    try {
      const raw = sessionStorage.getItem(DATA_BOOTSTRAP_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { savedAt?: number; data?: SampleData };
      if (!parsed.savedAt || !parsed.data) return false;
      if ((now - parsed.savedAt) >= DATA_BOOTSTRAP_CACHE_TTL_MS) return false;
      setData(parsed.data);
      memoryBootstrapCache = { savedAt: parsed.savedAt, data: parsed.data };
      return true;
    } catch {
      return false;
    }
  }, []);

  // Persist variance settings
  const setVarianceEnabled = useCallback((enabled: boolean) => {
    setVarianceEnabledState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('varianceEnabled', String(enabled));
    }
  }, []);

  const handleSetVariancePeriod = useCallback((period: VariancePeriod) => {
    setVariancePeriod(period);
    if (typeof window !== 'undefined') {
      localStorage.setItem('variancePeriod', period);
    }
  }, []);

  // Fetch metrics history from database
  const refreshMetricsHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', dataKey: 'metricsHistory' }),
      });
      const result = await response.json();
      if (result.data) {
        setMetricsHistory(result.data);
      }
    } catch (err) {
      logger.error('Error fetching metrics history', err);
    }
  }, []);

  /**
   * Fetch data from database on app initialization
   */
  useEffect(() => {
    const loadData = async () => {
      const hydratedFromCache = hydrateFromBootstrapCache();
      if (hydratedFromCache) {
        setIsLoading(false);
      }

      try {
        logger.debug('Fetching data from database...');
        const fetchWithTimeout = async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
          try {
            return await fetch('/api/data', { cache: 'no-store', signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
        };
        let response = await fetchWithTimeout();
        if (!response.ok) {
          // One retry for transient gateway/timeout failures.
          response = await fetchWithTimeout();
        }
        const result = await response.json();

        if (result.error) {
          logger.warn('Database not configured or error:', result.error);
          return;
        }

        const dbData = result.data;

        if (dbData && Object.keys(dbData).length > 0) {
          applyLoadedData(dbData as Record<string, unknown>);
        }
      } catch (err) {
        logger.error('Error fetching data from database', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [applyLoadedData, hydrateFromBootstrapCache]);

  /**
   * Update data - called by Data Management, Sprint Board, etc.
   * Re-runs transformData so computed views (wbsData, resourceHeatmap, resourceGantt) are rebuilt.
   * WBS Gantt and Resourcing page stay in sync with any changes (e.g. from Sprint Board).
   */
  const updateData = (updates: Partial<SampleData>) => {
    setData((prev) => {
      const merged: SampleData = { ...prev, ...updates };

      // Always re-apply global active filters when raw data changes so that
      // any updates from Workday, imports, or Data Management immediately
      // hide inactive / terminated employees and projects across the app.
      if (merged.employees && Array.isArray(merged.employees)) {
        merged.employees = filterActiveEmployees(merged.employees as any[]) as any;
      }
      if (merged.projects && Array.isArray(merged.projects)) {
        merged.projects = filterActiveProjects(merged.projects as any[]) as any;
      }
      // NOTE: Portfolios are NEVER globally filtered here; they should remain
      // visible in Data Management even when inactive. Individual pages decide
      // whether to show only active portfolios.

      // When only wbsData is updated (e.g. CPM results), keep it and skip full transform to avoid overwriting with a fresh build
      const keys = Object.keys(updates);
      if (keys.length === 1 && keys[0] === 'wbsData') {
        return merged;
      }
      // Re-apply transformations when raw data changes
      const normalized = normalizeRuntimeData(merged);
      const transformedData = transformData(normalized);
      return hydrateEmployeeNames({ ...merged, ...normalized, ...transformedData });
    });
    broadcastDataUpdated('context-update');
  };

  /**
   * Reset data to empty state
   */
  const resetData = () => {
    setData(createEmptyData());
    broadcastDataUpdated('context-reset');
  };

  /**
   * Refresh data from database
   */
  const refreshData = useCallback(async (): Promise<Partial<SampleData> | undefined> => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
      const response = await fetch(`/api/data?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      const result = await response.json();

      if (result.error || !result.data) {
        logger.debug('No data available to refresh');
        return undefined;
      }

      const dbData = result.data;
      if (!dbData) {
        logger.debug('No data returned from refresh');
        return undefined;
      }

      const mergedData: Partial<SampleData> = {};
      for (const [key, value] of Object.entries(dbData)) {
        if (Array.isArray(value)) {
          // Include arrays even if empty (to clear previous data)
          (mergedData as Record<string, unknown>)[key] = value;
        } else if (value !== null && value !== undefined) {
          // Include non-array values (like objects, strings, numbers)
          (mergedData as Record<string, unknown>)[key] = value;
        }
      }

      if (Object.keys(mergedData).length > 0) {
        // Apply transformations to build computed views
        const normalized = normalizeRuntimeData(mergedData);
        const transformedData = transformData(normalized);
        // Replace all data, not merge, to ensure fresh state
        setData(hydrateEmployeeNames({ ...createEmptyData(), ...normalized, ...transformedData }));
        logger.debug('Refreshed data from database:', Object.keys(mergedData).map(k => {
          const value = (mergedData as Record<string, unknown>)[k];
          const length = Array.isArray(value) ? value.length : (value ? 1 : 0);
          return `${length} ${k}`;
        }).join(', '));
        return mergedData;
      } else {
        logger.debug('No data to merge after refresh');
        return undefined;
      }
    } catch (err) {
      logger.error('Error refreshing data from database', err);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const localTabId = getTabId();

    const handleRemoteSync = async (event: TabSyncEvent) => {
      if (event.type !== 'data-updated') return;
      if (event.sourceTabId === localTabId) return;
      if (isRemoteRefreshInFlightRef.current) return;

      isRemoteRefreshInFlightRef.current = true;
      try {
        await refreshData();
      } finally {
        isRemoteRefreshInFlightRef.current = false;
      }
    };

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(TAB_SYNC_CHANNEL_NAME);
      syncChannelRef.current = channel;
      channel.onmessage = (messageEvent: MessageEvent<TabSyncEvent>) => {
        const payload = messageEvent.data;
        void handleRemoteSync(payload);
      };
    }

    const onStorage = (storageEvent: StorageEvent) => {
      if (storageEvent.key !== TAB_SYNC_STORAGE_EVENT_KEY || !storageEvent.newValue) return;
      try {
        const payload = JSON.parse(storageEvent.newValue) as TabSyncEvent;
        void handleRemoteSync(payload);
      } catch {
        // Ignore malformed payloads.
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (syncChannelRef.current) {
        syncChannelRef.current.close();
        syncChannelRef.current = null;
      }
    };
  }, [getTabId, refreshData]);

  /**
   * Save a visual snapshot to database and update local state
   */
  const saveVisualSnapshot = async (snapshot: any) => {
    try {
      const response = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataKey: 'visualSnapshots',
          records: [snapshot]
        }),
      });
      const result = await response.json();
      if (result.success) {
        setData(prev => ({
          ...prev,
          visualSnapshots: [snapshot, ...prev.visualSnapshots].slice(0, 1000) // Keep last 1000
        }));
        broadcastDataUpdated('visual-snapshot');
        return true;
      }
      return false;
    } catch (err) {
      logger.error('Error saving visual snapshot', err);
      return false;
    }
  };

  const createSnapshot = useCallback(async (payload: CreateSnapshotPayload): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const snapshotDate = new Date().toISOString().split('T')[0];
      const record: Snapshot = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id,
        snapshotId: id,
        versionName: payload.versionName || `Snapshot ${snapshotDate}`,
        scope: payload.scope ?? 'all',
        scopeId: payload.scopeId ?? null,
        snapshotType: payload.snapshotType ?? 'manual',
        snapshotDate,
        createdBy: payload.createdBy ?? 'User',
        notes: payload.notes ?? null,
        isLocked: false,
        totalHours: payload.metrics.actualHours,
        totalCost: payload.metrics.actualCost,
        totalProjects: payload.metrics.totalProjects,
        totalTasks: payload.metrics.totalTasks,
        totalEmployees: payload.metrics.totalEmployees ?? 0,
        snapshotData: {
          metrics: payload.metrics,
          byProject: payload.byProject ?? [],
          byPhase: payload.byPhase ?? [],
          byPortfolio: payload.byPortfolio ?? [],
          byTask: payload.byTask ?? [],
        } as unknown as Snapshot['snapshotData'],
      };
      const response = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataKey: 'snapshots', records: [record] }),
      });
      const result = await response.json();
      if (result.success) {
        setData(prev => ({
          ...prev,
          snapshots: [record, ...(prev.snapshots || [])],
        }));
        broadcastDataUpdated('snapshot-create');
        return { success: true, id };
      }
      return { success: false, error: (result as any).error || 'Save failed' };
    } catch (err: any) {
      logger.error('Error creating snapshot', err);
      return { success: false, error: err?.message || 'Failed to create snapshot' };
    }
  }, [broadcastDataUpdated]);

  /**
   * Memoized filtered data computation.
   * Applies hierarchy and date filters to the raw data.
   */
  const filteredData = useMemo(() => {
    const filtered = { ...data };

    // =========================================================================
    // ACTIVE PORTFOLIOS ONLY (WBS, Gantt, and app-wide views exclude inactive)
    // Data Management uses raw `data` for editing; filteredData is for display.
    // =========================================================================
    const activePortfolioIds = new Set(
      (filtered.portfolios || [])
        .filter((p: any) => p.isActive !== false && p.is_active !== false && p.active !== false)
        .map((p: any) => String(p.id || p.portfolioId || ''))
        .filter(Boolean)
    );
    if (filtered.portfolios && activePortfolioIds.size >= 0) {
      filtered.portfolios = (filtered.portfolios as any[]).filter((p: any) =>
        activePortfolioIds.has(String(p.id || p.portfolioId || ''))
      );
    }
    if (filtered.projects && activePortfolioIds.size > 0) {
      filtered.projects = (filtered.projects as any[]).filter((p: any) => {
        const pid = p.portfolioId ?? p.portfolio_id;
        // Keep orphaned projects visible so role pages do not appear empty when
        // upstream hierarchy links are incomplete.
        return !pid || activePortfolioIds.has(String(pid));
      });
    }
    if (filtered.customers && activePortfolioIds.size > 0) {
      filtered.customers = (filtered.customers as any[]).filter((c: any) => {
        const pid = c.portfolioId ?? c.portfolio_id;
        return !pid || activePortfolioIds.has(String(pid));
      });
    }
    const activeCustomerIds = new Set((filtered.customers || []).map((c: any) => c.id || c.customerId).filter(Boolean));
    if (filtered.sites) {
      filtered.sites = (filtered.sites as any[]).filter((s: any) => {
        const cid = s.customerId ?? s.customer_id;
        return !cid || activeCustomerIds.has(cid);
      });
    }

    // Keep full project/task/hour scope in global context; plan-specific filtering
    // is handled by dedicated pages (e.g., project plans) to avoid hidden data loss.

    // =========================================================================
    // APPLY ROLE VIEW PROJECT SCOPE
    // Product Owner override keeps full data visibility across simulated lenses.
    // =========================================================================
    if (!user?.canViewAll) {
      const roleScopedProjectIds = selectRoleProjectIds({
        role: activeRole.key,
        projects: filtered.projects || [],
        currentUserEmail: user?.email,
      });
      if (filtered.projects?.length) {
        const allowedProjectIdSet = new Set(roleScopedProjectIds);
        filtered.projects = (filtered.projects as any[]).filter((project: any) => {
          const projectId = String(project.id ?? project.projectId ?? project.project_id ?? '').trim();
          return !projectId || allowedProjectIdSet.has(projectId);
        });
      }
    }
    const visibleProjectIds = new Set((filtered.projects || []).map((p: any) => String(p.id ?? p.projectId ?? p.project_id ?? '')).filter(Boolean));
    if (filtered.units) {
      filtered.units = (filtered.units as any[]).filter((row: any) => {
        const projectId = String(row.projectId ?? row.project_id ?? '').trim();
        return !projectId || visibleProjectIds.has(projectId);
      });
    }
    if (filtered.phases) {
      filtered.phases = (filtered.phases as any[]).filter((row: any) => {
        const projectId = String(row.projectId ?? row.project_id ?? '').trim();
        return !projectId || visibleProjectIds.has(projectId);
      });
    }
    if (filtered.tasks) {
      filtered.tasks = filterEntitiesByProjectScope(filtered.tasks as any[], Array.from(visibleProjectIds));
    }
    if (filtered.subTasks) {
      filtered.subTasks = filterEntitiesByProjectScope(filtered.subTasks as any[], Array.from(visibleProjectIds));
    }
    if (filtered.qctasks) {
      filtered.qctasks = filterEntitiesByProjectScope(filtered.qctasks as any[], Array.from(visibleProjectIds));
    }
    if (filtered.hours) {
      filtered.hours = filterEntitiesByProjectScope(filtered.hours as any[], Array.from(visibleProjectIds));
    }
    if (filtered.costTransactions) {
      filtered.costTransactions = filterEntitiesByProjectScope(filtered.costTransactions as any[], Array.from(visibleProjectIds));
    }
    if (filtered.projectDocuments) {
      filtered.projectDocuments = filterEntitiesByProjectScope(filtered.projectDocuments as any[], Array.from(visibleProjectIds));
    }
    if (filtered.projectDocumentRecords) {
      filtered.projectDocumentRecords = filterEntitiesByProjectScope(filtered.projectDocumentRecords as any[], Array.from(visibleProjectIds));
    }
    if (filtered.projectDocumentVersions && filtered.projectDocumentRecords) {
      const visibleRecordIds = new Set(
        (filtered.projectDocumentRecords as any[])
          .map((record: any) => String(record.id ?? '').trim())
          .filter(Boolean)
      );
      filtered.projectDocumentVersions = (filtered.projectDocumentVersions as any[]).filter((version: any) => {
        const recordId = String(version.recordId ?? version.record_id ?? '').trim();
        return !recordId || visibleRecordIds.has(recordId);
      });
    }
    if (filtered.projectHealth) {
      filtered.projectHealth = filterEntitiesByProjectScope(filtered.projectHealth as any[], Array.from(visibleProjectIds));
    }
    if (filtered.projectLog) {
      filtered.projectLog = filterEntitiesByProjectScope(filtered.projectLog as any[], Array.from(visibleProjectIds));
    }
    if (filtered.changeRequests) {
      filtered.changeRequests = filterEntitiesByProjectScope(filtered.changeRequests as any[], Array.from(visibleProjectIds));
    }
    if (filtered.changeImpacts) {
      filtered.changeImpacts = filterEntitiesByProjectScope(filtered.changeImpacts as any[], Array.from(visibleProjectIds));
    }
    if (filtered.moPeriodNotes) {
      filtered.moPeriodNotes = filterEntitiesByProjectScope(filtered.moPeriodNotes as any[], Array.from(visibleProjectIds));
    }

    // =========================================================================
    // RDA PERSON-SCOPED FILTERING
    // Restrict tasks/hours to the logged-in employee identity.
    // =========================================================================
    if (activeRole.key === 'rda') {
      const normalizedEmail = String(user?.email || '').trim().toLowerCase();
      const employeeIdCandidates = new Set<string>();
      if (user?.employeeId) employeeIdCandidates.add(String(user.employeeId).trim());

      for (const emp of (filtered.employees || []) as any[]) {
        const email = String(emp.email || '').trim().toLowerCase();
        if (normalizedEmail && email && email === normalizedEmail) {
          const id = String(emp.id || emp.employeeId || emp.employee_id || '').trim();
          const code = String(emp.employeeId || emp.employee_id || '').trim();
          if (id) employeeIdCandidates.add(id);
          if (code) employeeIdCandidates.add(code);
        }
      }

      if (employeeIdCandidates.size > 0) {
        const matchesEmployee = (value: any): boolean => {
          const rowIds = [
            value.employeeId,
            value.employee_id,
            value.assignedResourceId,
            value.assigned_resource_id,
            value.assigneeId,
            value.assignee_id,
            value.resourceId,
            value.resource_id,
            value.qcResourceId,
            value.qc_resource_id,
          ]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
          return rowIds.some((rowId) => employeeIdCandidates.has(rowId));
        };

        filtered.tasks = ((filtered.tasks || []) as any[]).filter(matchesEmployee);
        filtered.subTasks = ((filtered.subTasks || []) as any[]).filter(matchesEmployee);
        filtered.hours = ((filtered.hours || []) as any[]).filter(matchesEmployee);
        filtered.qctasks = ((filtered.qctasks || []) as any[]).filter(matchesEmployee);
      }
    }
    if (filtered.snapshots) {
      filtered.snapshots = (filtered.snapshots as any[]).filter((snap: any) => {
        if (!snap || snap.scope === 'all') return true;
        if (snap.scope !== 'project') return true;
        const scopeId = String(snap.scopeId ?? '').trim();
        return !scopeId || visibleProjectIds.has(scopeId);
      });
    }
    const visibleSiteIds = new Set((filtered.projects || []).map((p: any) => String(p.siteId ?? p.site_id ?? '')).filter(Boolean));
    if (filtered.sites) {
      filtered.sites = (filtered.sites as any[]).filter((site: any) => {
        const siteId = String(site.id ?? site.siteId ?? site.site_id ?? '').trim();
        // If no project references a site in current scope, keep site rows
        // available for pages that render hierarchy metadata.
        if (visibleSiteIds.size === 0) return true;
        return !siteId || visibleSiteIds.has(siteId);
      });
    }
    const visibleCustomerIds = new Set((filtered.sites || []).map((s: any) => String(s.customerId ?? s.customer_id ?? '')).filter(Boolean));
    if (filtered.customers) {
      filtered.customers = (filtered.customers as any[]).filter((customer: any) => {
        const customerId = String(customer.id ?? customer.customerId ?? customer.customer_id ?? '').trim();
        if (visibleCustomerIds.size === 0) return true;
        return !customerId || visibleCustomerIds.has(customerId);
      });
    }
    // Preserve active portfolios in scope even if customer links are sparse.

    // Filter WBS tree: only active portfolios, exclude empty portfolios (no children), then deep-clone and renumber
    if (filtered.wbsData?.items?.length) {
      const isPortfolio = (item: any) => item.itemType === 'portfolio' || item.type === 'portfolio';
      const validCustomerIds = new Set((filtered.customers || []).map((c: any) => String(c.id || c.customerId || '')).filter(Boolean));
      const validSiteIds = new Set((filtered.sites || []).map((s: any) => String(s.id || s.siteId || '')).filter(Boolean));
      const validProjectIds = new Set((filtered.projects || []).map((p: any) => String(p.id || p.projectId || '')).filter(Boolean));
      const normalizeNodeId = (value: unknown, prefix: RegExp): string => String(value || '').replace(prefix, '').trim();
      const pruneWbsNode = (item: any): any | null => {
        const nodeId = String(item?.id || '');
        const nodeType = String(item?.itemType || item?.type || '').toLowerCase();
        const children = Array.isArray(item?.children)
          ? item.children.map((child: any) => pruneWbsNode(child)).filter(Boolean)
          : [];

        if (nodeType === 'portfolio' || isPortfolio(item)) {
          const portfolioId = normalizeNodeId(nodeId, /^wbs-portfolio-/);
          if (activePortfolioIds.size > 0 && portfolioId && !activePortfolioIds.has(portfolioId)) return null;
          if (!children.length) return null;
          return { ...item, children };
        }
        if (nodeType === 'customer') {
          const customerId = normalizeNodeId(nodeId, /^wbs-customer-/).split('-cust-')[0];
          if (customerId && !validCustomerIds.has(customerId)) return null;
        }
        if (nodeType === 'site') {
          const siteId = normalizeNodeId(nodeId, /^wbs-site-/).split('-cust-')[0];
          if (siteId && !validSiteIds.has(siteId)) return null;
        }
        if (nodeType === 'project') {
          const projectId = normalizeNodeId(nodeId, /^wbs-project-/);
          if (projectId && !validProjectIds.has(projectId)) return null;
        }

        return { ...item, children };
      };
      const wbsItems = (filtered.wbsData.items as any[])
        .map((item: any) => pruneWbsNode(item))
        .filter(Boolean);
      const reindexWBS = (itemList: any[], prefix = '') => {
        itemList.forEach((item: any, idx: number) => {
          item.wbsCode = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
          if (item.children?.length) reindexWBS(item.children, item.wbsCode);
        });
      };
      reindexWBS(wbsItems);
      filtered.wbsData = { ...filtered.wbsData, items: wbsItems };
    }

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

      // Step 2: Filter customers by valid portfolio IDs + name (path[1]) — support camelCase and snake_case
      if (filtered.customers) {
        const validPortfolioIds = new Set(
          filtered.portfolios?.map((p: any) => p.id || p.portfolioId) || []
        );
        filtered.customers = filtered.customers.filter((c: any) => {
          const cPortfolioId = c.portfolioId ?? c.portfolio_id;
          if (path[0] && validPortfolioIds.size > 0 && !validPortfolioIds.has(cPortfolioId)) {
            return false;
          }
          if (path[1] && c.name !== path[1]) return false;
          return true;
        });
      }

      // Step 3: Filter sites by valid customer IDs + name (path[2]) — support camelCase and snake_case
      if (filtered.sites) {
        const validCustomerIds = new Set(
          filtered.customers?.map((c: any) => c.id || c.customerId) || []
        );
        filtered.sites = filtered.sites.filter((s: any) => {
          const sCustomerId = s.customerId ?? s.customer_id;
          if ((path[0] || path[1]) && validCustomerIds.size > 0 && !validCustomerIds.has(sCustomerId)) {
            return false;
          }
          if (path[2] && s.name !== path[2]) return false;
          return true;
        });
      }

      // Step 4: Filter projects by valid site IDs + name (path[3]) — support camelCase and snake_case
      if (filtered.projects) {
        const validSiteIds = new Set(
          filtered.sites?.map((s: any) => s.id || s.siteId) || []
        );
        filtered.projects = filtered.projects.filter((p: any) => {
          const pSiteId = p.siteId ?? p.site_id;
          if ((path[0] || path[1] || path[2]) && validSiteIds.size > 0 && !validSiteIds.has(pSiteId)) {
            return false;
          }
          if (path[3] && p.name !== path[3]) return false;
          return true;
        });
      }

      // Valid project IDs for scope-based filtering (used by snapshots, change control, projectHealth, projectLog, projectDocuments, costTransactions)
      const validProjectIds = new Set(
        filtered.projects?.map((p: any) => p.id || p.projectId) || []
      );

      // Filter snapshots and change-control rows by valid project IDs
      if (filtered.snapshots) {
        filtered.snapshots = filtered.snapshots.filter((snap: any) => {
          if (snap.scope === 'all') return true;
          if (snap.scope === 'project' && snap.scopeId && validProjectIds.has(snap.scopeId)) return true;
          if (hierarchyFilter) {
            if (snap.scope === 'site' && snap.scopeId === hierarchyFilter.path?.[2]) return true;
            if (snap.scope === 'customer' && snap.scopeId === hierarchyFilter.path?.[1]) return true;
            if (snap.scope === 'portfolio' && snap.scopeId === hierarchyFilter.path?.[0]) return true;
          }
          return false;
        });
      }
      if (filtered.changeRequests) {
        filtered.changeRequests = filtered.changeRequests.filter((cr: any) => {
          return validProjectIds.has(cr.projectId);
        });
      }
      if (filtered.changeImpacts) {
        filtered.changeImpacts = filtered.changeImpacts.filter((impact: any) => {
          return validProjectIds.has(impact.projectId);
        });
      }

      // Filter projectHealth, projectLog, projectDocuments, costTransactions by valid project IDs so all pages respect hierarchy
      if (filtered.projectHealth && validProjectIds.size > 0) {
        filtered.projectHealth = filtered.projectHealth.filter((h: any) => {
          const pid = h.projectId ?? h.project_id;
          return pid && validProjectIds.has(pid);
        });
      }
      if (filtered.projectLog && validProjectIds.size > 0) {
        filtered.projectLog = filtered.projectLog.filter((l: any) => {
          const pid = l.projectId ?? l.project_id;
          return pid && validProjectIds.has(pid);
        });
      }
      if (filtered.projectDocuments && validProjectIds.size > 0) {
        filtered.projectDocuments = filtered.projectDocuments.filter((d: any) => {
          const pid = d.projectId ?? d.project_id;
          return pid && validProjectIds.has(pid);
        });
      }
      if (filtered.projectDocumentRecords) {
        const validPortfolioIds = new Set(
          filtered.portfolios?.map((p: any) => p.id || p.portfolioId) || []
        );
        const validCustomerIds = new Set(
          filtered.customers?.map((c: any) => c.id || c.customerId) || []
        );
        const validSiteIds = new Set(
          filtered.sites?.map((s: any) => s.id || s.siteId) || []
        );
        filtered.projectDocumentRecords = filtered.projectDocumentRecords.filter((d: any) => {
          const portfolioId = d.portfolioId ?? d.portfolio_id;
          const customerId = d.customerId ?? d.customer_id;
          const siteId = d.siteId ?? d.site_id;
          const projectId = d.projectId ?? d.project_id;
          if (portfolioId && validPortfolioIds.size > 0 && !validPortfolioIds.has(portfolioId)) return false;
          if (customerId && validCustomerIds.size > 0 && !validCustomerIds.has(customerId)) return false;
          if (siteId && validSiteIds.size > 0 && !validSiteIds.has(siteId)) return false;
          if (projectId && validProjectIds.size > 0 && !validProjectIds.has(projectId)) return false;
          return true;
        });
      }
      if (filtered.projectDocumentVersions && filtered.projectDocumentRecords) {
        const validRecordIds = new Set(
          filtered.projectDocumentRecords.map((d: any) => d.id).filter(Boolean)
        );
        filtered.projectDocumentVersions = filtered.projectDocumentVersions.filter((v: any) => {
          const recordId = v.recordId ?? v.record_id;
          return !!recordId && validRecordIds.has(recordId);
        });
      }
      if (filtered.moPeriodNotes) {
        const validPortfolioIds = new Set(
          filtered.portfolios?.map((p: any) => p.id || p.portfolioId) || []
        );
        const validCustomerIds = new Set(
          filtered.customers?.map((c: any) => c.id || c.customerId) || []
        );
        const validSiteIds = new Set(
          filtered.sites?.map((s: any) => s.id || s.siteId) || []
        );
        filtered.moPeriodNotes = filtered.moPeriodNotes.filter((n: any) => {
          const portfolioId = n.portfolioId ?? n.portfolio_id;
          const customerId = n.customerId ?? n.customer_id;
          const siteId = n.siteId ?? n.site_id;
          const projectId = n.projectId ?? n.project_id;
          if (portfolioId && validPortfolioIds.size > 0 && !validPortfolioIds.has(portfolioId)) return false;
          if (customerId && validCustomerIds.size > 0 && !validCustomerIds.has(customerId)) return false;
          if (siteId && validSiteIds.size > 0 && !validSiteIds.has(siteId)) return false;
          if (projectId && validProjectIds.size > 0 && !validProjectIds.has(projectId)) return false;
          return true;
        });
      }
      if (filtered.costTransactions && validProjectIds.size > 0) {
        filtered.costTransactions = filtered.costTransactions.filter((t: any) => {
          const pid = t.projectId ?? t.project_id;
          return !pid || validProjectIds.has(pid);
        });
      }

      // Step 5: Filter units by valid project IDs + name (path[4] = unit)
      if (filtered.units) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        filtered.units = filtered.units.filter((u: any) => {
          if ((path[0] || path[1] || path[2] || path[3]) && validProjectIds.size > 0 && !validProjectIds.has(u.projectId ?? u.project_id)) {
            return false;
          }
          if (path[4] && u.name !== path[4]) return false;
          return true;
        });
      }

      // Step 5.5: Filter phases by valid unit/project IDs + name (path[5] = phase)
      if (filtered.phases) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        const validUnitIds = new Set(
          filtered.units?.map((u: any) => u.id || u.unitId) || []
        );
        filtered.phases = filtered.phases.filter((ph: any) => {
          if ((path[0] || path[1] || path[2] || path[3]) && validProjectIds.size > 0 && !validProjectIds.has(ph.projectId ?? ph.project_id)) {
            return false;
          }
          if (path[4] && validUnitIds.size > 0 && (ph.unitId ?? ph.unit_id) && !validUnitIds.has(ph.unitId ?? ph.unit_id)) {
            return false;
          }
          if (path[5] && ph.name !== path[5]) return false;
          return true;
        });
      }

      // Step 6: Filter tasks by valid phase/project/unit IDs (path[4]=unit, path[5]=phase)
      if (filtered.tasks) {
        const validProjectIds = new Set(
          filtered.projects?.map((p: any) => p.id || p.projectId) || []
        );
        const validPhaseIds = new Set(
          filtered.phases?.map((ph: any) => ph.id || ph.phaseId) || []
        );
        const validUnitIds = new Set(
          filtered.units?.map((u: any) => u.id || u.unitId) || []
        );
        filtered.tasks = filtered.tasks.filter((t: any) => {
          if (validProjectIds.size > 0 && t.projectId && !validProjectIds.has(t.projectId)) {
            return false;
          }
          if (path[4] && validUnitIds.size > 0 && t.unitId && !validUnitIds.has(t.unitId)) {
            return false;
          }
          if (path[5] && validPhaseIds.size > 0 && t.phaseId && !validPhaseIds.has(t.phaseId)) {
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
        filtered.hours = filtered.hours.filter((h: any) => {
          if (validProjectIds.size > 0 && h.projectId && !validProjectIds.has(h.projectId)) {
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
              // path[0]=portfolio, path[1]=customer, path[2]=site, path[3]=project, path[4]=unit, path[5]=phase
              if (path[0] && item.type === 'portfolio' && item.name !== path[0]) return false;
              if (path[1] && item.type === 'customer' && item.name !== path[1]) return false;
              if (path[2] && item.type === 'site' && item.name !== path[2]) return false;
              if (path[3] && item.type === 'project' && item.name !== path[3]) return false;
              if (path[4] && item.type === 'unit' && item.name !== path[4]) return false;
              if (path[5] && item.type === 'phase' && item.name !== path[5]) return false;
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
    // Capture hours before date filter so labor breakdown and resource heatmap can show all week columns (values still use filtered hours)
    const hoursForWeekRange = dateFilter && dateFilter.type !== 'all' && filtered.hours?.length
      ? [...filtered.hours]
      : undefined;

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

      // Filter tasks by date range (include plan fields: start_date, end_date, finish_date)
      if (filtered.tasks) {
        filtered.tasks = filtered.tasks.filter((t: any) => {
          const taskStart = parseDate(t.baselineStartDate || t.actualStartDate || t.startDate || t.start_date || '');
          const taskEnd = parseDate(t.baselineEndDate || t.actualEndDate || t.endDate || t.end_date || t.finishDate || t.finish_date || '');
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

    // Rebuild computed views (taskHoursEfficiency, qualityHours, laborBreakdown, wbsData, etc.)
    // from the filtered raw data so hierarchy/date filters apply across the entire website
    const hasActiveFilter = (hierarchyFilter?.path?.length ?? 0) > 0 || (dateFilter && dateFilter.type !== 'all');
    if (hasActiveFilter) {
      const transformed = transformData(filtered, {
        allHoursForWeekRange: hoursForWeekRange,
      });
      Object.assign(filtered, transformed);
    }

    return filtered;
  }, [activeRole.key, data, hierarchyFilter, dateFilter, user?.canViewAll, user?.email]);

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
    saveVisualSnapshot,
    createSnapshot,

    // Variance trending
    variancePeriod,
    setVariancePeriod: handleSetVariancePeriod,
    varianceEnabled,
    setVarianceEnabled,
    metricsHistory,
    refreshMetricsHistory,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
