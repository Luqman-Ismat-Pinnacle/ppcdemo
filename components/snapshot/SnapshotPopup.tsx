'use client';

/**
 * Global Snapshot popup: create snapshot, compare, and deep variance (ingrained in app).
 * Create snapshots in-app; variance available everywhere via comparison snapshot.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { CreateSnapshotPayload } from '@/lib/data-context';
import { useSnapshotPopup } from '@/lib/snapshot-context';
import { useUser } from '@/lib/user-context';
import { VarianceVisual } from './VarianceVisual';

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString());
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c).toLocaleString()}`);

type TabId = 'overview' | 'create' | 'compare' | 'variance';

export default function SnapshotPopup() {
  const { isOpen, closeSnapshotPopup, comparisonSnapshotId, setComparisonSnapshotId } = useSnapshotPopup();
  const { filteredData: data, createSnapshot } = useData();
  const { user } = useUser();
  const [tab, setTab] = useState<TabId>('overview');
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<'baseline' | 'forecast' | 'manual'>('manual');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

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
  const compareSnapshot = comparisonSnapshotId ? snapshots.find((s: any) => (s.id || s.snapshotId) === comparisonSnapshotId) : null;

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

  const snapshotData = compareSnapshot?.snapshotData ?? compareSnapshot?.snapshot_data;
  const byProject = (snapshotData?.byProject || snapshotData?.by_project || []) as any[];
  const byPhase = (snapshotData?.byPhase || snapshotData?.by_phase || []) as any[];

  const handleCreateSnapshot = useCallback(async () => {
    const name = (createName || `Snapshot ${new Date().toLocaleDateString()}`).trim();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const tasks = data.tasks || [];
      const projects = data.projects || [];
      const phases = data.phases || [];
      let planHours = 0, planCost = 0, actualHours = 0, actualCost = 0;
      const byTask: CreateSnapshotPayload['byTask'] = [];
      const byProjectPayload: CreateSnapshotPayload['byProject'] = [];
      const byPhasePayload: CreateSnapshotPayload['byPhase'] = [];
      const projectMap = new Map<string, { planH: number; planC: number; actH: number; actC: number }>();
      const phaseMap = new Map<string, { planH: number; planC: number; actH: number; actC: number }>();

      tasks.forEach((t: any) => {
        const pH = Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
        const pC = Number(t.baselineCost ?? 0) || 0;
        const aH = Number(t.actualHours ?? t.actual_hours ?? 0) || 0;
        const aC = Number(t.actualCost ?? t.actual_cost ?? 0) || 0;
        planHours += pH;
        planCost += pC;
        actualHours += aH;
        actualCost += aC;
        const tid = t.id || t.taskId;
        const pid = t.projectId ?? t.project_id;
        const phid = t.phaseId ?? t.phase_id;
        if (tid) byTask.push({ taskId: tid, wbsCode: t.wbsCode || t.wbs_code || '', name: t.name || '', planHours: pH, actualHours: aH, planCost: pC, actualCost: aC });
        if (pid) {
          const cur = projectMap.get(pid) || { planH: 0, planC: 0, actH: 0, actC: 0 };
          cur.planH += pH; cur.planC += pC; cur.actH += aH; cur.actC += aC;
          projectMap.set(pid, cur);
        }
        if (phid) {
          const cur = phaseMap.get(phid) || { planH: 0, planC: 0, actH: 0, actC: 0 };
          cur.planH += pH; cur.planC += pC; cur.actH += aH; cur.actC += aC;
          phaseMap.set(phid, cur);
        }
      });
      projects.forEach((p: any) => {
        const pid = p.id || p.projectId;
        const row = projectMap.get(pid);
        if (row) byProjectPayload.push({ projectId: pid, name: p.name || pid, planHours: row.planH, actualHours: row.actH, planCost: row.planC, actualCost: row.actC });
      });
      phases.forEach((ph: any) => {
        const phid = ph.id || ph.phaseId;
        const row = phaseMap.get(phid);
        if (row) byPhasePayload.push({ phaseId: phid, name: ph.name || phid, planHours: row.planH, actualHours: row.actH, planCost: row.planC, actualCost: row.actC });
      });

      const payload: CreateSnapshotPayload = {
        versionName: name,
        snapshotType: createType,
        scope: 'all',
        notes: createNotes || null,
        createdBy: user?.name || 'User',
        metrics: {
          planHours,
          planCost,
          actualHours,
          actualCost,
          totalProjects: projects.length,
          totalTasks: tasks.length,
          totalEmployees: (data.employees || []).length,
        },
        byProject: byProjectPayload,
        byPhase: byPhasePayload,
        byTask: byTask.length <= 500 ? byTask : byTask.slice(0, 500),
      };
      const result = await createSnapshot(payload);
      if (result.success) {
        setCreateSuccess(`Snapshot "${name}" created.`);
        setCreateName('');
        setCreateNotes('');
        setTab('compare');
        if (result.id) setComparisonSnapshotId(result.id);
      } else {
        setCreateError(result.error || 'Failed to create snapshot');
      }
    } catch (e: any) {
      setCreateError(e?.message || 'Failed to create snapshot');
    } finally {
      setCreating(false);
    }
  }, [data, createName, createType, createNotes, user?.name, createSnapshot, setComparisonSnapshotId]);

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Current state' },
    { id: 'create', label: 'Create snapshot' },
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
          maxWidth: 960,
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
                Current view totals (filtered by date and hierarchy). Create a snapshot to compare later from the Create tab.
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

          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 420 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Capture the current view (filtered data) as a snapshot. You can compare any screen to this snapshot later.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={`Snapshot ${new Date().toLocaleDateString()}`}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Type</label>
                <select
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as 'baseline' | 'forecast' | 'manual')}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="manual">Manual</option>
                  <option value="baseline">Baseline</option>
                  <option value="forecast">Forecast</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes (optional)</label>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="e.g. Pre-go-live baseline"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                  }}
                />
              </div>
              {createError && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-error)' }}>{createError}</p>}
              {createSuccess && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-success)' }}>{createSuccess}</p>}
              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={creating}
                style={{
                  padding: '0.6rem 1rem',
                  background: 'var(--pinnacle-teal)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? 'Creating…' : 'Create snapshot'}
              </button>
            </div>
          )}

          {tab === 'compare' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Select a snapshot to compare against current state. This comparison applies across the whole app (every table and chart).
              </p>
              {snapshots.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No snapshots yet. Create one in the Create snapshot tab.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {snapshots.slice(0, 30).map((s: any) => {
                    const id = s.id || s.snapshotId;
                    const selected = comparisonSnapshotId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setComparisonSnapshotId(selected ? null : id)}
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
                <>
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
                      {snapshotTotals != null ? (
                        <VarianceVisual current={currentTotals.actualHours} snapshot={snapshotTotals.hours} kind="hours" visual="gauge" />
                      ) : (
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {variance.hoursDelta >= 0 ? '+' : ''}{fmtHrs(variance.hoursDelta)} ({variance.hoursPercent >= 0 ? '+' : ''}{variance.hoursPercent.toFixed(1)}% vs plan)
                        </div>
                      )}
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
                      {snapshotTotals != null ? (
                        <VarianceVisual current={currentTotals.actualCost} snapshot={snapshotTotals.cost} kind="cost" visual="gauge" />
                      ) : (
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: variance.costOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {variance.costDelta >= 0 ? '+' : ''}{fmtCost(variance.costDelta)} ({variance.costPercent >= 0 ? '+' : ''}{variance.costPercent.toFixed(1)}% vs plan)
                        </div>
                      )}
                    </div>
                  </div>
                  {byProject.length > 0 && (
                    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', overflow: 'auto', maxHeight: 220 }}>
                      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Variance by project</h4>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>Project</th>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Hours</th>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byProject.slice(0, 15).map((row: any) => {
                            const proj = (data.projects || []).find((p: any) => (p.id || p.projectId) === (row.projectId || row.project_id));
                            const name = row.name || proj?.name || row.projectId || '—';
                            const snapH = Number(row.actualHours ?? row.actual_hours ?? 0);
                            const snapC = Number(row.actualCost ?? row.actual_cost ?? 0);
                            const curH = (data.tasks || []).filter((t: any) => (t.projectId ?? t.project_id) === (row.projectId || row.project_id)).reduce((s: number, t: any) => s + (Number(t.actualHours ?? t.actual_hours) || 0), 0);
                            const curC = (data.tasks || []).filter((t: any) => (t.projectId ?? t.project_id) === (row.projectId || row.project_id)).reduce((s: number, t: any) => s + (Number(t.actualCost ?? t.actual_cost) || 0), 0);
                            return (
                              <tr key={row.projectId || row.project_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                                  <VarianceVisual current={curH} snapshot={snapH} kind="hours" inline />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                                  <VarianceVisual current={curC} snapshot={snapC} kind="cost" inline />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {byPhase.length > 0 && (
                    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', overflow: 'auto', maxHeight: 220 }}>
                      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Variance by phase</h4>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>Phase</th>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Hours</th>
                            <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byPhase.slice(0, 15).map((row: any) => {
                            const ph = (data.phases || []).find((p: any) => (p.id || p.phaseId) === (row.phaseId || row.phase_id));
                            const name = row.name || ph?.name || row.phaseId || '—';
                            const snapH = Number(row.actualHours ?? row.actual_hours ?? 0);
                            const snapC = Number(row.actualCost ?? row.actual_cost ?? 0);
                            const curH = (data.tasks || []).filter((t: any) => (t.phaseId ?? t.phase_id) === (row.phaseId || row.phase_id)).reduce((s: number, t: any) => s + (Number(t.actualHours ?? t.actual_hours) || 0), 0);
                            const curC = (data.tasks || []).filter((t: any) => (t.phaseId ?? t.phase_id) === (row.phaseId || row.phase_id)).reduce((s: number, t: any) => s + (Number(t.actualCost ?? t.actual_cost) || 0), 0);
                            return (
                              <tr key={row.phaseId || row.phase_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                                  <VarianceVisual current={curH} snapshot={snapH} kind="hours" inline />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                                  <VarianceVisual current={curC} snapshot={snapC} kind="cost" inline />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
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
