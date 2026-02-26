'use client';

/**
 * @fileoverview Client redirect helper for role routes.
 *
 * Redirects legacy role wrapper routes to native app routes so role lens applies
 * to the real page surface instead of an embedded iframe container.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RolePageRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return null;
}
