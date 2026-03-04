'use client';

/**
 * @fileoverview Reusable compliance matrix table for PCL/SM/COO workstation surfaces.
 */

import React from 'react';

export type ComplianceMatrixRow = {
  projectId: string;
  projectName: string;
  openIssues: number;
  overdueTasks: number;
  healthScore: number;
};

export default function ComplianceMatrix({ rows }: { rows: ComplianceMatrixRow[] }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 120px 120px',
          padding: '0.5rem 0.7rem',
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span>Project</span><span>Open Issues</span><span>Overdue</span><span>Health</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No compliance rows returned.
        </div>
      ) : rows.map((row) => (
        <div
          key={row.projectId}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 120px 120px',
            padding: '0.55rem 0.7rem',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.76rem',
          }}
        >
          <span>{row.projectName}</span>
          <span>{row.openIssues}</span>
          <span>{row.overdueTasks}</span>
          <span>{row.healthScore}%</span>
        </div>
      ))}
    </div>
  );
}

