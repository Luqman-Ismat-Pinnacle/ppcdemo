'use client';

/**
 * @fileoverview Legacy role-views entrypoint.
 *
 * Redirects to the active role home so role context always maps to the
 * full app shell rather than a separate hub page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';

export default function RoleViewsRedirectPage() {
  const router = useRouter();
  const { activeRole } = useRoleView();

  useEffect(() => {
    router.replace(activeRole.dashboardRoute);
  }, [activeRole.dashboardRoute, router]);

  return null;
}
