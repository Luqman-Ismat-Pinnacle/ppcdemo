/**
 * @fileoverview Core type definitions for PPC V3 application data structures.
 * 
 * This module defines all interfaces and types used throughout the application
 * for representing project data, including hierarchies, metrics, employees,
 * tasks, deliverables, and various analytics data structures.
 * 
 * Updated to align with database-schema.ts:
 * - Standardized ID prefixes (PRF, CST, STE, PRJ, PHS, TSK, SUB, DLB)
 * - Added tracking fields (baselineStartDate, baselineEndDate, actualStartDate, actualEndDate, percentComplete, comments)
 * - Added billableType to projects
 * - Added employeeId to portfolios
 * - Removed projectNumber from projects
 * - Removed code from phases
 * 
 * @module types/data
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

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

// ============================================================================
// BASE TRACKING FIELDS (shared across entities)
// ============================================================================

/**
 * Predecessor relationship types for scheduling
 * FS = Finish-to-Start (default)
 * SS = Start-to-Start
 * FF = Finish-to-Finish
 * SF = Start-to-Finish
 */
export type PredecessorRelationship = 'FS' | 'SS' | 'FF' | 'SF' | null;

/**
 * Resource assignment type for tasks and sub-tasks
 * specific = Assigned to a specific named employee
 * generic = Assigned to a role (any employee with that role can fulfill)
 */
export type AssignedResourceType = 'specific' | 'generic';

/**
 * Common tracking fields for schedule, progress, and cost
 * Added to Portfolio, Customer, Site, Project, Phase, Task, Sub-Task, Deliverable
 * 
 * Extended to include:
 * - Hours tracking (baseline, actual)
 * - Cost tracking (baseline, actual)
 * - Predecessor linking (ID and relationship type)
 * 
 * @interface TrackingFields
 */
export interface TrackingFields {
  id?: string;
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
  remainingHours?: number;

  // Cost tracking
  baselineCost: number;
  actualCost: number;
  remainingCost?: number;

  // Status
  isActive?: boolean;

  // Predecessor linking (applies to all hierarchy levels)
  predecessorId: string | null;
  predecessorRelationship: PredecessorRelationship;
}

// ============================================================================
// HIERARCHY TYPES
// ============================================================================

/**
 * Represents a portfolio in the organizational hierarchy.
 * A portfolio is the top-level container that groups customers.
 * 
 * @interface Portfolio
 * @property {string} id - Unique identifier for the portfolio (PRF-xxxx format)
 * @property {string} name - Display name of the portfolio
 * @property {string} manager - Name of the portfolio manager
 * @property {string} methodology - Project methodology used (e.g., "Agile", "Waterfall")
 * @property {Customer[]} customers - Array of customers under this portfolio
 */
export interface Portfolio {
  id: string;
  name: string;
  manager: string;
  methodology: string;
  customers: Customer[];
}

/**
 * Represents a customer in the organizational hierarchy.
 * A customer belongs to a portfolio and contains sites.
 * 
 * @interface Customer
 * @property {string} id - Unique identifier for the customer (CST-xxxx format)
 * @property {string} name - Customer organization name
 * @property {Site[]} sites - Array of customer sites
 */
export interface Customer {
  id: string;
  name: string;
  sites: Site[];
}

/**
 * Represents a physical site or location for a customer.
 * A site contains projects being executed at that location.
 * 
 * @interface Site
 * @property {string} id - Unique identifier for the site (STE-xxxx format)
 * @property {string} name - Site name or location identifier
 * @property {Project[]} projects - Array of projects at this site
 */
export interface Site {
  id: string;
  name: string;
  projects: Project[];
}

/**
 * Represents a project within a site.
 * A project is a unit of work with defined phases.
 * 
 * @interface Project
 * @property {string} id - Unique identifier for the project (PRJ-xxxx format)
 * @property {string} name - Project name or title
 * @property {string[]} phases - Array of phase names in this project
 */
export interface Project {
  id: string;
  name: string;
  phases: string[];
}

/**
 * Root hierarchy container holding all portfolios.
 * This is the main entry point for navigating the organizational structure.
 * 
 * @interface Hierarchy
 * @property {Portfolio[]} portfolios - Array of all portfolios in the system
 */
export interface Hierarchy {
  portfolios: Portfolio[];
}

// ============================================================================
// CHART & VISUALIZATION DATA TYPES
// ============================================================================

/**
 * Data structure for S-Curve visualization.
 * Compares planned vs actual progress over time.
 * 
 * @interface SCurveData
 * @property {string[]} dates - Array of date labels for the x-axis
 * @property {number[]} planned - Cumulative planned values at each date
 * @property {number[]} actual - Cumulative actual values at each date
 */
export interface SCurveData {
  dates: string[];
  planned: number[];
  actual: number[];
  forecast: number[];
}

/**
 * Single item in a budget variance waterfall chart.
 * Represents a change in budget from one state to another.
 * 
 * @interface BudgetVarianceItem
 * @property {string} name - Label for this variance item
 * @property {number} value - Monetary value of the variance
 * @property {'start' | 'increase' | 'decrease' | 'end'} type - Type of variance for chart rendering
 */
export interface BudgetVarianceItem {
  name: string;
  value: number;
  type: 'start' | 'increase' | 'decrease' | 'end';
}

/**
 * Data for milestone status pie chart segments.
 * 
 * @interface MilestoneStatusItem
 * @property {string} name - Status category name (e.g., "Completed", "In Progress")
 * @property {number} value - Count or value for this status
 * @property {string} color - Hex color code for chart rendering
 */
export interface MilestoneStatusItem {
  name: string;
  value: number;
  color: string;
}

// ============================================================================
// METRICS & ANALYSIS TYPES
// ============================================================================

/**
 * Count metrics analysis data for task-level performance tracking.
 * Used to identify tasks with efficiency or quality issues.
 * 
 * @interface CountMetricsAnalysis
 * @property {string} project - Project name or identifier
 * @property {string} task - Task name or identifier
 * @property {number} remainingHours - Estimated hours remaining
 * @property {number} count - Total count of items or units
 * @property {number} metric - Calculated metric value
 * @property {number} defensible - Defensible or expected value
 * @property {number} variance - Difference between metric and defensible
 * @property {'good' | 'warning' | 'bad'} status - Performance status indicator
 */
export interface CountMetricsAnalysis {
  project: string;
  task: string;
  remainingHours: number;
  count: number;
  metric: number;
  defensible: number;
  variance: number;
  status: 'good' | 'warning' | 'bad';
}

/**
 * Efficiency metrics at the project level.
 * Aggregates performance indicators across a project.
 * 
 * @interface ProjectsEfficiencyMetrics
 * @property {string} project - Project name
 * @property {string} portfolio - Parent portfolio name
 * @property {string} customer - Customer name
 * @property {string} site - Site name
 * @property {number} efficiency - Overall efficiency percentage (0-100+)
 * @property {number} metricsRatio - Ratio of actual to planned metrics
 * @property {number} remainingHours - Total remaining hours
 * @property {'ok' | 'watch' | 'high_metrics'} flag - Status flag for attention
 */
export interface ProjectsEfficiencyMetrics {
  project: string;
  portfolio: string;
  customer: string;
  site: string;
  efficiency: number;
  metricsRatio: number;
  remainingHours: number;
  flag: 'ok' | 'watch' | 'high_metrics';
}

/**
 * Task hours efficiency data for bar chart visualization.
 * Compares actual worked vs estimated hours across tasks.
 * 
 * @interface TaskHoursEfficiency
 * @property {string[]} tasks - Array of task names
 * @property {number[]} actualWorked - Actual hours worked per task
 * @property {number[]} estimatedAdded - Estimated additional hours per task
 * @property {number[]} efficiency - Efficiency percentage per task
 * @property {string[]} project - Project name for each task
 */
