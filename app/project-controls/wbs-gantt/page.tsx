'use client';

/**
 * @fileoverview Legacy WBS route shim.
 *
 * Redirects to the active WBS/Gantt V2 page while preserving query params.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function WbsGanttRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    router.replace(query ? `/project-controls/wbs-gantt-v2?${query}` : '/project-controls/wbs-gantt-v2');
  }, [router, searchParams]);

  return null;
}

