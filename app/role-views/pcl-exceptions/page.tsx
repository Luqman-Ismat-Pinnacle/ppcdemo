'use client';

/**
 * @fileoverview Legacy PCL exceptions route redirect.
 *
 * Canonical workstation exception queue now lives at /role-views/pcl/exceptions.
 */

import RolePageRedirect from '@/components/role-workstations/RolePageRedirect';

export default function PclExceptionsRedirectPage() {
  return <RolePageRedirect to="/role-views/pcl/exceptions" />;
}
