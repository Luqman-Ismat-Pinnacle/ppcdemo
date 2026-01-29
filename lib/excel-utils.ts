/**
 * @file excel-utils.ts
 * @description Excel Import/Export Utilities for Pinnacle Project Controls
 * 
 * Features:
 * - Export all data to multi-sheet Excel workbook
 * - Export individual entity tables to Excel
 * - Import data from Excel files with E/A/D action column support
 * - Download empty templates with correct headers
 * - Validate imported data against schema
 * - Progress tracking and detailed error reporting
 * 
 * Action Column Support:
 * - E = Edit existing record
 * - A = Add new record
 * - D = Delete record
 * 
 * @dependencies xlsx (SheetJS)
 * @dataflow Used by:
 *   - app/project-controls/data-management/page.tsx
 */

import * as XLSX from 'xlsx';
import type { SampleData, ImportAction, HierarchyFilter, DateFilter } from '@/types/data';

// ============================================================================
// FILENAME GENERATION
// ============================================================================

/**
 * Generate a formatted export filename with filters and timestamp
 * Format: [HierarchyFilters]_[DateFilters]_YYYY-MM-DD_HH-mm-ss.xlsx
 * 
 * @param hierarchyFilter - Current hierarchy filter selection
 * @param dateFilter - Current date filter selection
 * @returns Formatted filename string (without extension)
 */
export function generateExportFilename(
  hierarchyFilter?: HierarchyFilter | null,
  dateFilter?: DateFilter | null
): string {
  const parts: string[] = [];

  // Add hierarchy parts (or "Pinnacle" if none selected)
  if (hierarchyFilter) {
    const hierarchyParts: string[] = [];
    if (hierarchyFilter.portfolio) hierarchyParts.push(hierarchyFilter.portfolio);
    if (hierarchyFilter.customer) hierarchyParts.push(hierarchyFilter.customer);
    if (hierarchyFilter.site) hierarchyParts.push(hierarchyFilter.site);
    if (hierarchyFilter.project) hierarchyParts.push(hierarchyFilter.project);

    if (hierarchyParts.length > 0) {
      parts.push(hierarchyParts.join('-'));
    } else {
      parts.push('Pinnacle');
    }
  } else {
    parts.push('Pinnacle');
  }

  // Add date filter parts (if any)
  if (dateFilter && (dateFilter.from || dateFilter.to)) {
    const dateParts: string[] = [];
    if (dateFilter.from) {
      dateParts.push(dateFilter.from.replace(/-/g, ''));
    }
    if (dateFilter.to) {
      dateParts.push(dateFilter.to.replace(/-/g, ''));
    }
    if (dateParts.length > 0) {
      parts.push(dateParts.join('-to-'));
    }
  }

  // Add timestamp
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');
  parts.push(timestamp);

  // Clean filename (remove special characters)
  return parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '');
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Action types for import operations
 */
export type ImportActionType = 'E' | 'A' | 'D' | null;

/**
 * Row with action type for import processing
 */
export interface ActionRow {
  action: ImportActionType;
  data: Record<string, unknown>;
  rowNumber: number;
}

/**
 * Result of importing data from Excel
 */
export interface ImportResult {
  success: boolean;
  data: Partial<SampleData>;
  errors: ImportError[];
  warnings: ImportWarning[];
  summary: {
    sheetsProcessed: number;
    rowsImported: number;
    rowsUpdated: number;
    rowsDeleted: number;
    rowsSkipped: number;
    totalRows: number;
  };
  processingLog: ProcessingLogEntry[];
}

/**
 * Import error details
 */
export interface ImportError {
  sheet: string;
  row: number;
  column: string;
  message: string;
  value: string;
  severity: 'error' | 'critical';
}

/**
 * Import warning (non-blocking issues)
 */
export interface ImportWarning {
  sheet: string;
  row: number;
  message: string;
}

/**
 * Processing log entry for UI display
 */
export interface ProcessingLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  sheet: string;
  message: string;
  details?: string;
}

/**
 * Progress callback for import operations
 */
export type ImportProgressCallback = (progress: {
  stage: string;
  percent: number;
  currentSheet?: string;
  currentRow?: number;
  totalRows?: number;
}) => void;

/**
 * Entity type that can be exported
 */
export type ExportableEntity =
  | 'employees'
  | 'portfolios'
  | 'customers'
  | 'sites'
  | 'projects'
  | 'phases'
  | 'tasks'
  | 'subTasks'
  | 'hours'
  | 'qctasks'
  | 'milestones'
  | 'milestonesTable'
  | 'deliverables'
  | 'projectHealth';

// ============================================================================
// SHEET NAME MAPPINGS
// ============================================================================

/**
 * Map entity keys to sheet names
 */
const ENTITY_TO_SHEET: Record<ExportableEntity, string> = {
  employees: 'Employees',
  portfolios: 'Portfolios',
  customers: 'Customers',
  sites: 'Sites',
  projects: 'Projects',
  phases: 'Phases',
  tasks: 'Tasks',
  subTasks: 'Sub-Tasks',
  hours: 'Hour Entries',
  qctasks: 'QC Tasks',
  milestones: 'Milestones',
  milestonesTable: 'Milestones',
  deliverables: 'Deliverables',
  projectHealth: 'Project Health',
};

/**
 * Map sheet names to entity keys (reverse lookup)
 */
