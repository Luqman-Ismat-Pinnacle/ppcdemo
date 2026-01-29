/**
 * @file database-schema.ts
 * @description Unified Database Schema for Pinnacle Project Controls
 * 
 * This file defines the complete type system and interfaces for all data entities.
 * It serves as the single source of truth for the data structure used across:
 * - WBS/Gantt visualization
 * - Hours tracking and labor breakdown
 * - Forecasting and EVM calculations
 * - Sprint planning
 * - QC dashboards
 * - Resource management
 * 
 * @dependencies None (pure type definitions)
 * @dataflow This schema is consumed by:
 *   - lib/unified-data-loader.ts (parsing)
 *   - lib/data-store.ts (state management)
 *   - lib/data-context.tsx (React context)
 *   - All page components via useData() hook
 */

// ============================================================================
// ID PREFIX CONSTANTS
// ============================================================================

/**
 * Standardized ID prefixes for all entity types
 * These prefixes make IDs self-documenting and easily identifiable
 */
export const ID_PREFIXES = {
  PORTFOLIO: 'PRF',
  CUSTOMER: 'CST',
  SITE: 'STE',
  UNIT: 'UNT',
  PROJECT: 'PRJ',
  PHASE: 'PHS',
  TASK: 'TSK',
  SUB_TASK: 'SUB',
  DELIVERABLE: 'DLB',
  EMPLOYEE: 'EMP',
  HOUR_ENTRY: 'HRS',
  QC_TASK: 'QCT',
  MILESTONE: 'MLS',
  SPRINT: 'SPR',
  CHARGE_CODE: 'CHG',
  FORECAST: 'FCT',
  SNAPSHOT: 'SNP',
  DEPENDENCY: 'DEP',
  CHANGE_LOG: 'LOG',
  CHANGE_REQUEST: 'CRQ',
  CHANGE_IMPACT: 'CIM',
  PROJECT_DOCUMENT: 'DOC',
} as const;

export type IdPrefix = typeof ID_PREFIXES[keyof typeof ID_PREFIXES];

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Predecessor relationship types for CPM scheduling
 * FS = Finish-to-Start (most common)
 * SS = Start-to-Start
 * FF = Finish-to-Finish
 * SF = Start-to-Finish (rare)
 */
export type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * WBS hierarchy levels from top to bottom
 */
export type WBSItemType =
  | 'portfolio'
  | 'customer'
  | 'site'
  | 'unit'
  | 'project'
  | 'sub_project'
  | 'phase'
  | 'task'
  | 'sub_task';

/**
 * Task status progression
 */
export type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'On Hold'
  | 'Completed'
  | 'Cancelled';

export type EvMethod = '0/100' | '50/50' | 'milestone' | 'physical';

/**
 * Sprint status values
 */
export type SprintStatus =
  | 'Planning'
  | 'Active'
  | 'Completed'
  | 'Cancelled';

/**
 * QC review types
 */
export type QCType =
  | 'Initial'
  | 'Kickoff'
  | 'Mid'
  | 'Final'
  | 'Post-Validation'
  | 'Field QC'
  | 'Validation';

/**
 * QC status values
 */
export type QCStatus =
  | 'Unprocessed'
  | 'Pass'
  | 'Fail'
  | 'Rework';

/**
 * Billable type for projects
 * T&M = Time and Material
 * FP = Fixed Price
 */
export type BillableType = 'T&M' | 'FP';

/**
 * Import action type for data management
 * E = Edit existing record
 * A = Add new record
 * D = Delete record
 */
export type ImportAction = 'E' | 'A' | 'D' | null;

/**
 * Employee job roles used for Workday imports and role-based filtering
 */
export type EmployeeRole =
  | 'Partner'
  | 'Senior Manager'
  | 'Project Manager'
  | 'Project Lead'
  | 'Technical Lead'
  | 'Technical Manager'
  | 'Technical Writer'
  | 'QA/QC Auditor'
  | 'Data Engineer'
  | 'Data Scientist'
  | 'CAD / Drafter'
  | 'Field Technician'
  | 'IDMS SME'
  | 'Corrosion Engineer'
  | 'Reliability Specialist'
  | 'Senior Reliability Specialist'
  | 'Senior Engineer'
  | 'Process Engineer'
  | 'Deployment Lead'
  | 'Change Lead'
  | 'Training Lead';

