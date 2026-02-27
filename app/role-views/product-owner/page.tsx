'use client';

/**
 * @fileoverview Product Owner command center.
 *
 * Platform-level command center for data quality, operational pipeline health,
 * alerts/feedback triage, and cross-role visibility.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import SectionHeader from '@/components/ui/SectionHeader';
import type { MetricContract } from '@/lib/metrics/contracts';

type Summary = {
  activeProjects: number;
  activePeople: number;
  mappingCoverage: number;
  plansCurrentPct: number;
  openAlerts: number;
  criticalAlerts: number;
  commitmentRate: number;
  openFeatures: number;
};

type FeatureRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  createdByName: string;
  createdAt: string;
};

type DataQualityRow = {
  metric: string;
  current: number;
  target: number;
};

type RoleRow = {
  role: string;
  users: number;
  lastActive: string;
  bellCount: number;
  topIssue: string;
};

type PulseRow = {
  id: string;
  name: string;
  projects: number;
  health: number;
  criticalAlerts: number;
};

type PipelineCard = {
  key: string;
  label: string;
  lastRunAt: string;
  ageHours: number | null;
  status: 'ok' | 'warn' | 'bad';
  detail: string;
};

type OpenIssues = {
  alerts: number;
  feedback: Array<Record<string, unknown>>;
  anomalies: Array<Record<string, unknown>>;
};

type PoPayload = {
  success: boolean;
  computedAt?: string;
  periodKey: string;
  metrics?: MetricContract[];
  summary: Summary;
  features: FeatureRow[];
  roles: RoleRow[];
  pipeline: PipelineCard[];
  dataQuality: DataQualityRow[];
  portfolioPulse: PulseRow[];
  openIssues: OpenIssues;
};

function colorForMetric(current: number, target: number): string {
  if (current >= target) return '#10B981';
  if (current >= target * 0.8) return '#F59E0B';
  return '#EF4444';
}

function formatSince(iso: string, hours: number | null): string {
  if (!iso) return 'No run history';
  if (hours === null) return new Date(iso).toLocaleString();
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ProductOwnerCommandCenterPage() {
  const [payload, setPayload] = useState<PoPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueTab, setIssueTab] = useState<'alerts' | 'feedback' | 'anomalies'>('alerts');
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/role-views/product-owner/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load Product Owner summary');
      setPayload(result as PoPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Product Owner summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(async (key: 'workday' | 'alerts' | 'mapping') => {
    setRunningAction(key);
    try {
      if (key === 'workday') {
        await fetch('/api/workday', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncType: 'unified', hoursDaysBack: 14 }),
        });
      }
      if (key === 'alerts') {
        await fetch('/api/alerts/scan', { method: 'POST' });
      }
      if (key === 'mapping') {
        await fetch('/api/data/mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generateMappingSuggestions', minConfidence: 0.78, limit: 200 }),
        });
      }
      await load();
    } finally {
      setRunningAction(null);
    }
  }, [load]);

  const cards = useMemo(() => {
    const summary = payload?.summary;
    if (!summary) return [];
    const metricsById = new Map((payload?.metrics || []).map((metric) => [metric.metricId, metric]));
    return [
      { label: 'Active Projects', value: metricsById.get('po_active_projects')?.value ?? summary.activeProjects },
      { label: 'People in System', value: metricsById.get('po_people_in_system')?.value ?? summary.activePeople },
      { label: 'Mapping Coverage', value: `${metricsById.get('po_mapping_coverage')?.value ?? summary.mappingCoverage}%`, tone: colorForMetric(summary.mappingCoverage, 85) },
      { label: 'Plans Current', value: `${metricsById.get('po_plans_current')?.value ?? summary.plansCurrentPct}%`, tone: colorForMetric(summary.plansCurrentPct, 90) },
      { label: 'Open Alerts', value: metricsById.get('po_open_alerts')?.value ?? summary.openAlerts, tone: summary.openAlerts === 0 ? '#10B981' : summary.openAlerts <= 5 ? '#F59E0B' : '#EF4444' },
      { label: 'Commitment Rate', value: `${metricsById.get('po_commitment_rate')?.value ?? summary.commitmentRate}%`, tone: colorForMetric(summary.commitmentRate, 80) },
    ];
  }, [payload?.metrics, payload?.summary]);

  const features = payload?.features || [];
  const roles = payload?.roles || [];
  const pipeline = payload?.pipeline || [];
  const quality = payload?.dataQuality || [];
  const pulse = payload?.portfolioPulse || [];

  return (
    <RoleWorkstationShell
      role="product_owner"
      requiredTier="tier1"
      title="Product Owner Command Center"
      subtitle="Platform health, quality posture, issue queues, and role activity."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={runningAction !== null}
            onClick={() => { void runAction('workday'); }}
            style={{ fontSize: '0.72rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '0.35rem 0.55rem' }}
          >
            {runningAction === 'workday' ? 'Running Workday Sync...' : 'Run Workday Sync'}
          </button>
          <button
            type="button"
            disabled={runningAction !== null}
            onClick={() => { void runAction('alerts'); }}
            style={{ fontSize: '0.72rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '0.35rem 0.55rem' }}
          >
            {runningAction === 'alerts' ? 'Running Alert Engine...' : 'Run Alert Engine'}
          </button>
          <button
            type="button"
            disabled={runningAction !== null}
            onClick={() => { void runAction('mapping'); }}
            style={{ fontSize: '0.72rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '0.35rem 0.55rem' }}
          >
            {runningAction === 'mapping' ? 'Refreshing Suggestions...' : 'Refresh Suggestions'}
          </button>
          <Link href="/project-controls/data-management" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Open Data Management</Link>
        </div>
      )}
    >
      {error ? <div style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <SectionHeader title="Tier-1 Platform KPIs" timestamp={payload?.computedAt || null} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(var(--kpi-card-min-width), 1fr))', gap: '0.65rem' }}>
          {cards.map((card) => (
            <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{card.label}</div>
              <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: card.tone || 'var(--text-primary)' }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Data Pipeline Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem', padding: '0.7rem' }}>
              {pipeline.map((card) => (
                <div key={card.key} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: card.status === 'ok' ? '#10B981' : card.status === 'warn' ? '#F59E0B' : '#EF4444' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>{formatSince(card.lastRunAt, card.ageHours)}</div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: 3 }}>{card.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Open Features (Feedback Items)</div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '0.72rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading features...</div>
              ) : features.length === 0 ? (
                <div style={{ padding: '0.72rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open features found.</div>
              ) : features.map((feature) => (
                <div key={feature.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px', gap: '0.4rem', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feature.title}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{feature.status}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{feature.createdByName || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Data Quality</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 90px 70px', gap: '0.35rem 0.55rem', padding: '0.55rem 0.7rem', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Metric</span><span style={{ color: 'var(--text-muted)' }}>Current</span><span style={{ color: 'var(--text-muted)' }}>Target</span><span style={{ color: 'var(--text-muted)' }}>Status</span>
              {quality.map((row) => (
                <React.Fragment key={row.metric}>
                  <span>{row.metric}</span>
                  <span>{row.current.toFixed(1)}%</span>
                  <span>{row.target}%</span>
                  <span style={{ color: colorForMetric(row.current, row.target), fontWeight: 700 }}>{row.current >= row.target ? 'OK' : row.current >= row.target * 0.8 ? 'WARN' : 'RISK'}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Role Activity Monitor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 130px', gap: '0.35rem 0.55rem', padding: '0.55rem 0.7rem', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Role</span><span style={{ color: 'var(--text-muted)' }}>Users</span><span style={{ color: 'var(--text-muted)' }}>Top Issue</span>
              {roles.map((row) => (
                <React.Fragment key={row.role}>
                  <span>{row.role}</span>
                  <span>{row.users}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.topIssue}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Portfolio Pulse</div>
          <div style={{ display: 'grid', gap: '0.4rem', padding: '0.65rem' }}>
            {pulse.map((row) => (
              <div key={row.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem', display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{row.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Health {row.health.toFixed(0)}/100 · {row.projects} projects · {row.criticalAlerts} critical alerts
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {(['alerts', 'feedback', 'anomalies'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setIssueTab(tab)}
                style={{
                  border: issueTab === tab ? '1px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
                  borderRadius: 999,
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.68rem',
                  color: issueTab === tab ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                  background: 'transparent',
                }}
              >
                {tab === 'alerts' ? 'System Alerts' : tab === 'feedback' ? 'User Feedback' : 'Data Anomalies'}
              </button>
            ))}
          </div>

          <div style={{ padding: '0.7rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            {issueTab === 'alerts' ? (
              <div>Open alerts in queue: <strong>{payload?.openIssues.alerts || 0}</strong></div>
            ) : null}
            {issueTab === 'feedback' ? (
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {(payload?.openIssues.feedback || []).slice(0, 20).map((row, index) => (
                  <div key={`${String(row.id || index)}`} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem 0.55rem' }}>
                    <div style={{ fontWeight: 600 }}>{String(row.title || 'Feedback')}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{String(row.itemType || 'item')} · {String(row.status || 'open')} · {String(row.createdByName || 'Unknown')}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {issueTab === 'anomalies' ? (
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {(payload?.openIssues.anomalies || []).slice(0, 20).map((row, index) => (
                  <div key={`${String(row.id || index)}`} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem 0.55rem' }}>
                    <div style={{ fontWeight: 600 }}>{String(row.issue || 'Anomaly')}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{String(row.name || row.projectId || row.id || '')}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