const SHEET_TO_ENTITY: Record<string, ExportableEntity> = {
  'employees': 'employees',
  'portfolios': 'portfolios',
  'customers': 'customers',
  'sites': 'sites',
  'projects': 'projects',
  'phases': 'phases',
  'tasks': 'tasks',
  'sub-tasks': 'subTasks',
  'subtasks': 'subTasks',
  'hourentries': 'hours',
  'hour entries': 'hours',
  'hours': 'hours',
  'qctasks': 'qctasks',
  'qc tasks': 'qctasks',
  'milestones': 'milestonesTable',
  'milestonestable': 'milestonesTable',
  'deliverables': 'deliverables',
  'projecthealth': 'projectHealth',
  'project health': 'projectHealth',
};

/**
 * ID field name for each entity type
 */
const ENTITY_ID_FIELD: Record<ExportableEntity, string> = {
  employees: 'employeeId',
  portfolios: 'portfolioId',
  customers: 'customerId',
  sites: 'siteId',
  projects: 'projectId',
  phases: 'phaseId',
  tasks: 'taskId',
  subTasks: 'taskId',
  hours: 'entryId',
  qctasks: 'qcTaskId',
  milestones: 'milestoneId',
  milestonesTable: 'milestoneId',
  deliverables: 'deliverableId',
  projectHealth: 'projectId',
};

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export all data to a multi-sheet Excel workbook
 * Always includes Help Guide and Quick Reference tabs.
 * If no data exists, exports a blank template with example rows.
 * 
 * @param data - SampleData object to export
 * @param hierarchyFilter - Optional hierarchy filter for filename
 * @param dateFilter - Optional date filter for filename
 */
