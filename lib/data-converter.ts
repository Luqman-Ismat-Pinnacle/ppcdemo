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
 * Convert MPP Parser output (flat tasks with outline_level) to structured hierarchy
 * @param data Raw JSON data from MPP parser with flat tasks array
 * @param projectIdOverride Optional ID of the existing project to import into
 */
export function convertMppParserOutput(data: Record<string, unknown>, projectIdOverride?: string): Partial<SampleData> {
  const result: Partial<SampleData> = {};
  const now = new Date().toISOString();

  if (!Array.isArray(data.tasks)) {
    return result;
  }

  const normalizeRelationship = (value: unknown): 'FS' | 'SS' | 'FF' | 'SF' => {
    const v = String(value || 'FS').toUpperCase();
    return v === 'SS' || v === 'FF' || v === 'SF' ? v : 'FS';
  };

  const readOutlineLevel = (task: Record<string, unknown>): number => {
    const raw = task.outline_level ?? task.outlineLevel;
    const level = Number(raw);
    return Number.isFinite(level) ? level : 1;
  };

  const parseLinkString = (raw: string) => {
    const text = String(raw || '').trim().replace(/\s+/g, '');
    if (!text) return null;
    const match = text.match(/^([A-Za-z0-9_.-]+?)(FS|SS|FF|SF)?([+-]\d+)?$/i);
    if (!match) return null;
    return {
      id: match[1],
      relationship: normalizeRelationship(match[2] || 'FS'),
      lagDays: match[3] ? Number(match[3]) || 0 : 0,
    };
  };

  const normalizePredecessors = (task: any): any[] => {
    const rawLinks =
      task.predecessors ??
      task.predecessorLinks ??
      task.predecessor_links ??
      task.predecessorIds ??
      task.predecessor_ids ??
      [];
    const links = (Array.isArray(rawLinks) ? rawLinks : [rawLinks]).flatMap((link: any) =>
      typeof link === 'string'
        ? link.split(',').map((s) => s.trim()).filter(Boolean)
        : [link]
    );
    return links
      .map((link: any) => {
        if (typeof link === 'string') {
          const parsed = parseLinkString(link);
          if (!parsed) return null;
          return {
            predecessorTaskId: parsed.id,
            predecessorName: '',
            relationship: parsed.relationship,
            lagDays: parsed.lagDays,
          };
        }
        if (!link || typeof link !== 'object') return null;
        const predecessorTaskId =
          link.predecessorTaskId ??
          link.predecessor_task_id ??
          link.taskId ??
          link.task_id ??
          link.id ??
          link.uid;
        if (!predecessorTaskId) return null;
        return {
          predecessorTaskId: String(predecessorTaskId),
          predecessorName: String(link.predecessorName ?? link.predecessor_name ?? link.name ?? ''),
          relationship: normalizeRelationship(link.relationship ?? link.relationshipType ?? link.relationship_type),
          lagDays: Number(link.lagDays ?? link.lag_days ?? link.lag ?? 0) || 0,
        };
      })
      .filter(Boolean);
  };

  const normalizeSuccessors = (task: any): any[] => {
    const rawLinks =
      task.successors ??
      task.successorLinks ??
      task.successor_links ??
      task.successorIds ??
      task.successor_ids ??
      [];
    const links = (Array.isArray(rawLinks) ? rawLinks : [rawLinks]).flatMap((link: any) =>
      typeof link === 'string'
        ? link.split(',').map((s) => s.trim()).filter(Boolean)
        : [link]
    );
    return links
      .map((link: any) => {
        if (typeof link === 'string') {
          const parsed = parseLinkString(link);
          if (!parsed) return null;
          return {
            successorTaskId: parsed.id,
            successorName: '',
            relationship: parsed.relationship,
            lagDays: parsed.lagDays,
          };
        }
        if (!link || typeof link !== 'object') return null;
        const successorTaskId =
          link.successorTaskId ??
          link.successor_task_id ??
          link.taskId ??
          link.task_id ??
          link.id ??
          link.uid;
        if (!successorTaskId) return null;
        return {
          successorTaskId: String(successorTaskId),
          successorName: String(link.successorName ?? link.successor_name ?? link.name ?? ''),
          relationship: normalizeRelationship(link.relationship ?? link.relationshipType ?? link.relationship_type),
          lagDays: Number(link.lagDays ?? link.lag_days ?? link.lag ?? 0) || 0,
        };
      })
      .filter(Boolean);
  };

  // Build hierarchy: level 1 = unit; level 2+ with children = phase; leaf = task. (Project -> Unit -> Phase -> Task)
  const raw = (data.tasks as any[])
    .filter((t: any) => readOutlineLevel(t as Record<string, unknown>) !== 0)
    .map((t: any, idx: number) => ({
      id: String(t.id ?? t.taskId ?? t.task_id ?? t.uid ?? t.unique_id ?? `mpp-${idx + 1}`),
      outline_level: readOutlineLevel(t as Record<string, unknown>),
      hierarchy_type: String(t.hierarchy_type ?? t.hierarchyType ?? '').toLowerCase() || null,
      parent_id: t.parent_id ?? t.parentId ?? t.parent_uid ?? t.parentUid ?? null,
      name: t.name || '',
      startDate: t.startDate || null,
      endDate: t.endDate || null,
      percentComplete: t.percentComplete || 0,
      baselineHours: t.baselineHours ?? t.baselineWork ?? t.baseline_work ?? t.baseline_hours ?? 0,
      actualHours: t.actualHours ?? t.actualWork ?? t.actual_work ?? t.actual_hours ?? 0,
      projectedHours: t.projectedHours || 0,
      remainingHours: t.remainingHours ?? t.remainingWork ?? t.remaining_work ?? t.remaining_hours ?? 0,
      baselineCost: t.baselineCost ?? t.baseline_cost ?? 0,
      actualCost: t.actualCost ?? t.actual_cost ?? 0,
      remainingCost: t.remainingCost ?? t.remaining_cost ?? null,
      baselineCount: t.baselineCount ?? t.baseline_count ?? t.baselineQty ?? t.baseline_qty ?? 0,
      actualCount: t.actualCount ?? t.actual_count ?? t.actualQty ?? t.actual_qty ?? 0,
      completedCount: t.completedCount ?? t.completed_count ?? t.completedQty ?? t.completed_qty ?? 0,
      baselineMetric: t.baselineMetric ?? t.baseline_metric ?? null,
      baselineUom: t.baselineUom ?? t.baseline_uom ?? t.uom ?? null,
      isCritical: t.isCritical || false,
      totalSlack: Math.round(t.totalSlack || 0),
      comments: t.comments || '',
      is_summary: t.is_summary || t.isSummary || false,
      assignedResource: t.assignedResource || t.assigned_resource || '',
      predecessors: normalizePredecessors(t),
      successors: normalizeSuccessors(t),
    }));

  // Reconstruct missing parent links from outline levels when parent_id is absent.
  const outlineStack: string[] = [];
  raw.forEach((r: any) => {
    const level = Math.max(1, Number(r.outline_level) || 1);
    outlineStack.length = Math.max(0, level - 1);
    if (!r.parent_id && outlineStack.length > 0) {
      r.parent_id = outlineStack[outlineStack.length - 1];
    }
    outlineStack[level - 1] = String(r.id);
    outlineStack.length = level;
  });

  // Hierarchy detection (top-down using min/max outline):
  // rel 0=project, rel 1=unit, rel 2=phase, rel 3+=task, and deepest level becomes sub_task when depth allows.
  type NodeType = 'project' | 'phase' | 'unit' | 'task' | 'sub_task';
  const minLevel = raw.reduce((min: number, r: any) => Math.min(min, Number(r.outline_level) || 1), Number.POSITIVE_INFINITY);
  const maxLevel = raw.reduce((max: number, r: any) => Math.max(max, Number(r.outline_level) || 1), 0);
  const hierarchyAnchor = 2;

  const inferNodeType = (level: number): NodeType => {
    if (level <= 1) return 'project';
    if (level === hierarchyAnchor) return 'unit';
    if (level === hierarchyAnchor + 1) return 'phase';
    if (maxLevel >= (hierarchyAnchor + 3) && level === maxLevel) return 'sub_task';
    return 'task';
  };

  const normalizeNodeType = (value: unknown): NodeType | null => {
    const v = String(value || '').toLowerCase();
    if (v === 'project' || v === 'unit' || v === 'phase' || v === 'task' || v === 'sub_task') return v;
    return null;
  };

  const typeById = new Map<string, NodeType>();
  raw.forEach((r: any) => {
    const explicit = normalizeNodeType(r.hierarchy_type ?? r.hierarchyType);
    const nodeType = explicit ?? inferNodeType(Number(r.outline_level) || minLevel);
    typeById.set(String(r.id), nodeType);
  });

  const phases: any[] = [];
  const units: any[] = [];
  const tasks: any[] = [];
  const rawById = new Map<string, any>();
  raw.forEach((r: any) => rawById.set(String(r.id), r));

  raw.forEach((r: any) => {
    const nodeType = typeById.get(String(r.id)) ?? 'task';
    if (nodeType === 'project') {
      return;
    }
    const id = String(r.id);
    const baseTask = {
      id,
      name: r.name,
      startDate: r.startDate || null,
      endDate: r.endDate || null,
      percentComplete: r.percentComplete || 0,
      baselineHours: r.baselineHours || 0,
      actualHours: r.actualHours || 0,
      projectedHours: r.projectedHours || 0,
      remainingHours: r.remainingHours ?? r.remaining_hours ?? 0,
      baselineCost: r.baselineCost ?? r.baseline_cost ?? 0,
      actualCost: r.actualCost ?? r.actual_cost ?? 0,
      remainingCost: r.remainingCost ?? r.remaining_cost ?? null,
      baselineCount: Number(r.baselineCount ?? r.baseline_count ?? 0) || 0,
      actualCount: Number(r.actualCount ?? r.actual_count ?? 0) || 0,
      completedCount: Number(r.completedCount ?? r.completed_count ?? 0) || 0,
      baselineMetric: r.baselineMetric ?? r.baseline_metric ?? null,
      baselineUom: r.baselineUom ?? r.baseline_uom ?? null,
      isCritical: r.isCritical || false,
      totalSlack: r.totalSlack ?? 0,
      comments: r.comments || '',
      folder: String(r.folder ?? r.folderPath ?? '').trim(),
      parent_id: r.parent_id != null ? String(r.parent_id) : null,
      is_summary: r.is_summary || false,
      projectId: projectIdOverride || '',
      createdAt: now,
      updatedAt: now,
    };

    if (nodeType === 'unit') {
      units.push({
        ...baseTask,
        unitId: id,
        description: '',
        projectId: projectIdOverride || '',
        project_id: projectIdOverride || '',
        employeeId: null,
        active: true,
        endDate: r.endDate || null,
        isCritical: r.isCritical || false,
        parent_id: baseTask.parent_id,
      });
    } else if (nodeType === 'phase') {
      phases.push({
        ...baseTask,
        phaseId: id,
        methodology: '',
        sequence: phases.length + 1,
        employeeId: null,
        comments: r.comments || '',
        isCritical: r.isCritical || false,
        is_summary: r.is_summary || false,
        unitId: '', // resolved below
        unit_id: '',
      });
    } else {
      // Extract first predecessor for the legacy single-predecessor fields
      const preds = Array.isArray(r.predecessors) ? r.predecessors : [];
      const firstPred = preds.length > 0 ? preds[0] : null;

      tasks.push({
        ...baseTask,
        taskId: id,
        taskName: r.name,
        taskDescription: r.comments || '',
        isSubTask: nodeType === 'sub_task' || (r.outline_level ?? 0) >= maxLevel,
        parentTaskId: null,
        phaseId: '',
        unitId: '',
        assignedResource: r.assignedResource || '',
        assignedResourceType: 'specific' as const,
        status: (r.outline_level ?? 0) > 3 && r.is_summary ? 'In Progress' : 'Not Started',
        priority: 'medium' as const,
        predecessorId: firstPred?.predecessorTaskId || null,
        predecessorRelationship: (firstPred?.relationship as 'FS' | 'SS' | 'FF' | 'SF') || null,
        baselineCount: baseTask.baselineCount,
        actualCount: baseTask.actualCount,
        completedCount: baseTask.completedCount,
        baselineMetric: baseTask.baselineMetric,
        baselineUom: baseTask.baselineUom,
        // Full predecessors array for Gantt dependency arrows
        predecessors: preds.map((p: any) => ({
          id: `${id}-${p.predecessorTaskId}`,
          taskId: id,
          predecessorTaskId: String(p.predecessorTaskId),
          predecessorName: p.predecessorName || '',
          relationship: (p.relationship || 'FS') as 'FS' | 'SS' | 'FF' | 'SF',
          lagDays: p.lagDays || 0,
        })),
        successors: (Array.isArray(r.successors) ? r.successors : []).map((s: any) => ({
          id: `${id}-${s.successorTaskId}`,
          taskId: id,
          successorTaskId: String(s.successorTaskId),
          successorName: s.successorName || '',
          relationship: (s.relationship || 'FS') as 'FS' | 'SS' | 'FF' | 'SF',
          lagDays: s.lagDays || 0,
        })),
      });
    }
  });

  const unitById = new Map<string, any>();
  units.forEach((u: any) => unitById.set(String(u.id), u));
  const phaseById = new Map<string, any>();
  phases.forEach((p: any) => phaseById.set(String(p.id), p));
  const taskById = new Map<string, any>();
  tasks.forEach((t: any) => taskById.set(String(t.id), t));

  const normalizeName = (value: unknown): string =>
    String(value || '').trim().toLowerCase().replace(/[\s_\-.,;:()]+/g, ' ');

  const unitsByName = new Map<string, any[]>();
  units.forEach((u: any) => {
    const key = normalizeName(u.name);
    if (!key) return;
    if (!unitsByName.has(key)) unitsByName.set(key, []);
    unitsByName.get(key)!.push(u);
  });
  const phasesByName = new Map<string, any[]>();
  phases.forEach((p: any) => {
    const key = normalizeName(p.name);
    if (!key) return;
    if (!phasesByName.has(key)) phasesByName.set(key, []);
    phasesByName.get(key)!.push(p);
  });

  const getFolderSegments = (row: any): string[] => {
    const folder = String(row.folder || '').trim();
    if (!folder) return [];
    return folder.split('/').map((s) => normalizeName(s)).filter(Boolean);
  };

  const findAncestorByType = (startParentId: string | null, targetTypes: NodeType[]): string | null => {
    let cursor = startParentId ? String(startParentId) : '';
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const t = typeById.get(cursor);
      if (t && targetTypes.includes(t)) return cursor;
      const parent = rawById.get(cursor)?.parent_id;
      cursor = parent != null ? String(parent) : '';
    }
    return null;
  };

  const matchFromFolder = (segments: string[], mapByName: Map<string, any[]>): any | null => {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const candidates = mapByName.get(segments[i]);
      if (candidates && candidates.length > 0) return candidates[0];
    }
    return null;
  };

  // 1:1 association pass using parent chain first, then folder path fallback.
  phases.forEach((phase: any) => {
    const unitAncestorId = findAncestorByType(phase.parent_id ?? null, ['unit']);
    if (unitAncestorId && unitById.has(unitAncestorId)) {
      phase.unitId = unitAncestorId;
      phase.unit_id = unitAncestorId;
      return;
    }
    const fromFolder = matchFromFolder(getFolderSegments(phase), unitsByName);
    if (fromFolder) {
      phase.unitId = fromFolder.id;
      phase.unit_id = fromFolder.id;
    }
  });

  // If parser classification yields no unit rows, keep hierarchy intact by creating
  // a synthetic unit so phases/tasks still persist under the selected project.
  if (units.length === 0) {
    const syntheticUnitId = `UNT-${(projectIdOverride || 'AUTO').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'AUTO'}-001`;
    const syntheticUnit = {
      id: syntheticUnitId,
      unitId: syntheticUnitId,
      name: 'Project Unit',
      description: 'Auto-generated from MPP import',
      projectId: projectIdOverride || '',
      project_id: projectIdOverride || '',
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
    };
    units.push(syntheticUnit);
    unitById.set(String(syntheticUnit.id), syntheticUnit);
    const key = normalizeName(syntheticUnit.name);
    if (!unitsByName.has(key)) unitsByName.set(key, []);
    unitsByName.get(key)!.push(syntheticUnit);

    phases.forEach((phase: any) => {
      if (!phase.unitId && !phase.unit_id) {
        phase.unitId = syntheticUnitId;
        phase.unit_id = syntheticUnitId;
      }
    });
  }

  tasks.forEach((task: any) => {
    const phaseAncestorId = findAncestorByType(task.parent_id ?? null, ['phase']);
    const unitAncestorId = findAncestorByType(task.parent_id ?? null, ['unit']);
    const taskAncestorId = findAncestorByType(task.parent_id ?? null, ['task', 'sub_task']);

    if (phaseAncestorId && phaseById.has(phaseAncestorId)) {
      task.phaseId = phaseAncestorId;
      task.phase_id = phaseAncestorId;
      const phase = phaseById.get(phaseAncestorId);
      const phaseUnit = phase?.unitId ?? phase?.unit_id ?? '';
      if (phaseUnit) {
        task.unitId = phaseUnit;
        task.unit_id = phaseUnit;
      }
    } else {
      const folderPhase = matchFromFolder(getFolderSegments(task), phasesByName);
      if (folderPhase) {
        task.phaseId = folderPhase.id;
        task.phase_id = folderPhase.id;
        const phaseUnit = folderPhase.unitId ?? folderPhase.unit_id ?? '';
        if (phaseUnit) {
          task.unitId = phaseUnit;
          task.unit_id = phaseUnit;
        }
      }
    }

    if (!task.unitId && unitAncestorId && unitById.has(unitAncestorId)) {
      task.unitId = unitAncestorId;
      task.unit_id = unitAncestorId;
    }
    if (!task.unitId) {
      const folderUnit = matchFromFolder(getFolderSegments(task), unitsByName);
      if (folderUnit) {
        task.unitId = folderUnit.id;
        task.unit_id = folderUnit.id;
      }
    }

    task.parentTaskId = taskAncestorId && taskById.has(taskAncestorId) ? taskAncestorId : null;
  });

  // Pass 3: Normalize predecessor links to task IDs present in this import.
  const normalizeTaskId = (value: any) => String(value || '').trim().replace(/^wbs-(task|sub_task)-/, '');
  const taskIdSet = new Set(tasks.map((t: any) => normalizeTaskId(t.id || t.taskId)));
  const taskIdByName = new Map<string, string>();
  tasks.forEach((t: any) => {
    const id = normalizeTaskId(t.id || t.taskId);
    const nameKey = String(t.name || t.taskName || '').trim().toLowerCase();
    if (id && nameKey && !taskIdByName.has(nameKey)) taskIdByName.set(nameKey, id);
  });
  const resolveTaskId = (candidateId: any, candidateName: any): string | null => {
    const raw = normalizeTaskId(candidateId);
    if (raw && taskIdSet.has(raw)) return raw;
    const idWithoutPrefix = raw.replace(/^task-/, '');
    if (idWithoutPrefix && taskIdSet.has(idWithoutPrefix)) return idWithoutPrefix;
    const idWithPrefix = raw && !raw.startsWith('task-') ? `task-${raw}` : '';
    if (idWithPrefix && taskIdSet.has(idWithPrefix)) return idWithPrefix;
    const nameKey = String(candidateName || '').trim().toLowerCase();
    if (nameKey && taskIdByName.has(nameKey)) return taskIdByName.get(nameKey)!;
    return null;
  };

  tasks.forEach((task: any) => {
    const preds = Array.isArray(task.predecessors) ? task.predecessors : [];
    const normalizedPreds = preds
      .map((p: any) => {
        const resolvedId = resolveTaskId(p.predecessorTaskId || p.predecessor_task_id, p.predecessorName || p.predecessor_name);
        if (!resolvedId) return null;
        const rel = String(p.relationship || p.relationshipType || p.relationship_type || 'FS').toUpperCase();
        return {
          ...p,
          predecessorTaskId: resolvedId,
          predecessorName: String(p.predecessorName || p.predecessor_name || ''),
          relationship: rel === 'SS' || rel === 'FF' || rel === 'SF' ? rel : 'FS',
          lagDays: Number(p.lagDays || p.lag_days || p.lag || 0) || 0,
        };
      })
      .filter(Boolean);

    task.predecessors = normalizedPreds;
    const succs = Array.isArray(task.successors) ? task.successors : [];
    const normalizedSuccs = succs
      .map((s: any) => {
        const resolvedId = resolveTaskId(s.successorTaskId || s.successor_task_id, s.successorName || s.successor_name);
        if (!resolvedId) return null;
        const rel = String(s.relationship || s.relationshipType || s.relationship_type || 'FS').toUpperCase();
        return {
          ...s,
          successorTaskId: resolvedId,
          successorName: String(s.successorName || s.successor_name || ''),
          relationship: rel === 'SS' || rel === 'FF' || rel === 'SF' ? rel : 'FS',
          lagDays: Number(s.lagDays || s.lag_days || s.lag || 0) || 0,
        };
      })
      .filter(Boolean);

    task.successors = normalizedSuccs;
    const firstPred = normalizedPreds[0] as any;
    task.predecessorId = firstPred?.predecessorTaskId || null;
    task.predecessorRelationship = firstPred?.relationship || null;
  });

  result.phases = phases;
  result.units = units;
  result.tasks = tasks;

  console.log(`[DEBUG] Created ${phases.length} phases:`, phases.map((p: any) => ({ id: p.id, name: p.name, unitId: p.unitId, unit_id: p.unit_id })));
  console.log(`[DEBUG] Created ${units.length} units:`, units.map((u: any) => ({ id: u.id, name: u.name, parent_id: u.parent_id })));
  console.log(`[DEBUG] Created ${tasks.length} tasks:`, tasks.slice(0, 3).map((t: any) => ({ id: t.id, name: t.name, parent_id: t.parent_id, phaseId: t.phaseId, unitId: t.unitId })));

  return result;
}

