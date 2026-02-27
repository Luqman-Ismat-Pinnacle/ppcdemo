'use client';

import React from 'react';

export type RoleActivityRow = {
  role: string;
  users: number;
  lastActive: string;
  queueCount: number;
  topIssue: string;
};

export default function RoleActivityTable({
  rows,
  empty,
}: {
  rows: RoleActivityRow[];
  empty: string;
}) {
  if (!rows.length) {
    return <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 170px 90px 1fr', gap: '0.3rem 0.45rem', fontSize: '0.72rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>Role</span>
      <span style={{ color: 'var(--text-muted)' }}>Users</span>
      <span style={{ color: 'var(--text-muted)' }}>Last Active</span>
      <span style={{ color: 'var(--text-muted)' }}>Queue</span>
      <span style={{ color: 'var(--text-muted)' }}>Top Issue</span>
      {rows.map((row) => (
        <React.Fragment key={row.role}>
          <span>{row.role}</span>
          <span>{row.users}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{row.lastActive || 'No activity'}</span>
          <span>{row.queueCount}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{row.topIssue}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
