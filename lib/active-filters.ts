/**
 * @fileoverview Shared utilities for filtering inactive employees and projects.
 *
 * IMPORTANT BEHAVIOR (per user requirements):
 * - Only respect the explicit boolean flags from Data Management / Workday:
 *     isActive / is_active / active
 * - Do NOT try to infer inactivity from status or name text like "terminated" or "inactive".
 *
 * In short: if the row is explicitly marked inactive in Data Management, it is hidden
 * everywhere else in the app; otherwise it is treated as active.
 *
 * Usage:
 *   import { isActiveEmployee, isActiveProject, filterActiveEmployees, filterActiveProjects } from '@/lib/active-filters';
 */

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------

/** Check if a single employee record is active */
export function isActiveEmployee(e: any): boolean {
  if (!e) return false;

  // Explicit boolean field from Data Management / Workday
  const active = e.isActive ?? e.is_active ?? e.active;
  // Only treat explicitly-false values as inactive; everything else is active.
  return active !== false;
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

  // Explicit boolean field from Data Management / Workday
  const active = p.isActive ?? p.is_active ?? p.active;
  // Only treat explicitly-false values as inactive; everything else is active.
  return active !== false;
}

/** Filter an array of projects to only active ones */
export function filterActiveProjects<T = any>(projects: T[]): T[] {
  if (!Array.isArray(projects)) return [];
  return projects.filter(isActiveProject);
}
