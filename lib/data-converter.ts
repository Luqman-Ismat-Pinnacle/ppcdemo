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

/**
 * Workday employee CSV row structure
 */
interface WorkdayEmployeeRow {
  Employee_Type: string;
  Employee_ID: string;
  Default_Job_Title: string;
  Management_Level: string;
  businessTitle: string;
  Worker: string;
  Workers_Manager: string;
  Work_Email: string;
  termination_date: string;
}

/**
 * Convert Workday employee CSV data to Employee array
 * 
 * CSV Field Mapping:
 * | Workday Field      | → | App Field       |
 * |--------------------|---|-----------------|
 * | Employee_ID        | → | employeeId      |
 * | Worker             | → | name            |
 * | Default_Job_Title  | → | jobTitle        |
 * | Management_Level   | → | managementLevel |
 * | Workers_Manager    | → | manager         |
 * | Work_Email         | → | email           |
 * | Employee_Type      | → | employeeType    |
 * | termination_date   | → | (filter out if set) |
 */
export function convertWorkdayEmployees(csvData: string[][]): Employee[] {
  if (!csvData || csvData.length < 2) {
    return [];
  }

  const headers = csvData[0].map(h => h.trim());
  const employees: Employee[] = [];
  const now = new Date().toISOString();

  // Find column indices
  const colIndex = {
    employeeType: headers.indexOf('Employee_Type'),
    employeeId: headers.indexOf('Employee_ID'),
    jobTitle: headers.indexOf('Default_Job_Title'),
    managementLevel: headers.indexOf('Management_Level'),
    businessTitle: headers.indexOf('businessTitle'),
    worker: headers.indexOf('Worker'),
    manager: headers.indexOf('Workers_Manager'),
    email: headers.indexOf('Work_Email'),
    terminationDate: headers.indexOf('termination_date'),
  };

  // Process each row (skip header)
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row || row.length === 0) continue;

    // Skip terminated employees
    const terminationDate = colIndex.terminationDate >= 0 ? row[colIndex.terminationDate]?.trim() : '';
    if (terminationDate) continue;

    // Extract employee data
    const employeeId = colIndex.employeeId >= 0 ? row[colIndex.employeeId]?.trim() : `EMP-${i.toString().padStart(4, '0')}`;
    const name = colIndex.worker >= 0 ? row[colIndex.worker]?.trim() : '';
    const jobTitle = colIndex.jobTitle >= 0 ? row[colIndex.jobTitle]?.trim() : '';
    const managementLevel = colIndex.managementLevel >= 0 ? row[colIndex.managementLevel]?.trim() : '';
    const manager = colIndex.manager >= 0 ? row[colIndex.manager]?.trim() : '';
    const email = colIndex.email >= 0 ? row[colIndex.email]?.trim() : '';
    const employeeType = colIndex.employeeType >= 0 ? row[colIndex.employeeType]?.trim() : 'Regular';

    // Skip empty rows
    if (!name) continue;

    employees.push({
      employeeId,
      name,
      jobTitle,
      managementLevel,
      manager,
      email,
      employeeType,
      createdAt: now,
      updatedAt: now,
    });
  }

  return employees;
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
    taskId: findCol(['task_id', 'taskid', 'task']),
    projectId: findCol(['project_id', 'projectid', 'project']),
    chargeCode: findCol(['charge_code', 'chargecode', 'code']),
    date: findCol(['date', 'work_date', 'entry_date']),
    hours: findCol(['hours', 'worked_hours', 'time']),
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
 * Convert project plan JSON to SampleData format
 */
