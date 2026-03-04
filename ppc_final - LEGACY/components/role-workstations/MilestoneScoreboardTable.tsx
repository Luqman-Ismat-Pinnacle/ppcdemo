'use client';

/**
 * @fileoverview Milestone scoreboard for role workstation milestone pages.
 */

import React from 'react';

type MilestoneRow = {
  id: string;
  name: string;
  dueDate?: string;
  status?: string;
  project?: string;
};

export default function MilestoneScoreboardTable({ rows }: { rows: MilestoneRow[] }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 120px', gap: '0.5rem', padding: '0.5rem 0.65rem', fontSize: '0.68rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
        <span>Milestone</span><span>Project</span><span>Due</span><span>Status</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No milestones in scope.</div>
      ) : rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 120px', gap: '0.5rem', padding: '0.52rem 0.65rem', fontSize: '0.73rem', borderBottom: '1px solid var(--border-color)' }}>
          <span>{row.name}</span>
          <span>{row.project || '-'}</span>
          <span>{row.dueDate || '-'}</span>
          <span>{row.status || '-'}</span>
        </div>
      ))}
    </div>
  );
}

