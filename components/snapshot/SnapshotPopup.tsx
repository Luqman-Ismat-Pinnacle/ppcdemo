'use client';

/**
 * Global Snapshot popup: capture current state, compare snapshots, variance (ingrained in app).
 * Opened from header; variance is inside this popup, not a separate page.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import { useSnapshotPopup } from '@/lib/snapshot-context';

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString());
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c).toLocaleString()}`);

type TabId = 'overview' | 'compare' | 'variance';

export default function SnapshotPopup() {
  const { isOpen, closeSnapshotPopup } = useSnapshotPopup();
  const { filteredData: data } = useData();
  const [tab, setTab] = useState<TabId>('overview');
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);

  const currentTotals = useMemo(() => {
    const tasks = data.tasks || [];
    let planHours = 0, planCost = 0, actualHours = 0, actualCost = 0;
    tasks.forEach((t: any) => {
      planHours += Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      planCost += Number(t.baselineCost ?? 0) || 0;
      actualHours += Number(t.actualHours ?? t.actual_hours ?? 0) || 0;
      actualCost += Number(t.actualCost ?? t.actual_cost ?? 0) || 0;
    });
    return { planHours, planCost, actualHours, actualCost };
  }, [data.tasks]);

  const snapshots = (data.snapshots || []) as any[];
  const compareSnapshot = compareSnapshotId ? snapshots.find((s: any) => (s.id || s.snapshotId) === compareSnapshotId) : null;

  const snapshotTotals = useMemo(() => {
    if (!compareSnapshot) return null;
    const hours = Number(compareSnapshot.total_hours) || 0;
    const cost = Number(compareSnapshot.total_cost) || 0;
    return { hours, cost };
  }, [compareSnapshot]);

  const variance = useMemo(() => {
    const baseHours = snapshotTotals?.hours ?? currentTotals.planHours;
    const baseCost = snapshotTotals?.cost ?? currentTotals.planCost;
    if (baseHours === 0 && baseCost === 0) return null;
    const hoursVar = baseHours ? ((currentTotals.actualHours - baseHours) / baseHours) * 100 : 0;
    const costVar = baseCost ? ((currentTotals.actualCost - baseCost) / baseCost) * 100 : 0;
    return {
      hoursPercent: hoursVar,
      costPercent: costVar,
      hoursDelta: currentTotals.actualHours - baseHours,
      costDelta: currentTotals.actualCost - baseCost,
      hoursOver: currentTotals.actualHours > baseHours,
      costOver: currentTotals.actualCost > baseCost,
    };
  }, [currentTotals, snapshotTotals]);

  const maxHours = Math.max(currentTotals.planHours, currentTotals.actualHours, snapshotTotals?.hours ?? 0, 1);
  const maxCost = Math.max(currentTotals.planCost, currentTotals.actualCost, snapshotTotals?.cost ?? 0, 1);

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Current state' },
    { id: 'compare', label: 'Snapshots' },
    { id: 'variance', label: 'Variance' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--radius-lg)',
      }}
      onClick={closeSnapshotPopup}
    >
      <div
        role="dialog"
        aria-labelledby="snapshot-popup-title"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: 820,
          width: '100%',
          maxHeight: '88vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 id="snapshot-popup-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Snapshots & variance
          </h2>
          <button
            type="button"
            onClick={closeSnapshotPopup}
            aria-label="Close"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1rem', gap: 0, flexShrink: 0 }}>
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: tab === id ? '2px solid var(--pinnacle-teal)' : '2px solid transparent',
                color: tab === id ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
                fontWeight: tab === id ? 600 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: '1.25rem', overflow: 'auto', flex: 1, minHeight: 0 }}>
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Current view totals (filtered by date and hierarchy). Capture a snapshot in Data Management to compare later.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                {[
                  { label: 'Planned hours', value: fmtHrs(currentTotals.planHours), color: 'var(--text-primary)' },
                  { label: 'Actual hours', value: fmtHrs(currentTotals.actualHours), color: 'var(--pinnacle-teal)' },
                  { label: 'Planned cost', value: fmtCost(currentTotals.planCost), color: 'var(--text-primary)' },
                  { label: 'Actual cost', value: fmtCost(currentTotals.actualCost), color: 'var(--pinnacle-teal)' },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTab('variance')}
                style={{
                  padding: '0.6rem 1rem',
                  background: 'var(--pinnacle-teal)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                View variance
              </button>
            </div>
          )}

          {tab === 'compare' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Select a snapshot to compare against current state. Snapshots are managed in Data Management → Snapshots.
              </p>
              {snapshots.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No snapshots yet. Add rows in Data Management to capture baselines.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {snapshots.slice(0, 30).map((s: any) => {
                    const id = s.id || s.snapshotId;
                    const selected = compareSnapshotId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCompareSnapshotId(selected ? null : id)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${selected ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                          background: selected ? 'rgba(64, 224, 208, 0.12)' : 'var(--bg-tertiary)',
                          color: selected ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)',
                        }}
                      >
                        {s.version_name || s.snapshotType || 'Snapshot'} · {s.snapshot_date ? new Date(s.snapshot_date).toLocaleDateString() : id}
                      </button>
                    );
                  })}
                </div>
              )}
              {compareSnapshot && (
                <div style={{ marginTop: 8, padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Comparing to: {compareSnapshot.version_name || compareSnapshot.snapshot_id}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem' }}>Hours: {fmtHrs(Number(compareSnapshot.total_hours) || 0)}</span>
                    <span style={{ fontSize: '0.85rem' }}>Cost: {fmtCost(Number(compareSnapshot.total_cost) || 0)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('variance')}
                    style={{
                      marginTop: 10,
                      padding: '0.5rem 0.75rem',
                      background: 'var(--pinnacle-teal)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Show variance
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'variance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {compareSnapshot && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Comparing current state vs <strong style={{ color: 'var(--text-primary)' }}>{compareSnapshot.version_name || compareSnapshot.snapshot_id}</strong>
                </p>
              )}
              {!compareSnapshot && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Variance: plan vs actual. Select a snapshot in the Snapshots tab to compare against that baseline.
                </p>
              )}

              {/* Hours comparison bar */}
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Hours</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 100 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.min(100, (currentTotals.planHours / maxHours) * 100)}%`,
                          minHeight: currentTotals.planHours ? 6 : 0,
                          background: 'var(--text-muted)',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Plan</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmtHrs(currentTotals.planHours)}</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.min(100, (currentTotals.actualHours / maxHours) * 100)}%`,
                          minHeight: currentTotals.actualHours ? 6 : 0,
                          background: 'var(--pinnacle-teal)',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Actual</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)' }}>{fmtHrs(currentTotals.actualHours)}</span>
                  </div>
                  {snapshotTotals != null && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.min(100, (snapshotTotals.hours / maxHours) * 100)}%`,
                            minHeight: snapshotTotals.hours ? 6 : 0,
                            background: 'var(--pinnacle-lime)',
                            borderRadius: 6,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Snapshot</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-lime)' }}>{fmtHrs(snapshotTotals.hours)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cost comparison bar */}
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Cost</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 100 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.min(100, (currentTotals.planCost / maxCost) * 100)}%`,
                          minHeight: currentTotals.planCost ? 6 : 0,
                          background: 'var(--text-muted)',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Plan</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmtCost(currentTotals.planCost)}</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.min(100, (currentTotals.actualCost / maxCost) * 100)}%`,
                          minHeight: currentTotals.actualCost ? 6 : 0,
                          background: 'var(--pinnacle-teal)',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Actual</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-teal)' }}>{fmtCost(currentTotals.actualCost)}</span>
                  </div>
                  {snapshotTotals != null && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.min(100, (snapshotTotals.cost / maxCost) * 100)}%`,
                            minHeight: snapshotTotals.cost ? 6 : 0,
                            background: 'var(--pinnacle-lime)',
                            borderRadius: 6,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Snapshot</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pinnacle-lime)' }}>{fmtCost(snapshotTotals.cost)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Variance summary cards */}
              {variance && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div
                    style={{
                      padding: '1rem',
                      background: variance.hoursOver ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      border: `1px solid ${variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)'}`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hours variance</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                      {variance.hoursDelta >= 0 ? '+' : ''}{fmtHrs(variance.hoursDelta)} ({variance.hoursPercent >= 0 ? '+' : ''}{variance.hoursPercent.toFixed(1)}%)
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '1rem',
                      background: variance.costOver ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      border: `1px solid ${variance.costOver ? 'var(--color-error)' : 'var(--color-success)'}`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cost variance</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: variance.costOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                      {variance.costDelta >= 0 ? '+' : ''}{fmtCost(variance.costDelta)} ({variance.costPercent >= 0 ? '+' : ''}{variance.costPercent.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setTab('compare')}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--pinnacle-teal)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                {compareSnapshot ? 'Change snapshot' : 'Select snapshot to compare'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
