/**
 * @fileoverview Data Converter Module
 * 
 * Handles conversion of various data formats (CSV, JSON, Excel) into
 * the application's standard data structure.
 * 
 * Supported conversions:
 * - Workday Employee CSV -> Employee[]
 * - Project Plan JSON -> Project data structures
 * - Timecard CSV -> HourEntry[]
 * 
 * @module lib/data-converter
 */

import type { Employee, SampleData } from '@/types/data';
import { convertWorkdayProjectReport } from '@/lib/workday-converter';

/**
 * Workday employee CSV row structure
 * Supports both old and new CSV formats
 */
interface WorkdayEmployeeRow {
  Employee_Type?: string;
  Employee_ID?: string;
  Default_Job_Title?: string;
  Management_Level?: string;
  businessTitle?: string;
  Worker?: string;
  Workers_Manager?: string;
  Worker_s_Manager?: string;
  Work_Email?: string;
  termination_date?: string;
  firstName?: string;
  lastName?: string;
  Active_Status?: string;
  Hire_Date?: string;
}

/**
 * Convert Workday employee CSV data to Employee array
 * 
 * Supports the new CSV format with these columns:
 * Worker, Employee_ID, businessTitle, Job_Profile, Job_Profile_Name, Default_Job_Title,
 * Time_in_Job_Profile, timeInPosition, Management_Level, Worker_s_Manager, location,
 * Client, Company_-_ID, Work_W_H_State, Home_W_H_State, Cost_Center, Sr_Project_Manager,
 * customerOnEmpProfile, siteOnEmpProfile, projectNumberOnEmpProfile, Employee_Type,
 * Hire_Date, termination_date, Active_Status, Work_Email, Social_Security_Number,
 * lastName, firstName
 * 
 * CSV Field Mapping:
 * | Workday Field      | → | App Field       |
 * |--------------------|---|-----------------|
 * | Employee_ID        | → | employeeId      |
 * | Worker (or firstName + lastName) | → | name |
 * | Default_Job_Title or businessTitle | → | jobTitle |
 * | Management_Level   | → | managementLevel |
 * | Worker_s_Manager   | → | manager         |
 * | Work_Email         | → | email           |
 * | Employee_Type      | → | employeeType    |
 * | Active_Status      | → | isActive        |
 * | termination_date   | → | (filter out if set) |
 */
