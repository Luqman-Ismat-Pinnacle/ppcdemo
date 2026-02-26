/**
 * @fileoverview Canonical role workstation contracts.
 *
 * Defines normalized role keys, navigation models, and capability flags used by
 * route shells, action bars, and server/client permission checks.
 */

export type RoleViewKey =
  | 'product_owner'
  | 'pcl'
  | 'pca'
  | 'project_lead'
  | 'senior_manager'
  | 'coo'
  | 'rda'
  | 'client_portal';

export interface RolePreset {
  key: RoleViewKey;
  label: string;
  dashboardRoute: string;
  description: string;
}

export interface RoleNavItem {
  label: string;
  href: string;
  description?: string;
}

export interface RoleNavConfig {
  role: RoleViewKey;
  title: string;
  items: RoleNavItem[];
}

export interface WorkflowPermissions {
  uploadPlans: boolean;
  publishPlans: boolean;
  editMapping: boolean;
  editWbs: boolean;
  annotateWbs: boolean;
  updateForecast: boolean;
  manageDocuments: boolean;
  submitCommitments: boolean;
  triageExceptions: boolean;
  viewPortfolioCompliance: boolean;
  queryAiBriefing: boolean;
}

export interface WbsRoleCapabilities {
  canEditStructure: boolean;
  canEditDependencies: boolean;
  canEditProgress: boolean;
  canEditAssignments: boolean;
  canAnnotate: boolean;
  canEscalate: boolean;
  scope: 'portfolio' | 'assigned_projects' | 'owned_projects' | 'project';
}

/**
 * Shared response envelope for role workstation data contracts.
 */
export interface RolePageDataResponse<TData> {
  success: boolean;
  scope: string;
  generatedAt: string;
  data: TData;
  warnings?: string[];
  error?: string;
}

export interface RoleQueueItem {
  id: string;
  queueType: 'mapping' | 'plan_upload' | 'data_quality' | 'exception' | 'task';
  severity: 'info' | 'warning' | 'critical';
  projectId: string | null;
  projectName: string | null;
  customerName?: string | null;
  description: string;
  metricValue?: number | null;
  actionHref: string;
  actionLabel: string;
}

export interface PlanStatusRow {
  projectId: string;
  projectName: string;
  customerName: string | null;
  lastUploadAt: string | null;
  daysSinceUpload: number | null;
  taskCount: number;
  baselineSet: boolean;
  healthScore: number | null;
  status: 'missing' | 'overdue' | 'due_soon' | 'healthy';
}

export interface PlanUploadVersionSummary {
  id: string;
  projectId: string;
  uploadedAt: string;
  uploadedBy: string | null;
  parserWarnings: number;
  taskCount: number;
  phaseCount: number;
  storagePath: string | null;
}

export interface MappingOversightRow {
  projectId: string;
  projectName: string;
  unmappedHours: number;
  highConfidenceSuggestions: number;
  coveragePercent: number;
}

export interface StaleMappingAlert {
  projectId: string;
  projectName: string;
  taskId: string | null;
  mappedEntryCount: number;
  reason: string;
}

export interface DataQualityIssue {
  id: string;
  issueType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  projectId: string | null;
  projectName?: string | null;
  sourceTable: string;
  sourceColumn: string | null;
  suggestedAction: string;
  daysOpen?: number;
}

export interface DataQualityTrendPoint {
  weekKey: string;
  unmappedHours: number;
  ghostProgress: number;
  stalledTasks: number;
  pastDueTasks: number;
  totalIssues: number;
}

export interface ExceptionRow {
  id: number;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  source: string;
  relatedProjectId: string | null;
  createdAt: string;
}

export interface ExceptionBulkActionRequest {
  ids: number[];
  status: 'acknowledged' | 'resolved' | 'open';
  acknowledgedBy?: string;
}

export interface ComplianceMatrixGroupRow {
  portfolioName: string | null;
  customerName: string | null;
  projectId: string;
  projectName: string;
  pwaSchedule: boolean;
  hasBaseline: boolean;
  maintenanceHealthy: boolean;
  baselineHealth: number | null;
  scheduleHealth: number | null;
  costHealth: number | null;
  overallHealth: number | null;
  openIssues: number;
  overdueTasks: number;
}

export interface CommitmentDecisionRequest {
  id: string;
  status: 'draft' | 'submitted' | 'reviewed' | 'escalated' | 'approved' | 'rejected';
  reviewNote?: string | null;
  reviewerEmail?: string | null;
}

export interface CommitmentDecisionResult {
  id: string;
  projectId: string;
  periodKey: string;
  ownerRole: string;
  status: string;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  updatedAt: string;
}
