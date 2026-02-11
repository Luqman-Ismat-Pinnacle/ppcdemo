'use client';

/**
 * Snapshots & Variance — Modern variance-focused view.
 * Plan vs Actual with visuals; capture and compare snapshots.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';

const C = {
  teal: '#40E0D0',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  textPrimary: '#f4f4f5',
  textMuted: '#a1a1aa',
  border: '#3f3f46',
  bgCard: '#18181b',
  bgSecondary: '#141416',
};

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString());
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c).toLocaleString()}`);

export default function SnapshotsVariancePage() {
  const { filteredData: data } = useData();
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const tasks = data.tasks || [];
    let planHours = 0,
      planCost = 0,
      actualHours = 0,
      actualCost = 0;
    tasks.forEach((t: any) => {
      planHours += Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      planCost += Number(t.baselineCost ?? 0) || 0;
      actualHours += Number(t.actualHours ?? t.actual_hours ?? 0) || 0;
      actualCost += Number(t.actualCost ?? t.actual_cost ?? 0) || 0;
    });
    return { planHours, planCost, actualHours, actualCost };
  }, [data.tasks]);

  const variance = useMemo(() => {
    const hoursVar = totals.planHours ? ((totals.actualHours - totals.planHours) / totals.planHours) * 100 : 0;
    const costVar = totals.planCost ? ((totals.actualCost - totals.planCost) / totals.planCost) * 100 : 0;
    return {
      hoursPercent: hoursVar,
      costPercent: costVar,
      hoursOver: totals.actualHours > totals.planHours,
      costOver: totals.actualCost > totals.planCost,
    };
  }, [totals]);

  const snapshots = (data.snapshots || []) as any[];
  const compareSnapshot = compareSnapshotId ? snapshots.find((s: any) => (s.id || s.snapshotId) === compareSnapshotId) : null;

  return (
    <div className="page-panel" style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: C.textPrimary }}>Snapshots & Variance</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: C.textMuted }}>
          Plan vs actual at a glance. Capture snapshots to track variance over time.
        </p>
      </div>

      {/* Variance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: 4 }}>Planned hours</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.textPrimary }}>{fmtHrs(totals.planHours)}</div>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: 4 }}>Actual hours</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.teal }}>{fmtHrs(totals.actualHours)}</div>
          {totals.planHours > 0 && (
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: variance.hoursOver ? C.red : C.green }}>
              {variance.hoursOver ? '+' : ''}{variance.hoursPercent.toFixed(1)}% vs plan
            </div>
          )}
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: 4 }}>Planned cost</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.textPrimary }}>{fmtCost(totals.planCost)}</div>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: 4 }}>Actual cost</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.teal }}>{fmtCost(totals.actualCost)}</div>
          {totals.planCost > 0 && (
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: variance.costOver ? C.red : C.green }}>
              {variance.costOver ? '+' : ''}{variance.costPercent.toFixed(1)}% vs plan
            </div>
          )}
        </div>
      </div>

      {/* Plan vs Actual bar visual */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 600, color: C.textPrimary }}>Hours — Plan vs Actual</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 120 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, width: '100%', maxWidth: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.min(100, (totals.planHours / Math.max(totals.planHours, totals.actualHours, 1)) * 100)}%`,
                  minHeight: totals.planHours ? 8 : 0,
                  background: C.textMuted,
                  borderRadius: 6,
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: C.textMuted }}>Plan</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmtHrs(totals.planHours)}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, width: '100%', maxWidth: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.min(100, (totals.actualHours / Math.max(totals.planHours, totals.actualHours, 1)) * 100)}%`,
                  minHeight: totals.actualHours ? 8 : 0,
                  background: C.teal,
                  borderRadius: 6,
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: C.textMuted }}>Actual</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.teal }}>{fmtHrs(totals.actualHours)}</span>
          </div>
        </div>
      </div>

      {/* Saved snapshots list */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600, color: C.textPrimary }}>Saved snapshots</h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: C.textMuted }}>
          Create and manage snapshots in Data Management → Snapshots table. Select one below to compare variance.
        </p>
        {snapshots.length === 0 ? (
          <p style={{ margin: '16px 0 0', fontSize: '0.85rem', color: C.textMuted }}>No snapshots yet. Add rows in Data Management to capture baseline or forecast points.</p>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {snapshots.slice(0, 20).map((s: any) => {
              const id = s.id || s.snapshotId;
              const selected = compareSnapshotId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCompareSnapshotId(selected ? null : id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `1px solid ${selected ? C.teal : C.border}`,
                    background: selected ? `${C.teal}22` : C.bgSecondary,
                    color: selected ? C.teal : C.textPrimary,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {s.version_name || s.snapshotType || 'Snapshot'} · {s.snapshot_date ? new Date(s.snapshot_date).toLocaleDateString() : id}
                </button>
              );
            })}
          </div>
        )}
        {compareSnapshot && (
          <div style={{ marginTop: 16, padding: 12, background: C.bgSecondary, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: 8 }}>Comparing to: {compareSnapshot.version_name || compareSnapshot.snapshot_id}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem' }}>Hours: {fmtHrs(Number(compareSnapshot.total_hours) || 0)}</span>
              <span style={{ fontSize: '0.8rem' }}>Cost: {fmtCost(Number(compareSnapshot.total_cost) || 0)}</span>
              <span style={{ fontSize: '0.8rem', color: C.teal }}>
                Current variance: {fmtHrs(totals.actualHours - (Number(compareSnapshot.total_hours) || 0))} hrs · {fmtCost(totals.actualCost - (Number(compareSnapshot.total_cost) || 0))} cost
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