export function convertWorkdayEmployees(csvData: string[][]): Employee[] {
  if (!csvData || csvData.length < 2) {
    return [];
  }

  const headers = csvData[0].map(h => h.trim());
  const employees: Employee[] = [];
  const now = new Date().toISOString();

  // Find column indices - support both old and new formats
  // NOTE: "Roles" column is PRIMARY for senior manager detection
  const colIndex = {
    employeeType: findColumnIndex(headers, ['Employee_Type', 'Employee Type', 'employee_type']),
    employeeId: findColumnIndex(headers, ['Employee_ID', 'Employee ID', 'employee_id', 'EmployeeID']),
    jobTitle: findColumnIndex(headers, ['Default_Job_Title', 'Default Job Title', 'default_job_title', 'Job_Profile_Name', 'Job Profile Name']),
    businessTitle: findColumnIndex(headers, ['businessTitle', 'Business Title', 'business_title']),
    managementLevel: findColumnIndex(headers, ['Management_Level', 'Management Level', 'management_level']),
    worker: findColumnIndex(headers, ['Worker', 'worker']),
    firstName: findColumnIndex(headers, ['firstName', 'First Name', 'first_name', 'firstname']),
    lastName: findColumnIndex(headers, ['lastName', 'Last Name', 'last_name', 'lastname']),
    manager: findColumnIndex(headers, ['Worker_s_Manager', 'Workers_Manager', 'Worker\'s Manager', 'Workers Manager', 'worker_s_manager', 'Workers_Manager']),
    email: findColumnIndex(headers, ['Work_Email', 'Work Email', 'work_email', 'Email', 'email']),
    terminationDate: findColumnIndex(headers, ['termination_date', 'Termination Date', 'termination date', 'terminationdate']),
    activeStatus: findColumnIndex(headers, ['Active_Status', 'Active Status', 'active_status', 'activestatus']),
    hireDate: findColumnIndex(headers, ['Hire_Date', 'Hire Date', 'hire_date', 'hiredate']),
    role: findColumnIndex(headers, ['Roles', 'Role', 'roles', 'role', 'Job_Profile', 'Job Profile']), // PRIMARY: "Roles" column
  };

  // Process each row (skip header)
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row || row.length === 0) continue;

    // Skip terminated employees
    const terminationDate = colIndex.terminationDate >= 0 && row[colIndex.terminationDate]
      ? row[colIndex.terminationDate].trim()
      : '';
    if (terminationDate) continue;

    // Check active status - skip if not active
    const activeStatus = colIndex.activeStatus >= 0 && row[colIndex.activeStatus]
      ? row[colIndex.activeStatus].trim().toLowerCase()
      : 'active';
    if (activeStatus !== 'active' && activeStatus !== '1' && activeStatus !== 'true' && activeStatus !== 'yes') {
      continue;
    }

    // Extract employee ID
    const employeeId = colIndex.employeeId >= 0 && row[colIndex.employeeId]
      ? row[colIndex.employeeId].trim()
      : `EMP-${i.toString().padStart(4, '0')}`;

    // Extract name - prefer Worker field, fallback to firstName + lastName
    let name = '';
    if (colIndex.worker >= 0 && row[colIndex.worker]) {
      name = row[colIndex.worker].trim();
    } else if (colIndex.firstName >= 0 || colIndex.lastName >= 0) {
      const firstName = colIndex.firstName >= 0 && row[colIndex.firstName] ? row[colIndex.firstName].trim() : '';
      const lastName = colIndex.lastName >= 0 && row[colIndex.lastName] ? row[colIndex.lastName].trim() : '';
      name = `${firstName} ${lastName}`.trim();
    }

    // Skip if no name
    if (!name) continue;

    // Extract job title - prefer Default_Job_Title, fallback to businessTitle
    const defaultJobTitle = colIndex.jobTitle >= 0 && row[colIndex.jobTitle]
      ? row[colIndex.jobTitle].trim()
      : '';
    const businessTitle = colIndex.businessTitle >= 0 && row[colIndex.businessTitle]
      ? row[colIndex.businessTitle].trim()
      : '';
    const jobTitle = defaultJobTitle || businessTitle || 'Employee';

    // Extract other fields
    const managementLevel = colIndex.managementLevel >= 0 && row[colIndex.managementLevel]
      ? row[colIndex.managementLevel].trim()
      : 'Individual Contributor';
    const manager = colIndex.manager >= 0 && row[colIndex.manager]
      ? row[colIndex.manager].trim()
      : '';
    const email = colIndex.email >= 0 && row[colIndex.email]
      ? row[colIndex.email].trim()
      : '';
    const employeeType = colIndex.employeeType >= 0 && row[colIndex.employeeType]
      ? row[colIndex.employeeType].trim()
      : 'Regular';

    // Extract role from "Roles" column (PRIMARY for senior manager detection)
    const role = colIndex.role >= 0 && row[colIndex.role]
      ? row[colIndex.role].trim()
      : '';

    employees.push({
      employeeId,
      name,
      jobTitle,
      managementLevel,
      manager,
      email,
      employeeType,
      role, // Add role field from "Roles" column
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return employees;
}

/**
 * Helper function to find column index by trying multiple possible column names
 * Handles various formats: exact match, case-insensitive, with/without spaces/underscores
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  // Normalize header for comparison
  const normalize = (str: string): string => {
    return str.trim().toLowerCase()
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/'/g, '')     // Remove apostrophes
      .replace(/-/g, '_');   // Replace hyphens with underscores
  };

  for (const name of possibleNames) {
    const normalizedName = normalize(name);
    const index = headers.findIndex(h => {
      const normalizedHeader = normalize(h);
      return normalizedHeader === normalizedName ||
        normalizedHeader === name.toLowerCase() ||
        h.trim().toLowerCase() === name.toLowerCase();
    });
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Parse CSV string into 2D array
 */
export function parseCSVString(csvString: string): string[][] {
  const lines = csvString.split(/\r?\n/);
  const result: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    row.push(current.trim());
    result.push(row);
  }

  return result;
}

