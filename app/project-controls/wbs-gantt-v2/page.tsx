'use client';

/**
 * @fileoverview Legacy WBS v2 route.
 *
 * Redirects to the canonical WBS/Gantt engine to avoid duplicate rendering stacks.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WbsGanttV2RedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/project-controls/wbs-gantt');
  }, [router]);

  return null;
}
