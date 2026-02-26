'use client';

/**
 * @fileoverview Legacy PCA workspace route redirect.
 *
 * Canonical mapping workstation now lives at /role-views/pca/mapping.
 */

import RolePageRedirect from '@/components/role-workstations/RolePageRedirect';

export default function PcaWorkspaceRedirectPage() {
  return <RolePageRedirect to="/role-views/pca/mapping" />;
}
