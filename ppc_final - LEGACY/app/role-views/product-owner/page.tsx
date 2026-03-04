'use client';

import React, { useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import RoleActivityTable from '@/components/command-center/RoleActivityTable';
import OffenderList from '@/components/command-center/OffenderList';

type PoSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  actions?: Record<string, { href: string; method: 'GET' | 'POST' | 'PATCH' }>;
  sections: {
    vitalSigns: {
      activeProjects: number;
      mappingCoverage: number;
      pipelineFreshness: string;
      openAlerts: number;
      commitmentCompliance: number;
      peopleActiveToday: number;
    };
    pipelineStatus: Array<{ key: string; label: string; ageLabel: string; status: string; summary: string }>;
    dataQuality: Array<{ name: string; value: number; target: number; note?: string }>;
    roleActivity: Array<{ role: string; users: number; lastActive: string; queueCount: number; topIssue: string }>;
    issues: {
      systemAlerts: number;
      userFeedback: Array<{ id: string; title: string; status: string; type: string }>;
      openFeatures: Array<{ id: string; title: string; severity: string; status: string; createdBy: string; createdAt: string }>;
    };
  };
};

function statusColor(status: string): string {
  if (status === 'ok') return '#10B981';
  if (status === 'warn') return '#F59E0B';
  return '#EF4444';
}

export default function ProductOwnerCommandCenterPage() {
  const [payload, setPayload] = useState<PoSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'alerts' | 'feedback'>('alerts');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/role-views/product-owner/summary', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(String(result.error || 'Failed to load summary'));
        if (!cancelled) setPayload(result as PoSummary);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const vitalCards = useMemo(() => {
    if (!payload) return [];
    const vital = payload.sections.vitalSigns;
    return [
      { label: 'Active Projects', value: vital.activeProjects },
      { label: 'Mapping Coverage %', value: `${vital.mappingCoverage}%` },
      { label: 'Data Pipeline Freshness', value: vital.pipelineFreshness },
      { label: 'Open Alerts', value: vital.openAlerts },
      { label: 'Commitment Compliance', value: `${vital.commitmentCompliance}%` },
      { label: 'People Active Today', value: vital.peopleActiveToday },
    ];
  }, [payload]);

  return (
    <RoleWorkstationShell role="product_owner" title="Product Owner Command Center" subtitle="System health, data reliability, and role-level operational visibility.">
      {error ? <div style={{ color: '#EF4444', fontSize: '0.78rem' }}>{error}</div> : null}
      {payload?.warnings?.length ? (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {payload.warnings.join(' ')}
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="Platform Vital Signs" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(var(--kpi-card-min-width), 1fr))', gap: '0.55rem' }}>
            {(loading ? [] : vitalCards).map((card) => (
              <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{card.label}</div>
                <div style={{ marginTop: 4, fontSize: '1.15rem', fontWeight: 800 }}>{card.value}</div>
              </div>
            ))}
            {loading ? <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Loading vital signs...</div> : null}
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="Data Pipeline Status">
            {loading ? <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Loading pipeline status...</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.45rem' }}>
                {payload?.sections.pipelineStatus.map((item) => (
                  <div key={item.key} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor(item.status) }}>{item.label}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{item.ageLabel}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{item.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </CommandCenterSection>
          <CommandCenterSection title="Data Quality Scorecard">
            {loading ? <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Loading scorecard...</div> : (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {payload?.sections.dataQuality.map((row) => (
                  <div key={row.name} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.35rem', fontSize: '0.72rem' }}>
                      <span>{row.name}</span>
                      <span>{row.value}% / {row.target}%</span>
                    </div>
                    {row.note ? <div style={{ marginTop: 2, fontSize: '0.64rem', color: 'var(--text-muted)' }}>{row.note}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </CommandCenterSection>
        </div>

        <CommandCenterSection title="Role Activity Monitor">
          <RoleActivityTable rows={payload?.sections.roleActivity || []} empty="No role activity data available." />
        </CommandCenterSection>

        <CommandCenterSection
          title="Open Issues and Feedback"
          actions={(
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" onClick={() => setTab('alerts')} style={{ fontSize: '0.66rem' }}>System Alerts</button>
              <button type="button" onClick={() => setTab('feedback')} style={{ fontSize: '0.66rem' }}>User Feedback</button>
            </div>
          )}
        >
          {tab === 'alerts' ? (
            <OffenderList
              rows={[{ id: 'alerts', label: 'Open unacknowledged alert events', value: payload?.sections.issues.systemAlerts || 0, href: '/role-views/product-owner/system-health' }]}
              empty="No system alerts."
            />
          ) : (
            <OffenderList
              rows={(payload?.sections.issues.openFeatures || []).slice(0, 12).map((row) => ({
                id: row.id,
                label: row.title,
                value: row.status,
                href: '/feedback',
              }))}
              empty="No open feature feedback items."
            />
          )}
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