/**
 * Convert timecard CSV to HourEntry format
 */
export function convertTimecardCSV(csvData: string[][]): SampleData['hours'] {
  if (!csvData || csvData.length < 2) {
    return [];
  }

  const headers = csvData[0].map(h => h.toLowerCase().trim());
  const hours: SampleData['hours'] = [];
  const now = new Date().toISOString();

  // Find column indices (flexible matching)
  const findCol = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.includes(name));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colIndex = {
    employeeId: findCol(['employee_id', 'employeeid', 'emp_id']),
    taskId: findCol(['task_id', 'taskid', 'task', 'basic_data_task_reference_id']),
    projectId: findCol(['project_id', 'projectid', 'project']),
    chargeCode: findCol(['charge_code', 'chargecode', 'code']),
    date: findCol(['date', 'work_date', 'entry_date', 'start_date', 'end_date']),
    hours: findCol(['hours', 'worked_hours', 'time', 'total_hours_worked']),
    description: findCol(['description', 'notes', 'comment']),
    billable: findCol(['billable', 'is_billable']),
  };

  // Process each row
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row || row.length === 0) continue;

    const hoursVal = colIndex.hours >= 0 ? parseFloat(row[colIndex.hours]) : 0;
    if (isNaN(hoursVal) || hoursVal <= 0) continue;

    hours.push({
      entryId: `HRS-${i.toString().padStart(5, '0')}`,
      employeeId: colIndex.employeeId >= 0 ? row[colIndex.employeeId]?.trim() : '',
      taskId: colIndex.taskId >= 0 ? row[colIndex.taskId]?.trim() : null,
      projectId: colIndex.projectId >= 0 ? row[colIndex.projectId]?.trim() : '',
      chargeCode: colIndex.chargeCode >= 0 ? row[colIndex.chargeCode]?.trim() : 'EX',
      date: colIndex.date >= 0 ? row[colIndex.date]?.trim() : now.split('T')[0],
      hours: hoursVal,
      description: colIndex.description >= 0 ? row[colIndex.description]?.trim() : '',
      billable: colIndex.billable >= 0 ? row[colIndex.billable]?.toLowerCase() === 'true' : true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return hours;
}

/**
 * Convert Workday Task CSV to Task format
 */
export function convertWorkdayTasks(csvData: string[][]): Partial<SampleData> {
  if (!csvData || csvData.length < 2) {
    return { tasks: [] };
  }

  const headers = csvData[0].map(h => h.trim());
  const tasks: any[] = [];
  const now = new Date().toISOString();

  const colIndex = {
    taskId: findColumnIndex(headers, ['Basic_Data_Task_Reference_ID', 'Task_ID', 'Task ID']),
    startDate: findColumnIndex(headers, ['Start_Date__YYYY-MM-DD___Column_T', 'Start Date', 'start_date']),
    endDate: findColumnIndex(headers, ['End_Date__YYYY-MM-DD___Column_U', 'End Date', 'end_date']),
    hours: findColumnIndex(headers, ['Total_Hours_Worked', 'Hours', 'hours']),
    taskName: findColumnIndex(headers, ['Task_Name', 'Task Name', 'Name']),
    projectId: findColumnIndex(headers, ['Project_ID', 'Project ID', 'Project']),
  };

  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row || row.length === 0) continue;

    const taskId = colIndex.taskId >= 0 ? row[colIndex.taskId] : `TSK-${i.toString().padStart(4, '0')}`;
    const hours = colIndex.hours >= 0 ? parseFloat(row[colIndex.hours]) || 0 : 0;

    tasks.push({
      taskId,
      taskName: colIndex.taskName >= 0 ? row[colIndex.taskName] : `Task ${taskId}`,
      projectId: colIndex.projectId >= 0 ? row[colIndex.projectId] : '',
      actualHours: hours,
      baselineHours: hours, // Defaulting baseline to actual if not provided
      actualStartDate: colIndex.startDate >= 0 ? row[colIndex.startDate] : null,
      actualEndDate: colIndex.endDate >= 0 ? row[colIndex.endDate] : null,
      status: hours > 0 ? 'In Progress' : 'Not Started',
      percentComplete: hours > 0 ? 50 : 0,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });
  }

  return { tasks };
}

