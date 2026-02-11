/**
 * @fileoverview Shared utilities for filtering inactive/terminated employees and projects.
 *
 * Checks both the boolean `isActive` / `is_active` field AND scans the name/status
 * strings for keywords like "inactive", "terminated", "closed", etc.
 *
 * Usage:
 *   import { isActiveEmployee, isActiveProject, filterActiveEmployees, filterActiveProjects } from '@/lib/active-filters';
 */

// Keywords that indicate an inactive record (case-insensitive)
const INACTIVE_KEYWORDS = [
  'inactive',
  'terminated',
  'disabled',
  'closed',
  'cancelled',
  'canceled',
  'archived',
  'suspended',
  'deactivated',
  'removed',
  'offboarded',
  'left company',
  'no longer',
];

/** Returns true if the string contains any inactive keyword */
function containsInactiveKeyword(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toString().toLowerCase().trim();
  return INACTIVE_KEYWORDS.some(kw => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------

/** Check if a single employee record is active */
export function isActiveEmployee(e: any): boolean {
  if (!e) return false;

  // Explicit boolean field
  const active = e.isActive ?? e.is_active ?? e.active;
  if (active === false) return false;

  // Status field
  const status = e.status ?? e.employeeStatus ?? e.employee_status ?? '';
  if (containsInactiveKeyword(status)) return false;

  // Name field — some orgs append "(Inactive)" or "(Terminated)" to the name
  const name = e.name ?? e.employeeName ?? e.employee_name ?? '';
  if (containsInactiveKeyword(name)) return false;

  return true;
}

/** Filter an array of employees to only active ones */
export function filterActiveEmployees<T = any>(employees: T[]): T[] {
  if (!Array.isArray(employees)) return [];
  return employees.filter(isActiveEmployee);
}

// ---------------------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------------------

/** Check if a single project record is active */
export function isActiveProject(p: any): boolean {
  if (!p) return false;

  // Explicit boolean field
  const active = p.isActive ?? p.is_active ?? p.active;
  if (active === false) return false;

  // Status field — skip "Completed" here; that's still a valid project.
  // Only filter truly dead projects.
  const status = p.status ?? p.projectStatus ?? p.project_status ?? '';
  if (containsInactiveKeyword(status)) return false;

  // Name field
  const name = p.name ?? p.projectName ?? p.project_name ?? '';
  if (containsInactiveKeyword(name)) return false;

  return true;
}

/** Filter an array of projects to only active ones */
export function filterActiveProjects<T = any>(projects: T[]): T[] {
  if (!Array.isArray(projects)) return [];
  return projects.filter(isActiveProject);
}