export function exportAllToExcel(
  data: SampleData,
  hierarchyFilter?: HierarchyFilter | null,
  dateFilter?: DateFilter | null
): void {
  const filename = generateExportFilename(hierarchyFilter, dateFilter);
  const workbook = XLSX.utils.book_new();

  // Always add Help Guide first
  const helpData = [
    ['PPC V3 DATA IMPORT/EXPORT - HELP GUIDE'],
    [''],
    ['=== DATA HIERARCHY ==='],
    ['Portfolio → Customer → Site → Project → Phase → Task → Sub-Task → Deliverable'],
    [''],
    ['Level 1: Portfolio - Top-level grouping for senior managers. Each portfolio contains customers.'],
    ['Level 2: Customer - Client organizations under a portfolio.'],
    ['Level 3: Site - Physical locations belonging to a customer.'],
    ['Level 4: Project - Work programs at a site. Projects have a billable type (T&M or FP).'],
    ['Level 5: Phase - Stages within a project (e.g., Phase 0, Phase 1, Phase 2).'],
    ['Level 6: Task - Work items within a phase. Tasks have hours, costs, and resources.'],
    ['Level 7: Sub-Task - Detailed work items under a parent task.'],
    ['Level 8: Deliverable - Outputs/documents associated with phases or tasks.'],
    [''],
    ['=== ID PREFIXES ==='],
    ['PRF - Portfolio IDs (e.g., PRF_001)'],
    ['CST - Customer IDs (e.g., CST_001)'],
    ['STE - Site IDs (e.g., STE_001)'],
    ['PRJ - Project IDs (e.g., PRJ_001)'],
    ['PHS - Phase IDs (e.g., PHS_001)'],
    ['TSK - Task IDs (e.g., TSK_001)'],
    ['SUB - Sub-Task IDs (e.g., SUB_001)'],
    ['DLB - Deliverable IDs (e.g., DLB_001)'],
    ['QCT - QC Task IDs (e.g., QCT_001)'],
    ['HRS - Hour Entry IDs (e.g., HRS_001)'],
    ['EMP - Employee IDs (e.g., E1001)'],
    [''],
    ['=== ACTION COLUMN ==='],
    ['A - Add: Create a new record. Leave ID blank to auto-generate.'],
    ['E - Edit: Update an existing record. ID must match an existing record.'],
    ['D - Delete: Remove an existing record. ID must match an existing record.'],
    ['(blank) - Same as A: Import as new record.'],
    [''],
    ['=== COMMON DATA FIELDS ==='],
    ['baselineStartDate - Originally planned start date (YYYY-MM-DD format)'],
    ['baselineEndDate - Originally planned end date (YYYY-MM-DD format)'],
    ['actualStartDate - When work actually started (YYYY-MM-DD format)'],
    ['actualEndDate - When work actually completed (YYYY-MM-DD format)'],
    ['percentComplete - Progress percentage (0-100)'],
    ['comments - Free-text notes field'],
    ['baselineHours - Originally estimated hours'],
    ['actualHours - Hours actually worked'],
    ['projectedHours - Current estimate to complete'],
    ['baselineCost - Originally estimated cost'],
    ['status - Current state (Not Started, In Progress, Completed, etc.)'],
    [''],
    ['=== BILLABLE TYPE (Projects) ==='],
    ['T&M - Time and Materials: Billed based on hours worked'],
    ['FP - Fixed Price: Billed as agreed lump sum'],
    [''],
    ['=== HOW TO USE THIS FILE ==='],
    ['1. Edit data in the entity sheets (Portfolios, Customers, Projects, etc.)'],
    ['2. Use the Action column to specify what to do with each row on re-import'],
    ['3. Dates should be in YYYY-MM-DD format (e.g., 2025-01-15)'],
    ['4. Save and upload via the Data Management page to import changes'],
    [''],
    ['=== TIPS ==='],
    ['- Keep IDs unique: Each ID in a sheet must be unique.'],
    ['- Match references: ProjectId in Tasks must exist in Projects sheet.'],
    ['- Auto-timestamps: createdAt and updatedAt are auto-set on import.']
  ];

  const helpSheet = XLSX.utils.aoa_to_sheet(helpData);
  helpSheet['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, helpSheet, 'Help Guide');

  // Add Quick Reference sheet
  const quickRefData = [
    { Column: 'Action', Description: 'E = Edit existing record, A = Add new record, D = Delete record', Required: 'No' },
    { Column: '(ID fields)', Description: 'Auto-generated if left empty for new records (A action)', Required: 'No' },
    { Column: '(Required fields)', Description: 'Fields marked as required must have values', Required: 'Yes' },
    { Column: '', Description: '', Required: '' },
    { Column: 'Note:', Description: 'Leave Action empty to import all rows as new records', Required: '' }
  ];
  const quickRefSheet = XLSX.utils.json_to_sheet(quickRefData);
  autoSizeColumns(quickRefSheet);
  XLSX.utils.book_append_sheet(workbook, quickRefSheet, 'Quick Reference');

  // All entity types to export - ALWAYS include all tabs
  const entities: ExportableEntity[] = [
    'employees', 'portfolios', 'customers', 'sites', 'projects', 'phases',
    'tasks', 'subTasks', 'qctasks', 'deliverables', 'milestonesTable', 'hours',
    'projectHealth'
  ];

  // Export ALL entities - if data exists, export it; otherwise export template with headers
  entities.forEach(entity => {
    const entityData = data[entity as keyof SampleData];

    if (entityData && Array.isArray(entityData) && entityData.length > 0) {
      // Export actual data with Action column
      const headers = getEntityHeaders(entity);

      const dataWithAction = entityData.map(row => {
        const item: Record<string, any> = {
          Action: '' // Empty action column for editing during re-import
        };

        // Only include defined headers to strictly control export format
        // This prevents arrays/objects (like resource_assignments) from corrupting the Excel file
        headers.forEach(header => {
          let value = (row as any)[header];

          // Format Baseline Hours to 2 decimal places
          if (header === 'baselineHours' && typeof value === 'number') {
            value = Math.round(value * 100) / 100;
          }

          item[header] = value;
        });

        return item;
      });

      const worksheet = XLSX.utils.json_to_sheet(dataWithAction);
      autoSizeColumns(worksheet);
      XLSX.utils.book_append_sheet(workbook, worksheet, ENTITY_TO_SHEET[entity]);
    } else {
      // No data - export blank template with headers and example row
      const headers = ['Action', ...getEntityHeaders(entity)];
      const exampleRow = { Action: 'A', ...getExampleRow(entity) };
      const worksheet = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
      autoSizeColumns(worksheet);
      XLSX.utils.book_append_sheet(workbook, worksheet, ENTITY_TO_SHEET[entity]);
    }
  });

  // Add Change Log sheet if exists
  if (data.changeLog && data.changeLog.length > 0) {
    const changeLogSheet = XLSX.utils.json_to_sheet(data.changeLog);
    autoSizeColumns(changeLogSheet);
    XLSX.utils.book_append_sheet(workbook, changeLogSheet, 'Change Log');
  }

  // Trigger download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export a single entity type to Excel
 * 
 * @param data - Array of entity objects
 * @param entityType - Type of entity being exported
 * @param filename - Output filename (without extension)
 */
export function exportEntityToExcel(
  data: any[],
  entityType: ExportableEntity,
  filename?: string
): void {
  const workbook = XLSX.utils.book_new();

  // Add Action column for imports
  const headers = getEntityHeaders(entityType);

  const dataWithAction = data.map(row => {
    const item: Record<string, any> = {
      Action: ''
    };

    // Only include defined headers to strictly control export format
    headers.forEach(header => {
      let value = (row as any)[header];

      // Format Baseline Hours to 2 decimal places
      if (header === 'baselineHours' && typeof value === 'number') {
        value = Math.round(value * 100) / 100;
      }

      item[header] = value;
    });

    return item;
  });

  const worksheet = XLSX.utils.json_to_sheet(dataWithAction);
  autoSizeColumns(worksheet);

  const sheetName = ENTITY_TO_SHEET[entityType];
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, `${filename || entityType}-export.xlsx`);
}

/**
 * Auto-size columns based on content width
 */
function autoSizeColumns(worksheet: XLSX.WorkSheet): void {
  const colWidths: number[] = [];
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxWidth = 10; // Minimum width

    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v) {
        const cellWidth = String(cell.v).length;
        maxWidth = Math.max(maxWidth, Math.min(cellWidth + 2, 50)); // Max 50 chars
      }
    }

    colWidths.push(maxWidth);
  }

  worksheet['!cols'] = colWidths.map(w => ({ wch: w }));
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/**
 * Import data from an Excel file with E/A/D action column support
 * 
 * @param file - File object from file input
 * @param existingData - Current data for Edit/Delete operations
 * @param onProgress - Optional progress callback
 * @returns Promise<ImportResult> with parsed data and any errors
 */
