/**
 * @fileoverview Route-to-data-views mapping for lazy transform building.
 * Each route only builds the computed views it needs.
 */

export type TransformView =
  | 'wbsData'
  | 'resourceHeatmap'
  | 'resourceGantt'
  | 'laborBreakdown'
  | 'sCurve'
  | 'budgetVariance'
  | 'milestoneStatus'
  | 'qualityHours'
  | 'qc'
  | 'milestones'
  | 'documents'
  | 'resourceLeveling'
  | 'forecast'
  | 'taskHoursEfficiency'
  | 'hierarchy'
  | 'all';

/** Shell tables: minimal for nav, filters, and initial render */
export const SHELL_TABLE_KEYS = [
  'portfolios',
  'customers',
  'sites',
  'projects',
  'employees',
] as const;

/** Map pathname patterns to required transform views */
export const ROUTE_VIEWS: Record<string, TransformView[]> = {
  // WBS Gantt
  '/shared/wbs-gantt-v2': ['wbsData', 'hierarchy'],
  '/project-controls/wbs-gantt': ['wbsData', 'hierarchy'],

  // Resourcing
  '/shared/resourcing': ['resourceHeatmap', 'laborBreakdown', 'resourceGantt', 'hierarchy'],
  '/shared/resource-leveling': ['resourceLeveling', 'resourceGantt', 'hierarchy'],

  // Hours
  '/shared/hours': ['qualityHours', 'laborBreakdown', 'hierarchy'],

  // Milestones
  '/shared/milestones': ['milestones', 'milestoneStatus', 'hierarchy'],

  // QC Dashboard
  '/shared/qc-dashboard': ['qc', 'hierarchy'],

  // Overview / Executive
  '/shared/overview-v2': ['sCurve', 'budgetVariance', 'milestoneStatus', 'wbsData', 'hierarchy'],
  '/insights/overview': ['sCurve', 'budgetVariance', 'milestoneStatus', 'wbsData', 'hierarchy'],

  // Forecast
  '/shared/forecast': ['forecast', 'sCurve', 'hierarchy'],

  // Tasks
  '/shared/tasks': ['taskHoursEfficiency', 'hierarchy'],

  // Mo's Page
  '/shared/mos-page': ['qualityHours', 'laborBreakdown', 'hierarchy'],

  // Data Management - needs hierarchy for filters
  '/shared/data-management': ['hierarchy'],
};

/** Get views for a pathname; returns 'all' if no match (default) */
export function getViewsForPath(pathname: string): TransformView[] {
  // Exact match
  if (ROUTE_VIEWS[pathname]) {
    return ROUTE_VIEWS[pathname];
  }
  // Prefix match (e.g. /role-views/pca/mapping)
  for (const [pattern, views] of Object.entries(ROUTE_VIEWS)) {
    if (pathname.startsWith(pattern)) {
      return views;
    }
  }
  // Default: build all
  return ['all'];
}
