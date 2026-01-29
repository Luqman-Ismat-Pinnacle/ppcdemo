/**
 * @file data-store.ts
 * @description Data Store for Pinnacle Project Controls
 * 
 * This file provides access to application data via the Data Context.
 * 
 * IMPORTANT: This is a minimal wrapper for backward compatibility.
 * The actual data is managed by the Data Context (data-context.tsx).
 * 
 * The application now starts with EMPTY data. Data is populated by:
 * 1. User uploads via the Data Management page
 * 2. Supabase sync (when configured)
 * 
 * @dependencies 
 *   - ../types/data.ts
 * 
 * @dataflow
 *   Data Management Page → updateData() → Data Context → Pages
 */

import type { SampleData, ChangeLogEntry, TrackingFields } from '@/types/data';
import { generateId, getCurrentTimestamp, ID_PREFIXES } from './database-schema';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create default tracking fields with all hours, cost, and predecessor fields
 */
export function createDefaultTrackingFields(): TrackingFields {
  return {
    // Schedule dates
    baselineStartDate: null,
    baselineEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    // Progress
    percentComplete: 0,
    comments: '',
    // Hours tracking
    baselineHours: 0,
    actualHours: 0,
    // Cost tracking
    baselineCost: 0,
    actualCost: 0,
    // Predecessor linking
    predecessorId: null,
    predecessorRelationship: null,
  };
}

/**
 * Create empty SampleData structure
 * This is the initial state - all arrays empty, all computed views empty
 */
function createEmptyData(): SampleData {
  return {
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
    scheduleHealth: [],
    wbsData: { items: [] },
    changeLog: [],
    projectHealth: [],
    projectLog: [],
    epics: [],
    features: [],
    userStories: [],
    sprints: [],
    visualSnapshots: [],
  };
}

// ============================================================================
// DATA STORE CLASS
// ============================================================================

/**
 * DataStore - Centralized data management
 * 
 * NOTE: This class is maintained for backward compatibility.
 * New code should use the Data Context directly via useData() hook.
 */
class DataStore {
  private data: SampleData;

  constructor() {
    // Start with empty data - no sample data loaded
    this.data = createEmptyData();
  }

  /**
   * Get all data in SampleData format
   */
  getAllData(): SampleData {
    return this.data;
  }

  /**
   * Reload data (no-op since we don't have sample data files anymore)
   */
  reload(): void {
    // No-op - data is managed by Data Context now
  }

  // =========================================================================
  // GETTERS FOR SPECIFIC DATA SECTIONS
  // =========================================================================

  getHierarchy() { return this.data.hierarchy; }
  getSCurve() { return this.data.sCurve; }
  getBudgetVariance() { return this.data.budgetVariance; }
  getMilestoneStatus() { return this.data.milestoneStatus; }
  getEmployees() { return this.data.employees; }
  getProjects() { return this.data.projects; }
  getTasks() { return this.data.tasks; }
  getSubTasks() { return this.data.subTasks; }
  getHours() { return this.data.hours; }
  getMilestones() { return this.data.milestones; }
  getDeliverables() { return this.data.deliverables; }
  getWBSData() { return this.data.wbsData; }
  getChangeLog() { return this.data.changeLog; }

  // =========================================================================
  // UPDATE METHODS
  // =========================================================================

  /**
   * Update data (for DataManagement admin page)
   */
  updateData(updates: Partial<SampleData>): void {
    this.data = { ...this.data, ...updates };
  }

  /**
   * Set employees (for CSV upload)
   */
  setEmployees(employees: SampleData['employees']): void {
    this.data.employees = employees;
  }

  /**
   * Update specific item in array
   */
  updateItem<T extends keyof SampleData>(
    key: T,
    index: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: any
  ): void {
    const array = this.data[key];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(array) && (array as any[])[index]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (array as any[])[index] = { ...(array as any[])[index], ...updates };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (array as any[])[index];
      const entityId = item.id || item.taskId || item.employeeId || String(index);
      this.addChangeLog(key, entityId, updates);
    }
  }

  /**
   * Add entry to change log
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private addChangeLog(entityType: string, entityId: string, changes: Record<string, any>): void {
    Object.entries(changes).forEach(([field, newValue]) => {
      const entry: ChangeLogEntry = {
        id: generateId(ID_PREFIXES.CHANGE_LOG),
        timestamp: getCurrentTimestamp(),
        user: 'System',
        action: 'update',
        entityType: String(entityType),
        entityId,
        fieldName: field,
        oldValue: '',
        newValue: String(newValue)
      };
      this.data.changeLog.unshift(entry);
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/** Singleton instance */
const dataStore = new DataStore();

/** Export sample data for backward compatibility */
export const sampleData: SampleData = dataStore.getAllData();

/** Export the data store instance */
export { dataStore };

/** Export default for convenience */
export default dataStore;
