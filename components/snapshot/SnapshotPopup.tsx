'use client';

/**
 * Enhanced Snapshot Popup — redesigned with better UX, timeline view,
 * guided creation, and improved variance analysis.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import type { CreateSnapshotPayload } from '@/lib/data-context';
import { useSnapshotPopup } from '@/lib/snapshot-context';
import { useUser } from '@/lib/user-context';
import { VarianceVisual } from './VarianceVisual';

const fmtHrs = (h: number) => (h >= 1000 ? `${(h / 1000).toFixed(1)}K` : h.toLocaleString());
const fmtCost = (c: number) => (c >= 1000 ? `$${(c / 1000).toFixed(1)}K` : `$${Math.round(c).toLocaleString()}`);

type TabId = 'overview' | 'create' | 'compare' | 'variance' | 'remaining';

/* ── Icon helpers ─────────────────────────────────────────────────── */
const IconCamera = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;
const IconTimeline = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
const IconChart = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
const IconPlus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IconTable = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /></svg>;

/* ── Time-ago helper ──────────────────────────────────────────────── */
function timeAgo(d: string | Date) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── Type badge helper ────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = { baseline: '#3B82F6', forecast: '#8B5CF6', manual: '#6B7280' };
  const c = colors[type] || '#6B7280';
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: `${c}20`, color: c, border: `1px solid ${c}40` }}>
      {type}
    </span>
  );
}

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
  const [varSearch, setVarSearch] = useState('');

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
    return { hours: Number(compareSnapshot.total_hours) || 0, cost: Number(compareSnapshot.total_cost) || 0 };
  }, [compareSnapshot]);

  const variance = useMemo(() => {
    const baseHours = snapshotTotals?.hours ?? currentTotals.planHours;
    const baseCost = snapshotTotals?.cost ?? currentTotals.planCost;
    if (baseHours === 0 && baseCost === 0) return null;
    const hoursVar = baseHours ? ((currentTotals.actualHours - baseHours) / baseHours) * 100 : 0;
    const costVar = baseCost ? ((currentTotals.actualCost - baseCost) / baseCost) * 100 : 0;
    return {
      hoursPercent: hoursVar, costPercent: costVar,
      hoursDelta: currentTotals.actualHours - baseHours,
      costDelta: currentTotals.actualCost - baseCost,
      hoursOver: currentTotals.actualHours > baseHours,
      costOver: currentTotals.actualCost > baseCost,
    };
  }, [currentTotals, snapshotTotals]);

  const snapshotData = compareSnapshot?.snapshotData ?? compareSnapshot?.snapshot_data;
  const byProject = (snapshotData?.byProject || snapshotData?.by_project || []) as any[];
  const byPhase = (snapshotData?.byPhase || snapshotData?.by_phase || []) as any[];
  const byTask = (snapshotData?.byTask || snapshotData?.by_task || []) as any[];

  const remainingReviewRows = useMemo(() => {
    const tasks = (data.tasks || []) as any[];
    const projectNameById = new Map<string, string>();
    (data.projects || []).forEach((p: any) => {
      projectNameById.set(String(p.id || p.projectId), String(p.name || p.projectName || p.id || p.projectId || 'Unknown'));
    });
    const snapshotByTaskId = new Map<string, any>();
    byTask.forEach((row: any) => {
      const tid = String(row.taskId || row.task_id || '');
      if (tid) snapshotByTaskId.set(tid, row);
    });

    return tasks.map((t: any) => {
      const taskId = String(t.id || t.taskId || '');
      const projectId = String(t.projectId || t.project_id || '');
      const taskName = String(t.name || t.taskName || taskId || 'Unknown Task');
      const baselineHours = Number(t.baselineHours ?? t.budgetHours ?? 0) || 0;
      const actualHours = Number(t.actualHours ?? t.actual_hours ?? 0) || 0;
      const remainingHours = Math.max(0, baselineHours - actualHours);
      const snap = snapshotByTaskId.get(taskId);
      const snapPlan = Number(snap?.planHours ?? snap?.plan_hours ?? baselineHours) || 0;
      const snapActual = Number(snap?.actualHours ?? snap?.actual_hours ?? 0) || 0;
      const snapshotRemaining = Math.max(0, snapPlan - snapActual);
      const delta = remainingHours - snapshotRemaining;
      return {
        projectName: projectNameById.get(projectId) || projectId || 'Unassigned',
        taskId,
        taskName,
        baselineHours,
        actualHours,
        remainingHours,
        snapshotRemaining,
        delta,
      };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [data.tasks, data.projects, byTask]);

  const remainingReviewSummary = useMemo(() => {
    const totals = remainingReviewRows.reduce((acc, row) => {
      acc.current += row.remainingHours;
      acc.snapshot += row.snapshotRemaining;
      acc.delta += row.delta;
      if (Math.abs(row.delta) >= 8) acc.flagged += 1;
      return acc;
    }, { current: 0, snapshot: 0, delta: 0, flagged: 0 });
    return totals;
  }, [remainingReviewRows]);

  const handleExportRemainingCSV = useCallback(() => {
    const header = ['Project', 'Task ID', 'Task', 'Baseline Hrs', 'Actual Hrs', 'Remaining Hrs', 'Snapshot Remaining Hrs', 'Delta Hrs'];
    const rows = remainingReviewRows.map((row) => [
      row.projectName,
      row.taskId,
      row.taskName,
      row.baselineHours.toFixed(2),
      row.actualHours.toFixed(2),
      row.remainingHours.toFixed(2),
      row.snapshotRemaining.toFixed(2),
      row.delta.toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remaining-hours-review-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [remainingReviewRows]);

  // ── Sorted snapshots for timeline ──
  const sortedSnapshots = useMemo(() =>
    [...snapshots].sort((a: any, b: any) => new Date(b.snapshot_date || b.created_at || 0).getTime() - new Date(a.snapshot_date || a.created_at || 0).getTime()),
    [snapshots]
  );

  const handleCreateSnapshot = useCallback(async () => {
    const name = (createName || `Snapshot ${new Date().toLocaleDateString()}`).trim();
    setCreating(true); setCreateError(null); setCreateSuccess(null);
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
        planHours += pH; planCost += pC; actualHours += aH; actualCost += aC;
        const tid = t.id || t.taskId;
        const pid = t.projectId ?? t.project_id;
        const phid = t.phaseId ?? t.phase_id;
        if (tid) byTask.push({ taskId: tid, wbsCode: t.wbsCode || t.wbs_code || '', name: t.name || '', planHours: pH, actualHours: aH, planCost: pC, actualCost: aC });
        if (pid) { const cur = projectMap.get(pid) || { planH: 0, planC: 0, actH: 0, actC: 0 }; cur.planH += pH; cur.planC += pC; cur.actH += aH; cur.actC += aC; projectMap.set(pid, cur); }
        if (phid) { const cur = phaseMap.get(phid) || { planH: 0, planC: 0, actH: 0, actC: 0 }; cur.planH += pH; cur.planC += pC; cur.actH += aH; cur.actC += aC; phaseMap.set(phid, cur); }
      });
      projects.forEach((p: any) => { const pid = p.id || p.projectId; const row = projectMap.get(pid); if (row) byProjectPayload.push({ projectId: pid, name: p.name || pid, planHours: row.planH, actualHours: row.actH, planCost: row.planC, actualCost: row.actC }); });
      phases.forEach((ph: any) => { const phid = ph.id || ph.phaseId; const row = phaseMap.get(phid); if (row) byPhasePayload.push({ phaseId: phid, name: ph.name || phid, planHours: row.planH, actualHours: row.actH, planCost: row.planC, actualCost: row.actC }); });

      const payload: CreateSnapshotPayload = {
        versionName: name, snapshotType: createType, scope: 'all',
        notes: createNotes || null, createdBy: user?.name || 'User',
        metrics: { planHours, planCost, actualHours, actualCost, totalProjects: projects.length, totalTasks: tasks.length, totalEmployees: (data.employees || []).length },
        byProject: byProjectPayload, byPhase: byPhasePayload,
        byTask: byTask.length <= 500 ? byTask : byTask.slice(0, 500),
      };
      const result = await createSnapshot(payload);
      if (result.success) {
        setCreateSuccess(`Snapshot "${name}" created.`);
        setCreateName(''); setCreateNotes(''); setTab('compare');
        if (result.id) setComparisonSnapshotId(result.id);
      } else { setCreateError(result.error || 'Failed to create snapshot'); }
    } catch (e: any) { setCreateError(e?.message || 'Failed to create snapshot'); }
    finally { setCreating(false); }
  }, [data, createName, createType, createNotes, user?.name, createSnapshot, setComparisonSnapshotId]);

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <IconChart /> },
    { id: 'create', label: 'Create', icon: <IconPlus /> },
    { id: 'compare', label: 'Timeline', icon: <IconTimeline /> },
    { id: 'variance', label: 'Variance', icon: <IconCamera /> },
    { id: 'remaining', label: 'Remaining Review', icon: <IconTable /> },
  ];

  /* ── Shared styles ────────────────────────────────────────────── */
  const cardStyle: React.CSSProperties = { background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem' };
  const labelStyle: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontWeight: 600 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.88rem', transition: 'border-color 0.2s' };
  const btnPrimary: React.CSSProperties = { padding: '0.6rem 1.25rem', background: 'var(--pinnacle-teal)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' };
  const btnSecondary: React.CSSProperties = { padding: '0.5rem 0.85rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }} onClick={closeSnapshotPopup}>
      <div role="dialog" aria-labelledby="snapshot-popup-title" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, maxWidth: 1000, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 id="snapshot-popup-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>📸 Snapshots & Variance</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Capture, compare & track changes over time</p>
          </div>
          <button type="button" onClick={closeSnapshotPopup} aria-label="Close" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', width: 36, height: 36, borderRadius: 8, fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1rem', gap: 0, flexShrink: 0 }}>
          {tabs.map(({ id, label, icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: '0.7rem 1rem', background: 'none', border: 'none', borderBottom: tab === id ? '2.5px solid var(--pinnacle-teal)' : '2.5px solid transparent', color: tab === id ? 'var(--pinnacle-teal)' : 'var(--text-muted)', fontWeight: tab === id ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ padding: '1.25rem', overflow: 'auto', flex: 1, minHeight: 0 }}>

          {/* ═══ OVERVIEW TAB ═══ */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* What are snapshots? — guidance for first-time users */}
              {snapshots.length === 0 && (
                <div style={{ ...cardStyle, background: 'rgba(64,224,208,0.06)', border: '1px solid rgba(64,224,208,0.2)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--pinnacle-teal)', marginBottom: 6 }}>👋 Get Started with Snapshots</div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Snapshots capture the current state of all your project data — hours, costs, and progress. Create a snapshot to establish a <strong style={{ color: 'var(--text-primary)' }}>baseline</strong>, then compare against it anytime to see how things have changed.
                  </p>
                  <button type="button" onClick={() => setTab('create')} style={{ ...btnPrimary, marginTop: 12 }}>Create your first snapshot</button>
                </div>
              )}

              {/* Comparison panel */}
              <div style={{ ...labelStyle }}>Snapshot vs Current</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'stretch' }}>
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ ...labelStyle }}>Snapshot (baseline)</div>
                  {compareSnapshot ? (
                    <>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{fmtHrs(snapshotTotals?.hours ?? 0)} hrs</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{fmtCost(snapshotTotals?.cost ?? 0)}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TypeBadge type={compareSnapshot.snapshot_type || compareSnapshot.snapshotType || 'manual'} />
                        {compareSnapshot.version_name || compareSnapshot.versionName || 'Snapshot'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>— No snapshot selected</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 0.5rem', minWidth: 60 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>vs</div>
                  {variance && compareSnapshot && (
                    <>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)' }}>{variance.hoursPercent >= 0 ? '+' : ''}{variance.hoursPercent.toFixed(0)}% hrs</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: variance.costOver ? 'var(--color-error)' : 'var(--color-success)' }}>{variance.costPercent >= 0 ? '+' : ''}{variance.costPercent.toFixed(0)}% cost</span>
                    </>
                  )}
                </div>
                <div style={{ ...cardStyle, border: '2px solid var(--pinnacle-teal)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ ...labelStyle }}>Current</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{fmtHrs(currentTotals.actualHours)} hrs</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--pinnacle-teal)' }}>{fmtCost(currentTotals.actualCost)}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!compareSnapshot ? (
                  <button type="button" onClick={() => setTab('compare')} style={btnPrimary}>Select snapshot to compare</button>
                ) : (
                  <button type="button" onClick={() => setTab('variance')} style={btnPrimary}>Full variance analysis →</button>
                )}
                <button type="button" onClick={() => setTab('create')} style={btnSecondary}>+ Create new</button>
              </div>

              {/* Current totals grid */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Current view totals (filtered)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
                  {[
                    { label: 'Planned hours', value: fmtHrs(currentTotals.planHours) },
                    { label: 'Actual hours', value: fmtHrs(currentTotals.actualHours), accent: true },
                    { label: 'Planned cost', value: fmtCost(currentTotals.planCost) },
                    { label: 'Actual cost', value: fmtCost(currentTotals.actualCost), accent: true },
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{ ...cardStyle, padding: '0.65rem' }}>
                      <div style={{ ...labelStyle }}>{label}</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--pinnacle-teal)' : 'var(--text-primary)' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ CREATE TAB ═══ */}
          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 480 }}>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {['Name', 'Type', 'Notes', 'Confirm'].map((step, i) => (
                  <React.Fragment key={step}>
                    {i > 0 && <div style={{ width: 20, height: 1, background: 'var(--border-color)' }} />}
                    <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-tertiary)', fontWeight: 600, color: 'var(--text-secondary)' }}>{i + 1}. {step}</span>
                  </React.Fragment>
                ))}
              </div>

              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Capture the current filtered view as a snapshot. You can compare any page to this snapshot later for variance analysis.
              </p>

              {/* Live preview */}
              <div style={{ ...cardStyle, background: 'rgba(64,224,208,0.04)', border: '1px solid rgba(64,224,208,0.15)' }}>
                <div style={{ ...labelStyle, color: 'var(--pinnacle-teal)' }}>Preview — what will be captured</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.78rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Tasks:</span> <strong>{(data.tasks || []).length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Projects:</span> <strong>{(data.projects || []).length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Hours:</span> <strong>{fmtHrs(currentTotals.actualHours)}</strong></div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Snapshot Name</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={`Snapshot ${new Date().toLocaleDateString()}`} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['manual', 'baseline', 'forecast'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setCreateType(t)} style={{
                      flex: 1, padding: '0.55rem', borderRadius: 8, cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s',
                      background: createType === t ? 'rgba(64,224,208,0.12)' : 'var(--bg-tertiary)',
                      border: createType === t ? '2px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
                      color: createType === t ? 'var(--pinnacle-teal)' : 'var(--text-primary)',
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes (optional)</label>
                <textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} placeholder="e.g. Pre-go-live baseline" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {createError && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-error)', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{createError}</p>}
              {createSuccess && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-success)', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: 6 }}>✓ {createSuccess}</p>}
              <button type="button" onClick={handleCreateSnapshot} disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.7 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}>
                {creating ? 'Creating…' : '📸 Create Snapshot'}
              </button>
            </div>
          )}

          {/* ═══ TIMELINE / COMPARE TAB ═══ */}
          {tab === 'compare' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Snapshot Timeline</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} · Select one to compare across the app</div>
                </div>
                <button type="button" onClick={() => setTab('create')} style={{ ...btnSecondary, fontSize: '0.75rem' }}>+ New snapshot</button>
              </div>

              {sortedSnapshots.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: '2.5rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No snapshots yet</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>Create your first snapshot to start tracking changes.</div>
                  <button type="button" onClick={() => setTab('create')} style={btnPrimary}>Create snapshot</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                  {/* Timeline line */}
                  <div style={{ position: 'absolute', left: 15, top: 12, bottom: 12, width: 2, background: 'var(--border-color)', zIndex: 0 }} />
                  {sortedSnapshots.slice(0, 30).map((s: any) => {
                    const id = s.id || s.snapshotId;
                    const selected = comparisonSnapshotId === id;
                    const date = s.snapshot_date || s.created_at;
                    const name = s.version_name || s.versionName || s.snapshotType || 'Snapshot';
                    const type = s.snapshot_type || s.snapshotType || 'manual';
                    const notes = s.notes || '';
                    const hrs = Number(s.total_hours) || 0;
                    const cost = Number(s.total_cost) || 0;
                    const createdBy = s.created_by || s.createdBy || '';
                    return (
                      <button key={id} type="button" onClick={() => setComparisonSnapshotId(selected ? null : id)} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.85rem 1rem 0.85rem 2.5rem', borderRadius: 10, border: selected ? '2px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
                        background: selected ? 'rgba(64,224,208,0.08)' : 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', position: 'relative', zIndex: 1, marginBottom: 6, width: '100%',
                      }}>
                        {/* Timeline dot */}
                        <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', background: selected ? 'var(--pinnacle-teal)' : 'var(--bg-Secondary)', border: `3px solid ${selected ? 'var(--pinnacle-teal)' : 'var(--border-color)'}` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: selected ? 'var(--pinnacle-teal)' : 'var(--text-primary)' }}>{name}</span>
                            <TypeBadge type={type} />
                            {selected && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(64,224,208,0.2)', color: 'var(--pinnacle-teal)' }}>ACTIVE</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {date && <span>{new Date(date).toLocaleDateString()} · {timeAgo(date)}</span>}
                            {createdBy && <span>by {createdBy}</span>}
                            <span>{fmtHrs(hrs)} hrs · {fmtCost(cost)}</span>
                          </div>
                          {notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>"{notes}"</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {compareSnapshot && (
                <button type="button" onClick={() => setTab('variance')} style={{ ...btnPrimary, alignSelf: 'flex-start' }}>View variance analysis →</button>
              )}
            </div>
          )}

          {/* ═══ VARIANCE TAB ═══ */}
          {tab === 'variance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {compareSnapshot ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Comparing vs <strong style={{ color: 'var(--text-primary)' }}>{compareSnapshot.version_name || compareSnapshot.snapshot_id}</strong></p>
                  <button type="button" onClick={() => setTab('compare')} style={btnSecondary}>Change snapshot</button>
                </div>
              ) : (
                <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.88rem', fontWeight: 600 }}>No snapshot selected</p>
                  <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select a snapshot to see detailed variance breakdown.</p>
                  <button type="button" onClick={() => setTab('compare')} style={btnPrimary}>Select snapshot</button>
                </div>
              )}

              {/* Variance gauges */}
              {variance && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div style={{ padding: '1rem', background: variance.hoursOver ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)'}`, borderRadius: 10 }}>
                    <div style={{ ...labelStyle }}>Hours Variance</div>
                    {snapshotTotals != null ? (
                      <VarianceVisual current={currentTotals.actualHours} snapshot={snapshotTotals.hours} kind="hours" visual="gauge" />
                    ) : (
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: variance.hoursOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                        {variance.hoursDelta >= 0 ? '+' : ''}{fmtHrs(variance.hoursDelta)} ({variance.hoursPercent >= 0 ? '+' : ''}{variance.hoursPercent.toFixed(1)}%)
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '1rem', background: variance.costOver ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${variance.costOver ? 'var(--color-error)' : 'var(--color-success)'}`, borderRadius: 10 }}>
                    <div style={{ ...labelStyle }}>Cost Variance</div>
                    {snapshotTotals != null ? (
                      <VarianceVisual current={currentTotals.actualCost} snapshot={snapshotTotals.cost} kind="cost" visual="gauge" />
                    ) : (
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: variance.costOver ? 'var(--color-error)' : 'var(--color-success)' }}>
                        {variance.costDelta >= 0 ? '+' : ''}{fmtCost(variance.costDelta)} ({variance.costPercent >= 0 ? '+' : ''}{variance.costPercent.toFixed(1)}%)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Variance by project/phase — with search */}
              {(byProject.length > 0 || byPhase.length > 0) && (
                <input type="text" value={varSearch} onChange={e => setVarSearch(e.target.value)} placeholder="🔍 Search projects or phases…" style={{ ...inputStyle, maxWidth: 320 }} />
              )}

              {byProject.length > 0 && (
                <div style={{ ...cardStyle, overflow: 'auto', maxHeight: 240 }}>
                  <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', fontWeight: 700 }}>Variance by Project</h4>
                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>Project</th>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Hours Δ</th>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Cost Δ</th>
                    </tr></thead>
                    <tbody>
                      {byProject.filter((row: any) => {
                        if (!varSearch) return true;
                        const n = (row.name || '').toLowerCase();
                        return n.includes(varSearch.toLowerCase());
                      }).slice(0, 20).map((row: any) => {
                        const proj = (data.projects || []).find((p: any) => (p.id || p.projectId) === (row.projectId || row.project_id));
                        const name = row.name || proj?.name || row.projectId || '—';
                        const snapH = Number(row.actualHours ?? row.actual_hours ?? 0);
                        const snapC = Number(row.actualCost ?? row.actual_cost ?? 0);
                        const curH = (data.tasks || []).filter((t: any) => (t.projectId ?? t.project_id) === (row.projectId || row.project_id)).reduce((s: number, t: any) => s + (Number(t.actualHours ?? t.actual_hours) || 0), 0);
                        const curC = (data.tasks || []).filter((t: any) => (t.projectId ?? t.project_id) === (row.projectId || row.project_id)).reduce((s: number, t: any) => s + (Number(t.actualCost ?? t.actual_cost) || 0), 0);
                        return (
                          <tr key={row.projectId || row.project_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</td>
                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}><VarianceVisual current={curH} snapshot={snapH} kind="hours" inline /></td>
                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}><VarianceVisual current={curC} snapshot={snapC} kind="cost" inline /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {byPhase.length > 0 && (
                <div style={{ ...cardStyle, overflow: 'auto', maxHeight: 240 }}>
                  <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', fontWeight: 700 }}>Variance by Phase</h4>
                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>Phase</th>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Hours Δ</th>
                      <th style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Cost Δ</th>
                    </tr></thead>
                    <tbody>
                      {byPhase.filter((row: any) => {
                        if (!varSearch) return true;
                        return (row.name || '').toLowerCase().includes(varSearch.toLowerCase());
                      }).slice(0, 20).map((row: any) => {
                        const ph = (data.phases || []).find((p: any) => (p.id || p.phaseId) === (row.phaseId || row.phase_id));
                        const name = row.name || ph?.name || row.phaseId || '—';
                        const snapH = Number(row.actualHours ?? row.actual_hours ?? 0);
                        const snapC = Number(row.actualCost ?? row.actual_cost ?? 0);
                        const curH = (data.tasks || []).filter((t: any) => (t.phaseId ?? t.phase_id) === (row.phaseId || row.phase_id)).reduce((s: number, t: any) => s + (Number(t.actualHours ?? t.actual_hours) || 0), 0);
                        const curC = (data.tasks || []).filter((t: any) => (t.phaseId ?? t.phase_id) === (row.phaseId || row.phase_id)).reduce((s: number, t: any) => s + (Number(t.actualCost ?? t.actual_cost) || 0), 0);
                        return (
                          <tr key={row.phaseId || row.phase_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</td>
                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}><VarianceVisual current={curH} snapshot={snapH} kind="hours" inline /></td>
                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}><VarianceVisual current={curC} snapshot={snapC} kind="cost" inline /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ REMAINING HOURS REVIEW TAB ═══ */}
          {tab === 'remaining' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Remaining Hours Review</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    RH review spreadsheet for platform operations
                    {compareSnapshot ? ` · compared to ${compareSnapshot.version_name || compareSnapshot.versionName || 'selected snapshot'}` : ' · snapshot comparison optional'}
                  </div>
                </div>
                <button type="button" onClick={handleExportRemainingCSV} style={btnPrimary}>Export CSV</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: '0.6rem' }}>
                <div style={cardStyle}>
                  <div style={labelStyle}>Current Remaining</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmtHrs(Math.round(remainingReviewSummary.current))}h</div>
                </div>
                <div style={cardStyle}>
                  <div style={labelStyle}>Snapshot Remaining</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{fmtHrs(Math.round(remainingReviewSummary.snapshot))}h</div>
                </div>
                <div style={cardStyle}>
                  <div style={labelStyle}>Net Delta</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: remainingReviewSummary.delta > 0 ? 'var(--color-error)' : remainingReviewSummary.delta < 0 ? 'var(--color-success)' : 'var(--text-primary)' }}>
                    {remainingReviewSummary.delta > 0 ? '+' : ''}{fmtHrs(Math.round(remainingReviewSummary.delta))}h
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={labelStyle}>Flagged Rows (|Δ| ≥ 8h)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--pinnacle-teal)' }}>{remainingReviewSummary.flagged}</div>
                </div>
              </div>

              <div style={{ ...cardStyle, overflow: 'auto', maxHeight: 420 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Project</th>
                      <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Task</th>
                      <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>BL Hrs</th>
                      <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Act Hrs</th>
                      <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Remaining</th>
                      <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Snap Remaining</th>
                      <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remainingReviewRows.slice(0, 250).map((row) => (
                      <tr key={row.taskId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.projectName}</td>
                        <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.taskName}>{row.taskName}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row.baselineHours.toFixed(1)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row.actualHours.toFixed(1)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row.remainingHours.toFixed(1)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row.snapshotRemaining.toFixed(1)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 700, color: row.delta > 0 ? 'var(--color-error)' : row.delta < 0 ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                          {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                    {remainingReviewRows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No task rows available for remaining-hours review.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