// ============================================================================
// BASE TRACKING FIELDS (shared across entities)
// ============================================================================

/**
 * Resource assignment type for tasks and sub-tasks
 * specific = Assigned to a specific named employee
 * generic = Assigned to a role (any employee with that role can fulfill)
 */
export type AssignedResourceType = 'specific' | 'generic';

/**
 * Common tracking fields for schedule, progress, hours, and cost
 * Added to Portfolio, Customer, Site, Project, Phase, Task, Sub-Task, Deliverable
 * 
 * Extended to include:
 * - Hours tracking (baseline, actual)
 * - Cost tracking (baseline, actual)
 * - Predecessor linking (ID and relationship type)
 */
export interface TrackingFields {
  // Schedule dates
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;

  // Progress
  percentComplete: number;
  comments: string;

  // Hours tracking
  baselineHours: number;
  actualHours: number;

  // Cost tracking
  baselineCost: number;
  actualCost: number;

  // Predecessor linking (applies to all hierarchy levels)
  predecessorId: string | null;
  predecessorRelationship: RelationshipType | null;
}

// ============================================================================
// CORE ENTITY TABLES
// ============================================================================

/**
 * Hierarchy Node - Unified table for portfolios, customers, sites, and units
 * ID Prefix: Uses Workday IDs directly where available, otherwise PRF/CST/STE/UNT
 */
export interface HierarchyNode {
  id: string;                     // Primary key (Workday ID if available)
  nodeType: 'portfolio' | 'customer' | 'site' | 'unit';
  name: string;
  parentId: string | null;       // Parent hierarchy node ID
  employeeId: string | null;     // For portfolios: linked employee ID
  location: string | null;
  methodology: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Work Item - Unified table for epics, features, and user stories
 * ID Prefix: EPI/FEA/USR
 */
export interface WorkItem {
  id: string;                     // Primary key
  workItemType: 'epic' | 'feature' | 'user_story';
  name: string;
  description: string | null;
  projectId: string | null;
  parentId: string | null;       // Parent work item ID (for hierarchy)
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string | null;     // Employee ID
  sprintId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Employee - Team member who can be assigned to tasks and log hours
 * ID Prefix: EMP
 */
export interface DBEmployee {
  id: string;                     // EMP_xxx format
  employeeId: string;             // Legacy ID (E1000, E1001, etc.)
  name: string;
  email: string;
  role: EmployeeRole;
  hourlyRate: number;
  managerId: string | null;
  managerName: string | null;
  utilizationPercent: number;     // Target utilization (0-100)
  avgEfficiencyPercent: number;   // Historical efficiency
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Portfolio - Top-level organizational grouping managed by a Senior Manager
 * ID Prefix: PRF
 * Now extends TrackingFields for hours/cost tracking at portfolio level
 */
export interface DBPortfolio extends TrackingFields {
  id: string;                     // PRF_xxx format
  name: string;
  employeeId: string | null;      // Links to Employee table (Sr. Manager)
  srManager: string;              // Senior Manager name (display)
  methodology: string;            // RBI, QRO, etc.
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Customer - Client organization under a portfolio
 * ID Prefix: CST
 */
export interface DBCustomer extends TrackingFields {
  id: string;                     // CST_xxx format
  portfolioId: string;
  employeeId: string | null;      // Assigned account manager
  name: string;
  contactName: string;
  contactEmail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Site - Physical location belonging to a customer
 * ID Prefix: STE
 */
export interface DBSite extends TrackingFields {
  id: string;                     // STE_xxx format
  customerId: string;
  employeeId: string | null;      // Assigned site manager
  name: string;
  location: string;               // City, State format
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Unit - Organizational unit within a site (between Site and Project)
 * ID Prefix: UNT
 * Hierarchy: Portfolio → Customer → Site → Project → Phase → Unit → Task
 */
export interface DBUnit extends TrackingFields {
  id: string;                     // UNT_xxx format
  phaseId: string;                // Links to Phase (new hierarchy level)
  employeeId: string | null;      // Assigned unit manager
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project - Work engagement at a unit/site
 * ID Prefix: PRJ
 * Note: projectNumber column removed, billableType added
 */
export interface DBProject extends TrackingFields {
  id: string;                     // PRJ_xxx format
  siteId: string;
  customerId: string;
  portfolioId: string;
  name: string;
  projectType: string;            // 'Standard RBI', 'QRO', etc.
  billableType: BillableType;     // 'T&M' or 'FP'
  description: string;
  managerId: string;
  managerName: string;

