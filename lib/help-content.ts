/**
 * @file help-content.ts
 * @description Help content definitions for all pages in Pinnacle Project Controls
 * 
 * This file contains structured help content for each page, including:
 * - Page overview descriptions
 * - Feature highlights with tooltips
 * - Step-by-step guided tour content
 * - Frequently asked questions
 * 
 * @dependencies None (pure data)
 * @dataflow Used by:
 *   - app/help/page.tsx (landing page)
 *   - app/help/[pageId]/page.tsx (per-page help)
 *   - components/help/HelpButton.tsx (tooltip content)
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * FAQ item structure
 */
export interface FAQItem {
  question: string;
  answer: string;
}

/**
 * Tour step structure
 */
export interface TourStep {
  target: string;           // CSS selector or data-tour-id
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Feature highlight structure
 */
export interface Feature {
  title: string;
  description: string;
  icon: string;             // Icon name or emoji
}

/**
 * Page help content structure
 */
export interface PageHelpContent {
  id: string;
  title: string;
  category: 'Insights' | 'Project Controls' | 'Project Management' | 'General';
  description: string;
  features: Feature[];
  tour: TourStep[];
  faqs: FAQItem[];
  relatedPages: string[];
}

// ============================================================================
// HELP CONTENT
// ============================================================================

/**
 * All help content organized by page ID
 */
export const HELP_CONTENT: Record<string, PageHelpContent> = {
  home: {
    id: 'home',
    title: 'Welcome to Pinnacle Project Controls',
    category: 'General',
    description: 'Pinnacle Project Controls (PPC) is a comprehensive project management and analytics platform designed for asset integrity and reliability engineering teams. Navigate through insights, project controls, and management tools to track progress, analyze data, and optimize your projects.',
    features: [
      { title: 'Unified Dashboard', description: 'Access all project metrics and KPIs from a central location', icon: '📊' },
      { title: 'Real-time Analytics', description: 'View live data updates across all your projects', icon: '⚡' },
      { title: 'Hierarchy Filtering', description: 'Drill down from portfolio to task level', icon: '🔍' },
      { title: 'Dark/Light Mode', description: 'Toggle between themes for comfortable viewing', icon: '🌓' },
    ],
    tour: [],
    faqs: [
      { question: 'How do I navigate between pages?', answer: 'Use the sidebar navigation on the left. Pages are organized into three categories: Insights, Project Controls, and Project Management.' },
      { question: 'How do I filter data by project?', answer: 'Use the hierarchy filter in the header. Click on a portfolio, customer, site, or project to filter all visualizations.' },
      { question: 'Can I export data?', answer: 'Yes! Go to Project Controls > Data Management to export data in Excel or JSON format.' },
    ],
    relatedPages: ['overview', 'data-management', 'wbs-gantt'],
  },

  overview: {
    id: 'overview',
    title: 'Project Overview',
    category: 'Insights',
    description: 'The Overview page provides a high-level summary of your project portfolio with key performance indicators, progress metrics, and trend analysis. Use this page for executive reporting and quick status checks. Displays "No Data" when no data is loaded (no hardcoded fallback values).',
    features: [
      { title: 'KPI Dashboard', description: 'View budget, schedule, and resource metrics at a glance', icon: '📈' },
      { title: 'S-Curve Analysis', description: 'Track cumulative progress against baseline', icon: '📉' },
      { title: 'Milestone Status', description: 'See upcoming and completed milestones', icon: '🏁' },
      { title: 'Budget Variance', description: 'Waterfall chart showing budget changes', icon: '💰' },
      { title: 'Efficiency Metrics', description: 'Track total hours and efficiency calculations', icon: '⚡' },
    ],
    tour: [
      { target: '[data-tour-id="metrics"]', title: 'Key Metrics', content: 'These cards show your most important KPIs including budget status, schedule variance, and resource utilization. Values show as 0 or null when no data is loaded.', placement: 'bottom' },
      { target: '[data-tour-id="scurve"]', title: 'S-Curve Chart', content: 'The S-curve shows cumulative progress over time. The solid line is actual progress, dashed is planned. Chart displays empty when no data is available.', placement: 'right' },
      { target: '[data-tour-id="milestones"]', title: 'Milestone Status', content: 'Track your key milestones here. Colors indicate status: green (complete), yellow (in progress), red (late).', placement: 'left' },
    ],
    faqs: [
      { question: 'What does the S-Curve show?', answer: 'The S-Curve displays cumulative progress (hours or cost) over time. Compare actual progress against the baseline to identify variances early. The chart will be empty if no data is loaded.' },
      { question: 'How is the Overall Health calculated?', answer: 'Overall Health combines CPI (Cost Performance Index) and SPI (Schedule Performance Index). Green = both > 0.95, Yellow = either 0.85-0.95, Red = either < 0.85.' },
      { question: 'Why do I see "No Data" or 0 values?', answer: 'The Overview page no longer shows hardcoded fallback values. If you see 0 or "No Data", it means no actual data has been loaded. Import data via Data Management to populate the dashboards.' },
      { question: 'How is efficiency calculated?', answer: 'Efficiency compares earned hours (baseline hours × percent complete) to actual hours. Values > 100% indicate work is ahead of schedule, < 100% indicates behind schedule.' },
    ],
    relatedPages: ['hours', 'milestones', 'forecast', 'data-management'],
  },

  hours: {
    id: 'hours',
    title: 'Hours Insights',
    category: 'Insights',
    description: 'Analyze labor hours across workers, phases, and tasks. This page helps you understand resource utilization, identify bottlenecks, and track time-based productivity metrics. Includes non-execution hours analysis and quality hours tracking.',
    features: [
      { title: 'Labor Breakdown', description: 'View hours by worker, phase, or task over time', icon: '👥' },
      { title: 'Stacked Charts', description: 'See how different categories contribute to totals', icon: '📊' },
      { title: 'Time Trends', description: 'Track weekly and monthly labor patterns', icon: '📅' },
      { title: 'Utilization Metrics', description: 'Compare actual vs. planned hours', icon: '⚙️' },
      { title: 'Non-Execution Hours', description: 'Track hours not directly tied to execution tasks', icon: '📋' },
      { title: 'Quality Hours', description: 'Analyze QC and quality-related hours', icon: '✅' },
    ],
    tour: [
      { target: '[data-tour-id="view-toggle"]', title: 'View Options', content: 'Switch between viewing hours by Worker, Phase, or Task to see different perspectives of your labor data.', placement: 'bottom' },
      { target: '[data-tour-id="labor-chart"]', title: 'Labor Chart', content: 'This chart shows hours over time. Each color represents a different worker/phase/task depending on your selected view. Charts display empty when no data is available.', placement: 'top' },
    ],
    faqs: [
      { question: 'How often is hours data updated?', answer: 'Hours data is updated whenever timecards are approved. Import hour entries via Data Management to populate the charts.' },
      { question: 'What is the difference between billable and non-billable hours?', answer: 'Billable hours can be charged to the client. Non-billable hours include admin, training, and internal meetings.' },
      { question: 'What are non-execution hours?', answer: 'Non-execution hours are hours not directly tied to execution tasks, such as project management, quality control, and administrative work. These are tracked separately to understand overhead costs.' },
      { question: 'Why do I see empty charts?', answer: 'The Hours page no longer shows hardcoded fallback data. If charts are empty, import hour entries via Data Management. This ensures you only see actual data.' },
    ],
    relatedPages: ['overview', 'resourcing', 'sprint', 'data-management'],
  },

  milestones: {
    id: 'milestones',
    title: 'Milestones',
    category: 'Insights',
    description: 'Track project milestones and key deliverable dates. Compare planned vs. actual completion dates, analyze variance trends, and forecast upcoming milestone risks.',
    features: [
      { title: 'Milestone Tracker', description: 'List of all milestones with status indicators', icon: '🏁' },
      { title: 'Plan vs. Actual', description: 'Compare original schedule to reality', icon: '📆' },
      { title: 'Variance Analysis', description: 'See which milestones are ahead or behind', icon: '⚠️' },
      { title: 'Scoreboard', description: 'Customer-level milestone summary', icon: '🏆' },
    ],
    tour: [],
    faqs: [
      { question: 'How is variance calculated?', answer: 'Variance = Actual/Forecasted Date - Planned Date. Positive values mean the milestone is late.' },
      { question: 'What triggers a milestone status change?', answer: 'Status changes when: Not Started (0%), In Progress (1-99%), Completed (100%), or Missed (past due and not 100%).' },
    ],
    relatedPages: ['overview', 'wbs-gantt', 'forecast'],
  },

  documents: {
    id: 'documents',
    title: 'Documents',
    category: 'Insights',
    description: 'Monitor the status of project deliverables and documentation. Track DRDs, QMPs, SOPs, and workflow documents through their approval lifecycle. Deliverables can be tied to milestones for better milestone tracking.',
    features: [
      { title: 'Document Status', description: 'See which documents are approved, in review, or pending', icon: '📄' },
      { title: 'Approval Gauges', description: 'Visual indicators of document completion rates', icon: '✅' },
      { title: 'Deliverable Tracker', description: 'Detailed list of all project deliverables', icon: '📋' },
      { title: 'Milestone Linking', description: 'Link deliverables to milestones for milestone tracking', icon: '🔗' },
    ],
    tour: [],
    faqs: [
      { question: 'What document types are tracked?', answer: 'PPC tracks DRDs (Data Requirement Documents), QMPs (Quality Management Plans), SOPs (Standard Operating Procedures), and Workflow Documents.' },
      { question: 'How do I link a deliverable to a milestone?', answer: 'In Data Management, set the milestoneId field on a deliverable to link it to a milestone. This helps track which deliverables are associated with specific project milestones.' },
      { question: 'What fields are tracked for deliverables?', answer: 'Deliverables track: name, project, phase, task, milestone (optional), owner, type, status, due date, completed date, percent complete, baseline/actual hours and costs, and comments.' },
    ],
    relatedPages: ['overview', 'qc-dashboard', 'data-management', 'milestones'],
  },

  'qc-dashboard': {
    id: 'qc-dashboard',
    title: 'QC Dashboard',
    category: 'Insights',
    description: 'Quality Control analytics dashboard showing QC transaction volumes, pass/fail rates, and auditor performance. Use this to ensure quality standards are met across all work. Charts display empty when no QC data is loaded (no hardcoded fallback values).',
    features: [
      { title: 'QC Volume by Gate', description: 'See how many items are processed at each QC gate', icon: '🔍' },
      { title: 'Pass/Fail Rates', description: 'Track quality metrics over time', icon: '✓' },
      { title: 'Auditor Performance', description: 'Compare QC auditor productivity and accuracy', icon: '👤' },
      { title: 'Project QC Summary', description: 'QC status breakdown by project', icon: '📊' },
      { title: 'Subproject Analysis', description: 'QC metrics broken down by subproject', icon: '📋' },
    ],
    tour: [
      { target: '[data-tour-id="qc-charts"]', title: 'QC Charts', content: 'All QC charts will display empty when no QC task data is loaded. Import QC tasks via Data Management to populate the dashboard.', placement: 'bottom' },
    ],
    faqs: [
      { question: 'What are QC gates?', answer: 'QC gates are checkpoints in the workflow: Initial (first check), Mid (progress review), Final (completion review), and Post-Validation (after client review).' },
      { question: 'How is pass rate calculated?', answer: 'Pass Rate = Passed Items / Total Items Reviewed. A higher rate indicates better work quality.' },
      { question: 'Why are the charts empty?', answer: 'The QC Dashboard no longer shows hardcoded fallback data. If charts are empty, import QC tasks via Data Management. This ensures you only see actual QC data.' },
      { question: 'What QC metrics are tracked?', answer: 'The dashboard tracks: QC transaction volumes by gate, pass/fail distribution, analyst performance (hours vs pass rate), and subproject quality analysis.' },
    ],
    relatedPages: ['qc-log', 'hours', 'data-management'],
  },

  'data-management': {
    id: 'data-management',
    title: 'Data Management',
    category: 'Project Controls',
    description: 'The single source of truth for all project data. Import data from Excel or JSON files, view and edit tables, and export data for external reporting. All other pages pull their data from here. Includes comprehensive tables for all entities including new DevOps tables (Sprints, Epics, Features, User Stories) and Project Log.',
    features: [
      { title: 'File Upload', description: 'Import CSV, JSON, or Excel files', icon: '📤' },
      { title: 'Data Tables', description: 'View and search all entity types including new DevOps and Project Log tables', icon: '📋' },
      { title: 'Excel Export', description: 'Download data in Excel format', icon: '📥' },
      { title: 'Change Log', description: 'Audit trail of all data changes', icon: '📝' },
      { title: 'Auto-Calculated Fields', description: 'Fields like remaining hours, CPI/SPI, and rollups are automatically calculated', icon: '🧮' },
      { title: 'Project Log', description: 'Track assumptions, issues, risks, decisions, and lessons learned', icon: '📔' },
    ],
    tour: [
      { target: '[data-tour-id="upload"]', title: 'File Upload', content: 'Drag and drop files here or click to browse. Supported formats: CSV, JSON, XLSX.', placement: 'bottom' },
      { target: '[data-tour-id="tables"]', title: 'Data Tables', content: 'Switch between tabs to view different entity types: Employees, Projects, Tasks, Hours, Project Log, Sprints, Epics, Features, User Stories, etc.', placement: 'top' },
      { target: '[data-tour-id="changelog"]', title: 'Change Log', content: 'Every change is tracked here with timestamp, user, and before/after values.', placement: 'left' },
    ],
    faqs: [
      { question: 'What file formats can I import?', answer: 'You can import CSV (comma-separated), JSON (structured data), and XLSX (Excel) files. The system auto-detects the format.' },
      { question: 'How do I map imported columns to fields?', answer: 'Column headers are automatically matched to field names. If a column cannot be matched, it will be shown in the import preview for manual mapping.' },
      { question: 'Is there a template I can use?', answer: 'Yes! Click "Download Template" to get an Excel file with the correct column headers and sample data.' },
      { question: 'What are the new count fields in Tasks?', answer: 'Tasks now include baselineCount, actualCount, and completedCount fields for tracking countable deliverables (e.g., "5 drawings", "10 reports"). These values roll up to parent WBS items.' },
      { question: 'How does Project Log work?', answer: 'Project Log tracks project events by type (Assumptions, Issues, Risks, Decisions, etc.). When you select a project, the hierarchy IDs (portfolio, customer, site) are automatically populated.' },
      { question: 'How do I link tasks to user stories?', answer: 'In the Tasks table, set the userStoryId field to link a task to a user story. You can also set sprintId to assign tasks to sprints for sprint planning.' },
      { question: 'What is the hierarchy for Units and Projects?', answer: 'Units are now nested inside Projects (not Sites). The hierarchy is: Portfolio → Customer → Site → Project → Unit → Phase → Task.' },
    ],
    relatedPages: ['wbs-gantt', 'hours', 'overview', 'sprint'],
  },

  'wbs-gantt': {
    id: 'wbs-gantt',
    title: 'WBS & Gantt',
    category: 'Project Controls',
    description: 'Work Breakdown Structure and Gantt chart visualization. Manage project hierarchy, view task dependencies, run Critical Path Method (CPM) analysis, and track progress at every level. Supports count metrics rollup and updated hierarchy (Units inside Projects).',
    features: [
      { title: 'WBS Hierarchy', description: 'Navigate from portfolio to sub-task level (Portfolio → Customer → Site → Project → Unit → Phase → Task)', icon: '🌳' },
      { title: 'Gantt Bars', description: 'Visual timeline with progress indicators', icon: '📊' },
      { title: 'CPM Analysis', description: 'Calculate critical path and float', icon: '🔴' },
      { title: 'Dependency Arrows', description: 'See task relationships (FS, SS, FF, SF)', icon: '➡️' },
      { title: 'Count Metrics', description: 'Track baseline/actual/completed counts that roll up through hierarchy', icon: '🔢' },
    ],
    tour: [
      { target: '[data-tour-id="wbs-table"]', title: 'WBS Table', content: 'Expand/collapse items to navigate the hierarchy. Click on a row to see details. Count metrics (baselineCount, actualCount, completedCount) roll up from tasks to parent items.', placement: 'right' },
      { target: '[data-tour-id="gantt"]', title: 'Gantt Chart', content: 'Tasks are shown as bars on the timeline. The fill indicates progress. Red bars are on the critical path.', placement: 'left' },
      { target: '[data-tour-id="cpm-button"]', title: 'Run CPM', content: 'Click this button to calculate the critical path. Results show project duration, critical tasks, and float.', placement: 'bottom' },
    ],
    faqs: [
      { question: 'What is the Critical Path?', answer: 'The critical path is the longest sequence of dependent tasks. Any delay on a critical task delays the entire project.' },
      { question: 'What is Float?', answer: 'Float (or slack) is how much a task can be delayed without affecting the project end date. Critical tasks have zero float.' },
      { question: 'What do the relationship types mean?', answer: 'FS = Finish-to-Start (most common), SS = Start-to-Start, FF = Finish-to-Finish, SF = Start-to-Finish.' },
      { question: 'How are % Complete and Task Efficiency calculated?', answer: 'The system determines % complete based on the configured progress method: quantity uses completed versus baseline counts (capped at 0–100%), milestone uses a weighted status map (Completed=100, In Progress=65, At Risk=45, On Hold=25, Not Started=0), and hours uses actual hours compared to baseline hours. Task Efficiency compares earned hours (baseline × % complete) to actual hours so you can see if work is running lean (>100%) or behind (<100%).' },
      { question: 'What are count metrics?', answer: 'Count metrics (baselineCount, actualCount, completedCount) track countable deliverables like "5 drawings" or "10 reports". These values roll up from tasks through the WBS hierarchy (Task → Phase → Unit → Project → Site → Customer → Portfolio).' },
      { question: 'What is the hierarchy structure?', answer: 'The hierarchy is: Portfolio → Customer → Site → Project → Unit → Phase → Task. Units are now nested inside Projects (not Sites).' },
    ],
    relatedPages: ['data-management', 'resourcing', 'sprint'],
  },

  resourcing: {
    id: 'resourcing',
    title: 'Resourcing',
    category: 'Project Controls',
    description: 'Resource allocation and utilization dashboard. View resource assignments across projects, identify over/under-allocations, and plan resource capacity. Includes resource leveling engine for automated task scheduling.',
    features: [
      { title: 'Resource Heatmap', description: 'Color-coded view of resource utilization by week', icon: '🗓️' },
      { title: 'Resource Gantt', description: 'Timeline view of resource assignments', icon: '📊' },
      { title: 'Utilization Metrics', description: 'Track actual vs. target utilization', icon: '📈' },
      { title: 'Resource Leveling Engine', description: 'Automated task scheduling with precedence constraints', icon: '⚙️' },
    ],
    tour: [
      { target: '[data-tour-id="heatmap"]', title: 'Resource Heatmap', content: 'This heatmap shows resource utilization across all projects. Each cell represents hours assigned to a resource for a specific week. Colors indicate utilization levels.', placement: 'bottom' },
      { target: '[data-tour-id="leveling"]', title: 'Resource Leveling', content: 'Use the resource leveling engine to automatically schedule tasks based on resource availability and task priorities. Configure parameters and run the engine to see optimized schedules.', placement: 'top' },
    ],
    faqs: [
      { question: 'What does the heatmap color mean?', answer: 'Colors range from green (under-utilized) through yellow (optimal) to red (over-allocated). Target is typically 80-90% utilization.' },
      { question: 'How does resource leveling work?', answer: 'The resource leveling engine orders tasks by importance (priority and successor chains), then assigns them to resources based on availability calendars. It respects precedence constraints and tracks delays.' },
      { question: 'Can I export the resource schedule?', answer: 'Yes, you can export resource assignments and utilization data from the Data Management page in Excel format.' },
    ],
    relatedPages: ['hours', 'wbs-gantt', 'data-management'],
  },

  'project-health': {
    id: 'project-health',
    title: 'Project Health',
    category: 'Project Controls',
    description: 'Comprehensive project health assessment with 35+ health checks organized by category. Track financial metrics, work variance, schedule compliance, and approval workflows. Calculate overall health scores and manage project approvals.',
    features: [
      { title: 'Health Checks', description: '35+ checks across Scope, Tasks, Structure, Resources, and Compliance', icon: '✅' },
      { title: 'Financial Metrics', description: 'Track contract values, forecasts, GP/GM, and cost variances', icon: '💰' },
      { title: 'Work Variance', description: 'Compare baseline vs actual work and costs', icon: '📊' },
      { title: 'Approval Workflow', description: 'Multi-stage approval process with role-based sign-offs', icon: '📝' },
      { title: 'Health Score', description: 'Automated calculation of overall project health percentage', icon: '📈' },
    ],
    tour: [
      { target: '[data-tour-id="health-score"]', title: 'Health Score', content: 'The overall health score is calculated as the percentage of passed health checks. Green (80%+) = healthy, Yellow (60-79%) = at risk, Red (<60%) = critical.', placement: 'bottom' },
      { target: '[data-tour-id="checks"]', title: 'Health Checks', content: 'Expand each category to see individual checks. Click the circle to toggle Pass/Fail. For failed checks, select a failure reason and add comments.', placement: 'right' },
      { target: '[data-tour-id="approvals"]', title: 'Approval Workflow', content: 'Complete the approval workflow by marking each stage as approved. Enter approver name and comments. The project status updates based on approval progress.', placement: 'left' },
    ],
    faqs: [
      { question: 'How is the health score calculated?', answer: 'The health score is the percentage of passed checks out of all evaluated checks. Only checks that have been marked as Pass or Fail are counted. Multi-line checks are excluded from the calculation.' },
      { question: 'What are the failure reasons?', answer: 'Failure reasons include: Scope Gaps (missing requirements), Missing Logic (dependency issues), Resources (resource assignment problems), and Structure (WBS/schedule structure issues).' },
      { question: 'What financial metrics are tracked?', answer: 'Project Health tracks: Total Contract, Latest Forecasted Cost, Forecasted GP (Gross Profit), Forecasted GM (Gross Margin %), Baseline/Actual/Remaining Work and Costs, and various variance calculations.' },
      { question: 'How do I change the project being assessed?', answer: 'Use the hierarchy filter in the header to select a different project. The page automatically loads or creates a health record for the selected project.' },
      { question: 'What is the approval workflow?', answer: 'The workflow includes: Project Controls QC Complete, Project Lead Acknowledged, Senior Manager Approval, and Approved for Execution Setup. Each stage must be completed in sequence.' },
    ],
    relatedPages: ['data-management', 'overview', 'forecast'],
  },



  forecast: {
    id: 'forecast',
    title: 'Forecasting',
    category: 'Project Management',
    description: 'Probabilistic forecasting using Monte Carlo simulation and Earned Value Management (EVM). Generate P10/P50/P90 cost and schedule forecasts, calculate TCPI, and run scenario analysis.',
    features: [
      { title: 'Monte Carlo Simulation', description: 'Run 1000+ iterations for probabilistic forecasts', icon: '🎲' },
      { title: 'EVM Metrics', description: 'CPI, SPI, CV, SV, and TCPI calculations', icon: '📊' },
      { title: 'IEAC Methods', description: 'Three standard estimate-at-completion formulas', icon: '🧮' },
      { title: 'Scenario Modeling', description: 'Adjust parameters to see forecast impact', icon: '🔧' },
    ],
    tour: [
      { target: '[data-tour-id="params"]', title: 'Model Parameters', content: 'Adjust these inputs to model different scenarios. Changes affect the Monte Carlo simulation results.', placement: 'bottom' },
      { target: '[data-tour-id="run-button"]', title: 'Run Simulation', content: 'Click to run the Monte Carlo simulation. Results show P10 (best), P50 (most likely), and P90 (worst) outcomes.', placement: 'left' },
      { target: '[data-tour-id="results"]', title: 'Forecast Results', content: 'These tables show the simulation output and standard EVM calculations for comparison.', placement: 'top' },
    ],
    faqs: [
      { question: 'What is Monte Carlo simulation?', answer: 'Monte Carlo runs thousands of scenarios with randomized inputs to produce a probability distribution of outcomes instead of a single point estimate.' },
      { question: 'What do P10/P50/P90 mean?', answer: 'P10 = 10% chance of being at or below this value (best case). P50 = median (most likely). P90 = 90% chance (worst case).' },
      { question: 'What is TCPI?', answer: 'To-Complete Performance Index shows the efficiency needed to complete remaining work within budget. TCPI > 1 means you need to be more efficient than historical performance.' },
    ],
    relatedPages: ['overview', 'wbs-gantt', 'milestones'],
  },

  sprint: {
    id: 'sprint',
    title: 'Sprint Planning',
    category: 'Project Management',
    description: 'Agile sprint planning board with Kanban-style task management. Drag and drop tasks between status columns, assign resources, and track sprint progress. Full DevOps integration with Epics, Features, User Stories, and Sprints.',
    features: [
      { title: 'Kanban Board', description: 'Visual task board with drag-and-drop', icon: '📋' },
      { title: 'Sprint Metrics', description: 'Track velocity and burndown', icon: '📈' },
      { title: 'Task Cards', description: 'View task details, priority, and assignments', icon: '🎯' },
      { title: 'Group By Options', description: 'Organize by status, resource, project, or phase', icon: '📂' },
      { title: 'DevOps Integration', description: 'Link tasks to user stories and sprints for agile workflow', icon: '🔄' },
      { title: 'Sprint Management', description: 'Create and manage sprints, assign user stories to sprints', icon: '🏃' },
    ],
    tour: [
      { target: '[data-tour-id="groupby"]', title: 'Group By', content: 'Change how tasks are organized on the board: by Status, Resource, Project, or Phase.', placement: 'bottom' },
      { target: '[data-tour-id="board"]', title: 'Kanban Board', content: 'Drag tasks between columns to update their status. Changes are saved automatically. Tasks linked to user stories show their story information.', placement: 'top' },
    ],
    faqs: [
      { question: 'How do I move a task?', answer: 'Click and drag a task card to another column. The status will update automatically and be logged in the change history.' },
      { question: 'Can I assign tasks to resources?', answer: 'Yes! Group by Resource to see task assignments, then drag tasks between resource columns to reassign.' },
      { question: 'How do I link tasks to user stories?', answer: 'In Data Management, set the userStoryId field on tasks. Tasks can also be assigned to sprints via sprintId. This enables full DevOps workflow tracking.' },
      { question: 'What is the DevOps hierarchy?', answer: 'The hierarchy is: Epic → Feature → User Story → Task. Epics belong to projects, features belong to epics, user stories belong to features and can be assigned to sprints, and tasks can be linked to user stories.' },
      { question: 'How do charge codes relate to user stories?', answer: 'User stories have a chargeCodeId field. This allows charge codes to be tracked at the user story level, with tasks breaking down the work further without needing to track charge codes at the task level.' },
    ],
    relatedPages: ['wbs-gantt', 'hours', 'resourcing', 'data-management'],
  },

  'qc-log': {
    id: 'qc-log',
    title: 'QC Log',
    category: 'Project Management',
    description: 'Detailed log of all Quality Control transactions. View individual QC records, filter by status, search by task or auditor, and analyze QC trends.',
    features: [
      { title: 'QC Record List', description: 'Searchable list of all QC transactions', icon: '📋' },
      { title: 'Status Filters', description: 'Filter by Pass, Fail, Unprocessed, or Rework', icon: '🔍' },
      { title: 'Error Tracking', description: 'View critical and non-critical error counts', icon: '⚠️' },
      { title: 'Score Trends', description: 'Track QC scores over time', icon: '📈' },
    ],
    tour: [],
    faqs: [
      { question: 'What is the difference between critical and non-critical errors?', answer: 'Critical errors affect data integrity or safety. Non-critical errors are documentation or formatting issues that do not impact the final deliverable quality.' },
    ],
    relatedPages: ['qc-dashboard', 'data-management', 'hours'],
  },

  login: {
    id: 'login',
    title: 'Login',
    category: 'General',
    description: 'Sign in to Pinnacle Project Controls. Use your email and password, or select a demo account to explore the application.',
    features: [
      { title: 'Demo Accounts', description: 'Try the app with pre-configured demo users', icon: '👤' },
      { title: 'Secure Login', description: 'Enterprise-grade authentication', icon: '🔒' },
    ],
    tour: [],
    faqs: [
      { question: 'How do I use a demo account?', answer: 'Click one of the demo account buttons to auto-fill credentials, then click Sign In.' },
      { question: 'Forgot your password?', answer: 'Contact your system administrator to reset your password.' },
    ],
    relatedPages: ['home', 'overview'],
  },
};

/**
 * Get help content for a specific page
 */
export function getHelpContent(pageId: string): PageHelpContent | undefined {
  return HELP_CONTENT[pageId];
}

/**
 * Get all help content grouped by category
 */
export function getHelpContentByCategory(): Record<string, PageHelpContent[]> {
  const byCategory: Record<string, PageHelpContent[]> = {};
  
  Object.values(HELP_CONTENT).forEach(content => {
    if (!byCategory[content.category]) {
      byCategory[content.category] = [];
    }
    byCategory[content.category].push(content);
  });
  
  return byCategory;
}

/**
 * Search help content
 */
export function searchHelpContent(query: string): PageHelpContent[] {
  const lowerQuery = query.toLowerCase();
  
  return Object.values(HELP_CONTENT).filter(content => {
    return (
      content.title.toLowerCase().includes(lowerQuery) ||
      content.description.toLowerCase().includes(lowerQuery) ||
      content.features.some(f => 
        f.title.toLowerCase().includes(lowerQuery) ||
        f.description.toLowerCase().includes(lowerQuery)
      ) ||
      content.faqs.some(f =>
        f.question.toLowerCase().includes(lowerQuery) ||
        f.answer.toLowerCase().includes(lowerQuery)
      )
    );
  });
}


