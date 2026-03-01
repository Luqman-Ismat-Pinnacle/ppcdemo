export interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'readonly';
  editable?: boolean;
}

export interface TableDef {
  key: string;
  label: string;
  columns: ColumnDef[];
}

const TIMESTAMP_COLS: ColumnDef[] = [
  { key: 'created_at', label: 'Created', type: 'readonly' },
  { key: 'updated_at', label: 'Updated', type: 'readonly' },
];

const ROLLUP_COLS: ColumnDef[] = [
  { key: 'baseline_start', label: 'Baseline Start', type: 'date', editable: true },
  { key: 'baseline_end', label: 'Baseline End', type: 'date', editable: true },
  { key: 'actual_start', label: 'Actual Start', type: 'date', editable: true },
  { key: 'actual_end', label: 'Actual End', type: 'date', editable: true },
  { key: 'baseline_hours', label: 'Baseline Hrs', type: 'number', editable: true },
  { key: 'actual_hours', label: 'Actual Hrs', type: 'number', editable: true },
  { key: 'remaining_hours', label: 'Remaining Hrs', type: 'number', editable: true },
  { key: 'total_hours', label: 'Total Hrs', type: 'readonly' },
  { key: 'actual_cost', label: 'Actual Cost', type: 'number', editable: true },
  { key: 'remaining_cost', label: 'Remaining Cost', type: 'number', editable: true },
  { key: 'scheduled_cost', label: 'Sched Cost', type: 'readonly' },
  { key: 'projected_hours', label: 'Projected Hrs', type: 'number', editable: true },
  { key: 'days', label: 'Days', type: 'readonly' },
  { key: 'tf', label: 'TF', type: 'number', editable: true },
  { key: 'percent_complete', label: '% Complete', type: 'readonly' },
  { key: 'progress', label: 'Progress', type: 'number', editable: true },
  { key: 'is_active', label: 'Active', type: 'boolean', editable: true },
  { key: 'comments', label: 'Comments', type: 'text', editable: true },
];

const SCHED_COLS: ColumnDef[] = [
  { key: 'is_critical', label: 'Critical', type: 'boolean', editable: true },
  { key: 'is_milestone', label: 'Milestone', type: 'boolean', editable: true },
  { key: 'is_summary', label: 'Summary', type: 'boolean', editable: true },
  { key: 'outline_level', label: 'Outline Lvl', type: 'number', editable: true },
  { key: 'total_float', label: 'Total Float', type: 'number', editable: true },
  { key: 'resources', label: 'Resources', type: 'text', editable: true },
  { key: 'constraint_date', label: 'Constraint Date', type: 'date', editable: true },
  { key: 'constraint_type', label: 'Constraint Type', type: 'text', editable: true },
  { key: 'early_start', label: 'Early Start', type: 'date', editable: true },
  { key: 'early_finish', label: 'Early Finish', type: 'date', editable: true },
  { key: 'late_start', label: 'Late Start', type: 'date', editable: true },
  { key: 'late_finish', label: 'Late Finish', type: 'date', editable: true },
  { key: 'priority_value', label: 'Priority', type: 'number', editable: true },
  { key: 'lag_days', label: 'Lag Days', type: 'number', editable: true },
  { key: 'predecessor_name', label: 'Pred Name', type: 'text', editable: true },
  { key: 'predecessor_task_id', label: 'Pred Task ID', type: 'text', editable: true },
  { key: 'relationship', label: 'Relationship', type: 'text', editable: true },
  { key: 'wbs_code', label: 'WBS Code', type: 'text', editable: true },
  { key: 'folder', label: 'Folder', type: 'text', editable: true },
];

