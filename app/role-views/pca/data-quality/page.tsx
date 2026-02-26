'use client';

/**
 * @fileoverview PCA data quality issue triage page.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';

type DataQualityIssue = {
  id: string;
  issueType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  projectId: string | null;
  sourceTable: string;
  sourceColumn: string | null;
  suggestedAction: string;
};

export default function PcaDataQualityPage() {
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/data-quality/issues?scope=assigned', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setIssues(Array.isArray(payload.issues) ? payload.issues : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <RoleWorkstationShell
      role="pca"
      title="Data Quality"
      subtitle="Detect upstream data gaps and jump directly to mapping/WBS correction surfaces."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {issues.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No active data quality issues in current scope.</div>
        ) : issues.map((issue) => (
          <div key={issue.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{issue.title}</div>
              <div style={{ fontSize: '0.68rem', color: issue.severity === 'critical' ? '#EF4444' : issue.severity === 'warning' ? '#F59E0B' : 'var(--text-muted)' }}>{issue.severity}</div>
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{issue.detail}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Source: {issue.sourceTable}{issue.sourceColumn ? `.${issue.sourceColumn}` : ''} · {issue.projectId ? `Project ${issue.projectId}` : 'Cross-project'}
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.45rem' }}>
              <Link href="/role-views/pca/mapping" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fix in Mapping</Link>
              <Link href="/role-views/pca/wbs" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fix in WBS</Link>
            </div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
