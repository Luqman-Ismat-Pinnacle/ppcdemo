/**
 * @fileoverview CSV Parser Utility for PPC V3 Application.
 * 
 * Parses CSV files containing timecard and employee data.
 * Handles quoted fields, extracts unique employees, and converts
 * to the application's data format.
 * 
 * @module lib/csv-parser
 * 
 * @example
 * ```ts
 * import { parseCSV, convertToEmployees } from '@/lib/csv-parser';
 * 
 * const csvText = await file.text();
 * const parsed = parseCSV(csvText);
 * const employees = convertToEmployees(parsed);
 * ```
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Raw CSV row structure from timecard data.
 * Represents a single row of the timecard CSV file.
 * 
 * @interface CSVRow
 * @property {string} Portfolio - Portfolio name
 * @property {string} SrManager - Senior manager name
 * @property {string} Customer - Customer name
 * @property {string} Project - Project name
 * @property {string} Site - Site location
 * @property {string} Phase - Project phase
 * @property {string} Task - Task name
 * @property {string} StartDate - Start date of the work
 * @property {string} Date - Date of the time entry
 * @property {string} Role - Employee role/job title
 * @property {string} EmployeeName - Employee's full name
 * @property {string} EmployeeID - Unique employee identifier
 * @property {string} Hours - Hours worked (as string)
 */
export interface CSVRow {
  Portfolio: string;
  SrManager: string;
  Customer: string;
  Project: string;
  Site: string;
  Phase: string;
  Task: string;
  StartDate: string;
  Date: string;
  Role: string;
  EmployeeName: string;
  EmployeeID: string;
  Hours: string;
}

/**
 * Parsed employee data extracted from CSV.
 * Represents the minimal employee information available from timecards.
 * 
 * @interface ParsedEmployee
 * @property {string} employeeId - Unique employee identifier
 * @property {string} name - Employee's full name
 * @property {string} role - Employee's job role/title
 */
export interface ParsedEmployee {
  employeeId: string;
  name: string;
  role: string;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Parse a single CSV line, handling quoted fields.
 * Correctly handles:
 * - Fields enclosed in double quotes
 * - Escaped quotes within fields (doubled quotes)
 * - Commas within quoted fields
 * 
 * @param {string} line - A single line from a CSV file
 * @returns {string[]} Array of field values
 * 
 * @example
 * ```ts
 * parseCSVLine('John,Doe,"New York, NY"'); 
 * // Returns: ["John", "Doe", "New York, NY"]
 * 
 * parseCSVLine('"Quote ""test""",value');
 * // Returns: ['Quote "test"', 'value']
 * ```
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote (doubled) - add single quote to output
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state (entering or exiting quoted field)
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field (comma outside quotes)
      result.push(current.trim());
      current = '';
    } else {
      // Regular character
      current += char;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  return result;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parse CSV text and extract unique employees.
 * Deduplicates employees by their employee ID.
 * 
 * @param {string} csvText - Complete CSV file content as string
 * @returns {ParsedEmployee[]} Array of unique employees found in the CSV
 * @throws {Error} If required columns (EmployeeID, EmployeeName, Role) are missing
 * 
 * @example
 * ```ts
 * const csvText = `EmployeeID,EmployeeName,Role,Hours
 * EMP001,John Doe,Engineer,8
 * EMP002,Jane Smith,Manager,6`;
 * 
 * const employees = parseCSV(csvText);
 * // Returns: [
 * //   { employeeId: "EMP001", name: "John Doe", role: "Engineer" },
 * //   { employeeId: "EMP002", name: "Jane Smith", role: "Manager" }
 * // ]
 * ```
 */
export function parseCSV(csvText: string): ParsedEmployee[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header row to find column positions
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  
  // Find required column indices
  const employeeIdIdx = headers.indexOf('EmployeeID');
  const employeeNameIdx = headers.indexOf('EmployeeName');
  const roleIdx = headers.indexOf('Role');

  if (employeeIdIdx === -1 || employeeNameIdx === -1 || roleIdx === -1) {
    throw new Error('CSV missing required columns: EmployeeID, EmployeeName, Role');
  }

  // Parse data rows and extract unique employees
  const employeeMap = new Map<string, ParsedEmployee>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // Skip empty lines

    const values = parseCSVLine(line);
    
    // Ensure row has enough columns
    if (values.length <= Math.max(employeeIdIdx, employeeNameIdx, roleIdx)) {
      continue;
    }

    const employeeId = values[employeeIdIdx]?.trim();
    const name = values[employeeNameIdx]?.trim();
    const role = values[roleIdx]?.trim();

    // Add employee if not already in map
    if (employeeId && name && !employeeMap.has(employeeId)) {
      employeeMap.set(employeeId, {
        employeeId,
        name,
        role: role || '',
      });
    }
  }

  return Array.from(employeeMap.values());
}

/**
 * Convert parsed employee data to the full Employee format.
 * Generates derived fields (email, default values) for imported employees.
 * 
 * @param {ParsedEmployee[]} parsed - Array of parsed employees from CSV
 * @returns {Array<Employee>} Array of fully-formed Employee objects
 * 
 * @example
 * ```ts
 * const parsed = [{ employeeId: "EMP001", name: "John Doe", role: "Engineer" }];
 * const employees = convertToEmployees(parsed);
 * // Returns: [{
 * //   employeeId: "EMP001",
 * //   name: "John Doe",
 * //   jobTitle: "Engineer",
 * //   managementLevel: "Individual Contributor",
 * //   manager: "",
 * //   email: "john.doe@pinnacle.com",
 * //   employeeType: "Full Time",
 * //   createdAt: "...",
 * //   updatedAt: "..."
 * // }]
 * ```
 */
export function convertToEmployees(parsed: ParsedEmployee[]): Array<{
  employeeId: string;
  name: string;
  jobTitle: string;
  managementLevel: string;
  manager: string;
  email: string;
  employeeType: string;
  createdAt: string;
  updatedAt: string;
}> {
  const now = new Date().toISOString();
  
  return parsed.map(emp => ({
    employeeId: emp.employeeId,
    name: emp.name,
    jobTitle: emp.role || 'Employee',
    managementLevel: 'Individual Contributor', // Default, can be updated later
    manager: '', // Can be populated from additional data
    email: `${emp.name.toLowerCase().replace(/\s+/g, '.')}@pinnacle.com`, // Generate email from name
    employeeType: 'Full Time', // Default employment type
    createdAt: now,
    updatedAt: now,
  }));
}