export async function importFromExcel(
  file: File,
  existingData?: SampleData,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const processingLog: ProcessingLogEntry[] = [];
  const data: Partial<SampleData> = {};
  let sheetsProcessed = 0;
  let rowsImported = 0;
  let rowsUpdated = 0;
  let rowsDeleted = 0;
  let rowsSkipped = 0;
  let totalRows = 0;

  const addLog = (type: ProcessingLogEntry['type'], sheet: string, message: string, details?: string) => {
    processingLog.push({
      timestamp: new Date().toISOString(),
      type,
      sheet,
      message,
      details
    });
  };

  try {
    onProgress?.({ stage: 'Reading file', percent: 5 });
    addLog('info', 'File', `Reading ${file.name}...`);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    onProgress?.({ stage: 'Parsing sheets', percent: 15 });
    addLog('success', 'File', `Found ${workbook.SheetNames.length} sheets`);

    const totalSheets = workbook.SheetNames.length;
    let processedSheets = 0;

    for (const sheetName of workbook.SheetNames) {
      processedSheets++;
      const percentBase = 15 + (processedSheets / totalSheets) * 75;

      const normalizedName = sheetName.toLowerCase().replace(/\s+/g, '');
      const entityType = SHEET_TO_ENTITY[normalizedName] || SHEET_TO_ENTITY[sheetName.toLowerCase()];

      if (!entityType) {
        warnings.push({
          sheet: sheetName,
          row: 0,
          message: `Unknown sheet name: "${sheetName}". Skipping.`
        });
        addLog('warning', sheetName, `Skipped - unknown sheet name`);
        continue;
      }

      onProgress?.({ stage: 'Processing', percent: percentBase, currentSheet: sheetName });
      addLog('info', sheetName, `Processing ${sheetName}...`);

      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) {
        addLog('warning', sheetName, 'Sheet is empty, skipping');
        continue;
      }

      totalRows += jsonData.length;
      const idField = ENTITY_ID_FIELD[entityType];

      // Get existing data for this entity type
      const existingEntityData = existingData?.[entityType as keyof SampleData] as any[] || [];

      // Separate rows by action
      const toAdd: any[] = [];
      const toUpdate: any[] = [];
      const toDelete: Set<string> = new Set();
      const unchanged: any[] = [];

      jsonData.forEach((row: any, rowIndex: number) => {
        try {
          const action = parseAction(row.Action || row.action || row.ACTION);
          const cleanedRow = cleanRowData(row, entityType);

          // Remove action column from the data
          delete cleanedRow.Action;
          delete cleanedRow.action;
          delete cleanedRow.ACTION;

          const rowId = cleanedRow[idField] || cleanedRow.id;

          onProgress?.({
            stage: 'Processing',
            percent: percentBase,
            currentSheet: sheetName,
            currentRow: rowIndex + 1,
            totalRows: jsonData.length
          });

          switch (action) {
            case 'A':
              // Add new record
              if (!rowId) {
                cleanedRow[idField] = generateImportId(entityType);
              }
              toAdd.push(cleanedRow);
              rowsImported++;
              break;

            case 'E':
              // Edit existing record
              if (rowId) {
                const existingIndex = existingEntityData.findIndex((e: any) =>
                  e[idField] === rowId || e.id === rowId
                );

                if (existingIndex >= 0) {
                  toUpdate.push({ index: existingIndex, data: cleanedRow });
                  rowsUpdated++;
                } else {
                  // Record not found - treat as add
                  toAdd.push(cleanedRow);
                  rowsImported++;
                  warnings.push({
                    sheet: sheetName,
                    row: rowIndex + 2,
                    message: `Record with ID ${rowId} not found for Edit. Added as new.`
                  });
                }
              } else {
                errors.push({
                  sheet: sheetName,
                  row: rowIndex + 2,
                  column: 'ID',
                  message: 'Edit action requires a valid ID',
                  value: '',
                  severity: 'error'
                });
                rowsSkipped++;
              }
              break;

            case 'D':
              // Delete record
              if (rowId) {
                toDelete.add(rowId);
                rowsDeleted++;
              } else {
                errors.push({
                  sheet: sheetName,
                  row: rowIndex + 2,
                  column: 'ID',
                  message: 'Delete action requires a valid ID',
                  value: '',
                  severity: 'error'
                });
                rowsSkipped++;
              }
              break;

            default:
              // No action specified - add if has data
              if (Object.keys(cleanedRow).length > 2) { // More than just timestamps
                if (!rowId) {
                  cleanedRow[idField] = generateImportId(entityType);
                }
                unchanged.push(cleanedRow);
                rowsImported++;
              }
              break;
          }
        } catch (err) {
          errors.push({
            sheet: sheetName,
            row: rowIndex + 2, // +2 for 1-indexing and header row
            column: '',
            message: err instanceof Error ? err.message : 'Unknown validation error',
            value: JSON.stringify(row).substring(0, 100),
            severity: 'error'
          });
          rowsSkipped++;
        }
      });

      // Build final data for this entity
      let finalData: any[] = [];

      if (existingEntityData.length > 0) {
        // Start with existing data
        finalData = existingEntityData.map((item: any, idx: number) => {
          // Check if this item should be updated
          const updateEntry = toUpdate.find(u => u.index === idx);
          if (updateEntry) {
            return { ...item, ...updateEntry.data, updatedAt: new Date().toISOString() };
          }
          return item;
        });

        // Filter out deleted items
        finalData = finalData.filter((item: any) => {
          const itemId = item[idField] || item.id;
          return !toDelete.has(itemId);
        });

        // Add new items
        finalData = [...finalData, ...toAdd, ...unchanged];
      } else {
        // No existing data - just use imported data
        finalData = [...toAdd, ...unchanged];
      }

      if (finalData.length > 0) {
        (data as any)[entityType] = finalData;
        sheetsProcessed++;
        addLog('success', sheetName,
          `Processed: ${toAdd.length + unchanged.length} added, ${rowsUpdated} updated, ${toDelete.size} deleted`
        );
      }
    }

    onProgress?.({ stage: 'Complete', percent: 100 });
    addLog('success', 'Summary',
      `Import complete: ${rowsImported} added, ${rowsUpdated} updated, ${rowsDeleted} deleted, ${rowsSkipped} skipped`
    );

    return {
      success: errors.filter(e => e.severity === 'critical').length === 0,
      data,
      errors,
      warnings,
      summary: {
        sheetsProcessed,
        rowsImported,
        rowsUpdated,
        rowsDeleted,
        rowsSkipped,
        totalRows
      },
      processingLog
    };
  } catch (err) {
    addLog('error', 'File', err instanceof Error ? err.message : 'Failed to parse Excel file');

    return {
      success: false,
      data: {},
      errors: [{
        sheet: 'File',
        row: 0,
        column: '',
        message: err instanceof Error ? err.message : 'Failed to parse Excel file',
        value: file.name,
        severity: 'critical'
      }],
      warnings,
      summary: {
        sheetsProcessed: 0,
        rowsImported: 0,
        rowsUpdated: 0,
        rowsDeleted: 0,
        rowsSkipped: 0,
        totalRows: 0
      },
      processingLog
    };
  }
}