/**
 * Convert project plan JSON to SampleData format
 * @param data Raw JSON data from MPP parser
 * @param projectIdOverride Optional ID of the existing project to import into. If provided, all phases/tasks will be linked to this project.
 */
export function convertProjectPlanJSON(data: Record<string, unknown>, projectIdOverride?: string): Partial<SampleData> {
  const result: Partial<SampleData> = {};
  const now = new Date().toISOString();


  // Detect Workday "Find Projects" Report format
  if (Array.isArray(data.Report_Entry)) {
    return convertWorkdayProjectReport(data.Report_Entry);
  }

  // Handle portfolios
  if (Array.isArray(data.portfolios)) {
    result.portfolios = data.portfolios.map((p: Record<string, unknown>, i: number) => ({
      portfolioId: (p.portfolioId as string) || (p.portfolio_id as string) || (p.id as string) || `PRF-${(i + 1).toString().padStart(4, '0')}`,
      name: (p.name as string) || (p.portfolio_name as string) || '',
      employeeId: (p.employeeId as string) || (p.employee_id as string) || null,
      manager: (p.manager as string) || '',
      methodology: (p.methodology as string) || '',
      active: p.active !== false,
      baselineStartDate: (p.baselineStartDate as string) || (p.baseline_start as string) || null,
      baselineEndDate: (p.baselineEndDate as string) || (p.baseline_finish as string) || null,
      actualStartDate: (p.actualStartDate as string) || (p.actual_start as string) || null,
      actualEndDate: (p.actualEndDate as string) || (p.actual_finish as string) || null,
      percentComplete: (p.percentComplete as number) ?? (p.percent_complete as number) ?? 0,
      comments: (p.comments as string) || '',
      baselineHours: (p.baselineHours as number) ?? (p.baseline_work as number) ?? (p.baseline_hours as number) ?? 0,
      actualHours: (p.actualHours as number) ?? (p.actual_work as number) ?? (p.actual_hours as number) ?? 0,
      baselineCost: (p.baselineCost as number) ?? (p.baseline_cost as number) ?? 0,
      actualCost: (p.actualCost as number) ?? (p.actual_cost as number) ?? 0,
      predecessorId: (p.predecessorId as string) || (p.predecessor_id as string) || null,
      predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (p.predecessor_relationship as any) || null,
      createdAt: (p.createdAt as string) || now,
      updatedAt: (p.updatedAt as string) || now,
    }));
  }

  // Handle projects - if override provided, we might still return project data to update it
  if (Array.isArray(data.projects)) {
    result.projects = data.projects.map((p: Record<string, unknown>, i: number) => ({
      // Use override if available, otherwise fallback to parsed ID
      projectId: projectIdOverride || (p.projectId as string) || (p.project_id as string) || (p.id as string) || `PRJ-${(i + 1).toString().padStart(4, '0')}`,
      name: (p.name as string) || (p.project_name as string) || '',
      customerId: (p.customerId as string) || (p.customer_id as string) || '',
      siteId: (p.siteId as string) || (p.site_id as string) || '',
      employeeId: (p.employeeId as string) || (p.employee_id as string) || '',
      billableType: ((p.billableType as string) || (p.billable_type as string) || 'T&M') as 'T&M' | 'FP',
      methodology: (p.methodology as string) || '',
      manager: (p.manager as string) || (p.manager_name as string) || '',
      active: p.active !== false,
      baselineStartDate: (p.baselineStartDate as string) || (p.baseline_start as string) || null,
      baselineEndDate: (p.baselineEndDate as string) || (p.baseline_finish as string) || null,
      actualStartDate: (p.actualStartDate as string) || (p.actual_start as string) || null,
      actualEndDate: (p.actualEndDate as string) || (p.actual_finish as string) || null,
      percentComplete: (p.percentComplete as number) ?? (p.percent_complete as number) ?? 0,
      comments: (p.comments as string) || '',
      baselineHours: (p.baselineHours as number) ?? (p.baseline_work as number) ?? (p.baseline_hours as number) ?? 0,
      actualHours: (p.actualHours as number) ?? (p.actual_work as number) ?? (p.actual_hours as number) ?? 0,
      baselineCost: (p.baselineCost as number) ?? (p.baseline_cost as number) ?? 0,
      actualCost: (p.actualCost as number) ?? (p.actual_cost as number) ?? 0,
      predecessorId: (p.predecessorId as string) || (p.predecessor_id as string) || null,
      predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (p.predecessor_relationship as any) || null,
      createdAt: (p.createdAt as string) || now,
      updatedAt: (p.updatedAt as string) || now,
    }));

    // If we have an override, ensure we only return 1 project if multiple were somehow parsed, 
    // or just assume the first one is the target.
  } else if (projectIdOverride && data.project) {
    // Special case: Single project object from parser
    const p = data.project as any;
    result.projects = [{
      projectId: projectIdOverride,
      name: p.name || 'Imported Project',
      active: true,
      createdAt: now,
      updatedAt: now,
      // ... minimal defaults
      baselineHours: 0, actualHours: 0, baselineCost: 0, actualCost: 0, percentComplete: 0,
      baselineStartDate: null, baselineEndDate: null, actualStartDate: null, actualEndDate: null,
      comments: '', customerId: '', siteId: '', employeeId: '', billableType: 'T&M', methodology: '', manager: '',
      predecessorId: null, predecessorRelationship: null
    }];
  }

  // Handle phases
  if (Array.isArray(data.phases)) {
    result.phases = data.phases.map((p: Record<string, unknown>, i: number) => {
      const id = (p.id as string) || (p.phaseId as string) || (p.phase_id as string) || `PHS-${(i + 1).toString().padStart(4, '0')}`;
      return {
        id: id,
        phaseId: id,
        name: (p.name as string) || (p.phase_name as string) || '',
        methodology: (p.methodology as string) || '',
        sequence: (p.sequence as number) || i + 1,
        projectId: projectIdOverride || (p.projectId as string) || (p.project_id as string) || '',
        employeeId: (p.employeeId as string) || (p.employee_id as string) || '',
        startDate: (p.startDate as string) || (p.start_date as string) || '',
        endDate: (p.endDate as string) || (p.end_date as string) || '',
        active: p.active !== false,
        baselineStartDate: (p.baselineStartDate as string) || (p.baseline_start as string) || null,
        baselineEndDate: (p.baselineEndDate as string) || (p.baseline_finish as string) || null,
        actualStartDate: (p.actualStartDate as string) || (p.actual_start as string) || null,
        actualEndDate: (p.actualEndDate as string) || (p.actual_finish as string) || null,
        percentComplete: (p.percentComplete as number) ?? (p.percent_complete as number) ?? 0,
        comments: (p.comments as string) || '',
        baselineHours: (p.baselineHours as number) ?? (p.baseline_work as number) ?? (p.baseline_hours as number) ?? 0,
        actualHours: (p.actualHours as number) ?? (p.actual_work as number) ?? (p.actual_hours as number) ?? 0,
        baselineCost: (p.baselineCost as number) ?? (p.baseline_cost as number) ?? 0,
        actualCost: (p.actualCost as number) ?? (p.actual_cost as number) ?? 0,
        predecessorId: (p.predecessorId as string) || (p.predecessor_id as string) || null,
        predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (p.predecessor_relationship as any) || null,
        createdAt: (p.createdAt as string) || now,
        updatedAt: (p.updatedAt as string) || now,
      };
    });
  }

  // Handle units (from MPP parser)
  if (Array.isArray(data.units)) {
    if (typeof data.units[0] === 'string') {
      result.units = data.units.map((name: any, i: number) => ({
        id: `UNT-${(i + 1).toString().padStart(4, '0')}`,
        unitId: `UNT-${(i + 1).toString().padStart(4, '0')}`,
        name: String(name),
        description: '',
        phaseId: '',
        employeeId: null,
        active: true,
        baselineStartDate: null,
        baselineEndDate: null,
        actualStartDate: null,
        actualEndDate: null,
        percentComplete: 0,
        comments: '',
        baselineHours: 0,
        actualHours: 0,
        baselineCost: 0,
        actualCost: 0,
        predecessorId: null,
        predecessorRelationship: null,
        createdAt: now,
        updatedAt: now,
      }));
    } else {
      result.units = data.units.map((u: Record<string, unknown>, i: number) => {
        const id = (u.id as string) || (u.unitId as string) || (u.unit_id as string) || `UNT-${(i + 1).toString().padStart(4, '0')}`;
        return {
          id: id,
          unitId: id,
          name: (u.name as string) || '',
          description: (u.description as string) || '',
          phaseId: (u.phaseId as string) || (u.phase_id as string) || '',
          employeeId: (u.employeeId as string) || (u.employee_id as string) || null,
          active: u.active !== false,
          baselineStartDate: (u.baselineStartDate as string) || (u.baseline_start as string) || null,
          baselineEndDate: (u.baselineEndDate as string) || (u.baseline_finish as string) || null,
          actualStartDate: (u.actualStartDate as string) || (u.actual_start as string) || null,
          actualEndDate: (u.actualEndDate as string) || (u.actual_finish as string) || null,
          percentComplete: (u.percentComplete as number) ?? (u.percent_complete as number) ?? 0,
          comments: (u.comments as string) || '',
          baselineHours: (u.baselineHours as number) ?? (u.baseline_work as number) ?? (u.baseline_hours as number) ?? 0,
          actualHours: (u.actualHours as number) ?? (u.actual_work as number) ?? (u.actual_hours as number) ?? 0,
          baselineCost: (u.baselineCost as number) ?? (u.baseline_cost as number) ?? 0,
          actualCost: (u.actualCost as number) ?? (u.actual_cost as number) ?? 0,
          predecessorId: (u.predecessorId as string) || (u.predecessor_id as string) || null,
          predecessorRelationship: (u.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (u.predecessor_relationship as any) || null,
          createdAt: (u.createdAt as string) || now,
          updatedAt: (u.updatedAt as string) || now,
        };
      });
    }
  }

  // Handle tasks
  if (Array.isArray(data.tasks)) {
    result.tasks = data.tasks.map((t: Record<string, unknown>, i: number) => {
      let unitId = (t.unitId as string) || null;
      if (!unitId && t.unit && result.units) {
        const unitName = String(t.unit);
        const phaseId = (t.phaseId as string) || (t.phase_ancestor_id as string);
        let found = result.units.find((u: any) => u.name === unitName && u.phaseId === phaseId);
        if (!found) found = result.units.find((u: any) => u.name === unitName);
        if (found) unitId = found.unitId;
      }
      const taskId = (t.id as string) || (t.taskId as string) || (t.task_id as string) || `TSK-${(i + 1).toString().padStart(4, '0')}`;

      return {
        id: taskId,
        taskId: taskId,
        customerId: (t.customerId as string) || (t.customer_id as string) || '',
        projectId: projectIdOverride || (t.projectId as string) || (t.project_id as string) || '',
        siteId: (t.siteId as string) || (t.site_id as string) || '',
        phaseId: (t.phaseId as string) || (t.phase_id as string) || (t.phase_ancestor_id as string) || '',
        subProjectId: (t.subProjectId as string) || (t.sub_project_id as string) || '',
        unitId: unitId,
        resourceId: (t.resourceId as string) || (t.resource_id as string) || '',
        employeeId: (t.employeeId as string) || (t.employee_id as string) || '',
        assignedResourceType: ((t.assignedResourceType as string) || (t.assigned_resource_type as string) || 'specific') as 'specific' | 'generic',
        assignedResource: (t.assignedResource as string) || (t.assigned_resource as string) || '',
        taskName: (t.taskName as string) || (t.name as string) || (t.task_name as string) || '',
        taskDescription: (t.taskDescription as string) || (t.description as string) || (t.task_description as string) || '',
        isSubTask: (t.isSubTask as boolean) || (t.is_subtask as boolean) || false,
        parentTaskId: (t.parentTaskId as string) || (t.parent_task_id as string) || (t.parent_id as string) || null,
        // predecessor legacy field removed
        projectedHours: (t.projectedHours as number) || (t.projected_hours as number) || 0,
        status: (t.status as string) || 'Not Started',
        priority: ((t.priority as string) || 'medium') as 'low' | 'medium' | 'high' | 'critical',
        baselineStartDate: (t.baselineStartDate as string) || (t.baseline_start as string) || null,
        baselineEndDate: (t.baselineEndDate as string) || (t.baseline_finish as string) || null,
        actualStartDate: (t.actualStartDate as string) || (t.actual_start as string) || null,
        actualEndDate: (t.actualEndDate as string) || (t.actual_finish as string) || null,
        percentComplete: (t.percentComplete as number) ?? (t.percent_complete as number) ?? 0,
        comments: (t.comments as string) || '',
        baselineHours: (t.baselineHours as number) ?? (t.baseline_work as number) ?? (t.baseline_hours as number) ?? 0,
        actualHours: (t.actualHours as number) ?? (t.actual_work as number) ?? (t.actual_hours as number) ?? 0,
        baselineCost: (t.baselineCost as number) ?? (t.baseline_cost as number) ?? 0,
        actualCost: (t.actualCost as number) ?? (t.actual_cost as number) ?? 0,
        predecessorId: (t.predecessorId as string) || (t.predecessor_id as string) || null,
        predecessorRelationship: (t.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (t.predecessor_relationship as any) || null,
        createdAt: (t.createdAt as string) || now,
        updatedAt: (t.updatedAt as string) || now,
      };
    });
  }

  return result;
}

/**
 * Detect file type from filename
 */
export function detectFileType(filename: string): 'csv' | 'json' | 'excel' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'csv':
      return 'csv';
    case 'json':
      return 'json';
    case 'xlsx':
    case 'xls':
      return 'excel';
    default:
      return 'unknown';
  }
}

