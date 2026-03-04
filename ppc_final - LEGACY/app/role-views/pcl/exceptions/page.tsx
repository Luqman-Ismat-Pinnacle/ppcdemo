'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';

type Severity = 'critical' | 'warning' | 'info';

type Alert = {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  related_project_id: string;
  status: string;
  created_at: string;
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_COLORS: Record<Severity, string> = { critical: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
const FILTER_OPTIONS: Array<{ label: string; value: Severity | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
];

function ageLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.66rem',
      fontWeight: 700,
      textTransform: 'capitalize',
      color,
      background: `${color}26`,
      borderRadius: 999,
      padding: '0.15rem 0.5rem',
      lineHeight: 1.4,
    }}>
      {severity}
    </span>
  );
}

export default function PclExceptionsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/alerts?status=open&limit=200', { cache: 'no-store' });
        const data = await res.json().catch(() => ({ alerts: [] }));
        if (!cancelled) setAlerts(data.alerts ?? []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const openAlerts = alerts.filter((a) => !acknowledged.has(a.id));
  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const warningCount = openAlerts.filter((a) => a.severity === 'warning').length;

  const visible = openAlerts
    .filter((a) => filter === 'all' || a.severity === filter)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  const handleAcknowledge = (id: string) => {
    setAcknowledged((prev) => new Set(prev).add(id));
  };

  const kpis = [
    { label: 'Total Open', value: openAlerts.length },
    { label: 'Critical', value: criticalCount, color: SEVERITY_COLORS.critical },
    { label: 'Warning', value: warningCount, color: SEVERITY_COLORS.warning },
  ];

  const btnBase: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    padding: '0.3rem 0.7rem',
    fontSize: '0.72rem',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  };

  return (
    <RoleWorkstationShell role="pcl" title="Exception Triage" subtitle="Review, acknowledge, and escalate portfolio-wide exceptions.">
      <div style={{ display: 'grid', gap: '0.75rem' }}>

        <CommandCenterSection title="Summary" status={loading ? 'Loading…' : `${openAlerts.length} open`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.5rem' }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem 0.65rem' }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>{k.label}</div>
                <div style={{ marginTop: 3, fontWeight: 800, fontSize: '1.1rem', color: k.color ?? 'var(--text-primary)' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </CommandCenterSection>

        <CommandCenterSection
          title="Exception Queue"
          status={loading ? 'Loading…' : `${visible.length} shown`}
          actions={
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  style={{
                    ...btnBase,
                    fontWeight: filter === opt.value ? 700 : 500,
                    background: filter === opt.value ? 'var(--bg-card)' : 'var(--bg-secondary)',
                    boxShadow: filter === opt.value ? '0 0 0 1.5px var(--text-muted)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>Loading exceptions…</div>
          ) : visible.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>No open exceptions.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {visible.map((alert) => (
                <div key={alert.id} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <SeverityBadge severity={alert.severity} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{alert.title}</span>
                    </div>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ageLabel(alert.created_at)}</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{alert.message}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Project {alert.related_project_id}</span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button style={btnBase} onClick={() => handleAcknowledge(alert.id)}>Acknowledge</button>
                      <Link href="/shared/wbs-gantt-v2" style={{ ...btnBase, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Go to Project</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