/**
 * Parse action column value
 */
function parseAction(value: unknown): ImportActionType {
  if (!value) return null;
  const str = String(value).toUpperCase().trim();
  if (str === 'E' || str === 'EDIT') return 'E';
  if (str === 'A' || str === 'ADD') return 'A';
  if (str === 'D' || str === 'DELETE' || str === 'DEL') return 'D';
  return null;
}

/**
 * Clean and validate a row of data - simple 1:1 mapping
 * Excel columns should match Data Management page fields exactly (camelCase)
 */
function cleanRowData(row: any, entityType: ExportableEntity): any {
  const cleaned: any = {};

  Object.entries(row).forEach(([key, value]) => {
    // Skip empty keys and Action column
    if (!key || key.trim() === '' || key.toLowerCase() === 'action') return;

    // Convert key to camelCase (handle spaces and underscores)
    // This ensures Excel headers like "Project ID" become "projectId"
    const cleanKey = key.trim()
      .replace(/[\s_]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^./, c => c.toLowerCase());

    // Handle different value types - simple 1:1 mapping
    if (value === null || value === undefined || value === '') {
      cleaned[cleanKey] = null;
    } else if (typeof value === 'number') {
      cleaned[cleanKey] = value;
    } else if (typeof value === 'boolean') {
      cleaned[cleanKey] = value;
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      // Try to parse as number if it looks like one
      if (/^-?\d+\.?\d*$/.test(trimmed)) {
        cleaned[cleanKey] = parseFloat(trimmed);
      } else if (trimmed.toLowerCase() === 'true') {
        cleaned[cleanKey] = true;
      } else if (trimmed.toLowerCase() === 'false') {
        cleaned[cleanKey] = false;
      } else {
        cleaned[cleanKey] = trimmed;
      }
    } else {
      cleaned[cleanKey] = String(value).trim();
    }
  });

  // Ensure 'baselineHours' is rounded to 2 decimal places if present
  if (typeof cleaned.baselineHours === 'number') {
    cleaned.baselineHours = Math.round(cleaned.baselineHours * 100) / 100;
  }

  // Ensure 'id' is set - generate if missing (for new records)
  if (!cleaned.id) {
    const prefixes: Record<ExportableEntity, string> = {
      portfolios: 'PRF',
      customers: 'CST',
      sites: 'STE',
      projects: 'PRJ',
      phases: 'PHS',
      tasks: 'TSK',
      subTasks: 'SUB',
      hours: 'HRS',
      qctasks: 'QCT',
      milestones: 'MLS',
      milestonesTable: 'MLS',
      deliverables: 'DLB',
      employees: 'EMP',
      projectHealth: 'PRJ',
    };
    const prefix = prefixes[entityType] || 'GEN';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    cleaned.id = `${prefix}-${timestamp}${random}`;
  }

  // Add timestamps if not present
  const now = new Date().toISOString();
  if (!cleaned.createdAt) cleaned.createdAt = now;
  if (!cleaned.updatedAt) cleaned.updatedAt = now;

  return cleaned;
}

/**
 * Generate a unique ID for imported rows using standardized prefixes
 */
function generateImportId(entityType: string): string {
  const prefixes: Record<string, string> = {
    portfolios: 'PRF',
    customers: 'CST',
    sites: 'STE',
    projects: 'PRJ',
    phases: 'PHS',
    tasks: 'TSK',
    subTasks: 'SUB',
    hours: 'HRS',
    qctasks: 'QCT',
    milestones: 'MLS',
    deliverables: 'DLB',
    employees: 'EMP',
  };

  const prefix = prefixes[entityType] || entityType.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================================================
// TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Download an empty template Excel file with correct headers
 * 
 * @param entityType - Type of entity template to download
 */
export function downloadTemplate(entityType: ExportableEntity): void {
  const workbook = XLSX.utils.book_new();

  // Get headers for the entity type (with Action column first)
  const headers = ['Action', ...getEntityHeaders(entityType)];

  // Create sheet with headers and one example row
  const exampleRow = { Action: 'A', ...getExampleRow(entityType) };
  const data = [exampleRow];

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  autoSizeColumns(worksheet);

  // Add instructions sheet
  const instructionsData = [
    { Column: 'Action', Description: 'E = Edit existing record, A = Add new record, D = Delete record' },
    { Column: '(ID fields)', Description: 'Auto-generated if left empty for new records' },
    { Column: '(Other fields)', Description: 'Fill in values as needed' }
  ];
  const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData);
  autoSizeColumns(instructionsSheet);

  XLSX.utils.book_append_sheet(workbook, worksheet, ENTITY_TO_SHEET[entityType]);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

  XLSX.writeFile(workbook, `${entityType}-template.xlsx`);
}

/**
 * Download a complete template with all entity sheets
 */