/**
 * Detect data type from CSV headers
 */
export function detectCSVDataType(headers: string[]): 'employees' | 'timecards' | 'tasks' | 'unknown' {
  const lowercaseHeaders = headers.map(h => h.toLowerCase().trim());

  // Check for Workday employee export
  const hasEmployeeId = lowercaseHeaders.some(h =>
    h.includes('employee_id') ||
    h.includes('employeeid') ||
    h === 'employee_id'
  );

  const hasWorkerOrName = lowercaseHeaders.some(h =>
    h.includes('worker') ||
    h.includes('firstname') ||
    h.includes('lastname') ||
    h === 'worker'
  );

  if (hasEmployeeId && hasWorkerOrName) {
    return 'employees';
  }

  // Check for Workday task export
  const hasTaskRefId = lowercaseHeaders.some(h => h.includes('basic_data_task_reference_id') || h === 'task_id');
  const hasTaskDates = lowercaseHeaders.some(h => h.includes('start_date') || h.includes('end_date'));
  if (hasTaskRefId && hasTaskDates) {
    return 'tasks';
  }

  // Check for timecard data
  if (
    lowercaseHeaders.some(h => h.includes('hours') || h.includes('time')) &&
    lowercaseHeaders.some(h => h.includes('date'))
  ) {
    return 'timecards';
  }

  return 'unknown';
}

