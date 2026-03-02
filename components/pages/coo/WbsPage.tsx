'use client';

import PclWbsPage from '@/components/pages/pcl/WbsPage';

export default function CooWbsPage() {
  return <PclWbsPage apiBase="/api/coo/wbs" roleHeader="COO" title="WBS Gantt (Executive Variance)" />;
}
