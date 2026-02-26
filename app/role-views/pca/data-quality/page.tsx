'use client';

/**
 * @fileoverview PCA data quality issue triage page.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { DataQualityIssue, DataQualityTrendPoint } from '@/types/role-workstation';

type IssueSummary = {
  unmappedHours: number;
  missingScheduleDates: number;
  critical: number;
  warning: number;
  info: number;
  total: number;
};

export default function PcaDataQualityPage() {
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [trend, setTrend] = useState<DataQualityTrendPoint[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [loading, setLoading] = useState(false);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const severityQuery = severityFilter === 'all' ? '' : `&severity=${severityFilter}`;
      const res = await fetch(`/api/data-quality/issues?scope=assigned${severityQuery}`, {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setIssues(Array.isArray(payload.issues) ? payload.issues : []);
        setSummary(payload.summary || null);
        setTrend(Array.isArray(payload.trend) ? payload.trend : []);
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, severityFilter, user?.email]);

  const trendRows = useMemo(() => trend.slice(-8), [trend]);

  return (
    <RoleWorkstationShell
      role="pca"
      title="Data Quality"
      subtitle="Detect upstream data gaps and jump directly to mapping/WBS correction surfaces."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
        {[
          { label: 'Unmapped Hours', value: summary?.unmappedHours ?? 0 },
          { label: 'Missing Schedule Dates', value: summary?.missingScheduleDates ?? 0 },
          { label: 'Critical', value: summary?.critical ?? 0, danger: true },
          { label: 'Total Issues', value: summary?.total ?? 0 },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.62rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Severity</span>
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as 'all' | 'critical' | 'warning' | 'info')} style={{ padding: '0.42rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 150px 1fr 140px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Severity</span><span>Type</span><span>Issue</span><span>Actions</span>
        </div>
        {loading ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading issues...</div>
        ) : issues.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No active data quality issues in current scope.</div>
        ) : issues.map((issue) => (
          <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: '100px 150px 1fr 140px', gap: '0.55rem', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: issue.severity === 'critical' ? '#EF4444' : issue.severity === 'warning' ? '#F59E0B' : 'var(--text-muted)' }}>{issue.severity}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{issue.issueType}</span>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>{issue.title}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{issue.detail}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
              <Link href="/role-views/pca/mapping" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fix in Mapping</Link>
              <Link href="/role-views/pca/wbs" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fix in WBS</Link>
            </div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          8-Week Issue Trend
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 120px 120px 120px 120px 120px', padding: '0.45rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Week</span><span>Unmapped</span><span>Ghost</span><span>Stalled</span><span>Past Due</span><span>Total</span>
        </div>
        {trendRows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No trend points available.</div>
        ) : trendRows.map((point) => (
          <div key={point.weekKey} style={{ display: 'grid', gridTemplateColumns: '120px 120px 120px 120px 120px 120px', padding: '0.45rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{point.weekKey}</span>
            <span>{point.unmappedHours}</span>
            <span>{point.ghostProgress}</span>
            <span>{point.stalledTasks}</span>
            <span>{point.pastDueTasks}</span>
            <span>{point.totalIssues}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
