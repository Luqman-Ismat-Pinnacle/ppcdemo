/**
 * @fileoverview Work Breakdown Structure (WBS) Types and Interfaces.
 * 
 * This module defines the complete type system for the WBS hierarchy,
 * including task types, employee types, predecessor relationships,
 * Gantt chart data structures, and visual styling constants.
 * 
 * @module types/wbs
 */

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * Predecessor relationship types for scheduling dependencies.
 * 
 * - **FS (Finish to Start)**: Task B starts after Task A finishes (most common)
 * - **FF (Finish to Finish)**: Task B finishes when Task A finishes
 * - **SS (Start to Start)**: Task B starts when Task A starts
 * - **SF (Start to Finish)**: Task B finishes when Task A starts (rare)
 * 
 * @typedef {'FS' | 'FF' | 'SS' | 'SF'} PredecessorRelationship
 */
export type PredecessorRelationship = 'FS' | 'FF' | 'SS' | 'SF';

/**
 * WBS Item Types representing the hierarchy levels.
 * Ordered from highest (portfolio) to lowest (sub_task) level.
 * 
 * @typedef {('portfolio' | 'customer' | 'site' | 'project' | 'sub_project' | 'task' | 'sub_task')} WBSItemType
 */
export type WBSItemType =
  | 'portfolio'
  | 'customer'
  | 'site'
  | 'project'
  | 'sub_project'
  | 'task'
  | 'sub_task';

/**
 * Standard employee types/roles in the organization.
 * Used for resource assignment and rate calculations.
 * 
 * @typedef {('Project Manager' | 'Senior Engineer' | 'Engineer' | ...)} EmployeeType
 */
export type EmployeeType =
  | 'Project Manager'
  | 'Senior Engineer'
  | 'Engineer'
  | 'Junior Engineer'
  | 'Technician'
  | 'Designer'
  | 'Analyst'
  | 'Consultant'
  | 'Contractor'
  | 'Administrator';

/**
 * Standard task status values.
 * Represents the lifecycle state of a task.
 * 
 * @typedef {('Not Started' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled')} TaskStatus
 */
export type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'On Hold'
  | 'Completed'
  | 'Cancelled';

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Employee interface for resource management.
 * Contains personal info, rates, and performance metrics.
 * 
 * @interface Employee
 * @property {string} id - Unique system identifier
 * @property {string} employeeId - Human-readable employee ID
 * @property {string} name - Full name of the employee
 * @property {string} [email] - Work email address
 * @property {EmployeeType} employeeType - Job role/type
 * @property {number} hourlyRate - Billing/costing rate per hour
 * @property {string} [managerId] - Direct manager's ID
 * @property {string} [managerName] - Direct manager's name
 * @property {number} utilizationPercent - Target utilization (0-100)
 * @property {number} avgEfficiencyPercent - Average efficiency (0-100+)
 * @property {boolean} isActive - Whether employee is active
 * @property {Date} [createdAt] - Record creation timestamp
 * @property {Date} [updatedAt] - Last update timestamp
 */
export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email?: string;
  employeeType: EmployeeType;
  hourlyRate: number;
  managerId?: string;
  managerName?: string;
  utilizationPercent: number;
  avgEfficiencyPercent: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Predecessor link defining a scheduling dependency.
 * Links one task to another with a specific relationship type.
 * 
 * @interface PredecessorLink
 * @property {string} id - Unique link identifier
 * @property {string} taskId - The dependent task ID
 * @property {string} predecessorTaskId - The predecessor task ID
 * @property {string} [predecessorName] - Display name of predecessor
 * @property {PredecessorRelationship} relationship - Type of dependency
 * @property {number} lagDays - Lag or lead days (positive = lag, negative = lead)
 */
export interface PredecessorLink {
  id: string;
  taskId: string;
  predecessorTaskId: string;
  predecessorName?: string;
  relationship: PredecessorRelationship;
  lagDays: number;
}

/**
 * Base WBS Item interface with common properties.
 * All WBS items (from portfolio to sub-task) share these fields.
 * 
 * @interface WBSItemBase
 * @property {string} id - Unique identifier
 * @property {string} wbsCode - Hierarchical WBS code (e.g., "1.2.3.4")
 * @property {string} name - Display name
 * @property {string} [description] - Detailed description
 * @property {WBSItemType} itemType - Type of WBS element
 * @property {number} level - Nesting level (1 = portfolio, 7 = sub_task)
 * @property {string} [parentId] - Parent item's ID
 * @property {string} sortPath - Sort key for ordering
 * @property {Date | null} startDate - Scheduled start date
 * @property {Date | null} endDate - Scheduled end date
 * @property {string} color - Display color (hex)
 * @property {string} status - Current status
 * @property {boolean} isExpanded - UI expansion state
 * @property {WBSItem[]} [children] - Child items in hierarchy
 */
export interface WBSItemBase {
  id: string;
  wbsCode: string;
  name: string;
  description?: string;
  itemType: WBSItemType;
  level: number;
  parentId?: string;
  sortPath: string;
  startDate: Date | null;
  endDate: Date | null;
  color: string;
  status: string;
  isExpanded: boolean;
  children?: WBSItem[];
}