export interface TaskHoursEfficiency {
  tasks: string[];
  actualWorked: number[];
  estimatedAdded: number[];
  efficiency: number[];
  project: string[];
}

/**
 * Quality hours breakdown by category.
 * Shows distribution of work across quality-related activities.
 * 
 * @interface QualityHours
 * @property {string[]} tasks - Array of task names
 * @property {string[]} categories - Quality categories (e.g., "QC", "Rework")
 * @property {number[][]} data - Matrix of hours [task][category]
 * @property {number[]} qcPercent - QC percentage per task
 * @property {number[]} poorQualityPercent - Poor quality work percentage
 * @property {string[]} project - Project name for each task
 */
export interface QualityHours {
  tasks: string[];
  categories: string[];
  data: number[][];
  qcPercent: number[];
  poorQualityPercent: number[];
  project: string[];
}

/**
 * Non-execute hours breakdown and analysis.
 * Tracks time spent on non-productive or overhead activities.
 * 
 * @interface NonExecuteHours
 * @property {number} total - Total non-execute hours
 * @property {number} fte - Full-time equivalent impact
 * @property {number} percent - Percentage of total hours
 * @property {Array<{name: string; value: number; color: string}>} tpwComparison - TPW comparison breakdown
 * @property {Array<{name: string; value: number; color: string}>} otherBreakdown - Other categories breakdown
 */
export interface NonExecuteHours {
  total: number;
  fte: number;
  percent: number;
  tpwComparison: Array<{ name: string; value: number; color: string }>;
  otherBreakdown: Array<{ name: string; value: number; color: string }>;
}

// ============================================================================
// ENTITY TABLE TYPES
// These mirror database table structures
// ============================================================================

/**
 * Employee record with HR and assignment data.
 * 
 * @interface Employee
 * @property {string} employeeId - Unique employee identifier (EMP-xxxx format)
 * @property {string} name - Full name of the employee
 * @property {string} jobTitle - Current job title
 * @property {string} managementLevel - Management tier
 * @property {string} manager - Direct manager's name
 * @property {string} email - Work email address
 * @property {string} employeeType - Employment type (FTE, Contractor, etc.)
 * @property {string} createdAt - ISO timestamp of record creation
 * @property {string} updatedAt - ISO timestamp of last update
 */
