'use client';

/**
 * Snapshots & Variance is now a global popup (header button).
 * Redirect old links to overview.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SnapshotsVarianceRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/insights/overview');
  }, [router]);
  return null;
}
