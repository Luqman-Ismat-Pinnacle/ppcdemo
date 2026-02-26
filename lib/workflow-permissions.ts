/**
 * @fileoverview Role workflow permission matrix.
 */

import type { RoleViewKey, WorkflowPermissions } from '@/types/role-workstation';
import { normalizeRoleKey } from '@/lib/role-navigation';

const NONE: WorkflowPermissions = {
  uploadPlans: false,
  publishPlans: false,
  editMapping: false,
  editWbs: false,
  annotateWbs: false,
  updateForecast: false,
  manageDocuments: false,
  submitCommitments: false,
  triageExceptions: false,
  viewPortfolioCompliance: false,
  queryAiBriefing: false,
};

export const ROLE_PERMISSION_MATRIX: Record<RoleViewKey, WorkflowPermissions> = {
  product_owner: {
    uploadPlans: true,
    publishPlans: true,
    editMapping: true,
    editWbs: true,
    annotateWbs: true,
    updateForecast: true,
    manageDocuments: true,
    submitCommitments: true,
    triageExceptions: true,
    viewPortfolioCompliance: true,
    queryAiBriefing: true,
  },
  pcl: {
    uploadPlans: true,
    publishPlans: true,
    editMapping: true,
    editWbs: true,
    annotateWbs: true,
    updateForecast: false,
    manageDocuments: true,
    submitCommitments: false,
    triageExceptions: true,
    viewPortfolioCompliance: true,
    queryAiBriefing: false,
  },
  pca: {
    uploadPlans: true,
    publishPlans: true,
    editMapping: true,
    editWbs: true,
    annotateWbs: true,
    updateForecast: false,
    manageDocuments: true,
    submitCommitments: false,
    triageExceptions: false,
    viewPortfolioCompliance: false,
    queryAiBriefing: false,
  },
  project_lead: {
    uploadPlans: false,
    publishPlans: false,
    editMapping: false,
    editWbs: true,
    annotateWbs: true,
    updateForecast: true,
    manageDocuments: true,
    submitCommitments: true,
    triageExceptions: false,
    viewPortfolioCompliance: false,
    queryAiBriefing: false,
  },
  senior_manager: {
    uploadPlans: false,
    publishPlans: false,
    editMapping: false,
    editWbs: false,
    annotateWbs: true,
    updateForecast: false,
    manageDocuments: true,
    submitCommitments: true,
    triageExceptions: true,
    viewPortfolioCompliance: true,
    queryAiBriefing: false,
  },
  coo: {
    uploadPlans: false,
    publishPlans: false,
    editMapping: false,
    editWbs: false,
    annotateWbs: true,
    updateForecast: false,
    manageDocuments: false,
    submitCommitments: true,
    triageExceptions: true,
    viewPortfolioCompliance: true,
    queryAiBriefing: true,
  },
  rda: {
    uploadPlans: false,
    publishPlans: false,
    editMapping: false,
    editWbs: false,
    annotateWbs: false,
    updateForecast: false,
    manageDocuments: false,
    submitCommitments: false,
    triageExceptions: false,
    viewPortfolioCompliance: false,
    queryAiBriefing: false,
  },
  client_portal: NONE,
};

export function getWorkflowPermissions(role: string | null | undefined): WorkflowPermissions {
  return ROLE_PERMISSION_MATRIX[normalizeRoleKey(role)] || NONE;
}

export function canPerformWorkflowAction(role: string | null | undefined, action: keyof WorkflowPermissions): boolean {
  return Boolean(getWorkflowPermissions(role)[action]);
}