export interface Employee {
  id?: string;
  employeeId: string;
  name: string;
  jobTitle: string;
  managementLevel: string;
  manager: string;
  email: string;
  employeeType: string;
  role?: string;
  department?: string;
  hourlyRate?: number;
  utilizationPercent?: number;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Portfolio database table record.
 * Extended version of Portfolio with audit fields.
 * Now includes employeeId to link to the Employee table.
 * Includes full tracking fields for schedule, hours, and costs.
 * 
 * @interface PortfolioTable
 */
export interface PortfolioTable extends TrackingFields {
  portfolioId: string;            // PRF-xxxx format
  name: string;
  employeeId: string | null;      // Links to Employee table (Sr. Manager)
  manager: string;
  methodology: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Customer database table record.
 * Links to a portfolio via portfolioId.
 * Includes tracking fields for schedule and progress.
 * 
 * @interface CustomerTable
 */
export interface CustomerTable extends TrackingFields {
  customerId: string;             // CST-xxxx format
  name: string;
  portfolioId: string;
  employeeId: string;             // Assigned account manager
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Site database table record.
 * Links to a customer via customerId.
 * Includes tracking fields for schedule and progress.
 * 
 * @interface SiteTable
 */
export interface SiteTable extends TrackingFields {
  siteId: string;                 // STE-xxxx format
  name: string;
  customerId: string;
  employeeId: string;             // Assigned site manager
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Unit database table record with full metadata.
 * Represents an organizational unit between Site and Project.
 * Hierarchy: Portfolio → Customer → Site → Project → Phase → Unit → Task
 * 
 * @interface UnitTable
 */
export interface UnitTable extends TrackingFields {
  unitId: string;                 // UNT-xxxx format
  name: string;
  description: string;
  phaseId: string;                // Links to Phase (new hierarchy level)
  employeeId: string | null;      // Assigned unit manager
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project database table record with full metadata.
 * Links to customer and site.
 * Note: projectNumber removed, billableType added.
 * Includes tracking fields for schedule and progress.
 * 
 * @interface ProjectTable
 */
export interface ProjectTable extends TrackingFields {
  projectId: string;              // PRJ-xxxx format
  name: string;
  customerId: string;
  siteId: string;
  employeeId: string;             // Assigned project manager
  billableType: BillableType;     // 'T&M' or 'FP'
  methodology: string;
  manager: string;
  status?: string;
  cpi?: number;
  spi?: number;
  isOverhead?: boolean;
  isTpw?: boolean;                // "The Pinnacle Way" project
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sub-project record for breaking down large projects.
 * 
 * @interface SubProject
 */
export interface SubProject extends TrackingFields {
  subProjectId: string;
  name: string;
  projectId: string;
  sequence: number;
  description: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase definition in a methodology.
 * Phases are reusable across projects using the same methodology.
 * Note: code column removed.
 * Includes tracking fields for schedule and progress.
 * 
 * @interface Phase
 */
export interface Phase extends TrackingFields {
  phaseId: string;                // PHS-xxxx format
  name: string;
  methodology: string;
  sequence: number;
  projectId: string;
  employeeId: string;             // Assigned phase lead
  startDate: string;              // Phase start date
  endDate: string;                // Phase end date
  active?: boolean;
  evMethod?: EvMethod;
  createdAt: string;
  updatedAt: string;
}

export interface CostCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  level?: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CostTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  categoryId?: string;
  vendor?: string;
  projectId?: string;
  phaseId?: string;
  taskId?: string;
  chargeCodeId?: string;
  isAccrual?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Calendar {
  id: string;
  name: string;
  description?: string;
  timezone?: string;
  workingDays?: string;
  holidays?: string[] | string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceCalendar {
  id: string;
  employeeId: string;
  calendarId: string;
  overrideDays?: string[] | string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleHealthEntry {
  id: string;
  taskId: string;
  taskName?: string;
  issueType: 'calendar' | 'constraint';
  severity: 'warning' | 'error';
  detail: string;
  date?: string;
}

/**
 * Task record with planning and tracking data.
 * Tasks are the lowest schedulable work units.
 * Includes tracking fields for schedule, progress, hours, and costs.
 * 
 * @interface Task
 * @property {string} taskId - Unique task identifier (TSK-xxxx or SUB-xxxx format)
 * @property {string} customerId - Associated customer
 * @property {string} projectId - Parent project
 * @property {string} siteId - Work location
 * @property {string} phaseId - Methodology phase
 * @property {string} subProjectId - Optional sub-project
 * @property {string} resourceId - Assigned resource ID (legacy, use assignedResource)
 * @property {AssignedResourceType} assignedResourceType - 'specific' or 'generic'
 * @property {string} assignedResource - Employee name (specific) or Role name (generic)
 * @property {string} taskName - Task display name
 * @property {string} taskDescription - Detailed description
 * @property {boolean} isSubTask - True if this is a sub-task
 * @property {string | null} parentTaskId - Parent task ID for sub-tasks
 * @property {string | null} predecessor - Predecessor task reference (legacy)
 * @property {number} projectedHours - Current projected total hours
 * @property {string} status - Current task status
 * @property {'low' | 'medium' | 'high' | 'critical'} [priority] - Task priority level
 * @property {string} createdAt - Record creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */
export interface Task extends TrackingFields {
  taskId: string;
  customerId: string;
  projectId: string;
  siteId: string;
  unitId?: string | null; // For tasks linked to a unit
  phaseId: string;
  subProjectId: string;
  resourceId: string;
  employeeId: string;             // Assigned employee ID (direct reference)
  // New resource assignment fields
  assignedResourceType: AssignedResourceType;
  assignedResource: string;
  assignedResourceId?: string | null;
  taskName: string;
  taskDescription: string;
  isSubTask: boolean;
  parentTaskId: string | null;
  // predecessor legacy field removed - use predecessorId for linking
  projectedHours: number;
  status: string;
  isCritical?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  baselineQty?: number;
  actualQty?: number;
  completedQty?: number;
  baselineCount?: number;
  baselineMetric?: string | null;
  baselineUom?: string;
  actualCount?: number;
  completedCount?: number;
  uom?: string;
  progressMethod?: ProgressMethod;
  evMethod?: EvMethod;
  userStoryId?: string;
  sprintId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgressMethod = 'hours' | 'quantity' | 'milestone';

export type EvMethod = '0/100' | '50/50' | 'milestone' | 'physical';

/**
 * QC (Quality Control) task record.
 * Represents a quality check performed on a parent task.
 * 
 * @interface QCTask
 * @property {string} qcTaskId - Unique QC task identifier (QCT-xxxx format)
 * @property {string} parentTaskId - Task being quality checked
 * @property {string} qcResourceId - Reviewer's resource ID
 * @property {string} employeeId - Assigned QC reviewer employee ID
 * @property {number} qcHours - Hours spent on QC
 * @property {number} qcScore - Quality score (0-100)
 * @property {number} qcCount - Number of items reviewed
 * @property {string} qcUOM - Unit of measure for count
 * @property {string} qcType - Type of QC (e.g., "Peer Review", "Gate Review")
 * @property {string} qcStatus - Current QC status
 * @property {number} qcCriticalErrors - Count of critical errors found
 * @property {number} qcNonCriticalErrors - Count of non-critical errors
 * @property {string} qcComments - Reviewer comments
 * @property {string} qcStartDate - QC start date
 * @property {string | null} qcEndDate - QC completion date
 * @property {string | null} baselineStartDate - Planned start date
 * @property {string | null} baselineEndDate - Planned end date
 * @property {string | null} actualStartDate - Actual start date
 * @property {string | null} actualEndDate - Actual end date
 * @property {string} createdAt - Record creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */
export interface QCTask {
  id?: string;
  qcTaskId: string;
  parentTaskId: string;
  qcResourceId: string;
  employeeId: string;
  qcHours: number;
  qcScore: number;
  qcCount: number;
  qcUOM: string;
  qcType: string;
  qcStatus: string;
  qcCriticalErrors: number;
  qcNonCriticalErrors: number;
  qcComments: string;
  qcStartDate: string;
  qcEndDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Time entry record for tracking hours worked.
 * 
 * @interface HourEntry
 * @property {string} entryId - Unique entry identifier (HRS-xxxx format)
 * @property {string} employeeId - Employee who logged time
 * @property {string | null} taskId - Associated task (null for overhead)
 * @property {string} projectId - Associated project
 * @property {string} chargeCode - Billing/charge code
 * @property {string} date - Date of work (ISO format)
 * @property {number} hours - Number of hours logged
 * @property {string} description - Work description
 * @property {boolean} billable - Whether hours are billable
 * @property {string} createdAt - Record creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */
export interface HourEntry {
  id?: string;
  entryId: string;
  employeeId: string;
  taskId: string | null;
  projectId: string;
  phaseId?: string | null;
  userStoryId?: string | null;
  chargeCode: string;
  date: string;
  hours: number;
  description: string;
  billable?: boolean;
  isBillable?: boolean;
  isApproved?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Milestone database table record with tracking data.
 * 
 * @interface MilestoneTable
 * @property {string} milestoneId - Unique milestone identifier (MLS-xxxx format)
 * @property {string} customer - Customer name
 * @property {string} site - Site name
 * @property {string} projectId - Project ID reference
 * @property {string} milestoneName - Milestone display name
 * @property {string} status - Current status
 * @property {number} percentComplete - Completion percentage (0-100)
 * @property {string} plannedDate - Originally planned completion date
 * @property {string} forecastedDate - Current forecast completion date
 * @property {string} actualDate - Actual completion date
 * @property {number} varianceDays - Days variance from plan
 * @property {string} createdAt - Record creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */
export interface MilestoneTable {
  id?: string;
  milestoneId: string;
  customer: string;
  site: string;
  projectId: string;
  phaseId?: string | null;
  taskId?: string | null;
  milestoneName: string;
  status: string;
  percentComplete: number;
  plannedDate: string;
  forecastedDate: string;
  actualDate: string;
  varianceDays: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Deliverable record for tracking project outputs.
 * Includes tracking fields for schedule and progress.
 * 
 * @interface Deliverable
 */
export interface Deliverable extends TrackingFields {
  deliverableId: string;          // DLB-xxxx format
  name: string;
  projectId: string;
  phaseId: string;
  taskId?: string;
  milestoneId?: string;          // Primary relationship to milestone
  employeeId: string;             // Assigned deliverable owner
  type?: string;
  status: string;
  dueDate: string;
  completedDate: string | null;
  assigneeId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// LABOR BREAKDOWN TYPES
// ============================================================================

/**
 * Labor breakdown by individual worker.
 * Shows hours distribution across time periods.
 * 
 * @interface LaborBreakdownWorker
 * @property {string} name - Worker name
 * @property {number[]} data - Hours per time period
 * @property {number} total - Total hours
 * @property {string} role - Job role
 * @property {string} chargeCode - Primary charge code
 * @property {string} project - Associated project
 * @property {string} portfolio - Parent portfolio
 * @property {string} customer - Customer name
 * @property {string} site - Work site
 */
export interface LaborBreakdownWorker {
  name: string;
  data: number[];
  total: number;
  role: string;
  chargeCode: string;
  project: string;
  portfolio: string;
  customer: string;
  site: string;
}

/**
 * Labor breakdown by project phase.
 * 
 * @interface LaborBreakdownPhase
 */
export interface LaborBreakdownPhase {
  name: string;
  data: number[];
  total: number;
  project: string;
}

/**
 * Labor breakdown by task.
 * 
 * @interface LaborBreakdownTask
 */
export interface LaborBreakdownTask {
  name: string;
  data: number[];
  total: number;
  project: string;
}

/**
 * Complete labor breakdown container.
 * Provides multiple views of labor distribution.
 * 
 * @interface LaborBreakdown
 * @property {string[]} weeks - Week labels for time axis
 * @property {LaborBreakdownWorker[]} byWorker - Breakdown by worker
 * @property {LaborBreakdownPhase[]} byPhase - Breakdown by phase
 * @property {LaborBreakdownTask[]} byTask - Breakdown by task
 */
export interface LaborBreakdown {
  weeks: string[];
  byWorker: LaborBreakdownWorker[];
  byPhase: LaborBreakdownPhase[];
  byTask: LaborBreakdownTask[];
}

/**
 * Labor chart data by month and employee.
 * Simplified structure for time-series charts.
 * 
 * @interface LaborChartData
 * @property {string[]} months - Month labels
 * @property {Record<string, number[]>} byEmployee - Hours array per employee name
 */
export interface LaborChartData {
  months: string[];
  byEmployee: Record<string, number[]>;
}

// ============================================================================
// QC TRANSACTION TYPES
// ============================================================================

/**
 * QC transaction count by gate/phase.
 * 
 * @interface QCTransactionByGate
 */
export interface QCTransactionByGate {
  gate: string;
  count: number;
  project: string;
}

/**
 * QC transaction summary by project.
 * Shows pass/fail/unprocessed counts.
 * 
 * @interface QCTransactionByProject
 */
export interface QCTransactionByProject {
  projectId: string;
  customer: string;
  site: string;
  unprocessed: number;
  pass: number;
  fail: number;
  portfolio: string;
}

/**
 * QC status breakdown by gate.
 * 
 * @interface QCByGateStatus
 */
export interface QCByGateStatus {
  gate: string;
  unprocessed: number;
  pass: number;
  fail: number;
  portfolio?: string;
}

/**
 * QC performance by person and role.
 * 
 * @interface QCByNameAndRole
 */
export interface QCByNameAndRole {
  name: string;
  role: string;
  records: number;
  passRate: number;
  hours: number;
  openCount: number;
  closedCount: number;
  passCount: number;
  project?: string;
}

/**
 * QC summary by sub-project.
 * 
 * @interface QCBySubproject
 */
export interface QCBySubproject {
  name: string;
  records: number;
  passRate: number;
}

/**
 * Execute hours since last QC check by employee.
 * 
 * @interface ExecuteHoursSinceLastQC
 */
export interface ExecuteHoursSinceLastQC {
  employeeId: string;
  employeeName: string;
  hours: number;
}

/**
 * EX hours to QC check ratio by employee.
 * 
 * @interface EXHoursToQCRatio
 */
export interface EXHoursToQCRatio {
  employeeId: string;
  employeeName: string;
  hours: number;
  qcCount: number;
  ratio: number;
}

/**
 * Execute hours since last QC check by project.
 * 
 * @interface ExecuteHoursSinceLastQCByProject
 */
export interface ExecuteHoursSinceLastQCByProject {
  projectId: string;
  projectName: string;
  hours: number;
}

/**
 * QC hours since last QC check by employee.
 * 
 * @interface QCHoursSinceLastQC
 */
export interface QCHoursSinceLastQC {
  employeeId: string;
  employeeName: string;
  hours: number;
}

/**
 * QC hours to QC check ratio by employee.
 * 
 * @interface QCHoursToQCRatio
 */
export interface QCHoursToQCRatio {
  employeeId: string;
  employeeName: string;
  hours: number;
  qcCount: number;
  ratio: number;
}

/**
 * QC hours since last QC check by project and subproject.
 * 
 * @interface QCHoursSinceLastQCByProject
 */
export interface QCHoursSinceLastQCByProject {
  projectId: string;
  projectName: string;
  subprojectId?: string;
  subprojectName: string;
  hours: number;
}

/**
 * QC pass and fail by task/subproject.
 * 
 * @interface QCPassFailByTask
 */
export interface QCPassFailByTask {
  name: string;
  pass: number;
  fail: number;
}

/**
 * QC feedback time (days to close) by task/subproject.
 * 
 * @interface QCFeedbackTimeByTask
 */
export interface QCFeedbackTimeByTask {
  name: string;
  avgDays: number;
}

/**
 * QC pass rate per month.
 * 
 * @interface QCPassRatePerMonth
 */
export interface QCPassRatePerMonth {
  month: string;
  monthLabel: string;
  passRate: number;
  pass: number;
  total: number;
}

/**
 * QC outcomes (pass/fail) by month.
 * 
 * @interface QCOutcomesByMonth
 */
export interface QCOutcomesByMonth {
  month: string;
  monthLabel: string;
  pass: number;
  fail: number;
  total: number;
}

/**
 * QC feedback time (takt time) by month.
 * 
 * @interface QCFeedbackTimeByMonth
 */
export interface QCFeedbackTimeByMonth {
  month: string;
  monthLabel: string;
  avgDays: number;
}

// ============================================================================
// MILESTONE & DELIVERABLE TYPES
// ============================================================================

/**
 * Milestone status for pie chart display.
 * 
 * @interface MilestoneStatusPie
 */
export interface MilestoneStatusPie {
  name: string;
  value: number;
  percent: number;
  color: string;
}

/**
 * Plan vs Forecast vs Actual comparison data.
 * Used for cumulative progress charts.
 * 
 * @interface PlanVsForecastVsActual
 * @property {string[]} dates - Date labels
 * @property {number} statusDate - Index of current status date
 * @property {number[]} cumulativeActual - Cumulative actual values
 * @property {number[]} cumulativeForecasted - Cumulative forecast values
 * @property {number[]} cumulativePlanned - Cumulative planned values
 */
export interface PlanVsForecastVsActual {
  dates: string[];
  statusDate: number;
  cumulativeActual: number[];
  cumulativeForecasted: number[];
  cumulativePlanned: number[];
}

/**
 * Milestone scoreboard summary by customer.
 * 
 * @interface MilestoneScoreboard
 * @property {string} customer - Customer name
 * @property {number} plannedThrough - Planned milestones through date
 * @property {number} actualThrough - Actual milestones completed
 * @property {number} variance - Difference (actual - planned)
 */
export interface MilestoneScoreboard {
  customer: string;
  plannedThrough: number;
  actualThrough: number;
  variance: number;
}

/**
 * Full milestone detail record.
 * 
 * @interface Milestone
 */
export interface Milestone {
  customer: string;
  site: string;
  projectNum: string;
  name: string;
  status: string;
  percentComplete: number;
  plannedCompletion: string;
  forecastedCompletion: string;
  actualCompletion: string;
  varianceDays: number;
  portfolio: string;
}

/**
 * Document signoff gauge data.
 * For displaying document approval progress.
 * 
 * @interface DocumentSignoffGauge
 */
export interface DocumentSignoffGauge {
  name: string;
  value: number;
  color: string;
}

/**
 * Deliverable status for pie chart.
 * 
 * @interface DeliverableStatus
 */
export interface DeliverableStatus {
  name: string;
  value: number;
  percent: number;
  color: string;
}

/**
 * Deliverable status grouped by type.
 * Each type (DRD, Workflow, SOP, QMP) has its own status breakdown.
 * 
 * @interface DeliverableByStatus
 */
export interface DeliverableByStatus {
  drd: DeliverableStatus[];
  workflow: DeliverableStatus[];
  sop: DeliverableStatus[];
  qmp: DeliverableStatus[];
}

/**
 * Deliverable tracker row for table display.
 * Shows status across all deliverable types.
 * 
 * @interface DeliverableTracker
 */
export interface DeliverableTracker {
  customer: string;
  projectNum: string | number;
  projectId?: string;
  name: string;
  drdStatus: string;
  workflowStatus: string;
  sopStatus: string;
  qmpStatus: string;
}

// ============================================================================
// RESOURCE TYPES
// ============================================================================

/**
 * Resource heatmap data for capacity visualization.
 * 
 * @interface ResourceHeatmap
 * @property {string[]} resources - Resource names (y-axis)
 * @property {string[]} weeks - Week labels (x-axis)
 * @property {number[][]} data - Utilization values [resource][week]
 */
export interface ResourceHeatmap {
  resources: string[];
  weeks: string[];
  data: number[][];
}

/**
 * Resource Gantt chart item.
 * Hierarchical structure for displaying resource assignments.
 * 
 * @interface ResourceGanttItem
 * @property {string} name - Resource or task name
 * @property {'resource' | 'task' | 'sub_task'} type - Item type
 * @property {string} [project] - Associated project
 * @property {string} [portfolio] - Associated portfolio
 * @property {string} startDate - Assignment start date
 * @property {string} endDate - Assignment end date
 * @property {number} efficiency - Efficiency percentage
 * @property {number} [utilization] - Utilization percentage
 * @property {number} [hours] - Total hours
 * @property {boolean} [expanded] - UI expansion state
 * @property {ResourceGanttItem[]} [children] - Nested items
 */
export interface ResourceGanttItem {
  name: string;
  type: 'resource' | 'task' | 'sub_task';
  project?: string;
  portfolio?: string;
  startDate: string;
  endDate: string;
  efficiency: number;
  utilization?: number;
  hours?: number;
  expanded?: boolean;
  children?: ResourceGanttItem[];
}

/**
 * Container for resource Gantt data.
 * 
 * @interface ResourceGantt
 * @property {ResourceGanttItem[]} items - Root-level items
 */
export interface ResourceGantt {
  items: ResourceGanttItem[];
}

// ============================================================================
// FORECAST & WBS TYPES
// ============================================================================

/**
 * Forecast data for progress comparison.
 * 
 * @interface Forecast
 * @property {string[]} months - Month labels
 * @property {number[]} baseline - Baseline values
 * @property {(number | null)[]} actual - Actual values (null for future)
 * @property {number[]} forecast - Forecasted values
 */
export interface Forecast {
  months: string[];
  baseline: number[];
  actual: (number | null)[];
  forecast: number[];
  periodActual?: number[];
  remainingDelta?: number[];
  remainingCostDelta?: number[];
}

// ============================================================================
// SNAPSHOT TYPES
// ============================================================================

export type SnapshotEntityLevel = 'project' | 'phase' | 'task';

export type SnapshotType = 'baseline' | 'forecast' | 'workday' | 'manual' | 'auto';
export type SnapshotScope = 'project' | 'site' | 'customer' | 'portfolio' | 'all';

export interface SnapshotMetadata {
  snapshotId: string;
  snapshotDate: string; // Week ending date (YYYY-MM-DD)
  versionName: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  isLocked: boolean;
}

export interface VisualSnapshot {
  id: string;
  visualId: string;
  visualType: 'chart' | 'table';
  visualTitle: string;
  snapshotName: string;
  snapshotDate: string;
  data: any;
  metadata: {
    filters?: Record<string, unknown>;
    dateRange?: { start: string; end: string };
    hierarchyFilter?: Record<string, unknown>;
    [key: string]: any;
  };
  createdAt: string;
  createdBy: string;
}

/**
 * Comprehensive snapshot data structure stored in JSONB
 * Contains all calculated metrics, chart data, and transformed views
 */
export interface SnapshotData {
  // Aggregated metrics
  metrics: {
    totalHours: number;
    totalCost: number;
    totalProjects: number;
    totalTasks: number;
    totalEmployees: number;
    // EVM metrics
    bac?: number;  // Budget at Completion
    ac?: number;   // Actual Cost
    ev?: number;   // Earned Value
    pv?: number;   // Planned Value
    cpi?: number;  // Cost Performance Index
    spi?: number;  // Schedule Performance Index
    eac?: number;  // Estimate at Completion
    etc?: number;  // Estimate to Complete
    vac?: number;  // Variance at Completion
    tcpi?: number; // To-Complete Performance Index
  };
  // Chart-ready data
  charts: {
    sCurve?: SCurveData;
    laborBreakdown?: LaborBreakdown;
    resourceHeatmap?: ResourceHeatmap;
    resourceLeveling?: ResourceLevelingData;
    forecast?: Forecast;
    qcMetrics?: {
      qcByNameAndRole?: QCByNameAndRole[];
      qcTransactionByGate?: QCTransactionByGate[];
      qcTransactionByProject?: QCTransactionByProject[];
      [key: string]: any;
    };
    [key: string]: any; // Allow additional chart data
  };
  // WBS hierarchy data
  wbsData?: WBSData;
  // Raw entity data (optional, for detailed comparisons)
  entities?: {
    projects?: ProjectTable[];
    tasks?: Task[];
    hours?: HourEntry[];
    [key: string]: any;
  };
  // Hierarchy aggregations
  hierarchy?: {
    portfolio?: any;
    customer?: any;
    site?: any;
    project?: any;
    [key: string]: any;
  };
  // Metadata for UI view state and other context
  metadata?: {
    view?: string;
    [key: string]: any;
  };
}

/**
 * Unified Snapshot - Comprehensive snapshot with all calculated data
 */
export interface Snapshot {
  id: string;
  snapshotId: string;
  snapshotDate: string;
  snapshotType: SnapshotType;
  versionName: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  isLocked: boolean;
  scope: SnapshotScope;
  scopeId?: string | null;  // ID of the scoped entity
  // Aggregated metrics (quick access without parsing JSONB)
  totalHours?: number;
  totalCost?: number;
  totalProjects?: number;
  totalTasks?: number;
  totalEmployees?: number;
  // Comprehensive data stored as JSONB
  snapshotData: SnapshotData;
  createdAt: string;
  updatedAt: string;
}


// ============================================================================
// CHANGE CONTROL (CHANGE REQUESTS + IMPACTS)
// ============================================================================

export type ChangeRequestStatus = 'submitted' | 'assessed' | 'approved' | 'rejected' | 'implemented';
export type ChangeRequestCategory = 'scope' | 'schedule' | 'cost' | 'quality' | 'other';

export interface ChangeRequest {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: ChangeRequestCategory;
  status: ChangeRequestStatus;
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  implementedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeImpact {
  id: string;
  changeRequestId: string;
  entityLevel: SnapshotEntityLevel;
  projectId: string;
  phaseId?: string | null;
  taskId?: string | null;
  deltaBaselineHours: number;
  deltaBaselineCost: number;
  deltaStartDays: number;
  deltaEndDays: number;
  deltaQty: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeControlProjectRollup {
  projectId: string;
  projectName: string;
  approvedDeltaHours: number;
  approvedDeltaCost: number;
  approvedDeltaStartDays: number;
  approvedDeltaEndDays: number;
  approvedDeltaQty: number;
}

export interface ChangeControlMonthlyRollup {
  month: string;
  approvedDeltaHours: number;
  approvedDeltaCost: number;
  approvedDeltaQty: number;
}

export interface ChangeControlSummary {
  byProject: ChangeControlProjectRollup[];
  byMonth: ChangeControlMonthlyRollup[];
}

export interface ProgressClaim {
  id: string;
  taskId: string;
  claimDate: string;
  claimedEV: number;
  claimedPct: number;
  notes?: string | null;
  evidenceLink?: string | null;
  claimedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EVSeriesPoint {
  period: string;
  date: string;
  pv: number;
  ev: number;
  ac: number;
}

export type QuantityEntryType = 'produced' | 'completed';
export interface TaskQuantityEntry {
  id: string;
  taskId: string;
  projectId: string;
  date: string;
  qty: number;
  qtyType: QuantityEntryType;
  notes?: string | null;
  enteredBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalEntityType = 'baselineSnapshot' | 'forecastSnapshot' | 'milestone' | 'deliverable' | 'qcGate';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export interface ApprovalRecord {
  id: string;
  projectId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  approvalType: string;
  status: ApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskProductivityMetrics {
  taskId: string;
  taskName: string;
  projectId: string;
  phaseId?: string | null;
  baselineQty: number;
  actualQty: number;
  completedQty: number;
  qtyRemaining: number;
  uom?: string | null;
  baselineMetric?: string | null;
  baselineHours: number;
  actualHours: number;
  hrsPerUnit?: number | null;
  unitsPerHour?: number | null;
  productivityVariance?: number | null;
  performingMetric?: number | null;
}

export interface PhaseProductivityMetrics {
  phaseId: string;
  phaseName: string;
  projectId: string;
  baselineQty: number;
  actualQty: number;
  completedQty: number;
  qtyRemaining: number;
  baselineHours: number;
  actualHours: number;
  hrsPerUnit?: number | null;
  unitsPerHour?: number | null;
  productivityVariance?: number | null;
  performingMetric?: number | null;
}

export interface ProjectProductivityMetrics {
  projectId: string;
  projectName: string;
  baselineQty: number;
  actualQty: number;
  completedQty: number;
  qtyRemaining: number;
  baselineHours: number;
  actualHours: number;
  hrsPerUnit?: number | null;
  unitsPerHour?: number | null;
  productivityVariance?: number | null;
  performingMetric?: number | null;
}

export interface CatchUpEntry {
  id: string;
  timestamp: string;
  projectId?: string | null;
  entityType: string;
  entityId: string;
  description: string;
  source: 'changeLog' | 'approval';
  user?: string | null;
  status?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}

/**
 * WBS (Work Breakdown Structure) item.
 * Hierarchical work element with progress tracking.
 * Extended to include tasks and sub-tasks, plus predecessor/cost tracking.
 * 
 * @interface WBSItem
 * @property {string} id - Unique identifier (PRF/CST/STE/PRJ/PHS/TSK/SUB-xxxx format)
 * @property {string} wbsCode - WBS code (e.g., "1.2.3")
 * @property {string} name - Item name
 * @property {'portfolio' | 'customer' | 'site' | 'project' | 'phase' | 'task' | 'sub_task'} type - Hierarchy level
 * @property {string} startDate - Start date (ISO format)
 * @property {string} endDate - End date (ISO format)
 * @property {number} progress - Completion percentage (0-100)
 * @property {string} [manager] - Assigned manager
 * @property {string} [methodology] - Applied methodology
 * @property {string | null} [assignedResourceId] - Assigned resource ID
 * @property {AssignedResourceType} [assignedResourceType] - 'specific' or 'generic'
 * @property {string} [assignedResource] - Employee name or Role name
 * @property {number} [baselineHours] - Planned hours
 * @property {number} [actualHours] - Actual hours worked
 * @property {number} [baselineCost] - Planned cost
 * @property {number} [actualCost] - Actual cost incurred
 * @property {string | null} [predecessorId] - Predecessor item ID
 * @property {PredecessorRelationship} [predecessorRelationship] - Predecessor relationship type
 * @property {boolean} [isCritical] - On critical path
 * @property {number} [taskEfficiency] - Efficiency ratio
 * @property {WBSItem[]} [children] - Child items
 */
export interface WBSItem {
  id: string;
  wbsCode: string;
  name: string;
  type: 'portfolio' | 'customer' | 'site' | 'project' | 'phase' | 'task' | 'sub_task';
  startDate: string;
  endDate: string;
  progress: number;
  manager?: string;
  methodology?: string;
  assignedResourceId?: string | null;
  assignedResourceType?: AssignedResourceType;
  assignedResource?: string;
  baselineHours?: number;
  actualHours?: number;
  remainingHours?: number;
  projectedRemainingHours?: number;
  baselineCost?: number;
  actualCost?: number;
  remainingCost?: number;
  predecessorId?: string | null;
  predecessorRelationship?: PredecessorRelationship;
  isCritical?: boolean;
  totalFloat?: number;
  taskEfficiency?: number;
  children?: WBSItem[];
}

/**
 * Container for WBS hierarchy.
 * 
 * @interface WBSData
 * @property {WBSItem[]} items - Root-level WBS items
 */
export interface WBSData {
  items: WBSItem[];
}

// ============================================================================
// RESOURCE LEVELING DATA
// ============================================================================

export interface ResourceLevelingData {
  monthly: Array<{
    month: string;
    monthLabel: string;
    totalProjectHours: number;
    projectedFTEUtilization: number;
    variance: number;
    variancePercent: number;
  }>;
  quarterly: Array<{
    quarter: string;
    quarterLabel: string;
    totalProjectHours: number;
    projectedFTEUtilization: number;
    variance: number;
    variancePercent: number;
  }>;
}

// ============================================================================
// CHANGE LOG
// ============================================================================

/**
 * Change log entry for audit trail.
 * Records all data modifications.
 * 
 * @interface ChangeLogEntry
 * @property {string} id - Unique entry identifier (LOG-xxxx format)
 * @property {string} timestamp - When change occurred (ISO format)
 * @property {string} user - User who made the change
 * @property {string} action - Type of action (create, update, delete)
 * @property {string} entityType - Type of entity changed
 * @property {string} entityId - ID of changed entity
 * @property {string} fieldName - Field that was modified
 * @property {string} oldValue - Previous value (serialized)
 * @property {string} newValue - New value (serialized)
 */
export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
}

// ============================================================================
// MAIN DATA CONTAINER
// ============================================================================

/**
 * Complete sample data structure containing all application data.
 * This is the primary data type used throughout the application.
 * 
 * @interface SampleData
 * @property {Hierarchy} hierarchy - Organizational hierarchy
 * @property {SCurveData} sCurve - S-curve chart data
 * @property {BudgetVarianceItem[]} budgetVariance - Budget variance items
 * @property {MilestoneStatusItem[]} milestoneStatus - Milestone status summary
 * @property {CountMetricsAnalysis[]} countMetricsAnalysis - Task metrics analysis
 * @property {ProjectsEfficiencyMetrics[]} projectsEfficiencyMetrics - Project efficiency data
 * @property {TaskHoursEfficiency} taskHoursEfficiency - Task hours efficiency
 * @property {QualityHours} qualityHours - Quality hours breakdown
 * @property {NonExecuteHours} nonExecuteHours - Non-execute hours analysis
 * @property {Employee[]} employees - Employee records
 * @property {PortfolioTable[]} portfolios - Portfolio table records
 * @property {CustomerTable[]} customers - Customer table records
 * @property {SiteTable[]} sites - Site table records
 * @property {UnitTable[]} units - Unit table records (between Site and Project)
 * @property {ProjectTable[]} projects - Project table records
 * @property {SubProject[]} subprojects - Sub-project records
 * @property {Phase[]} phases - Phase definitions
 * @property {ChargeCode[]} chargecodes - Charge code definitions
 * @property {Task[]} tasks - Task records
 * @property {Task[]} subTasks - Sub-task records (separate for clarity)
 * @property {QCTask[]} qctasks - QC task records
 * @property {HourEntry[]} hours - Hour entry records
 * @property {MilestoneTable[]} milestonesTable - Milestone table records
 * @property {Deliverable[]} deliverables - Deliverable records
 * @property {DeliverableTracker[]} [deliverablesTracker] - Deliverable tracker data
 * @property {LaborBreakdown} laborBreakdown - Labor breakdown data
 * @property {LaborChartData} laborChartData - Labor chart data
 * @property {QCTransactionByGate[]} qcTransactionByGate - QC by gate
 * @property {QCTransactionByProject[]} qcTransactionByProject - QC by project
 * @property {QCByGateStatus[]} qcByGateStatus - QC gate status
 * @property {QCByNameAndRole[]} qcByNameAndRole - QC by person
 * @property {QCBySubproject[]} qcBySubproject - QC by sub-project
 * @property {ExecuteHoursSinceLastQC[]} executeHoursSinceLastQC - Execute hours since last QC by employee
 * @property {EXHoursToQCRatio[]} exHoursToQCRatio - EX hours to QC ratio by employee
 * @property {ExecuteHoursSinceLastQCByProject[]} executeHoursSinceLastQCByProject - Execute hours since last QC by project
 * @property {QCHoursSinceLastQC[]} qcHoursSinceLastQC - QC hours since last QC by employee
 * @property {QCHoursToQCRatio[]} qcHoursToQCRatio - QC hours to QC ratio by employee
 * @property {QCHoursSinceLastQCByProject[]} qcHoursSinceLastQCByProject - QC hours since last QC by project/subproject
 * @property {QCPassFailByTask[]} qcPassFailByTask - QC pass/fail by task/subproject
 * @property {QCFeedbackTimeByTask[]} qcFeedbackTimeByTask - QC feedback time by task/subproject
 * @property {QCPassRatePerMonth[]} qcPassRatePerMonth - QC pass rate per month
 * @property {QCOutcomesByMonth[]} qcOutcomesByMonth - QC outcomes (pass/fail) by month
 * @property {QCFeedbackTimeByMonth[]} qcFeedbackTimeByMonth - QC feedback time by month
 * @property {QCFeedbackTimeByMonth[]} kickoffFeedbackTimeByMonth - Kickoff feedback time by month
 * @property {MilestoneStatusPie[]} milestoneStatusPie - Milestone pie data
 * @property {PlanVsForecastVsActual} planVsForecastVsActual - Plan/forecast/actual
 * @property {MilestoneScoreboard[]} milestoneScoreboard - Milestone scoreboard
 * @property {Milestone[]} milestones - Milestone details
 * @property {DocumentSignoffGauge[]} documentSignoffGauges - Document gauges
 * @property {DeliverableByStatus} deliverableByStatus - Deliverables by status
 * @property {ResourceHeatmap} resourceHeatmap - Resource heatmap
 * @property {ResourceGantt} resourceGantt - Resource Gantt data
 * @property {ResourceLevelingData} resourceLeveling - Resource leveling (monthly/quarterly)
 * @property {Forecast} forecast - Forecast data
 * @property {BaselineSnapshot[]} baselineSnapshots - Baseline snapshot rows
 * @property {ForecastSnapshot[]} forecastSnapshots - Forecast snapshot rows
 * @property {ChangeRequest[]} changeRequests - Change requests (PCR/CCR)
 * @property {ChangeImpact[]} changeImpacts - Change request impacts linked to WBS
 * @property {ChangeControlSummary} [changeControlSummary] - Approved change rollups
 * @property {WBSData} wbsData - WBS hierarchy data
 * @property {ChangeLogEntry[]} changeLog - Change history
 */
export interface SampleData {
  hierarchy: Hierarchy;
  sCurve: SCurveData;
  budgetVariance: BudgetVarianceItem[];
  milestoneStatus: MilestoneStatusItem[];
  countMetricsAnalysis: CountMetricsAnalysis[];
  projectsEfficiencyMetrics: ProjectsEfficiencyMetrics[];
  taskHoursEfficiency: TaskHoursEfficiency;
  qualityHours: QualityHours;
  nonExecuteHours: NonExecuteHours;
  employees: Employee[];
  portfolios: PortfolioTable[];
  customers: CustomerTable[];
  sites: SiteTable[];
  units: UnitTable[];
  projects: ProjectTable[];
  subprojects: SubProject[];
  phases: Phase[];
  costCategories: CostCategory[];
  calendars: Calendar[];
  resourceCalendars: ResourceCalendar[];
  tasks: Task[];
  subTasks: Task[];
  qctasks: QCTask[];
  hours: HourEntry[];
  costTransactions: CostTransaction[];
  milestonesTable: MilestoneTable[];
  deliverables: Deliverable[];
  deliverablesTracker?: DeliverableTracker[];
  laborBreakdown: LaborBreakdown;
  laborChartData: LaborChartData;
  qcTransactionByGate: QCTransactionByGate[];
  qcTransactionByProject: QCTransactionByProject[];
  qcByGateStatus: QCByGateStatus[];
  qcByNameAndRole: QCByNameAndRole[];
  qcBySubproject: QCBySubproject[];
  executeHoursSinceLastQC: ExecuteHoursSinceLastQC[];
  exHoursToQCRatio: EXHoursToQCRatio[];
  executeHoursSinceLastQCByProject: ExecuteHoursSinceLastQCByProject[];
  qcHoursSinceLastQC: QCHoursSinceLastQC[];
  qcHoursToQCRatio: QCHoursToQCRatio[];
  qcHoursSinceLastQCByProject: QCHoursSinceLastQCByProject[];
  qcPassFailByTask: QCPassFailByTask[];
  qcFeedbackTimeByTask: QCFeedbackTimeByTask[];
  qcPassRatePerMonth: QCPassRatePerMonth[];
  qcOutcomesByMonth: QCOutcomesByMonth[];
  qcFeedbackTimeByMonth: QCFeedbackTimeByMonth[];
  kickoffFeedbackTimeByMonth: QCFeedbackTimeByMonth[];
  milestoneStatusPie: MilestoneStatusPie[];
  planVsForecastVsActual: PlanVsForecastVsActual;
  milestoneScoreboard: MilestoneScoreboard[];
  milestones: Milestone[];
  documentSignoffGauges: DocumentSignoffGauge[];
  deliverableByStatus: DeliverableByStatus;
  resourceHeatmap: ResourceHeatmap;
  resourceGantt: ResourceGantt;
  resourceLeveling: ResourceLevelingData;
  forecast: Forecast;
  snapshots: Snapshot[];
  visualSnapshots: VisualSnapshot[];
  projectDocuments: ProjectDocument[];
  changeRequests: ChangeRequest[];
  changeImpacts: ChangeImpact[];
  changeControlSummary?: ChangeControlSummary;
  taskQuantityEntries: TaskQuantityEntry[];
  approvalRecords: ApprovalRecord[];
  progressClaims: ProgressClaim[];
  evmSeries: EVSeriesPoint[];
  taskProductivity: TaskProductivityMetrics[];
  phaseProductivity: PhaseProductivityMetrics[];
  projectProductivity: ProjectProductivityMetrics[];
  catchUpLog: CatchUpEntry[];
  projectHealth: ProjectHealth[];
  projectLog: ProjectLog[];
  epics: Epic[];
  features: Feature[];
  userStories: UserStory[];
  sprints: Sprint[];
  tpwStructure?: TPWStructure;
  scheduleHealth: ScheduleHealthEntry[];
  wbsData: WBSData;
  changeLog: ChangeLogEntry[];
  // New consolidated tables (optional for backward compatibility)
  hierarchyNodes?: any[]; // Consolidated portfolios, customers, sites, units
  workItems?: any[]; // Consolidated epics, features, user_stories
}

// ============================================================================
// PROJECT HEALTH CHECK TYPES
// ============================================================================

/**
 * Failure reason categories for project health checks
 */
export type HealthCheckFailureReason = 'Scope Gaps' | 'Missing Logic' | 'Resources' | 'Structure' | null;

/**
 * Individual health check item
 * Each check has a pass/fail status, optional failure reason, and comments
 */
export interface HealthCheckItem {
  id: string;
  name: string;
  description: string;
  passed: boolean | null;  // null = not evaluated yet
  failureReason: HealthCheckFailureReason;
  comments: string;
  category: 'scope' | 'tasks' | 'structure' | 'resources' | 'compliance';
  isMultiLine?: boolean;  // For "Tasks Requiring Rework" field
  multiLineValue?: string; // Multiple lines of text
}

/**
 * Approval signature for project health
 */
export interface HealthApproval {
  role: string;
  name: string;
  date: string | null;
  approved: boolean;
  comments: string;
}

/**
 * Complete project health record
 */
export interface ProjectHealth {
  id: string;
  projectId: string;
  projectName: string;
  workdayStatus?: string;
  scheduleRequired: boolean;
  totalContract: number;
  revTd: number;                   // Revenue To Date
  billedTd: number;                // Billed To Date
  latestForecastedCost: number;
  forecastedGp: number;           // Calculated: Combination of Rev TD and Billed TD
  forecastedGm: number;           // Calculated: Forecasted GP / Total Contract
  baselineWork: number;
  actualWork: number;
  remainingWork: number;
  workVariance: number;
  baselineCost: number;
  actualCost: number;
  scheduleForecastedCost: number;
  costVariance: number;
  scheduleCostForecastedCostVariance: number;
  createdAt: string;
  updatedAt: string;

  // Health check items
  checks: HealthCheckItem[];

  // Approval workflow
  approvals: {
    pcQcComplete: HealthApproval;
    projectLeadAcknowledged: HealthApproval;
    seniorManagerApproval: HealthApproval;
    approvedForExecution: HealthApproval;
  };

  // Overall status
  overallStatus: 'draft' | 'pending_review' | 'approved' | 'rejected';
  overallScore: number; // Percentage of passing checks
}

/**
 * Default health check items (matches the image specification)
 */
export const DEFAULT_HEALTH_CHECKS: Omit<HealthCheckItem, 'id'>[] = [
  // Scope category
  { name: 'WBS Represents 100% of Proposal Scope', description: 'Verify WBS covers all proposed scope', passed: null, failureReason: null, comments: '', category: 'scope' },
  { name: 'All Proposal Deliverables Represented', description: 'All deliverables from proposal are in WBS', passed: null, failureReason: null, comments: '', category: 'scope' },
  { name: 'No Scope Hidden in Summary Tasks', description: 'Summary tasks do not hide detailed scope', passed: null, failureReason: null, comments: '', category: 'scope' },
  { name: 'Execution & Non-Execution Clearly Separated', description: 'Clear distinction between work types', passed: null, failureReason: null, comments: '', category: 'scope' },
  { name: 'Known Scope Gaps Identified', description: 'Any gaps are documented', passed: null, failureReason: null, comments: '', category: 'scope' },

  // Tasks category
  { name: 'Execution Tasks Included', description: 'Core execution work is defined', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Project Planning Tasks Included', description: 'Planning activities are included', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Monitoring & Control Tasks Included', description: 'M&C activities are defined', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Closeout Tasks Included', description: 'Project closeout is planned', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Travel & Expense Tasks Included', description: 'T&E is accounted for', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Non-Execution ≤ 25% of Execution Hours', description: 'Non-execution ratio is acceptable', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Baseline Counts Defined', description: 'Count baselines are set', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Unit of Measure Defined', description: 'UOM is specified for tasks', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Baseline Metrics Defined', description: 'Metrics baselines are established', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Planned Effort Entered', description: 'Hours/effort is planned', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Duration Reasonable', description: 'Task durations are realistic', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Task Names Clear & Measurable', description: 'Names describe measurable work', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'No Tasks >100 hrs with Count = 1', description: 'Large tasks have proper counts', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Tasks Split by Effort Type', description: 'Tasks are properly categorized', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Execution, QC, Coord, Updates Split', description: 'Work types are separated', passed: null, failureReason: null, comments: '', category: 'tasks' },
  { name: 'Tasks Requiring Rework', description: 'List tasks that need rework', passed: null, failureReason: null, comments: '', category: 'tasks', isMultiLine: true, multiLineValue: '' },

  // Structure category
  { name: 'All Tasks Have Predecessors/Successors', description: 'Logic links are complete', passed: null, failureReason: null, comments: '', category: 'structure' },
  { name: 'Logical Flow Reflects Execution', description: 'Schedule logic is realistic', passed: null, failureReason: null, comments: '', category: 'structure' },
  { name: 'No Orphaned Tasks', description: 'All tasks are connected', passed: null, failureReason: null, comments: '', category: 'structure' },
  { name: 'Milestones Included Where Required', description: 'Key milestones are defined', passed: null, failureReason: null, comments: '', category: 'structure' },

  // Resources category
  { name: 'Resources Assigned to Execution Tasks', description: 'Resources are assigned', passed: null, failureReason: null, comments: '', category: 'resources' },
  { name: 'Roles or Named Resources Defined', description: 'Resource types are specified', passed: null, failureReason: null, comments: '', category: 'resources' },
  { name: 'Resource Loading Matches Effort', description: 'Resource allocation is consistent', passed: null, failureReason: null, comments: '', category: 'resources' },

  // Compliance category
  { name: 'Execution Structure Compliant', description: 'Follows execution standards', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Non-Execution Structure Compliant', description: 'Follows non-execution standards', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Naming Conventions Followed', description: 'Naming standards are met', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Supports Charge Code Creation', description: 'Can generate charge codes', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Execution vs Non-Execution Clear', description: 'Clear work type distinction', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Baseline Defensible', description: 'Baseline can be defended', passed: null, failureReason: null, comments: '', category: 'compliance' },
  { name: 'Suitable for CPI/SPI Tracking', description: 'Supports EVM tracking', passed: null, failureReason: null, comments: '', category: 'compliance' },
];

// ============================================================================
// PROJECT LOG TYPES
// ============================================================================

/**
 * Project log entry for tracking assumptions, issues, risks, decisions, etc.
 * 
 * @interface ProjectLog
 */
export interface ProjectLog {
  id: string;
  logId: string;
  projectId: string;
  portfolioId?: string;
  customerId?: string;
  siteId?: string;
  type: 'Assumptions' | 'Issue' | 'Risks' | 'Decisions' | 'Change' |
  'Stakeholder' | 'Lesson Learned' | 'Success/Win' | 'TWP Actions' |
  'Variance Explanation';
  dateOpened: string;
  addedBy: string;
  internalExternal?: 'Internal' | 'External';
  description?: string;
  owner?: string;
  dueBy?: string;
  mitigation?: string;
  status: string;
  dateClosed?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// DEVOPS / SPRINT PLANNING TYPES
// ============================================================================

/**
 * Epic - High-level feature grouping
 * 
 * @interface Epic
 */
export interface Epic {
  id: string;
  epicId: string;
  name: string;
  projectId: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature - Mid-level functionality within an epic
 * 
 * @interface Feature
 */
export interface Feature {
  id: string;
  featureId: string;
  name: string;
  epicId: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User Story - Detailed requirement with acceptance criteria
 * Charge codes are assigned at the user story level
 * 
 * @interface UserStory
 */
export interface UserStory {
  id: string;
  userStoryId: string;
  name: string;
  featureId: string;
  description?: string;
  acceptanceCriteria?: string;
  status: string;
  sprintId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sprint - Time-boxed development iteration
 * 
 * @interface Sprint
 */
export interface Sprint {
  id: string;
  sprintId: string;
  name: string;
  projectId: string;
  startDate?: string;
  endDate?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PROJECT DOCUMENTS TYPES
// ============================================================================

/**
 * Project Document - File storage metadata
 * 
 * @interface ProjectDocument
 */
export interface ProjectDocument {
  id: string;
  documentId: string;
  projectId?: string;
  customerId?: string;
  siteId?: string;
  name: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentType: 'DRD' | 'QMP' | 'SOP' | 'Workflow' | 'MPP' | 'Excel' | 'PDF' | 'Word' | 'Other';
  storagePath: string;
  storageBucket: string;
  uploadedBy?: string;
  uploadedAt: string;
  description?: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// TPW (THE PINNACLE WAY) TYPES
// ============================================================================

/**
 * TPW Structure - Overhead project structure
 * Phase = Customer, Sub-Phase (Task) = Site, Understand/Solve = Task
 * 
 * @interface TPWStructure
 */
export interface TPWStructure {
  overheadProject: ProjectTable;
  phases: Array<{
    phase: Phase;
    customer: string; // Phase name = Customer
    sites: Array<{
      site: string; // Task name = Site
      understandSolve: Task; // Task = Understand/Solve
    }>;
  }>;
  align: SubProject[]; // Project Planning, Monitoring and Controls, Project Closeout, Travel
  execution: SubProject[]; // All other subprojects
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Hierarchy filter for drilling down into data.
 * All properties are optional to allow partial filtering.
 * 
 * @interface HierarchyFilter
 * @property {string} [portfolio] - Filter by portfolio ID
 * @property {string} [customer] - Filter by customer ID
 * @property {string} [site] - Filter by site ID
 * @property {string} [project] - Filter by project ID
 * @property {string[]} [path] - Breadcrumb path of selected hierarchy
 */
export interface HierarchyFilter {
  portfolio?: string;
  customer?: string;
  site?: string;
  project?: string;
  path?: string[];
}

/**
 * Date filter for time-based data filtering.
 * 
 * @interface DateFilter
 * @property {'all' | 'week' | 'month' | 'quarter' | 'ytd' | 'year' | 'custom'} type - Filter type
 * @property {string} [from] - Start date for custom range (ISO format)
 * @property {string} [to] - End date for custom range (ISO format)
 */
export interface DateFilter {
  type: 'all' | 'week' | 'month' | 'quarter' | 'ytd' | 'year' | 'custom';
  from?: string;
  to?: string;
}

/**
 * Helper function to create default tracking fields
 * Initializes all tracking fields with sensible defaults
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