/**
 * Task-specific fields for schedulable work items.
 * Applies to items of type 'task' and 'sub_task'.
 * 
 * @interface TaskFields
 */
export interface TaskFields {
  // -------------------------------------------------------------------------
  // Resource Assignment
  // -------------------------------------------------------------------------

  /** ID of the assigned resource/employee */
  assignedResourceId?: string;

  /** Display name of the assigned resource */
  assignedResourceName?: string;

  // -------------------------------------------------------------------------
  // Baseline Fields (Original Plan)
  // -------------------------------------------------------------------------

  /** Original estimated duration in working days */
  daysRequired: number;

  /** Original estimated hours (typically 8 hours per day) */
  baselineHours: number;

  /** Originally planned start date */
  baselineStartDate?: Date;

  /** Originally planned end date */
  baselineEndDate?: Date;

  // -------------------------------------------------------------------------
  // Actual Fields (Progress Tracking)
  // -------------------------------------------------------------------------

  /** Hours actually worked to date */
  actualHours: number;

  /** Date work actually started */
  actualStartDate?: Date;

  /** Date work actually completed */
  actualEndDate?: Date;

  // -------------------------------------------------------------------------
  // Projected & Remaining
  // -------------------------------------------------------------------------

  /** Estimated hours remaining to complete the task */
  projectedRemainingHours: number;

  // -------------------------------------------------------------------------
  // Calculated Cost Fields
  // -------------------------------------------------------------------------

  /** Baseline cost = Baseline Hours × Hourly Rate */
  baselineCost: number;

  /** Actual cost = Actual Hours × Hourly Rate */
  actualCost: number;

  /** Remaining cost = Projected Remaining Hours × Hourly Rate */
  remainingCost: number;

  /** 
   * Task efficiency ratio = Baseline Hours / (Actual Hours + Remaining Hours)
   * - Value > 1.0 means under budget (efficient)
   * - Value < 1.0 means over budget (inefficient)
   * - null if no hours data available
   */
  taskEfficiency: number | null;

  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  /** Completion percentage (0-100) */
  percentComplete: number;

  // -------------------------------------------------------------------------
  // CPM (Critical Path Method) Fields
  // -------------------------------------------------------------------------

  /** Earliest possible start (day number from project start) */
  earlyStart?: number;

  /** Earliest possible finish (day number from project start) */
  earlyFinish?: number;

  /** Latest allowable start without delaying project */
  lateStart?: number;

  /** Latest allowable finish without delaying project */
  lateFinish?: number;

  /** Total float = Late Start - Early Start (days of slack) */
  totalFloat?: number;

  /** Free float = slack before affecting successor */
  freeFloat?: number;

  /** True if task is on the critical path (zero float) */
  isCritical: boolean;

  // -------------------------------------------------------------------------
  // Dependencies
  // -------------------------------------------------------------------------

  /** Array of predecessor relationships */
  predecessors: PredecessorLink[];

  // -------------------------------------------------------------------------
  // Display Options
  // -------------------------------------------------------------------------

  /** True if this is a milestone (zero duration) */
  isMilestone: boolean;

  /** Database column format for milestone flag */
  is_milestone?: boolean;

  /** Additional notes or comments */
  notes?: string;
}

/**
 * Full WBS Item combining base properties with optional task fields.
 * Non-task items (portfolio, customer, site, project, sub_project)
 * will have undefined task fields.
 * 
 * @typedef {WBSItemBase & Partial<TaskFields>} WBSItem
 */
export type WBSItem = WBSItemBase & Partial<TaskFields>;

/**
 * Flattened WBS row for table display.
 * Extends WBSItem with display-specific properties.
 * 
 * @interface WBSTableRow
 * @extends {WBSItem}
 * @property {number} indentLevel - Visual indentation level
 * @property {boolean} hasChildren - Whether row has children
 * @property {boolean} isVisible - Whether row is visible (not collapsed)
 * @property {number} rowIndex - Position in flattened list
 */
export interface WBSTableRow extends WBSItem {
  indentLevel: number;
  hasChildren: boolean;
  isVisible: boolean;
  rowIndex: number;
  is_critical?: boolean;
}

// ============================================================================
// GANTT CHART TYPES
// ============================================================================

/**
 * Data structure for rendering a Gantt bar.
 * Simplified from WBSItem for chart rendering.
 * 
 * @interface GanttBar
 * @property {string} id - Unique identifier
 * @property {string} name - Display label
 * @property {string} wbsCode - WBS code for reference
 * @property {WBSItemType} itemType - Type determines styling
 * @property {number} level - Hierarchy level
 * @property {Date} startDate - Bar start position
 * @property {Date} endDate - Bar end position
 * @property {number} percentComplete - Progress fill percentage
 * @property {boolean} isCritical - Highlight as critical
 * @property {boolean} isMilestone - Render as diamond
 * @property {boolean} isExpanded - Show/hide children
 * @property {boolean} hasChildren - Can expand/collapse
 * @property {string} color - Bar fill color
 * @property {PredecessorLink[]} predecessors - Dependency arrows
 * @property {number} rowIndex - Vertical position
 */
