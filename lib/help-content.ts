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
      { title: 'Unified Dashboard', description: 'Access all project metrics and KPIs from a central location', icon: '' },
      { title: 'Real-time Analytics', description: 'View live data updates across all your projects', icon: '' },
      { title: 'Hierarchy Filtering', description: 'Drill down from portfolio to task level', icon: '' },
      { title: 'Dark/Light Mode', description: 'Toggle between themes for comfortable viewing', icon: '' },
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
    description: 'Executive dashboard with portfolio flow visualization, advanced project controls, and cross-filtering. Provides high-level KPIs, Sankey flow diagrams, risk matrices, and health metrics for manager-to-COO presentations.',
    features: [
      { title: 'Portfolio Flow Sankey', description: 'Visual flow from Portfolio → Customer → Project → Status showing work distribution', icon: '' },
      { title: 'SPI/CPI Scorecards', description: 'Schedule and Cost Performance Indices with trend indicators', icon: '' },
      { title: 'Risk Matrix', description: 'Impact vs Probability scatter chart for risk assessment', icon: '' },
      { title: 'Budget Variance Waterfall', description: 'Visual breakdown of baseline to forecast cost changes', icon: '' },
      { title: 'Advanced Controls', description: 'Float analysis, cascade impact, and predictive health metrics', icon: '' },
      { title: 'Cross-Filtering', description: 'Click any chart element to filter the entire page', icon: '' },
    ],
    tour: [
      { target: '[data-tour-id="metrics"]', title: 'Key Metrics', content: 'These cards show your most important KPIs including SPI, CPI, budget status, and efficiency. Values show as 0 or null when no data is loaded.', placement: 'bottom' },
      { target: '[data-tour-id="sankey"]', title: 'Portfolio Flow', content: 'The Sankey diagram shows how work flows from Portfolio through Customer to Projects and their status. Node width represents hours/value. Use zoom controls to navigate.', placement: 'right' },
      { target: '[data-tour-id="advanced"]', title: 'Advanced Controls', content: 'Float consumption, cascade impact, and predictive health metrics for senior manager presentations.', placement: 'left' },
    ],
    faqs: [
      { question: 'How is SPI (Schedule Performance Index) calculated?', answer: 'SPI = EV / PV. Earned Value (EV) = Baseline Hours × % Complete. Planned Value (PV) = Hours planned to be completed by now. SPI > 1 means ahead of schedule, < 1 behind schedule.' },
      { question: 'How is CPI (Cost Performance Index) calculated?', answer: 'CPI = EV / AC. Earned Value (EV) = Baseline Cost × % Complete. Actual Cost (AC) = Actual spend to date. CPI > 1 means under budget, < 1 over budget.' },
      { question: 'How is Overall Efficiency calculated?', answer: 'Efficiency = (Earned Hours / Actual Hours) × 100%. Earned Hours = Sum of (Baseline Hours × % Complete) for all tasks. Values > 100% mean work is being completed faster than planned.' },
      { question: 'How does the Portfolio Flow Sankey work?', answer: 'The Sankey shows hierarchical flow: Portfolio → Customer → Project → Status. Node width represents total hours. Links show how work distributes through the hierarchy. Click nodes to filter.' },
      { question: 'What is the Risk Matrix?', answer: 'A scatter chart plotting tasks by Impact (Y-axis) vs Probability (X-axis). Tasks in upper-right are high priority. Impact considers baseline hours and criticality. Probability considers % complete deviation.' },
      { question: 'How is Float Consumption calculated?', answer: 'Float Consumption = (Max Possible Float - Current Avg Float) / Max Possible Float × 100%. Max Possible Float is estimated as 30% of project duration. Lower remaining float = higher schedule risk.' },
      { question: 'What does the Cascade Impact show?', answer: 'Shows how many downstream tasks are affected if a milestone slips, how many are on critical path, and the maximum cascade depth through dependency chains.' },
    ],
    relatedPages: ['hours', 'milestones', 'forecast', 'data-management', 'tasks'],
  },

  hours: {
    id: 'hours',
    title: 'Hours Insights',
    category: 'Insights',
    description: 'Analyze labor hours across workers, phases, and tasks. This page helps you understand resource utilization, identify bottlenecks, and track time-based productivity metrics. Includes non-execution hours analysis and quality hours tracking.',
    features: [
      { title: 'Labor Breakdown', description: 'View hours by worker, phase, or task over time', icon: '' },
      { title: 'Stacked Charts', description: 'See how different categories contribute to totals', icon: '' },
      { title: 'Time Trends', description: 'Track weekly and monthly labor patterns', icon: '' },
      { title: 'Utilization Metrics', description: 'Compare actual vs. planned hours', icon: '' },
      { title: 'Non-Execution Hours', description: 'Track hours not directly tied to execution tasks', icon: '' },
      { title: 'Quality Hours', description: 'Analyze QC and quality-related hours', icon: '' },
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
      { title: 'Milestone Tracker', description: 'List of all milestones with status indicators', icon: '' },
      { title: 'Plan vs. Actual', description: 'Compare original schedule to reality', icon: '' },
      { title: 'Variance Analysis', description: 'See which milestones are ahead or behind', icon: '' },
      { title: 'Scoreboard', description: 'Customer-level milestone summary', icon: '' },
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
      { title: 'Document Status', description: 'See which documents are approved, in review, or pending', icon: '' },
      { title: 'Approval Gauges', description: 'Visual indicators of document completion rates', icon: '' },
      { title: 'Deliverable Tracker', description: 'Detailed list of all project deliverables', icon: '' },
      { title: 'Milestone Linking', description: 'Link deliverables to milestones for milestone tracking', icon: '' },
    ],
    tour: [],
    faqs: [
      { question: 'What document types are tracked?', answer: 'PPC tracks DRDs (Data Requirement Documents), QMPs (Quality Management Plans), SOPs (Standard Operating Procedures), and Workflow Documents.' },
      { question: 'How do I link a deliverable to a milestone?', answer: 'In Data Management, set the milestoneId field on a deliverable to link it to a milestone. This helps track which deliverables are associated with specific project milestones.' },
      { question: 'What fields are tracked for deliverables?', answer: 'Deliverables track: name, project, phase, task, milestone (optional), owner, type, status, due date, completed date, percent complete, baseline/actual hours and costs, and comments.' },
    ],
    relatedPages: ['overview', 'qc-dashboard', 'data-management', 'milestones'],
  },

  tasks: {
    id: 'tasks',
    title: 'Tasks Insights',
    category: 'Insights',
    description: 'Comprehensive task analytics combining Hours, QC performance, and work distribution. Features interactive Sankey flows, efficiency charts, and executive summaries for performance discussions.',
    features: [
      { title: 'Hours vs Efficiency Chart', description: 'Scatter plot showing tasks by hours worked vs efficiency', icon: '' },
      { title: 'Work Type Breakdown', description: 'Stacked bar chart of hours by execution, QC, management categories', icon: '' },
      { title: 'Enhanced Sankey', description: 'Multi-level flow from Portfolio → Status → Type → Phase', icon: '' },
      { title: 'Executive View', description: 'Risk matrix, action priority treemap, health distribution, efficiency gauge', icon: '' },
      { title: 'Task Explorer', description: 'Multiple view modes: treemap, timeline, cards, table with filtering', icon: '' },
      { title: 'Cross-Filtering', description: 'Click any chart element to filter all visuals on the page', icon: '' },
    ],
    tour: [
      { target: '[data-tour-id="hours-chart"]', title: 'Hours & Efficiency', content: 'Each bubble represents a task. X-axis is hours worked, Y-axis is efficiency. Bubble size shows importance. Use zoom controls to navigate large datasets.', placement: 'bottom' },
      { target: '[data-tour-id="sankey"]', title: 'Enhanced Sankey', content: 'Multi-level breakdown showing work flow. Toggle depth levels (simple/detailed/full) for more granularity.', placement: 'right' },
      { target: '[data-tour-id="executive"]', title: 'Executive View', content: 'Four-panel view for management presentations: Risk Matrix, Action Priority, Health Distribution, and Efficiency Gauge.', placement: 'left' },
    ],
    faqs: [
      { question: 'How is Task Efficiency calculated?', answer: 'Efficiency = (Earned Hours / Actual Hours) × 100%. Earned Hours = Baseline Hours × (% Complete / 100). Values > 100% mean task completed faster than planned, < 100% slower than planned.' },
      { question: 'What are the work type categories?', answer: 'Execution: Direct project work (development, construction). QC: Quality Control checks. Management: PM, coordination, meetings. Support: Admin, training. Types are derived from task names and phase types.' },
      { question: 'How does the Hours vs Efficiency scatter work?', answer: 'X-axis: Total hours on task. Y-axis: Efficiency %. Bubble size: Baseline hours (importance). Color: Status. Tasks in upper-right are high-hours but efficient. Lower-right are concerning (high hours, low efficiency).' },
      { question: 'What does the Risk Matrix show?', answer: 'Impact (Y) × Probability (X) grid. Impact = Baseline Hours / Max Hours. Probability = deviation from expected progress. High impact + High probability = Top priority action items.' },
      { question: 'How is the Efficiency Gauge calculated?', answer: 'Overall Efficiency = Total Earned Hours / Total Actual Hours × 100%. Gauge shows 0-150% range. Green zone: 90-110% (on track). Yellow: 70-90% or 110-130%. Red: outside these ranges.' },
      { question: 'What does the Action Priority Treemap show?', answer: 'Tasks sized by priority score (hours × criticality × risk). Color indicates status. Larger boxes need more attention. Click to drill down to task details.' },
      { question: 'How is the Health Distribution calculated?', answer: 'Tasks categorized as Healthy (>80% efficiency, on schedule), At Risk (60-80% efficiency or minor delays), Critical (<60% efficiency or significant delays). Pie chart shows distribution.' },
    ],
    relatedPages: ['overview', 'hours', 'qc-dashboard', 'wbs-gantt'],
  },

  'qc-dashboard': {
    id: 'qc-dashboard',
    title: 'QC Dashboard',
    category: 'Insights',
    description: 'Quality Control analytics dashboard showing QC transaction volumes, pass/fail rates, and auditor performance. Use this to ensure quality standards are met across all work. Charts display empty when no QC data is loaded (no hardcoded fallback values).',
    features: [
      { title: 'QC Volume by Gate', description: 'See how many items are processed at each QC gate', icon: '' },
      { title: 'Pass/Fail Rates', description: 'Track quality metrics over time', icon: '' },
      { title: 'Auditor Performance', description: 'Compare QC auditor productivity and accuracy', icon: '' },
      { title: 'Project QC Summary', description: 'QC status breakdown by project', icon: '' },
      { title: 'Subproject Analysis', description: 'QC metrics broken down by subproject', icon: '' },
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
      { title: 'File Upload', description: 'Import CSV, JSON, or Excel files', icon: '' },
      { title: 'Data Tables', description: 'View and search all entity types including new DevOps and Project Log tables', icon: '' },
      { title: 'Excel Export', description: 'Download data in Excel format', icon: '' },
      { title: 'Change Log', description: 'Audit trail of all data changes', icon: '' },
      { title: 'Auto-Calculated Fields', description: 'Fields like remaining hours, CPI/SPI, and rollups are automatically calculated', icon: '' },
      { title: 'Project Log', description: 'Track assumptions, issues, risks, decisions, and lessons learned', icon: '' },
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
      { title: 'WBS Hierarchy', description: 'Navigate from portfolio to sub-task level (Portfolio → Customer → Site → Project → Unit → Phase → Task)', icon: '' },
      { title: 'Gantt Bars', description: 'Visual timeline with progress indicators', icon: '' },
      { title: 'CPM Analysis', description: 'Calculate critical path and float', icon: '' },
      { title: 'Dependency Arrows', description: 'See task relationships (FS, SS, FF, SF)', icon: '' },
      { title: 'Count Metrics', description: 'Track baseline/actual/completed counts that roll up through hierarchy', icon: '' },
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
    description: 'Comprehensive resource management for resourcing teams. Assign employees to projects, track utilization and QC performance, analyze capacity vs demand, and identify resource gaps. Features employee cards with detailed metrics.',
    features: [
      { title: 'Team Overview', description: 'Employee cards with utilization, QC rate, and capacity metrics', icon: '' },
      { title: 'Assignment Center', description: 'Match available employees to roles needing resources', icon: '' },
      { title: 'Capacity Analysis', description: 'Team utilization and capacity vs demand charts', icon: '' },
      { title: 'Employee Profiles', description: 'Detailed view of each employee\'s workload and performance', icon: '' },
      { title: 'Resource Heatmap', description: 'Color-coded view of resource utilization by week, month, or quarter with capacity from active employees', icon: '' },
      { title: 'Heatmap Drill down features', description: 'Date filter: heatmap respects the global date range. Hierarchy filter: drill to portfolio, project, or unit and see demand for that scope. View by week, month, or quarter. Capacity per role is based on how many active employees in the employee list match that role.', icon: '' },
      { title: 'Resource Leveling Engine', description: 'Automated task scheduling with precedence constraints', icon: '' },
    ],
    tour: [
      { target: '[data-tour-id="team-overview"]', title: 'Team Overview', content: 'Employee cards showing utilization status, QC pass rate, and available capacity. Click any card for detailed profile.', placement: 'bottom' },
      { target: '[data-tour-id="assignment"]', title: 'Assignment Center', content: 'See roles needing resources and available employees. Quickly assign team members to projects with resource gaps.', placement: 'right' },
      { target: '[data-tour-id="capacity"]', title: 'Capacity Analysis', content: 'Bar charts showing team utilization vs 100% target and role-based capacity vs demand comparison.', placement: 'left' },
    ],
    faqs: [
      { question: 'How is Employee Utilization calculated?', answer: 'Utilization = (Allocated Hours / Annual Capacity) × 100%. Annual Capacity is typically 1880 hours (47 weeks × 40 hours). Status: Available (<50%), Optimal (50-85%), Busy (85-100%), Overloaded (>100%).' },
      { question: 'How is QC Pass Rate calculated?', answer: 'QC Pass Rate = (Passed QC Items / Total QC Items) × 100% for tasks assigned to the employee. Higher rates indicate better work quality requiring less rework.' },
      { question: 'How is Employee Efficiency calculated?', answer: 'Efficiency = (Actual Hours / Allocated Hours) × 100%. Values < 100% mean completing work in less time than allocated (efficient). Values > 100% mean taking longer than planned.' },
      { question: 'What is Available Capacity?', answer: 'Available Capacity = Annual Capacity - Allocated Hours. Shows remaining hours an employee can take on. Used to identify who can absorb additional work.' },
      { question: 'How are Roles Needing Resources identified?', answer: 'Roles where total demand hours exceed available capacity of employees in that role. Shows FTE gap (Demand FTE - Available FTE) and lists matching available employees.' },
      { question: 'What does the Capacity vs Demand chart show?', answer: 'Compares total capacity hours (sum of available hours for all employees in role) against demand hours (sum of remaining work for unassigned/role-based tasks). Roles where demand > capacity need attention.' },
      { question: 'How does the heatmap color coding work?', answer: 'Green: 0-70% utilization (capacity available). Yellow: 70-90% (optimal). Orange: 90-100% (near capacity). Red: >100% (overallocated). Target is 80-85% for sustainable workload.' },
      { question: 'How does resource leveling work?', answer: 'The engine orders tasks by priority (1=highest), then by successor chain length (tasks with more dependents scheduled first). Assigns to available resources respecting precedence constraints. Tracks delays when resources unavailable.' },
    ],
    relatedPages: ['hours', 'wbs-gantt', 'data-management', 'sprint'],
  },

  'project-plans': {
    id: 'project-plans',
    title: 'Project Plans',
    category: 'Project Controls',
    description: 'Upload MPP schedule files, process with MPXJ, run auto project health checks, and sync to Supabase. Health scores and flagged issues are shown per file after processing.',
    features: [
      { title: 'MPP Upload', description: 'Upload Microsoft Project files and link to Workday projects', icon: '' },
      { title: 'Auto Health Check', description: 'Automatic project health scoring when parsing (logic, resources, effort, structure)', icon: '' },
      { title: 'Health Score', description: 'Per-file health score with flagged issues and pass/fail breakdown', icon: '' },
      { title: 'Sync to Supabase', description: 'Convert hierarchy and sync phases, units, tasks to database', icon: '' },
    ],
    tour: [
      { target: '.chart-card', title: 'Upload MPP', content: 'Select an MPP file and link it to a Workday project before uploading.', placement: 'bottom' },
      { target: '.data-table', title: 'Files & Health', content: 'Processed files show a health score. Click the score to see detailed check results and flagged issues.', placement: 'top' },
    ],
    faqs: [
      { question: 'How is the health score calculated?', answer: 'The auto check evaluates: task logic (predecessors/successors), resource assignments, planned effort, duration, large tasks (>100 hrs), and non-execution ratio. Score = passed checks / total checks × 100.' },
      { question: 'What gets flagged?', answer: 'Tasks without logic links, execution tasks without resources, no baseline hours, tasks >100 hrs with count=1, and non-execution exceeding 25% of execution hours.' },
      { question: 'How do I re-run health check?', answer: 'Re-process the file with Run MPXJ. The health check runs automatically during parsing.' },
    ],
    relatedPages: ['data-management', 'wbs-gantt', 'overview'],
  },

  'project-health': {
    id: 'project-health',
    title: 'Project Health',
    category: 'Project Controls',
    description: 'Comprehensive project health assessment with 35+ health checks organized by category. Track financial metrics, work variance, schedule compliance, and approval workflows. Calculate overall health scores and manage project approvals.',
    features: [
      { title: 'Health Checks', description: '35+ checks across Scope, Tasks, Structure, Resources, and Compliance', icon: '' },
      { title: 'Financial Metrics', description: 'Track contract values, forecasts, GP/GM, and cost variances', icon: '' },
      { title: 'Work Variance', description: 'Compare baseline vs actual work and costs', icon: '' },
      { title: 'Approval Workflow', description: 'Multi-stage approval process with role-based sign-offs', icon: '' },
      { title: 'Health Score', description: 'Automated calculation of overall project health percentage', icon: '' },
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
    title: 'Forecasting & Profit Margin',
    category: 'Project Management',
    description: 'Comprehensive forecasting with Profit Margin analysis for Finance alignment, Monte Carlo simulation, and Earned Value Management (EVM). Bridge the gap between project teams and finance for accurate revenue declaration.',
    features: [
      { title: 'Profit Margin Analysis', description: 'Track profit margin against finance targets for accurate revenue declaration', icon: '' },
      { title: 'Revenue Recognition', description: 'Percent Complete Method (POC) using Cost-to-Cost calculation', icon: '' },
      { title: 'Monte Carlo Simulation', description: 'Run 1000+ iterations for probabilistic P10/P50/P90 forecasts', icon: '' },
      { title: 'EVM Metrics', description: 'CPI, SPI, CV, SV, and TCPI calculations', icon: '' },
      { title: 'Cascade Analysis', description: 'Visualize milestone delay impacts on downstream tasks', icon: '' },
      { title: 'FTE Capacity Planning', description: 'Compare resource demand against capacity constraints', icon: '' },
    ],
    tour: [
      { target: '[data-tour-id="profit-margin"]', title: 'Profit Margin', content: 'The primary metric for finance alignment. Shows forecast profit margin vs finance target to ensure correct revenue declaration.', placement: 'bottom' },
      { target: '[data-tour-id="poc"]', title: 'Revenue Recognition', content: 'Uses Percent Complete Method (POC) with Cost-to-Cost calculation. Recognizable Revenue = Contract Value × (Actual Cost / Forecast Cost).', placement: 'right' },
      { target: '[data-tour-id="params"]', title: 'Model Parameters', content: 'Adjust these inputs to model different scenarios. Changes affect the Monte Carlo simulation results.', placement: 'bottom' },
    ],
    faqs: [
      { question: 'How is Profit Margin calculated?', answer: 'Profit Margin = (Revenue - Cost) / Revenue × 100%. Revenue is the PO/Contract value. Cost is the P50 forecast cost from Monte Carlo simulation.' },
      { question: 'What is the Cost-to-Cost POC method?', answer: 'Percent Complete = Actual Cost / Forecast Cost × 100%. This determines how much revenue can be recognized. Recognizable Revenue = Contract Value × Percent Complete.' },
      { question: 'How is Gross Profit calculated?', answer: 'Gross Profit = Contract Value (Revenue) - Forecast Cost. This is the expected profit at project completion.' },
      { question: 'What is the Cost Buffer to Target?', answer: 'Required Cost for Target Margin = Revenue × (1 - Target Margin%). Cost Buffer = Forecast Cost - Required Cost. Negative means you are under budget limit, positive means over.' },
      { question: 'What is Monte Carlo simulation?', answer: 'Monte Carlo runs 1000+ scenarios with randomized inputs (based on historical CPI/SPI variance) to produce a probability distribution of outcomes instead of a single point estimate.' },
      { question: 'What do P10/P50/P90 mean?', answer: 'P10 = 10% chance of being at or below this value (best case). P50 = median/50th percentile (most likely). P90 = 90% chance of being at or below (worst case planning value).' },
      { question: 'What is TCPI?', answer: 'To-Complete Performance Index = (BAC - EV) / (BAC - AC). Shows the cost efficiency needed for remaining work to hit budget. TCPI > 1 means you need to be more efficient than historical performance.' },
      { question: 'What are the IEAC methods?', answer: 'Budget Rate: AC + (BAC - EV) assumes remaining work at budget rate. CPI Method: BAC / CPI assumes current efficiency continues. SPI×CPI: BAC / (CPI × SPI) adjusts for both cost and schedule performance.' },
      { question: 'How does cascade analysis work?', answer: 'Select a milestone and set a delay (days). The sunburst chart shows all downstream dependent tasks and their delay impact. Tasks on critical path (red) affect project end date.' },
      { question: 'How is Float calculated?', answer: 'Total Float = Late Start - Early Start (or Late Finish - Early Finish). Tasks with zero float are on the critical path. Float shows how much a task can slip without delaying the project.' },
    ],
    relatedPages: ['overview', 'wbs-gantt', 'milestones', 'resourcing'],
  },

  sprint: {
    id: 'sprint',
    title: 'Sprint Planning',
    category: 'Project Management',
    description: 'Agile sprint planning board with Kanban-style task management. Drag and drop tasks between status columns, assign resources, and track sprint progress. Full DevOps integration with Epics, Features, User Stories, and Sprints.',
    features: [
      { title: 'Kanban Board', description: 'Visual task board with drag-and-drop', icon: '' },
      { title: 'Sprint Metrics', description: 'Track velocity and burndown', icon: '' },
      { title: 'Task Cards', description: 'View task details, priority, and assignments', icon: '' },
      { title: 'Group By Options', description: 'Organize by status, resource, project, or phase', icon: '' },
      { title: 'DevOps Integration', description: 'Link tasks to user stories and sprints for agile workflow', icon: '' },
      { title: 'Sprint Management', description: 'Create and manage sprints, assign user stories to sprints', icon: '' },
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
      { title: 'QC Record List', description: 'Searchable list of all QC transactions', icon: '' },
      { title: 'Status Filters', description: 'Filter by Pass, Fail, Unprocessed, or Rework', icon: '' },
      { title: 'Error Tracking', description: 'View critical and non-critical error counts', icon: '' },
      { title: 'Score Trends', description: 'Track QC scores over time', icon: '' },
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
      { title: 'Demo Accounts', description: 'Try the app with pre-configured demo users', icon: '' },
      { title: 'Secure Login', description: 'Enterprise-grade authentication', icon: '' },
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