  // Dates (inherited from TrackingFields, plus additional)
  startDate: string;
  endDate: string;
  plannedStartDate: string;
  plannedEndDate: string;

  // Budget & Hours
  baselineBudget: number;
  baselineHours: number;
  actualBudget: number;
  actualHours: number;
  eacBudget: number;              // Estimate at Completion
  eacHours: number;

  // EVM Metrics (computed)
  cpi: number;                    // Cost Performance Index
  spi: number;                    // Schedule Performance Index

  // TPW Flags
  isOverhead: boolean;
  isTpw: boolean;                 // "The Pinnacle Way" project

  status: TaskStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase - Major project phase (Phase 0, Phase 1, etc.)
 * ID Prefix: PHS
 * Note: code column removed
 */
export interface DBPhase extends TrackingFields {
  id: string;                     // PHS_xxx format
  projectId: string;
  employeeId: string | null;      // Assigned phase lead
  name: string;
  sequence: number;
  description: string;
  startDate: string;
  endDate: string;
  baselineHours: number;
  actualHours: number;
  isActive: boolean;
  evMethod?: EvMethod;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task - Work item within a phase
 * ID Prefix: TSK (for tasks), SUB (for sub-tasks)
 */
export interface DBTask extends TrackingFields {
  id: string;                     // TSK_xxx or SUB_xxx format
  phaseId: string;
  projectId: string;
  parentTaskId: string | null;    // For sub-tasks

  // Identification
  wbsCode: string;
  name: string;
  description: string;

  // Assignment
  assignedResourceId: string | null;
  assignedResourceName: string | null;
  assignedResourceType: AssignedResourceType;  // 'specific' or 'generic'
  assignedResource: string;                    // Employee name (specific) or Role name (generic)

  // Scheduling
  startDate: string;
  endDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  daysRequired: number;

  // Hours & Cost
  baselineHours: number;
  actualHours: number;
  projectedRemainingHours: number;
  baselineCost: number;
  actualCost: number;
  remainingCost: number;

  // Quantity & Count
  baselineQty: number;
  actualQty: number;
  completedQty: number;
  baselineCount: number;
  baselineMetric: string | null;
  baselineUom: string;
  actualCount: number;
  completedCount: number;
  uom: string;

  // DevOps Integration
  userStoryId: string | null;
  sprintId: string | null;

  // Progress
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evMethod?: EvMethod;

  // CPM Fields
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;

  // Flags
  isMilestone: boolean;
  isSubTask: boolean;

  // Metadata
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task Dependency - Predecessor/successor relationship between tasks
 * ID Prefix: DEP
 */
export interface DBTaskDependency {
  id: string;                     // DEP_xxx format
  taskId: string;                 // The dependent task
  predecessorTaskId: string;      // The task this depends on
  relationship: RelationshipType;
  lagDays: number;                // Positive = delay, Negative = lead
  createdAt: string;
  updatedAt: string;
}

export interface DBProgressClaim {
  id: string;
  taskId: string;
  claimDate: string;
  claimedEv: number;
  claimedPct: number;
  notes: string;
  evidenceLink: string;
  claimedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// OPERATIONAL TABLES
// ============================================================================

/**
 * HourEntry - Time logged by an employee against a task
 * ID Prefix: HRS
 */
export interface DBHourEntry {
  id: string;                     // HRS_xxx format
  employeeId: string;
  employeeName: string;
  taskId: string | null;
  projectId: string;
  phaseId: string | null;
  userStoryId: string | null;
  chargeCode: string;
  date: string;                   // YYYY-MM-DD
  hours: number;
  description: string;
  role: EmployeeRole;
  isBillable: boolean;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * QCTask - Quality control review record
 * ID Prefix: QCT
 */
export interface DBQCTask {
  id: string;                     // QCT_xxx format
  taskId: string;
  projectId: string;
  employeeId: string | null;      // Assigned QC reviewer

  // QC Assignment
  qcResourceId: string;
  qcResourceName: string;

  // QC Details
  qcType: QCType;
  qcStatus: QCStatus;
  qcHours: number;
  qcScore: number;                // 0-100
  qcCount: number;                // Number of items reviewed
  qcUOM: string;                  // Unit of measure (documents, assets, rows, etc.)