/**
 * Helper to find parent phase ID from parent_id
 */
function findParentPhaseId(parentId: string | null, phases: any[], units: any[]): string {
  if (!parentId) return '';
  
  // Check if parent is a phase
  const phase = phases.find(p => p.id === parentId);
  if (phase) return phase.id;
  
  // Check if parent is a unit, then find its phase
  const unit = units.find(u => u.id === parentId);
  return unit?.phaseId || '';
}

/**
 * Helper to find parent unit ID from parent_id
 */
function findParentUnitId(parentId: string | null, units: any[]): string {
  if (!parentId) return '';
  
  const unit = units.find(u => u.id === parentId);
  return unit?.id || '';
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

  // Handle MPP Parser format (flat tasks array with outline_level)
  if (
    Array.isArray(data.tasks) &&
    data.tasks.length > 0 &&
    data.tasks.some((task: any) => task?.outline_level !== undefined || task?.outlineLevel !== undefined)
  ) {
    return convertMppParserOutput(data, projectIdOverride);
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

  // Handle phases (phase belongs to unit in hierarchy)
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
        unitId: (p.unitId as string) || (p.unit_id as string) || '',
        unit_id: (p.unitId as string) || (p.unit_id as string) || '',
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
          projectId: projectIdOverride || (u.projectId as string) || (u.project_id as string) || '',
          project_id: projectIdOverride || (u.projectId as string) || (u.project_id as string) || '',
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
        const projectId = projectIdOverride || (t.projectId as string) || (t.project_id as string);
        let found = result.units.find((u: any) => u.name === unitName && (u.projectId === projectId || u.project_id === projectId));
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
        remainingHours: (t.remainingHours as number) ?? (t.remaining_work as number) ?? (t.remaining_hours as number) ?? 0,
        baselineCost: (t.baselineCost as number) ?? (t.baseline_cost as number) ?? 0,
        actualCost: (t.actualCost as number) ?? (t.actual_cost as number) ?? 0,
        remainingCost: (t.remainingCost as number) ?? (t.remaining_cost as number) ?? 0,
        baselineCount: (t.baselineCount as number) ?? (t.baseline_count as number) ?? 0,
        actualCount: (t.actualCount as number) ?? (t.actual_count as number) ?? 0,
        completedCount: (t.completedCount as number) ?? (t.completed_count as number) ?? 0,
        baselineMetric: (t.baselineMetric as string) ?? (t.baseline_metric as string) ?? null,
        baselineUom: (t.baselineUom as string) ?? (t.baseline_uom as string) ?? (t.uom as string) ?? null,
        predecessorId: (t.predecessorId as string) || (t.predecessor_id as string) || null,
        predecessorRelationship: (t.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || (t.predecessor_relationship as any) || null,
        // Full predecessors array for Gantt dependency arrows
        predecessors: Array.isArray(t.predecessors)
          ? (t.predecessors as any[]).map((p: any) => ({
              id: `${taskId}-${p.predecessorTaskId || p.predecessor_task_id}`,
              taskId: taskId,
              predecessorTaskId: String(p.predecessorTaskId || p.predecessor_task_id || ''),
              predecessorName: (p.predecessorName || p.predecessor_name || '') as string,
              relationship: ((p.relationship || 'FS') as 'FS' | 'SS' | 'FF' | 'SF'),
              lagDays: (p.lagDays || p.lag_days || 0) as number,
            }))
          : [],
        successors: Array.isArray(t.successors)
          ? (t.successors as any[]).map((s: any) => ({
              id: `${taskId}-${s.successorTaskId || s.successor_task_id}`,
              taskId: taskId,
              successorTaskId: String(s.successorTaskId || s.successor_task_id || ''),
              successorName: (s.successorName || s.successor_name || '') as string,
              relationship: ((s.relationship || 'FS') as 'FS' | 'SS' | 'FF' | 'SF'),
              lagDays: (s.lagDays || s.lag_days || 0) as number,
            }))
          : [],
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
