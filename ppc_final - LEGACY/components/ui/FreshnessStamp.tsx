'use client';

import React from 'react';

export default function FreshnessStamp({
  timestamp,
  thresholdMinutes = 60,
}: {
  timestamp?: string | null;
  thresholdMinutes?: number;
}) {
  if (!timestamp) {
    return <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>as of unknown</span>;
  }

  const now = Date.now();
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts)) {
    return <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>as of unknown</span>;
  }

  const ageMin = Math.max(0, Math.round((now - ts) / 60000));
  const tone = ageMin <= thresholdMinutes
    ? '#10B981'
    : ageMin <= thresholdMinutes * 2
      ? '#F59E0B'
      : '#EF4444';

  const label = ageMin < 1
    ? 'just now'
    : ageMin < 60
      ? `${ageMin}m ago`
      : `${Math.round(ageMin / 60)}h ago`;

  return (
    <span style={{ fontSize: '0.68rem', color: tone, fontWeight: 700 }}>
      as of {label}
    </span>
  );
}