export interface GanttBar {
  id: string;
  name: string;
  wbsCode: string;
  itemType: WBSItemType;
  level: number;
  startDate: Date;
  endDate: Date;
  percentComplete: number;
  isCritical: boolean;
  isMilestone: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  color: string;
  predecessors: PredecessorLink[];
  rowIndex: number;
}

/**
 * Predecessor arrow for Gantt chart.
 * Represents the visual dependency line between tasks.
 * 
 * @interface PredecessorArrow
 * @property {string} id - Unique arrow identifier
 * @property {string} fromTaskId - Source task ID
 * @property {string} toTaskId - Target task ID
 * @property {number} fromX - Arrow start X coordinate
 * @property {number} fromY - Arrow start Y coordinate
 * @property {number} toX - Arrow end X coordinate
 * @property {number} toY - Arrow end Y coordinate
 * @property {PredecessorRelationship} relationship - Determines arrow path
 * @property {boolean} isCritical - Highlight if on critical path
 */
export interface PredecessorArrow {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  relationship: PredecessorRelationship;
  isCritical: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Color palette for WBS visualization.
 * Based on the Pinnacle logo colors with extensions for
 * hierarchy levels, status indicators, and chart elements.
 * 
 * @constant
 * @type {Object}
 */
export const WBS_COLORS = {
  // -------------------------------------------------------------------------
  // Primary Brand Colors (from Pinnacle logo)
  // -------------------------------------------------------------------------
  teal: '#40E0D0',
  tealDark: '#1A9B8F',
  lime: '#CDDC39',
  limeDark: '#9E9D24',
  pink: '#E91E63',
  pinkDark: '#AD1457',
  orange: '#FF9800',
  orangeDark: '#E65100',

  // -------------------------------------------------------------------------
  // Hierarchy Level Colors
  // -------------------------------------------------------------------------
  portfolio: '#40E0D0',
  customer: '#CDDC39',
  site: '#E91E63',
  project: '#FF9800',
  subProject: '#40E0D0',
  task: '#CDDC39',
  subTask: '#E91E63',

  // -------------------------------------------------------------------------
  // Status Colors
  // -------------------------------------------------------------------------
  critical: '#E91E63',
  criticalPath: '#DC2626',
  onTrack: '#10B981',
  atRisk: '#F59E0B',
  delayed: '#EF4444',

  // -------------------------------------------------------------------------
  // Chart Element Colors
  // -------------------------------------------------------------------------
  bar: '#40E0D0',
  barBorder: '#1A9B8F',
  progress: '#CDDC39',
  arrow: '#666666',
  criticalArrow: '#DC2626',
  today: '#FF9800',
  weekend: '#F3F4F6',
  gridLine: '#E5E7EB'
};

/**
 * Human-readable labels for predecessor relationship types.
 * 
 * @constant
 * @type {Record<PredecessorRelationship, string>}
 */
export const PREDECESSOR_LABELS: Record<PredecessorRelationship, string> = {
  FS: 'Finish to Start',
  FF: 'Finish to Finish',
  SS: 'Start to Start',
  SF: 'Start to Finish'
};

/**
 * List of all valid employee types.
 * Used for dropdown options and validation.
 * 
 * @constant
 * @type {EmployeeType[]}
 */
export const EMPLOYEE_TYPES: EmployeeType[] = [
  'Project Manager',
  'Senior Engineer',
  'Engineer',
  'Junior Engineer',
  'Technician',
  'Designer',
  'Analyst',
  'Consultant',
  'Contractor',
  'Administrator'
];

/**
 * List of all valid task statuses.
 * Used for dropdown options and validation.
 * 
 * @constant
 * @type {TaskStatus[]}
 */
export const TASK_STATUSES: TaskStatus[] = [
  'Not Started',
  'In Progress',
  'On Hold',
  'Completed',
  'Cancelled'
];

/**
 * Configuration for each WBS level.
 * Maps item types to their numeric level, display label, and color.
 * 
 * @constant
 * @type {Record<WBSItemType, { level: number; label: string; color: string }>}
 */
export const WBS_LEVELS: Record<WBSItemType, { level: number; label: string; color: string }> = {
  portfolio: { level: 1, label: 'Portfolio', color: WBS_COLORS.portfolio },
  customer: { level: 2, label: 'Customer', color: WBS_COLORS.customer },
  site: { level: 3, label: 'Site', color: WBS_COLORS.site },
  project: { level: 4, label: 'Project', color: WBS_COLORS.project },
  sub_project: { level: 5, label: 'Sub-Project', color: WBS_COLORS.subProject },
  task: { level: 6, label: 'Task', color: WBS_COLORS.task },
  sub_task: { level: 7, label: 'Sub-Task', color: WBS_COLORS.subTask }
};