export function downloadFullTemplate(): void {
  const workbook = XLSX.utils.book_new();

  // Add comprehensive help sheet at the beginning
  const helpData = [
    ['PPC V3 DATA IMPORT TEMPLATE - HELP GUIDE'],
    [''],
    ['=== DATA HIERARCHY ==='],
    ['Portfolio → Customer → Site → Project → Phase → Task → Sub-Task → Deliverable'],
    [''],
    ['Level 1: Portfolio - Top-level grouping for senior managers. Each portfolio contains customers.'],
    ['Level 2: Customer - Client organizations under a portfolio.'],
    ['Level 3: Site - Physical locations belonging to a customer.'],
    ['Level 4: Project - Work programs at a site. Projects have a billable type (T&M or FP).'],
    ['Level 5: Phase - Stages within a project (e.g., Phase 0, Phase 1, Phase 2).'],
    ['Level 6: Task - Work items within a phase. Tasks have hours, costs, and resources.'],
    ['Level 7: Sub-Task - Detailed work items under a parent task.'],
    ['Level 8: Deliverable - Outputs/documents associated with phases or tasks.'],
    [''],
    ['=== ID PREFIXES ==='],
    ['PRF - Portfolio IDs (e.g., PRF_001)'],
    ['CST - Customer IDs (e.g., CST_001)'],
    ['STE - Site IDs (e.g., STE_001)'],
    ['PRJ - Project IDs (e.g., PRJ_001)'],
    ['PHS - Phase IDs (e.g., PHS_001)'],
    ['TSK - Task IDs (e.g., TSK_001)'],
    ['SUB - Sub-Task IDs (e.g., SUB_001)'],
    ['DLB - Deliverable IDs (e.g., DLB_001)'],
    ['QCT - QC Task IDs (e.g., QCT_001)'],
    ['HRS - Hour Entry IDs (e.g., HRS_001)'],
    ['EMP - Employee IDs (e.g., E1001)'],
    [''],
    ['=== ACTION COLUMN ==='],
    ['A - Add: Create a new record. Leave ID blank to auto-generate.'],
    ['E - Edit: Update an existing record. ID must match an existing record.'],
    ['D - Delete: Remove an existing record. ID must match an existing record.'],
    ['(blank) - Same as A: Import as new record.'],
    [''],
    ['=== COMMON DATA FIELDS ==='],
    ['baselineStartDate - Originally planned start date (YYYY-MM-DD format)'],
    ['baselineEndDate - Originally planned end date (YYYY-MM-DD format)'],
    ['actualStartDate - When work actually started (YYYY-MM-DD format)'],
    ['actualEndDate - When work actually completed (YYYY-MM-DD format)'],
    ['percentComplete - Progress percentage (0-100)'],
    ['comments - Free-text notes field'],
    ['baselineHours - Originally estimated hours'],
    ['actualHours - Hours actually worked'],
    ['projectedHours - Current estimate to complete'],
    ['baselineCost - Originally estimated cost'],
    ['status - Current state (Not Started, In Progress, Completed, etc.)'],
    [''],
    ['=== BILLABLE TYPE (Projects) ==='],
    ['T&M - Time and Materials: Billed based on hours worked'],
    ['FP - Fixed Price: Billed as agreed lump sum'],
    [''],
    ['=== HOW TO USE THIS TEMPLATE ==='],
    ['1. Fill out sheets in hierarchy order: Start with Portfolios, then Customers, etc.'],
    ['2. Use consistent IDs: When referencing a portfolio in Customer sheet, use the exact portfolioId.'],
    ['3. Dates: Use YYYY-MM-DD format (e.g., 2025-01-15)'],
    ['4. Required fields: Ensure name fields and parent IDs are filled.'],
    ['5. Import: Upload the completed Excel file via the Data Management page.'],
    ['6. Review: Check the import log for any errors or warnings.'],
    [''],
    ['=== TIPS ==='],
    ['- Start small: Import a few records first to test, then add more.'],
    ['- Keep IDs unique: Each ID in a sheet must be unique.'],
    ['- Match references: ProjectId in Tasks must exist in Projects sheet.'],
    ['- Auto-timestamps: createdAt and updatedAt are auto-set on import.']
  ];

  const helpSheet = XLSX.utils.aoa_to_sheet(helpData);
  // Set column width for readability
  helpSheet['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, helpSheet, 'Help Guide');

  // Add instructions sheet (quick reference)
  const instructionsData = [
    { Column: 'Action', Description: 'E = Edit existing record, A = Add new record, D = Delete record', Required: 'No' },
    { Column: '(ID fields)', Description: 'Auto-generated if left empty for new records (A action)', Required: 'No' },
    { Column: '(Required fields)', Description: 'Fields marked as required must have values', Required: 'Yes' },
    { Column: '', Description: '', Required: '' },
    { Column: 'Note:', Description: 'Leave Action empty to import all rows as new records', Required: '' }
  ];
  const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData);
  autoSizeColumns(instructionsSheet);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Quick Reference');

  const entities: ExportableEntity[] = [
    'employees', 'portfolios', 'customers', 'sites', 'projects', 'phases',
    'tasks', 'subTasks', 'qctasks', 'deliverables', 'milestonesTable',
    'hours', 'projectHealth'
  ];

  entities.forEach(entity => {
    const headers = ['Action', ...getEntityHeaders(entity)];
    const exampleRow = { Action: 'A', ...getExampleRow(entity) };
    const worksheet = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
    autoSizeColumns(worksheet);
    XLSX.utils.book_append_sheet(workbook, worksheet, ENTITY_TO_SHEET[entity]);
  });

  XLSX.writeFile(workbook, 'ppc-data-template.xlsx');
}

/**
 * Get column headers for an entity type - matches Data Management page fields exactly
 * These headers must match the field keys in app/project-controls/data-management/page.tsx
 */
