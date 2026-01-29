import type {
  SampleData,
  Snapshot,
  SnapshotData,
  SnapshotType,
  SnapshotScope
} from '@/types/data';
import { generateId, ID_PREFIXES } from '@/lib/database-schema';
import { transformData } from './data-transforms';

const DEFAULT_HOURLY_RATE = 75;

export interface SnapshotCreateInput {
  snapshotDate: string;
  snapshotType: SnapshotType;
  versionName: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  isLocked?: boolean;
  scope: SnapshotScope;
  scopeId?: string | null;  // ID of the scoped entity (project_id, site_id, etc.)
  view?: string; // Specific view to snapshot (all, wbs-gantt, cost, milestones, etc.)
}

export interface SnapshotDelta {
  actualHoursPeriod: number;
  actualCostPeriod: number;
  remainingHoursDelta: number;
  remainingCostDelta: number;
}

/**
 * Create a comprehensive unified snapshot with all calculated metrics and chart data
 */
export function createSnapshot(
  data: SampleData,
  input: SnapshotCreateInput
): Snapshot {
  const snapshotId = generateId(ID_PREFIXES.SNAPSHOT);
  const view = input.view || 'all';

  // Transform data to get all calculated views
  const transformedData = transformData(data);

  // Calculate EVM metrics from WBS data
  let evmMetrics = {
    bac: 0,
    ac: 0,
    ev: 0,
    pv: 0,
    cpi: 1.0,
    spi: 1.0,
  };

  if (transformedData.wbsData?.items && transformedData.wbsData.items.length > 0) {
    const rootItem = transformedData.wbsData.items[0];
    const ac = rootItem.actualCost || 0;
    const ev = rootItem.baselineCost ? (rootItem.baselineCost * (rootItem.progress || 0) / 100) : 0;
    const pv = rootItem.baselineCost || 0;
    const cpi = ac > 0 ? ev / ac : 1.0;
    const spi = pv > 0 ? ev / pv : 1.0;
    evmMetrics = {
      bac: rootItem.baselineCost || 0,
      ac: ac,
      ev: ev,
      pv: pv,
      cpi: cpi,
      spi: spi,
    };
  }

  // Calculate EAC, ETC, VAC, TCPI
  const eac = evmMetrics.cpi > 0 ? evmMetrics.bac / evmMetrics.cpi : evmMetrics.bac;
  const etc = Math.max(0, eac - evmMetrics.ac);
  const vac = evmMetrics.bac - eac;
  const tcpi = evmMetrics.bac > evmMetrics.ev && etc > 0
    ? (evmMetrics.bac - evmMetrics.ev) / etc
    : 1.0;

  // Aggregate totals based on scope
  const projects = data.projects || [];
  const tasks = [...(data.tasks || []), ...(data.subTasks || [])];
  const hours = data.hours || [];
  const employees = data.employees || [];

  let totalHours = 0;
  let totalCost = 0;
  let totalProjects = 0;
  let totalTasks = 0;
  const totalEmployees = employees.length;

  // Filter by scope
  let filteredProjects = projects;
  if (input.scope === 'project' && input.scopeId) {
    filteredProjects = projects.filter(p => (p.id || p.projectId) === input.scopeId);
  } else if (input.scope === 'site' && input.scopeId) {
    filteredProjects = projects.filter(p => p.siteId === input.scopeId);
  } else if (input.scope === 'customer' && input.scopeId) {
    filteredProjects = projects.filter(p => p.customerId === input.scopeId);
  } else if (input.scope === 'portfolio' && input.scopeId) {
    // Portfolio -> Customers -> Sites -> Projects
    const portfolioCustomers = (data.customers || []).filter(c => c.portfolioId === input.scopeId).map(c => c.id || c.customerId);
    const portfolioSites = (data.sites || []).filter(s => portfolioCustomers.includes(s.customerId || '')).map(s => s.id || s.siteId);
    filteredProjects = projects.filter(p => portfolioSites.includes(p.siteId));
  }
  // 'all' scope uses all projects

  totalProjects = filteredProjects.length;
  const filteredProjectIds = filteredProjects.map(p => p.id || p.projectId);
  const filteredTasks = tasks.filter(t => filteredProjectIds.includes(t.projectId));
  totalTasks = filteredTasks.length;

  // Calculate totals
  filteredTasks.forEach(task => {
    const taskHours = hours
      .filter(h => h.taskId === (task.id || task.taskId))
      .reduce((sum, h) => sum + (Number(h.hours) || 0), 0);
    totalHours += taskHours;
    totalCost += taskHours * DEFAULT_HOURLY_RATE;
  });

  // Empty default chart data
  const emptyCharts = {
    sCurve: { dates: [], planned: [], actual: [], forecast: [] },
    laborBreakdown: { weeks: [], byWorker: [], byPhase: [], byTask: [] },
    resourceHeatmap: { resources: [], weeks: [], data: [] },
    resourceLeveling: { monthly: [], quarterly: [] },
    forecast: { months: [], baseline: [], actual: [], forecast: [] },
    qcMetrics: {
      qcByNameAndRole: [],
      qcTransactionByGate: [],
      qcTransactionByProject: [],
      qcByGateStatus: [],
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
    },
    milestoneStatus: [],
    budgetVariance: [],
    deliverableByStatus: { total: 0, byStatus: {} },
  };

  // Helper to determine if we should include a section based on view
  const includeAll = view === 'all';
  const includeWBS = includeAll || view === 'wbs-gantt';
  const includeCost = includeAll || view === 'cost';
  const includeResourcing = includeAll || view === 'resourcing';
  const includeMilestones = includeAll || view === 'milestones';
  const includeQuality = includeAll || view === 'quality';

  // Build comprehensive snapshot data
  const snapshotData: SnapshotData = {
    metrics: {
      totalHours,
      totalCost,
      totalProjects,
      totalTasks,
      totalEmployees,
      ...evmMetrics,
      eac,
      etc,
      vac,
      tcpi,
    },
    charts: {
      // Include relevant charts based on view
      sCurve: includeCost ? (transformedData.sCurve || emptyCharts.sCurve) : emptyCharts.sCurve,
      laborBreakdown: includeResourcing ? (transformedData.laborBreakdown || emptyCharts.laborBreakdown) : emptyCharts.laborBreakdown,
      resourceHeatmap: includeResourcing ? (transformedData.resourceHeatmap || emptyCharts.resourceHeatmap) : emptyCharts.resourceHeatmap,
      resourceLeveling: includeResourcing ? (transformedData.resourceLeveling || emptyCharts.resourceLeveling) : emptyCharts.resourceLeveling,
      forecast: includeCost ? (transformedData.forecast || emptyCharts.forecast) : emptyCharts.forecast,
      qcMetrics: includeQuality ? {
        qcByNameAndRole: transformedData.qcByNameAndRole || [],
        qcTransactionByGate: transformedData.qcTransactionByGate || [],
        qcTransactionByProject: transformedData.qcTransactionByProject || [],
        qcByGateStatus: transformedData.qcByGateStatus || [],
        qcBySubproject: transformedData.qcBySubproject || [],
        executeHoursSinceLastQC: transformedData.executeHoursSinceLastQC || [],
        exHoursToQCRatio: transformedData.exHoursToQCRatio || [],
        executeHoursSinceLastQCByProject: transformedData.executeHoursSinceLastQCByProject || [],
        qcHoursSinceLastQC: transformedData.qcHoursSinceLastQC || [],
        qcHoursToQCRatio: transformedData.qcHoursToQCRatio || [],
        qcHoursSinceLastQCByProject: transformedData.qcHoursSinceLastQCByProject || [],
        qcPassFailByTask: transformedData.qcPassFailByTask || [],
        qcFeedbackTimeByTask: transformedData.qcFeedbackTimeByTask || [],
        qcPassRatePerMonth: transformedData.qcPassRatePerMonth || [],
        qcOutcomesByMonth: transformedData.qcOutcomesByMonth || [],
        qcFeedbackTimeByMonth: transformedData.qcFeedbackTimeByMonth || [],
        kickoffFeedbackTimeByMonth: transformedData.kickoffFeedbackTimeByMonth || [],
      } : emptyCharts.qcMetrics,
      milestoneStatus: includeMilestones ? (transformedData.milestoneStatus || []) : [],
      budgetVariance: includeCost ? (transformedData.budgetVariance || []) : [],
      deliverableByStatus: includeAll ? (transformedData.deliverableByStatus || emptyCharts.deliverableByStatus) : emptyCharts.deliverableByStatus,
    },
    // WBS Data is heavy, only include if needed
    wbsData: includeWBS ? transformedData.wbsData : undefined,
    hierarchy: {
      portfolio: data.portfolios || [],
      customer: data.customers || [],
      site: data.sites || [],
      project: filteredProjects,
    },
    metadata: {
      view,
    },
  };

  const snapshot: Snapshot = {
    id: snapshotId,
    snapshotId,
    snapshotDate: input.snapshotDate,
    snapshotType: input.snapshotType,
    versionName: input.versionName,
    createdBy: input.createdBy,
    approvedBy: input.approvedBy ?? null,
    approvedAt: input.approvedAt ?? null,
    notes: input.notes ?? null,
    isLocked: input.isLocked ?? false,
    scope: input.scope,
    scopeId: input.scopeId ?? null,
    totalHours,
    totalCost,
    totalProjects,
    totalTasks,
    totalEmployees,
    snapshotData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return snapshot;
}

/**
 * Compute delta between two snapshots
 */
export function computeSnapshotDelta(
  previous: Snapshot,
  current: Snapshot
): SnapshotDelta {
  return {
    actualHoursPeriod: (current.totalHours || 0) - (previous.totalHours || 0),
    actualCostPeriod: (current.totalCost || 0) - (previous.totalCost || 0),
    remainingHoursDelta: 0, // Not directly comparable in unified snapshots
    remainingCostDelta: 0,
  };
}
