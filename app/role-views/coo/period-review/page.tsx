'use client';

import React, { useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';

type ScopeLevel = 'portfolio' | 'customer' | 'site' | 'project';

type PeriodReviewSummary = {
  scheduleVariance: {
    actualPercentComplete: number;
    plannedPercentComplete: number;
    deltaPercentPoints: number;
    deltaHours: number;
    evHours: number;
    pvHours: number;
  };
  periodHoursVariance: {
    plan: number;
    actual: number;
    added: number;
    reduced: number;
    deltaHours: number;
    deltaPct: number;
    fteEquivalent: number;
  };
  baselineVsActualVsRemaining: {
    baselineHours: number;
    actualHours: number;
    remainingHours: number;
  };
};

type PeriodReviewResponse = {
  success: boolean;
  scope: { level: ScopeLevel; id?: string | null };
  period: { granularity: 'month'; start: string; end: string };
  summary: PeriodReviewSummary;
};

function formatHours(value: number): string {
  if (!Number.isFinite(value)) return '0h';
  const rounded = Math.round(value);
  return `${rounded.toLocaleString()}h`;
}

export default function CooPeriodReviewPage() {
  const [payload, setPayload] = useState<PeriodReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/role-views/coo/period-review', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as PeriodReviewResponse;
        if (!cancelled && res.ok && json.success) setPayload(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const summary = payload?.summary;
  const periodLabel = useMemo(() => {
    if (!payload) return '';
    const { start, end } = payload.period;
    return `${start} – ${end}`;
  }, [payload]);

  return (
    <RoleWorkstationShell
      role="coo"
      title="COO Period Review"
      subtitle="Variance-first story of the current period: schedule, hours, and milestones."
    >
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Period</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{periodLabel || 'Current month'}</div>
          </div>
          {/* Simple v1 selectors; future iterations can add true period/scope controls. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span style={{ padding: '0.25rem 0.55rem', borderRadius: 999, border: '1px solid var(--border-color)' }}>
              Scope: {payload?.scope.level || 'portfolio'}
            </span>
          </div>
        </header>

        {/* Section 1: The Period Story — Summary Banner */}
        <section
          style={{
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            padding: '0.9rem',
            display: 'grid',
            gap: '0.6rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '0.95rem' }}>The Period Story</h2>
          {loading && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading period summary…</div>}
          {!loading && summary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                gap: '0.75rem',
                fontSize: '0.8rem',
              }}
            >
              {/* 1. Schedule Variance */}
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Schedule Variance
                </div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>
                  Actual {summary.scheduleVariance.actualPercentComplete.toFixed(1)}% vs Plan{' '}
                  {summary.scheduleVariance.plannedPercentComplete.toFixed(1)}%
                </div>
                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                  Δ {summary.scheduleVariance.deltaPercentPoints.toFixed(1)} pts ·{' '}
                  {summary.scheduleVariance.deltaHours >= 0 ? '+' : ''}
                  {Math.round(summary.scheduleVariance.deltaHours).toLocaleString()}h vs plan
                </div>
              </div>

              {/* 2. Period Hours Variance */}
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Period Hours Variance
                </div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>
                  Plan {formatHours(summary.periodHoursVariance.plan)} · Actual {formatHours(summary.periodHoursVariance.actual)}
                </div>
                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                  Added {formatHours(summary.periodHoursVariance.added)} ({summary.periodHoursVariance.deltaPct.toFixed(1)}%) · ≈{' '}
                  {summary.periodHoursVariance.fteEquivalent.toFixed(1)} FTE
                </div>
              </div>

              {/* 4. Baseline vs Actual vs Remaining */}
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Baseline vs Actual vs Remaining
                </div>
                <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>
                  {[
                    {
                      label: 'Baseline',
                      value: summary.baselineVsActualVsRemaining.baselineHours,
                      color: '#3B82F6',
                    },
                    {
                      label: 'Actual',
                      value: summary.baselineVsActualVsRemaining.actualHours,
                      color: '#22C55E',
                    },
                    {
                      label: 'Remaining',
                      value: summary.baselineVsActualVsRemaining.remainingHours,
                      color: '#F59E0B',
                    },
                  ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 70, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{row.label}</span>
                      <div
                        style={{
                          flex: 1,
                          position: 'relative',
                          height: 6,
                          borderRadius: 999,
                          background: 'var(--bg-secondary)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            background: row.color,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', minWidth: 70, textAlign: 'right' }}>
                        {formatHours(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {!loading && !summary && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No data available for the selected period.</div>
          )}
        </section>

        {/* Placeholder sections for future drill-down implementation, kept minimal for now. */}
        <section
          style={{
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            padding: '0.9rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Hours Variance Drill-Down</h2>
          <p style={{ marginTop: 6 }}>
            Detailed task, quality, and non-execute breakdowns for this period will appear here as the analytics pipeline is wired in.
          </p>
        </section>

        <section
          style={{
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            padding: '0.9rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Deliverable Count & Resourcing</h2>
          <p style={{ marginTop: 6 }}>
            Deliverable count variance, per-person hours variance, and talent review visuals will be added here, aligned with the PPTX design.
          </p>
        </section>
      </div>
    </RoleWorkstationShell>
  );
}