export function convertProjectPlanJSON(data: Record<string, unknown>): Partial<SampleData> {
  const result: Partial<SampleData> = {};
  const now = new Date().toISOString();

  // Handle portfolios
  if (Array.isArray(data.portfolios)) {
    result.portfolios = data.portfolios.map((p: Record<string, unknown>, i: number) => ({
      portfolioId: (p.portfolioId as string) || (p.id as string) || `PRF-${(i + 1).toString().padStart(4, '0')}`,
      name: (p.name as string) || '',
      employeeId: (p.employeeId as string) || null,
      manager: (p.manager as string) || '',
      methodology: (p.methodology as string) || '',
      active: p.active !== false,
      baselineStartDate: (p.baselineStartDate as string) || null,
      baselineEndDate: (p.baselineEndDate as string) || null,
      actualStartDate: (p.actualStartDate as string) || null,
      actualEndDate: (p.actualEndDate as string) || null,
      percentComplete: (p.percentComplete as number) || 0,
      comments: (p.comments as string) || '',
      baselineHours: (p.baselineHours as number) || 0,
      actualHours: (p.actualHours as number) || 0,
      baselineCost: (p.baselineCost as number) || 0,
      actualCost: (p.actualCost as number) || 0,
      predecessorId: (p.predecessorId as string) || null,
      predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || null,
      createdAt: (p.createdAt as string) || now,
      updatedAt: (p.updatedAt as string) || now,
    }));
  }

  // Handle projects
  if (Array.isArray(data.projects)) {
    result.projects = data.projects.map((p: Record<string, unknown>, i: number) => ({
      projectId: (p.projectId as string) || (p.id as string) || `PRJ-${(i + 1).toString().padStart(4, '0')}`,
      name: (p.name as string) || '',
      unitId: (p.unitId as string) || null,
      customerId: (p.customerId as string) || '',
      siteId: (p.siteId as string) || '',
      employeeId: (p.employeeId as string) || '',
      billableType: ((p.billableType as string) || 'T&M') as 'T&M' | 'FP',
      methodology: (p.methodology as string) || '',
      manager: (p.manager as string) || '',
      active: p.active !== false,
      baselineStartDate: (p.baselineStartDate as string) || null,
      baselineEndDate: (p.baselineEndDate as string) || null,
      actualStartDate: (p.actualStartDate as string) || null,
      actualEndDate: (p.actualEndDate as string) || null,
      percentComplete: (p.percentComplete as number) || 0,
      comments: (p.comments as string) || '',
      baselineHours: (p.baselineHours as number) || 0,
      actualHours: (p.actualHours as number) || 0,
      baselineCost: (p.baselineCost as number) || 0,
      actualCost: (p.actualCost as number) || 0,
      predecessorId: (p.predecessorId as string) || null,
      predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || null,
      createdAt: (p.createdAt as string) || now,
      updatedAt: (p.updatedAt as string) || now,
    }));
  }

  // Handle phases
  if (Array.isArray(data.phases)) {
    result.phases = data.phases.map((p: Record<string, unknown>, i: number) => ({
      phaseId: (p.phaseId as string) || (p.id as string) || `PHS-${(i + 1).toString().padStart(4, '0')}`,
      name: (p.name as string) || '',
      methodology: (p.methodology as string) || '',
      sequence: (p.sequence as number) || i + 1,
      projectId: (p.projectId as string) || '',
      employeeId: (p.employeeId as string) || '',
      startDate: (p.startDate as string) || '',
      endDate: (p.endDate as string) || '',
      active: p.active !== false,
      baselineStartDate: (p.baselineStartDate as string) || null,
      baselineEndDate: (p.baselineEndDate as string) || null,
      actualStartDate: (p.actualStartDate as string) || null,
      actualEndDate: (p.actualEndDate as string) || null,
      percentComplete: (p.percentComplete as number) || 0,
      comments: (p.comments as string) || '',
      baselineHours: (p.baselineHours as number) || 0,
      actualHours: (p.actualHours as number) || 0,
      baselineCost: (p.baselineCost as number) || 0,
      actualCost: (p.actualCost as number) || 0,
      predecessorId: (p.predecessorId as string) || null,
      predecessorRelationship: (p.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || null,
      createdAt: (p.createdAt as string) || now,
      updatedAt: (p.updatedAt as string) || now,
    }));
  }

  // Handle tasks
  if (Array.isArray(data.tasks)) {
    result.tasks = data.tasks.map((t: Record<string, unknown>, i: number) => ({
      taskId: (t.taskId as string) || (t.id as string) || `TSK-${(i + 1).toString().padStart(4, '0')}`,
      customerId: (t.customerId as string) || '',
      projectId: (t.projectId as string) || '',
      siteId: (t.siteId as string) || '',
      phaseId: (t.phaseId as string) || '',
      subProjectId: (t.subProjectId as string) || '',
      resourceId: (t.resourceId as string) || '',
      employeeId: (t.employeeId as string) || '',
      assignedResourceType: ((t.assignedResourceType as string) || 'specific') as 'specific' | 'generic',
      assignedResource: (t.assignedResource as string) || '',
      taskName: (t.taskName as string) || (t.name as string) || '',
      taskDescription: (t.taskDescription as string) || (t.description as string) || '',
      isSubTask: (t.isSubTask as boolean) || false,
      parentTaskId: (t.parentTaskId as string) || null,
      predecessor: (t.predecessor as string) || null,
      projectedHours: (t.projectedHours as number) || 0,
      status: (t.status as string) || 'Not Started',
      priority: ((t.priority as string) || 'medium') as 'low' | 'medium' | 'high' | 'critical',
      baselineStartDate: (t.baselineStartDate as string) || null,
      baselineEndDate: (t.baselineEndDate as string) || null,
      actualStartDate: (t.actualStartDate as string) || null,
      actualEndDate: (t.actualEndDate as string) || null,
      percentComplete: (t.percentComplete as number) || 0,
      comments: (t.comments as string) || '',
      baselineHours: (t.baselineHours as number) || 0,
      actualHours: (t.actualHours as number) || 0,
      baselineCost: (t.baselineCost as number) || 0,
      actualCost: (t.actualCost as number) || 0,
      predecessorId: (t.predecessorId as string) || null,
      predecessorRelationship: (t.predecessorRelationship as 'FS' | 'SS' | 'FF' | 'SF') || null,
      createdAt: (t.createdAt as string) || now,
      updatedAt: (t.updatedAt as string) || now,
    }));
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
export function detectCSVDataType(headers: string[]): 'employees' | 'timecards' | 'unknown' {
  const lowercaseHeaders = headers.map(h => h.toLowerCase().trim());
  
  // Check for Workday employee export
  if (
    lowercaseHeaders.some(h => h.includes('employee_id') || h.includes('employeeid')) &&
    lowercaseHeaders.some(h => h.includes('worker') || h.includes('name'))
  ) {
    return 'employees';
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

