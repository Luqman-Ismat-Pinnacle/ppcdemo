/**
 * @fileoverview Maps role keys to WBS capability envelopes.
 */

import { normalizeRoleKey } from '@/lib/role-navigation';
import type { RoleViewKey, WbsRoleCapabilities } from '@/types/role-workstation';

export const WBS_CAPABILITIES: Record<RoleViewKey, WbsRoleCapabilities> = {
  product_owner: {
    canEditStructure: true,
    canEditDependencies: true,
    canEditProgress: true,
    canEditAssignments: true,
    canAnnotate: true,
    canEscalate: true,
    scope: 'portfolio',
  },
  pcl: {
    canEditStructure: true,
    canEditDependencies: true,
    canEditProgress: true,
    canEditAssignments: true,
    canAnnotate: true,
    canEscalate: true,
    scope: 'portfolio',
  },
  pca: {
    canEditStructure: true,
    canEditDependencies: true,
    canEditProgress: true,
    canEditAssignments: true,
    canAnnotate: true,
    canEscalate: false,
    scope: 'assigned_projects',
  },
  project_lead: {
    canEditStructure: true,
    canEditDependencies: true,
    canEditProgress: true,
    canEditAssignments: true,
    canAnnotate: true,
    canEscalate: true,
    scope: 'owned_projects',
  },
  senior_manager: {
    canEditStructure: false,
    canEditDependencies: false,
    canEditProgress: false,
    canEditAssignments: false,
    canAnnotate: true,
    canEscalate: true,
    scope: 'portfolio',
  },
  coo: {
    canEditStructure: false,
    canEditDependencies: false,
    canEditProgress: false,
    canEditAssignments: false,
    canAnnotate: true,
    canEscalate: true,
    scope: 'portfolio',
  },
  rda: {
    canEditStructure: false,
    canEditDependencies: false,
    canEditProgress: true,
    canEditAssignments: false,
    canAnnotate: false,
    canEscalate: false,
    scope: 'project',
  },
  client_portal: {
    canEditStructure: false,
    canEditDependencies: false,
    canEditProgress: false,
    canEditAssignments: false,
    canAnnotate: false,
    canEscalate: false,
    scope: 'project',
  },
};

export function getWbsCapabilities(role: string | null | undefined): WbsRoleCapabilities {
  return WBS_CAPABILITIES[normalizeRoleKey(role)] || WBS_CAPABILITIES.project_lead;
}