export const TABLE_DEFS: TableDef[] = [
  {
    key: 'portfolios', label: 'Portfolios',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      ...ROLLUP_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'customers', label: 'Customers',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'portfolio_id', label: 'Portfolio ID', type: 'text', editable: true },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      ...ROLLUP_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'sites', label: 'Sites',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'location', label: 'Location', type: 'text', editable: true },
      { key: 'customer_id', label: 'Customer ID', type: 'text', editable: true },
      { key: 'portfolio_id', label: 'Portfolio ID', type: 'text', editable: true },
      ...ROLLUP_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'projects', label: 'Projects',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'site_id', label: 'Site ID', type: 'text', editable: true },
      { key: 'customer_id', label: 'Customer ID', type: 'text', editable: true },
      { key: 'portfolio_id', label: 'Portfolio ID', type: 'text', editable: true },
      { key: 'pca_email', label: 'PCA Email', type: 'text', editable: true },
      { key: 'has_schedule', label: 'Has Schedule', type: 'boolean', editable: true },
      ...ROLLUP_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'units', label: 'Units',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'employee_id', label: 'Employee ID', type: 'text', editable: true },
      ...ROLLUP_COLS, ...SCHED_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'phases', label: 'Phases',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'unit_id', label: 'Unit ID', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'employee_id', label: 'Employee ID', type: 'text', editable: true },
      { key: 'resource', label: 'Resource', type: 'text', editable: true },
      ...ROLLUP_COLS, ...SCHED_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'tasks', label: 'Tasks',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'phase_id', label: 'Phase ID', type: 'text', editable: true },
      { key: 'unit_id', label: 'Unit ID', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'employee_id', label: 'Employee ID', type: 'text', editable: true },
      { key: 'resource', label: 'Resource', type: 'text', editable: true },
      ...ROLLUP_COLS, ...SCHED_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'sub_tasks', label: 'Sub-Tasks',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'task_id', label: 'Task ID', type: 'text', editable: true },
      { key: 'phase_id', label: 'Phase ID', type: 'text', editable: true },
      { key: 'unit_id', label: 'Unit ID', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'employee_id', label: 'Employee ID', type: 'text', editable: true },
      { key: 'resource', label: 'Resource', type: 'text', editable: true },
      ...ROLLUP_COLS, ...SCHED_COLS, ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'employees', label: 'Employees',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'email', label: 'Email', type: 'text', editable: true },
      { key: 'time_in_job_profile', label: 'Time in Job', type: 'text', editable: true },
      { key: 'management_level', label: 'Mgmt Level', type: 'text', editable: true },
      { key: 'employee_type', label: 'Type', type: 'text', editable: true },
      { key: 'senior_manager', label: 'Sr Manager', type: 'text', editable: true },
      { key: 'job_title', label: 'Job Title', type: 'text', editable: true },
      { key: 'is_active', label: 'Active', type: 'boolean', editable: true },
      { key: 'manager', label: 'Manager', type: 'text', editable: true },
      { key: 'employee_customer', label: 'Customer', type: 'text', editable: true },
      { key: 'employee_site', label: 'Site', type: 'text', editable: true },
      { key: 'employee_project', label: 'Project', type: 'text', editable: true },
      { key: 'department', label: 'Department', type: 'text', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'hour_entries', label: 'Hour Entries',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'employee_id', label: 'Employee ID', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'phase', label: 'Phase', type: 'text', editable: true },
      { key: 'task', label: 'Task', type: 'text', editable: true },
      { key: 'charge_code', label: 'Charge Code', type: 'text', editable: true },
      { key: 'description', label: 'Description', type: 'text', editable: true },
      { key: 'date', label: 'Date', type: 'date', editable: true },
      { key: 'hours', label: 'Hours', type: 'number', editable: true },
      { key: 'actual_cost', label: 'Actual Cost', type: 'number', editable: true },
      { key: 'workday_phase', label: 'WD Phase', type: 'text', editable: true },
      { key: 'workday_task', label: 'WD Task', type: 'text', editable: true },
      { key: 'mpp_phase_task', label: 'MPP Phase/Task', type: 'text', editable: true },
      { key: 'actual_revenue', label: 'Revenue', type: 'number', editable: true },
      { key: 'billing_status', label: 'Billing', type: 'text', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'customer_contracts', label: 'Contracts',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'line_amount', label: 'Amount', type: 'number', editable: true },
      { key: 'line_date', label: 'Date', type: 'date', editable: true },
      { key: 'currency', label: 'Currency', type: 'text', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'project_documents', label: 'Documents',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'file_name', label: 'File Name', type: 'text', editable: true },
      { key: 'storage_path', label: 'Storage Path', type: 'text', editable: false },
      { key: 'document_type', label: 'Type', type: 'text', editable: true },
      { key: 'is_current_version', label: 'Current', type: 'boolean', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'sprints', label: 'Sprints',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'start_date', label: 'Start', type: 'date', editable: true },
      { key: 'end_date', label: 'End', type: 'date', editable: true },
      { key: 'status', label: 'Status', type: 'text', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'sprint_tasks', label: 'Sprint Tasks',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'sprint_id', label: 'Sprint ID', type: 'text', editable: true },
      { key: 'task_id', label: 'Task ID', type: 'text', editable: true },
      { key: 'sort_order', label: 'Order', type: 'number', editable: true },
      ...TIMESTAMP_COLS,
    ],
  },
  {
    key: 'workday_phases', label: 'Workday Phases',
    columns: [
      { key: 'id', label: 'ID', type: 'text', editable: false },
      { key: 'project_id', label: 'Project ID', type: 'text', editable: true },
      { key: 'unit', label: 'Unit', type: 'text', editable: true },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      ...ROLLUP_COLS, ...TIMESTAMP_COLS,
    ],
  },
];