  // Errors
  criticalErrors: number;
  nonCriticalErrors: number;

  // Dates
  startDate: string;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;

  // Notes
  comments: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Deliverable - Project output document or artifact
 * ID Prefix: DLB
 */
export interface DBDeliverable extends TrackingFields {
  id: string;                     // DLB_xxx format
  taskId: string | null;
  projectId: string;
  phaseId: string;
  milestoneId: string | null;    // Primary relationship to milestone
  employeeId: string | null;      // Assigned deliverable owner

  name: string;
  type: string;                   // 'DRD', 'QMP', 'SOP', 'Workflow', etc.
  status: 'Not Started' | 'In Progress' | 'Under Review' | 'Approved' | 'Rejected';

  assigneeId: string;
  assigneeName: string;

  dueDate: string;
  completedDate: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Milestone - Key project checkpoint
 * ID Prefix: MLS
 */
export interface DBMilestone {
  id: string;                     // MLS_xxx format
  projectId: string;
  phaseId: string | null;
  taskId: string | null;          // Optional link to specific task

  name: string;
  description: string;

  status: 'Not Started' | 'In Progress' | 'Completed' | 'Missed';
  percentComplete: number;

  plannedDate: string;
  forecastedDate: string;
  actualDate: string | null;
  varianceDays: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * Sprint - Agile sprint for task grouping
 * ID Prefix: SPR
 */
export interface DBSprint {
  id: string;                     // SPR_xxx format
  sprintId: string;
  projectId: string;

  name: string;                   // 'Sprint 1', 'Sprint 2', etc.
  number?: number;

  startDate: string | null;
  endDate: string | null;

  status: SprintStatus | string;
  goal?: string;

  // Computed fields
  totalTasks?: number;
  completedTasks?: number;
  totalHours?: number;
  completedHours?: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * SprintTask - Links tasks to sprints
 */
export interface DBSprintTask {
  id: string;
  sprintId: string;
  taskId: string;
  sequence: number;               // Order within sprint
  createdAt: string;
  updatedAt: string;
}

/**
 * Forecast - Historical forecast snapshot
 * ID Prefix: FCT
 */
export interface DBForecast {
  id: string;                     // FCT_xxx format
  projectId: string;
  date: string;                   // Snapshot date

  // Budget Forecasts
  eacBudget: number;
  bacBudget: number;
  varianceBudget: number;

  // Hours Forecasts
  eacHours: number;
  bacHours: number;
  varianceHours: number;

  // EVM Metrics at time of forecast
  cpi: number;
  spi: number;
  tcpi: number;

