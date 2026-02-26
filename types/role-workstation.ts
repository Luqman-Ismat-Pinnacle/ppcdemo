/**
 * @fileoverview Canonical role workstation contracts.
 *
 * Defines normalized role keys, navigation models, and capability flags used by
 * route shells, action bars, and server/client permission checks.
 */

export type RoleViewKey =
  | 'product_owner'
  | 'pcl'
  | 'pca'
  | 'project_lead'
  | 'senior_manager'
  | 'coo'
  | 'rda'
  | 'client_portal';

export interface RolePreset {
  key: RoleViewKey;
  label: string;
  dashboardRoute: string;
  description: string;
}

export interface RoleNavItem {
  label: string;
  href: string;
  description?: string;
}

export interface RoleNavConfig {
  role: RoleViewKey;
  title: string;
  items: RoleNavItem[];
}

export interface WorkflowPermissions {
  uploadPlans: boolean;
  publishPlans: boolean;
  editMapping: boolean;
  editWbs: boolean;
  annotateWbs: boolean;
  updateForecast: boolean;
  manageDocuments: boolean;
  submitCommitments: boolean;
  triageExceptions: boolean;
  viewPortfolioCompliance: boolean;
  queryAiBriefing: boolean;
}

export interface WbsRoleCapabilities {
  canEditStructure: boolean;
  canEditDependencies: boolean;
  canEditProgress: boolean;
  canEditAssignments: boolean;
  canAnnotate: boolean;
  canEscalate: boolean;
  scope: 'portfolio' | 'assigned_projects' | 'owned_projects' | 'project';
}
