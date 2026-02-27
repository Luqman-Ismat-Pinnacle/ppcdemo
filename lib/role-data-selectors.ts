/**
 * @fileoverview Role-scoped data selectors.
 *
 * Applies role lens constraints to project-scoped entities so role workstations
 * can consistently render scoped lists and aggregates.
 */

import { normalizeRoleKey } from '@/lib/role-navigation';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export function projectIdFromEntity(entity: unknown): string {
  const row = toRecord(entity);
  return asString(row.projectId ?? row.project_id ?? '');
}

export function selectRoleProjectIds(params: {
  role: string | null | undefined;
  projects: unknown[];
  currentUserEmail?: string | null;
}): string[] {
  const role = normalizeRoleKey(params.role);
  const projects = (params.projects || []).map(toRecord);

  if (role === 'product_owner' || role === 'pcl' || role === 'senior_manager' || role === 'coo') {
    return projects.map((project) => asString(project.id || project.projectId || project.project_id)).filter(Boolean);
  }

  const email = asString(params.currentUserEmail).toLowerCase();

  const assigned = projects
    .filter((project) => {
      if (!email) return true;
      const leadEmail = asString(project.projectLeadEmail || project.project_lead_email || '').toLowerCase();
      const pcaEmail = asString(project.pcaEmail || project.pca_email || '').toLowerCase();
      if (role === 'project_lead') return leadEmail ? leadEmail === email : true;
      if (role === 'pca') return pcaEmail ? pcaEmail === email : true;
      return true;
    })
    .map((project) => asString(project.id || project.projectId || project.project_id))
    .filter(Boolean);

  if (assigned.length === 0) {
    return projects
      .map((project) => asString(project.id || project.projectId || project.project_id))
      .filter(Boolean);
  }

  return assigned;
}

export function filterEntitiesByProjectScope<T>(entities: T[], allowedProjectIds: string[]): T[] {
  if (!allowedProjectIds.length) return entities;
  const set = new Set(allowedProjectIds);
  return (entities || []).filter((entity) => {
    const id = projectIdFromEntity(entity);
    return !id || set.has(id);
  });
}
