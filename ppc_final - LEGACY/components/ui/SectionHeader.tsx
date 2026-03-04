'use client';

import React from 'react';
import FreshnessStamp from '@/components/ui/FreshnessStamp';

export default function SectionHeader({
  title,
  statusChip,
  timestamp,
  actions,
}: {
  title: string;
  statusChip?: React.ReactNode;
  timestamp?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </h3>
        {statusChip}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FreshnessStamp timestamp={timestamp} />
        {actions}
      </div>
    </div>
  );
}