function getEntityHeaders(entityType: ExportableEntity): string[] {
  const headers: Record<ExportableEntity, string[]> = {
    // Employees
    employees: ['id', 'employeeId', 'name', 'email', 'jobTitle', 'managementLevel', 'manager', 'employeeType', 'role', 'department', 'hourlyRate', 'utilizationPercent', 'isActive'],

    // Portfolios
    portfolios: ['id', 'portfolioId', 'name', 'employeeId', 'manager', 'methodology', 'description', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineHours', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'comments', 'isActive'],

    // Customers
    customers: ['id', 'customerId', 'portfolioId', 'employeeId', 'name', 'contactName', 'contactEmail', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineHours', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'comments', 'isActive'],

    // Sites
    sites: ['id', 'siteId', 'customerId', 'employeeId', 'name', 'location', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineHours', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'comments', 'isActive'],

    // Projects
    projects: ['id', 'projectId', 'unitId', 'siteId', 'customerId', 'portfolioId', 'name', 'projectType', 'billableType', 'description', 'managerId', 'managerName', 'startDate', 'endDate', 'plannedStartDate', 'plannedEndDate', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineBudget', 'baselineHours', 'actualBudget', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'eacBudget', 'eacHours', 'cpi', 'spi', 'isOverhead', 'isTpw', 'status', 'isActive'],

    // Phases
    phases: ['id', 'phaseId', 'projectId', 'employeeId', 'name', 'sequence', 'methodology', 'description', 'startDate', 'endDate', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineHours', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'evMethod', 'isActive'],

    // Tasks
    tasks: ['id', 'taskId', 'phaseId', 'projectId', 'parentTaskId', 'wbsCode', 'name', 'description', 'assignedResourceId', 'assignedResourceName', 'assignedResourceType', 'assignedResource', 'startDate', 'endDate', 'plannedStartDate', 'plannedEndDate', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'daysRequired', 'percentComplete', 'baselineHours', 'actualHours', 'projectedRemainingHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'baselineQty', 'actualQty', 'completedQty', 'baselineCount', 'baselineMetric', 'baselineUom', 'actualCount', 'completedCount', 'uom', 'userStoryId', 'sprintId', 'status', 'priority', 'evMethod', 'earlyStart', 'earlyFinish', 'lateStart', 'lateFinish', 'totalFloat', 'freeFloat', 'isCritical', 'isMilestone', 'isSubTask', 'predecessorId', 'predecessorRelationship', 'notes', 'comments'],

    // Sub-Tasks (Subset of tasks)
    subTasks: ['id', 'taskId', 'parentTaskId', 'name', 'description', 'assignedResourceId', 'status', 'priority', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'percentComplete', 'baselineHours', 'actualHours', 'remainingHours', 'baselineCost', 'actualCost', 'remainingCost', 'comments'],

    // Hour Entries
    hours: ['id', 'entryId', 'employeeId', 'projectId', 'phaseId', 'taskId', 'userStoryId', 'date', 'hours', 'description'],

    // QC Tasks
    qctasks: ['id', 'qcTaskId', 'projectId', 'phaseId', 'taskId', 'name', 'description', 'status', 'assignedTo', 'dueDate', 'completedDate'],

    // Milestones
    milestones: ['id', 'milestoneId', 'milestoneName', 'projectId', 'phaseId', 'taskId', 'customer', 'plannedDate', 'forecastedDate', 'actualDate', 'varianceDays', 'percentComplete'],
    milestonesTable: ['id', 'milestoneId', 'milestoneName', 'projectId', 'phaseId', 'taskId', 'customer', 'plannedDate', 'forecastedDate', 'actualDate', 'varianceDays', 'percentComplete'],

    // Deliverables
    deliverables: ['id', 'deliverableId', 'projectId', 'phaseId', 'taskId', 'milestoneId', 'employeeId', 'assigneeId', 'name', 'type', 'status', 'dueDate', 'completedDate', 'percentComplete', 'baselineStartDate', 'baselineEndDate', 'actualStartDate', 'actualEndDate', 'baselineHours', 'actualHours', 'baselineCost', 'actualCost', 'comments'],

    // Project Health
    projectHealth: ['id', 'projectId', 'healthScore', 'status', 'riskLevel'],
  };

  return headers[entityType];
}

/**
 * Get an example row for a template (updated for new schema with remaining hours/cost)
 */
function getExampleRow(entityType: ExportableEntity): any {
  const now = new Date().toISOString();

  const examples: Record<ExportableEntity, any> = {
    employees: {
      id: 'EMP-001',
      employeeId: 'EMP-001',
      name: 'John Doe',
      jobTitle: 'Engineer',
      managementLevel: 'Individual Contributor',
      manager: 'Jane Smith',
      email: 'john.doe@example.com',
      employeeType: 'Regular',
      department: 'Engineering',
      hourlyRate: 100,
      utilizationPercent: 80,
      isActive: true
    },
    portfolios: {
      id: 'PRF-001',
      portfolioId: 'PRF-001',
      name: 'Example Portfolio',
      employeeId: 'EMP-001',
      manager: 'Manager Name',
      methodology: 'RBI',
      description: 'Portfolio Description',
      baselineStartDate: '2025-01-01',
      baselineEndDate: '2025-12-31',
      actualStartDate: '',
      actualEndDate: '',
      percentComplete: 25,
      baselineHours: 1000,
      actualHours: 250,
      remainingHours: 750,
      baselineCost: 100000,
      actualCost: 25000,
      remainingCost: 75000,
      comments: 'Portfolio comments',
      isActive: true
    },
    customers: {
      id: 'CST-001',
      customerId: 'CST-001',
      name: 'Example Customer',
      contactName: 'Contact Person',
      contactEmail: 'contact@example.com',
      portfolioId: 'PRF-001',
      employeeId: 'EMP-001',
      baselineStartDate: '2025-01-01',
      baselineEndDate: '2025-12-31',
      actualStartDate: '',
      actualEndDate: '',
      percentComplete: 0,
      baselineHours: 500,
      actualHours: 0,
      remainingHours: 500,
      baselineCost: 50000,
      actualCost: 0,
      remainingCost: 50000,
      comments: '',
      isActive: true
    },
    sites: {
      id: 'STE-001',
      siteId: 'STE-001',
      name: 'Example Site',
      customerId: 'CST-001',
      employeeId: 'EMP-001',
      location: 'Houston, TX',
      baselineStartDate: '2025-01-01',
      baselineEndDate: '2025-12-31',
      actualStartDate: '',
      actualEndDate: '',
      percentComplete: 0,
      baselineHours: 200,
      actualHours: 0,
      remainingHours: 200,
      baselineCost: 20000,
      actualCost: 0,
      remainingCost: 20000,
      comments: '',
      isActive: true
    },
    projects: {
      id: 'PRJ-001',
      projectId: 'PRJ-001',
      name: 'Example Project',
      customerId: 'CST-001',
      siteId: 'STE-001',
      managerId: 'EMP-001',
      managerName: 'Project Manager',
      projectType: 'Standard RBI',
      billableType: 'T&M',
      status: 'In Progress',
      startDate: '2025-01-01',
      endDate: '2025-06-30',
      baselineStartDate: '2025-01-01',
      baselineEndDate: '2025-06-30',
      actualStartDate: '2025-01-02',
      actualEndDate: '',
      percentComplete: 25,
      baselineBudget: 50000,
      baselineHours: 400,
      actualBudget: 10000,
      actualHours: 100,
      remainingHours: 300,
      baselineCost: 40000,
      actualCost: 10000,
      remainingCost: 30000,
      description: 'Project Description',
      isActive: true
    },
    phases: {
      id: 'PHS-001',
      phaseId: 'PHS-001',
      name: 'Phase 1 - Initiate',
      projectId: 'PRJ-001',
      employeeId: 'EMP-001',
      sequence: 1,
      startDate: '2025-01-01',
      endDate: '2025-02-28',
      baselineStartDate: '2025-01-01',
      baselineEndDate: '2025-02-28',
      actualStartDate: '2025-01-02',
      actualEndDate: '',
      percentComplete: 50,
      baselineHours: 100,
      actualHours: 50,
      remainingHours: 50,
      baselineCost: 10000,
      actualCost: 5000,
      remainingCost: 5000,
      description: 'Phase Description',
      isActive: true
    },
    tasks: {
      id: 'TSK-001',
      taskId: 'TSK-001',
      name: 'Example Task',
      description: 'Description of the task',
      projectId: 'PRJ-001',
      phaseId: 'PHS-001',
      assignedResourceId: 'EMP-001',
      status: 'In Progress',
      priority: 'medium',
      baselineStartDate: '2025-01-15',
      baselineEndDate: '2025-01-31',
      actualStartDate: '2025-01-15',
      actualEndDate: '',
      percentComplete: 50,
      baselineHours: 40,
      actualHours: 20,
      remainingHours: 20,
      baselineCost: 4000,
      actualCost: 2000,
      remainingCost: 2000,
      isCritical: false,
      comments: ''
    },
    subTasks: {
      id: 'SUB-001',
      taskId: 'SUB-001',
      parentTaskId: 'TSK-001',
      name: 'Example Sub-Task',
      description: 'Sub-task description',
      assignedResourceId: 'EMP-001',
      status: 'In Progress',
      priority: 'medium',
      baselineStartDate: '2025-01-15',
      baselineEndDate: '2025-01-20',
      actualStartDate: '2025-01-15',
      actualEndDate: '',
      percentComplete: 50,
      baselineHours: 8,
      actualHours: 4,
      remainingHours: 4,
      baselineCost: 800,
      actualCost: 400,
      remainingCost: 400,
      comments: ''
    },
    hours: {
      id: 'HRS-001',
      entryId: 'HRS-001',
      employeeId: 'EMP-001',
      taskId: 'TSK-001',
      projectId: 'PRJ-001',
      phaseId: 'PHS-001',
      date: '2025-01-06',
      hours: 8,
      description: 'Worked on task'
    },
    qctasks: {
      id: 'QCT-001',
      qcTaskId: 'QCT-001',
      taskId: 'TSK-001',
      assignedTo: 'EMP-001',
      name: 'Initial QC',
      status: 'Not Started',
      dueDate: '2025-01-06',
      description: 'QC Description'
    },
    milestones: {
      id: 'MLS-001',
      milestoneId: 'MLS-001',
      milestoneName: 'Phase 1 Complete',
      projectId: 'PRJ-001',
      phaseId: 'PHS-001',
      percentComplete: 65,
      plannedDate: '2025-02-01',
      forecastedDate: '2025-02-05',
      actualDate: '',
      varianceDays: 4
    },
    milestonesTable: {
      id: 'MLS-001',
      milestoneId: 'MLS-001',
      milestoneName: 'Phase 1 Complete',
      projectId: 'PRJ-001',
      phaseId: 'PHS-001',
      percentComplete: 65,
      plannedDate: '2025-02-01',
      forecastedDate: '2025-02-05',
      actualDate: '',
      varianceDays: 4
    },
    deliverables: {
      id: 'DLB-001',
      deliverableId: 'DLB-001',
      name: 'Data Requirement Document',
      projectId: 'PRJ-001',
      phaseId: 'PHS-001',
      employeeId: 'EMP-001',
      type: 'Document',
      status: 'In Progress',
      dueDate: '2025-01-15',
      completedDate: '',
      percentComplete: 75,
      comments: ''
    },
    projectHealth: {
      id: 'PRJ-001',
      projectId: 'PRJ-001',
      status: 'Pass',
      healthScore: 95,
      riskLevel: 'Low'
    },
  };

  return examples[entityType];
}
