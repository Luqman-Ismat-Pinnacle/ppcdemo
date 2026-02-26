'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function RdaHoursPage() {
  const { filteredData, data: fullData } = useData();
  const totalHours = useMemo(() => {
    const entries = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];
    return entries.reduce((sum, entry) => {
      const row = entry as Record<string, unknown>;
      const hours = Number(row.hours ?? row.quantity ?? 0);
      return sum + (Number.isFinite(hours) ? hours : 0);
    }, 0);
  }, [filteredData?.hours, fullData?.hours]);

  return (
    <RoleWorkstationShell role="rda" title="Hours Lane" subtitle="Timesheet and execution-hour visibility in the active role scope.">
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Hours in Scope</div>
        <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
      </div>
      <Link href="/insights/hours" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Hours View</Link>
    </RoleWorkstationShell>
  );
}