  // Monte Carlo results (if applicable)
  p10Cost: number | null;
  p50Cost: number | null;
  p90Cost: number | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Snapshot - Unified comprehensive snapshot with all calculated data
 * ID Prefix: SNP
 */
export interface DBSnapshot {
  id: string;                     // SNP_xxx format
  snapshotId: string;             // Grouping ID for snapshot run
  snapshotDate: string;           // Week ending date (YYYY-MM-DD)
  snapshotType: 'baseline' | 'forecast' | 'workday' | 'manual' | 'auto';
  versionName: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  isLocked: boolean;
  scope: 'project' | 'site' | 'customer' | 'portfolio' | 'all';
  scopeId: string | null;          // ID of the scoped entity
  totalHours: number | null;
  totalCost: number | null;
  totalProjects: number | null;
  totalTasks: number | null;
  totalEmployees: number | null;
  snapshotData: any;               // JSONB - comprehensive data structure
  createdAt: string;
  updatedAt: string;
}


// ============================================================================
// CHANGE CONTROL (REQUESTS + IMPACTS)
// ============================================================================

export interface DBChangeRequest {
  id: string;                     // CRQ_xxx format
  projectId: string;
  title: string;
  description: string;
  category: string;
  status: 'submitted' | 'assessed' | 'approved' | 'rejected' | 'implemented';
  submittedBy: string;
  submittedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DBChangeImpact {
  id: string;                     // CIM_xxx format
  changeRequestId: string;
  entityLevel: 'project' | 'phase' | 'task';
  projectId: string;
  phaseId: string | null;
  taskId: string | null;
  deltaBaselineHours: number;
  deltaBaselineCost: number;
  deltaStartDays: number;
  deltaEndDays: number;
  deltaQty: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CHANGE LOG
// ============================================================================

/**
 * ChangeLogEntry - Audit trail for data changes
 * ID Prefix: LOG
 */
export interface DBChangeLogEntry {
  id: string;                     // LOG_xxx format
  timestamp: string;
  userId: string;
  userName: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'export';
  entityType: string;             // 'Task', 'Project', 'HourEntry', etc.
  entityId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
}

// ============================================================================
// COMPUTED/DERIVED VIEWS (for charts and reports)
// ============================================================================

/**
 * LaborBreakdown - Aggregated hours view
 */
export interface LaborBreakdownView {
  weeks: string[];
  byWorker: {
    name: string;
    role: EmployeeRole;
    chargeCode: string;
    data: number[];
    total: number;
    project: string;
    portfolio: string;
    customer: string;
    site: string;
  }[];
  byPhase: {
    name: string;
    data: number[];
    total: number;
    project: string;
  }[];
  byTask: {
    name: string;
    data: number[];
    total: number;
    project: string;
  }[];
}

/**
 * ResourceHeatmap - Resource utilization grid
 */
export interface ResourceHeatmapView {
  resources: string[];
  weeks: string[];
  data: number[][];               // Hours per resource per week
}

/**
 * SCurve - Cumulative progress over time
 */
export interface SCurveView {
  dates: string[];
  planned: number[];
  actual: number[];
  forecast: number[];
}

/**
 * EVMMetrics - Earned Value Management metrics
 */
export interface EVMMetrics {
  pv: number;                     // Planned Value (BCWS)
  ev: number;                     // Earned Value (BCWP)
  ac: number;                     // Actual Cost (ACWP)
  bac: number;                    // Budget at Completion
  sv: number;                     // Schedule Variance (EV - PV)
  cv: number;                     // Cost Variance (EV - AC)
  spi: number;                    // Schedule Performance Index (EV / PV)
  cpi: number;                    // Cost Performance Index (EV / AC)
  eac: number;                    // Estimate at Completion
  etc: number;                    // Estimate to Complete
  vac: number;                    // Variance at Completion
  tcpi: number;                   // To-Complete Performance Index
}

// ============================================================================
// PROJECT HEALTH & LOG
// ============================================================================

/**
 * ProjectHealth - Project health assessment record
 * ID Prefix: PHC
 */
export interface DBProjectHealth {
  id: string;
  projectId: string;
  projectName: string;
  workdayStatus: string | null;
  scheduleRequired: boolean;
  totalContract: number;
  revTd: number;                   // Revenue To Date
  billedTd: number;                // Billed To Date
  latestForecastedCost: number;
  forecastedGp: number;
  forecastedGm: number;
  baselineWork: number;
  actualWork: number;
  remainingWork: number;
  workVariance: number;
  baselineCost: number;
  actualCost: number;
  scheduleForecastedCost: number;
  costVariance: number;
  scheduleCostForecastedCostVariance: number;
  overallStatus: string;
  overallScore: number;
  checks: any; // JSONB
  approvals: any; // JSONB
  createdAt: string;
  updatedAt: string;
}

/**
 * ProjectLog - Project log entry
 * ID Prefix: LOG
 */
export interface DBProjectLog {
  id: string;
  logId: string;
  projectId: string;
  portfolioId: string | null;
  customerId: string | null;
  siteId: string | null;
  type: 'Assumptions' | 'Issue' | 'Risks' | 'Decisions' | 'Change' |
  'Stakeholder' | 'Lesson Learned' | 'Success/Win' | 'TWP Actions' |
  'Variance Explanation';
  dateOpened: string;
  addedBy: string;
  internalExternal: 'Internal' | 'External' | null;
  description: string | null;
  owner: string | null;
  dueBy: string | null;
  mitigation: string | null;
  status: string;
  dateClosed: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ProjectDocument - File storage metadata
 * ID Prefix: DOC
 */
export interface DBProjectDocument {
  id: string;
  documentId: string;
  projectId: string | null;
  customerId: string | null;
  siteId: string | null;
  name: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentType: 'DRD' | 'QMP' | 'SOP' | 'Workflow' | 'MPP' | 'Excel' | 'PDF' | 'Word' | 'Other';
  storagePath: string;
  storageBucket: string;
  uploadedBy: string | null;
  uploadedAt: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// DEVOPS / SPRINT PLANNING
// ============================================================================


/**
 * Epic - High-level feature grouping
 * ID Prefix: EPI
 */
export interface DBEpic {
  id: string;
  epicId: string;
  name: string;
  projectId: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature - Mid-level functionality within an epic
 * ID Prefix: FTR
 */
export interface DBFeature {
  id: string;
  featureId: string;
  name: string;
  epicId: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UserStory - Detailed requirement with acceptance criteria
 * ID Prefix: USR
 */
export interface DBUserStory {
  id: string;
  userStoryId: string;
  name: string;
  featureId: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: string;
  sprintId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// UNIFIED DATA STRUCTURE
// ============================================================================

/**
 * UnifiedData - Complete data structure for the application
 * This is the shape of data after parsing and processing
 */
export interface UnifiedData {
  // Core Entities
  employees: DBEmployee[];
  portfolios: DBPortfolio[];
  customers: DBCustomer[];
  sites: DBSite[];
  units: DBUnit[];                // Units between Site and Project
  projects: DBProject[];
  phases: DBPhase[];
  tasks: DBTask[];
  subTasks: DBTask[];             // Sub-tasks stored separately for clarity
  taskDependencies: DBTaskDependency[];

  // Operational Tables
  hours: DBHourEntry[];
  qcTasks: DBQCTask[];
  deliverables: DBDeliverable[];
  milestones: DBMilestone[];
  sprints: DBSprint[];
  sprintTasks: DBSprintTask[];
  forecasts: DBForecast[];
  snapshots: DBSnapshot[];
  changeRequests: DBChangeRequest[];
  changeImpacts: DBChangeImpact[];
  projectHealth: DBProjectHealth[];
  projectLog: DBProjectLog[];
  projectDocuments: DBProjectDocument[];

  // DevOps
  epics: DBEpic[];
  features: DBFeature[];
  userStories: DBUserStory[];

  // Change Log
  changeLog: DBChangeLogEntry[];

  // Computed Views (populated by unified-data-loader)
  laborBreakdown: LaborBreakdownView;
  resourceHeatmap: ResourceHeatmapView;
  sCurve: SCurveView;

  // Metadata
  lastUpdated: string;
  dataVersion: string;
}

// ============================================================================
// ROLE TO EMPLOYEE MAPPING (standard role assignments)
// ============================================================================

/**
 * Default employee mapping for roles
 * Used when generating sample data
 */
export const ROLE_TO_EMPLOYEE: Record<EmployeeRole, { name: string; id: string }> = {
  'Partner': { name: 'Milea Cosby', id: 'E1000' },
  'Project Manager': { name: 'Alex Johnson', id: 'E1001' },
  'Senior Manager': { name: 'Gus Barrera', id: 'E1002' },
  'Project Lead': { name: 'Nicole Brown', id: 'E1003' },
  'Technical Lead': { name: 'Clark Thannisch', id: 'E1004' },
  'Technical Manager': { name: 'Clark Thannisch', id: 'E1004' },
  'Technical Writer': { name: 'Sam Patel', id: 'E1005' },
  'QA/QC Auditor': { name: 'Jordan Lee', id: 'E1006' },
  'Data Engineer': { name: 'Taylor Nguyen', id: 'E1007' },
  'CAD / Drafter': { name: 'Chris Morales', id: 'E1008' },
  'Field Technician': { name: 'Riley Smith', id: 'E1009' },
  'IDMS SME': { name: 'Jamie Carter', id: 'E1010' },
  'Corrosion Engineer': { name: 'Priya Singh', id: 'E1011' },
  'Data Scientist': { name: 'Ethan Brooks', id: 'E1012' },
  'Reliability Specialist': { name: 'Aisha Khan', id: 'E1013' },
  'Senior Reliability Specialist': { name: 'Diego Martinez', id: 'E1014' },
  'Senior Engineer': { name: 'Olivia Brown', id: 'E1015' },
  'Process Engineer': { name: "Michael O'Neill", id: 'E1016' },
  'Deployment Lead': { name: 'Ben Ruffolo', id: 'E1017' },
  'Change Lead': { name: 'Sara Collins', id: 'E1018' },
  'Training Lead': { name: 'Lena Park', id: 'E1019' },
};

/**
 * Hourly rates by role (approximate, for sample data)
 */
export const ROLE_HOURLY_RATES: Record<EmployeeRole, number> = {
  'Partner': 350,
  'Senior Manager': 275,
  'Project Manager': 200,
  'Project Lead': 175,
  'Technical Lead': 225,
  'Technical Manager': 225,
  'Technical Writer': 125,
  'QA/QC Auditor': 150,
  'Data Engineer': 150,
  'Data Scientist': 175,
  'CAD / Drafter': 100,
  'Field Technician': 95,
  'IDMS SME': 160,
  'Corrosion Engineer': 185,
  'Reliability Specialist': 165,
  'Senior Reliability Specialist': 195,
  'Senior Engineer': 190,
  'Process Engineer': 180,
  'Deployment Lead': 175,
  'Change Lead': 165,
  'Training Lead': 155,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Auto-incrementing counters for each entity type */
const idCounters: Record<string, number> = {};

/**
 * Generate a unique ID with the standardized prefix
 * @param prefix - One of the ID_PREFIXES values (PRF, CST, STE, etc.)
 * @returns Formatted ID string like "PRF-0001"
 */
export function generateId(prefix: string = ''): string {
  if (!prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
  }

  // Initialize counter if needed
  if (!idCounters[prefix]) {
    idCounters[prefix] = 0;
  }

  // Increment and format
  idCounters[prefix]++;
  const randomSuffix = Math.random().toString(36).substring(2, 5);
  const paddedNumber = idCounters[prefix].toString().padStart(4, '0');
  return `${prefix}-${paddedNumber}-${randomSuffix}`;
}

/**
 * Reset ID counter for a specific prefix (useful for testing)
 */
export function resetIdCounter(prefix: string): void {
  idCounters[prefix] = 0;
}

/**
 * Set ID counter for a specific prefix (useful when loading existing data)
 */
export function setIdCounter(prefix: string, value: number): void {
  idCounters[prefix] = value;
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

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
 * Create an empty UnifiedData structure
 */
export function createEmptyUnifiedData(): UnifiedData {
  return {
    employees: [],
    portfolios: [],
    customers: [],
    sites: [],
    units: [],
    projects: [],
    phases: [],
    tasks: [],
    subTasks: [],
    taskDependencies: [],
    hours: [],
    qcTasks: [],
    deliverables: [],
    milestones: [],
    sprints: [],
    sprintTasks: [],
    forecasts: [],
    snapshots: [],
    changeRequests: [],
    changeImpacts: [],
    projectHealth: [],
    projectLog: [],
    projectDocuments: [],
    epics: [],
    features: [],
    userStories: [],
    changeLog: [],
    laborBreakdown: { weeks: [], byWorker: [], byPhase: [], byTask: [] },
    resourceHeatmap: { resources: [], weeks: [], data: [] },
    sCurve: { dates: [], planned: [], actual: [], forecast: [] },
    lastUpdated: getCurrentTimestamp(),
    dataVersion: '2.0.0',
  };
}

/**
 * Extract entity type from prefixed ID
 * @param id - ID like "PRF-0001"
 * @returns Entity type or null if not recognized
 */
export function getEntityTypeFromId(id: string): string | null {
  const prefix = id.split('-')[0];
  const prefixToType: Record<string, string> = {
    [ID_PREFIXES.PORTFOLIO]: 'Portfolio',
    [ID_PREFIXES.CUSTOMER]: 'Customer',
    [ID_PREFIXES.SITE]: 'Site',
    [ID_PREFIXES.UNIT]: 'Unit',
    [ID_PREFIXES.PROJECT]: 'Project',
    [ID_PREFIXES.PHASE]: 'Phase',
    [ID_PREFIXES.TASK]: 'Task',
    [ID_PREFIXES.SUB_TASK]: 'Sub-Task',
    [ID_PREFIXES.DELIVERABLE]: 'Deliverable',
    [ID_PREFIXES.EMPLOYEE]: 'Employee',
    [ID_PREFIXES.HOUR_ENTRY]: 'HourEntry',
    [ID_PREFIXES.QC_TASK]: 'QCTask',
    [ID_PREFIXES.MILESTONE]: 'Milestone',
    [ID_PREFIXES.SPRINT]: 'Sprint',
    [ID_PREFIXES.CHARGE_CODE]: 'ChargeCode',
    [ID_PREFIXES.FORECAST]: 'Forecast',
    [ID_PREFIXES.CHANGE_REQUEST]: 'ChangeRequest',
    [ID_PREFIXES.CHANGE_IMPACT]: 'ChangeImpact',
  };
  return prefixToType[prefix] || null;
}
