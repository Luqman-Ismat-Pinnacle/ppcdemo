'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';

type WbsItem = {
  id: string;
  table_name: string;
  name: string;
  project_id: string;
  project_name: string;
  unit_name: string;
  phase_name: string;
  level: string;
  baseline_hours: number;
  actual_hours: number;
  remaining_hours: number;
  baseline_count: number;
  baseline_metric: string;
  baseline_uom: string;
  actual_count: number;
  actual_metric: string;
  actual_uom: string;
  actual_count_updated_at: string | null;
  percent_complete: number;
};

type Draft = {
  actual_count: number;
  actual_metric: string;
  actual_uom: string;
  remaining_hours: number;
};

type GuardrailFlag = {
  id: string;
  predicted: number;
  entered: number;
  comment: string;
};

type ProjectOption = { id: string; name: string };

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

const LEVEL_LABELS: Record<string, string> = { unit: 'Unit', phase: 'Phase', task: 'Task', sub_task: 'Sub-task' };
const LEVEL_ORDER: Record<string, number> = { unit: 0, phase: 1, task: 2, sub_task: 3 };

function predictRemaining(item: WbsItem, draftCount: number): number {
  const blCount = item.baseline_count || 0;
  const blHours = item.baseline_hours || 0;
  if (blCount <= 0 || blHours <= 0) return item.remaining_hours;

  const hoursPerUnit = blHours / blCount;
  const remaining = Math.max(0, blCount - draftCount) * hoursPerUnit;
  return Math.round(remaining * 10) / 10;
}

function paceBasedRemaining(item: WbsItem): number {
  const actH = item.actual_hours || 0;
  const actC = item.actual_count || 0;
  const blC = item.baseline_count || 0;
  if (actC <= 0 || blC <= 0 || actH <= 0) return item.remaining_hours;

  const pacePerUnit = actH / actC;
  const remaining = Math.max(0, blC - actC) * pacePerUnit;
  return Math.round(remaining * 10) / 10;
}

function staleDays(updatedAt: string | null): number {
  if (!updatedAt) return 999;
  const d = new Date(updatedAt);
  if (isNaN(d.getTime())) return 999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PLForecastPage() {
  const [items, setItems] = useState<WbsItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'unit' | 'phase' | 'task' | 'sub_task'>('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [guardrails, setGuardrails] = useState<Record<string, GuardrailFlag>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    fetch(`/api/project-lead/forecast-update?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setItems(d.items || []);
          setProjects(d.projects || []);
          setDrafts({});
          setGuardrails({});
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let rows = items;
    if (projectId) rows = rows.filter((r) => r.project_id === projectId);
    if (levelFilter !== 'all') rows = rows.filter((r) => r.level === levelFilter);
    return rows.sort((a, b) => {
      const pCmp = a.project_name.localeCompare(b.project_name);
      if (pCmp !== 0) return pCmp;
      return (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || a.name.localeCompare(b.name);
    });
  }, [items, projectId, levelFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const stale = filtered.filter((r) => staleDays(r.actual_count_updated_at) >= 14).length;
    const withCounts = filtered.filter((r) => r.baseline_count > 0).length;
    const avgProgress = total > 0 ? filtered.reduce((s, r) => s + r.percent_complete, 0) / total : 0;
    const totalBl = filtered.reduce((s, r) => s + r.baseline_hours, 0);
    const totalAct = filtered.reduce((s, r) => s + r.actual_hours, 0);
    const totalRem = filtered.reduce((s, r) => s + r.remaining_hours, 0);
    const dirtyCount = Object.keys(drafts).length;
    const guardrailCount = Object.keys(guardrails).length;
    return { total, stale, withCounts, avgProgress, totalBl, totalAct, totalRem, dirtyCount, guardrailCount };
  }, [filtered, drafts, guardrails]);

  const getDraft = (id: string, item: WbsItem): Draft => {
    return drafts[id] || {
      actual_count: item.actual_count,
      actual_metric: item.actual_metric,
      actual_uom: item.actual_uom || item.baseline_uom,
      remaining_hours: item.remaining_hours,
    };
  };

  const updateDraft = (id: string, item: WbsItem, patch: Partial<Draft>) => {
    const prev = getDraft(id, item);
    const next = { ...prev, ...patch };

    setDrafts((d) => ({ ...d, [id]: next }));

    const predicted = predictRemaining(item, next.actual_count);
    if (predicted > 0 && next.remaining_hours < predicted * 0.9) {
      setGuardrails((g) => ({
        ...g,
        [id]: {
          id,
          predicted,
          entered: next.remaining_hours,
          comment: g[id]?.comment || '',
        },
      }));
    } else {
      setGuardrails((g) => {
        const copy = { ...g };
        delete copy[id];
        return copy;
      });
    }
  };

  const applyAll = async () => {
    const dirtyIds = Object.keys(drafts);
    if (!dirtyIds.length) return;

    const unresolved = dirtyIds.filter((id) => guardrails[id] && !guardrails[id].comment.trim());
    if (unresolved.length > 0) {
      alert(`${unresolved.length} item(s) have remaining hours below predicted. Please provide a rationale for each before applying.`);
      return;
    }

    setSaving(true);
    setSuccessMsg('');

    const updates = dirtyIds.map((id) => {
      const d = drafts[id];
      const item = items.find((i) => i.id === id);
      return {
        id,
        table_name: item?.table_name || 'tasks',
        actual_count: d.actual_count,
        actual_metric: d.actual_metric,
        actual_uom: d.actual_uom,
        remaining_hours: d.remaining_hours,
      };
    });

    try {
      const res = await fetch('/api/project-lead/forecast-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_actuals', updates }),
      });
      const data = await res.json();

      if (data.success) {
        for (const id of dirtyIds) {
          const g = guardrails[id];
          if (g && g.comment.trim()) {
            const item = items.find((i) => i.id === id);
            await fetch('/api/project-lead/forecast-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'submit_guardrail',
                project_id: item?.project_id,
                record_table: item?.table_name,
                record_id: id,
                record_name: item?.name,
                predicted_hours: g.predicted,
                entered_hours: g.entered,
                pl_comment: g.comment,
              }),
            });
          }
        }

        setSuccessMsg(`Updated ${updates.length} item(s) successfully.`);
        loadData();
      }
    } catch {
      setSuccessMsg('Error applying updates.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Forecast Review</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={400} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Forecast Review</h1>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.85rem' }}>
        Update actual counts and remaining hours for each WBS item. The system calculates predicted remaining hours based on baseline count ratios and flags entries below predicted values.
      </p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <KpiCard label="WBS Items" value={stats.total} />
        <KpiCard label="With BL Counts" value={stats.withCounts} detail={`${stats.total > 0 ? Math.round((stats.withCounts / stats.total) * 100) : 0}% tracked`} />
        <KpiCard label="Stale (14d+)" value={stats.stale} color={stats.stale > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Avg Progress" value={`${stats.avgProgress.toFixed(1)}%`} color={stats.avgProgress >= 50 ? '#10b981' : '#f59e0b'} />
        <KpiCard label="Pending Changes" value={stats.dirtyCount} color={stats.dirtyCount > 0 ? '#6366f1' : '#94a3b8'} />
        <KpiCard label="Guardrail Flags" value={stats.guardrailCount} color={stats.guardrailCount > 0 ? '#ef4444' : '#10b981'} />
      </div>

      {/* Filters + Apply */}
      <div className="glass" style={{ padding: '0.6rem', marginBottom: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '0.72rem' }}>
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '0.72rem' }}>
          <option value="all">All Levels</option>
          <option value="unit">Units</option>
          <option value="phase">Phases</option>
          <option value="task">Tasks</option>
          <option value="sub_task">Sub-tasks</option>
        </select>
        <div style={{ flex: 1 }} />
        {successMsg && <span style={{ fontSize: '0.68rem', color: '#10b981' }}>{successMsg}</span>}
        <button
          onClick={applyAll}
          disabled={saving || stats.dirtyCount === 0}
          style={{
            background: stats.dirtyCount > 0 ? 'rgba(59,130,246,.25)' : 'rgba(59,130,246,.1)',
            border: '1px solid rgba(59,130,246,.5)',
            color: stats.dirtyCount > 0 ? '#bfdbfe' : '#64748b',
            borderRadius: 6, padding: '0.35rem 0.7rem', cursor: stats.dirtyCount > 0 ? 'pointer' : 'default', fontSize: '0.72rem',
          }}
        >
          {saving ? 'Applying...' : `Apply ${stats.dirtyCount} Update${stats.dirtyCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Hours summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div className="glass" style={{ padding: '0.55rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Baseline Hours</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>{Math.round(stats.totalBl).toLocaleString()}</div>
        </div>
        <div className="glass" style={{ padding: '0.55rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Actual Hours</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>{Math.round(stats.totalAct).toLocaleString()}</div>
        </div>
        <div className="glass" style={{ padding: '0.55rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Remaining Hours</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>{Math.round(stats.totalRem).toLocaleString()}</div>
        </div>
      </div>

      {/* WBS table */}
      <div className="glass" style={{ padding: '0.6rem' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.72rem' }}>
            No WBS items found. Select a project or adjust filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}>
                  {['', 'Name', 'Level', 'Project', 'BL Hrs', 'Act Hrs', 'Rem Hrs', 'BL Count', 'BL Metric', 'UOM', 'Act Count', 'Act Metric', 'Rem Hrs (you)', 'Predicted', 'Pace', 'Last Updated', '% Complete'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.4rem', textAlign: ['Name', 'Level', 'Project', 'BL Metric', 'UOM', 'Act Metric', 'Last Updated'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.95)', zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const draft = getDraft(item.id, item);
                  const predicted = predictRemaining(item, draft.actual_count);
                  const pace = paceBasedRemaining(item);
                  const isDirty = !!drafts[item.id];
                  const gf = guardrails[item.id];
                  const stale = staleDays(item.actual_count_updated_at);
                  const expanded = expandedId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        style={{
                          borderBottom: '1px solid rgba(148,163,184,.06)',
                          background: gf ? 'rgba(239,68,68,0.06)' : isDirty ? 'rgba(99,102,241,0.04)' : undefined,
                        }}
                      >
                        <td style={{ padding: '0.3rem 0.35rem' }}>
                          <button
                            onClick={() => setExpandedId(expanded ? null : item.id)}
                            style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
                          >
                            {expanded ? '▾' : '▸'}
                          </button>
                        </td>
                        <td style={{ padding: '0.3rem 0.35rem', color: '#e2e8f0', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td style={{ padding: '0.3rem 0.35rem', color: '#94a3b8' }}>
                          <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
                            {LEVEL_LABELS[item.level] || item.level}
                          </span>
                        </td>
                        <td style={{ padding: '0.3rem 0.35rem', color: '#94a3b8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project_name}</td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: '#94a3b8' }}>{item.baseline_hours.toFixed(1)}</td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: '#cbd5e1' }}>{item.actual_hours.toFixed(1)}</td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: '#94a3b8' }}>{item.remaining_hours.toFixed(1)}</td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: item.baseline_count > 0 ? '#e2e8f0' : '#475569' }}>{item.baseline_count || '—'}</td>
                        <td style={{ padding: '0.3rem 0.35rem', color: '#94a3b8' }}>{item.baseline_metric || '—'}</td>
                        <td style={{ padding: '0.3rem 0.35rem', color: '#94a3b8' }}>{item.baseline_uom || draft.actual_uom || '—'}</td>
                        {/* Editable: Actual Count */}
                        <td style={{ padding: '0.2rem 0.25rem', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={draft.actual_count}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              const newPredicted = predictRemaining(item, val);
                              updateDraft(item.id, item, { actual_count: val, remaining_hours: newPredicted });
                            }}
                            style={{ width: 56, background: 'rgba(15,23,42,.6)', border: `1px solid ${isDirty ? 'rgba(99,102,241,.4)' : 'rgba(148,163,184,.2)'}`, color: '#e2e8f0', borderRadius: 4, padding: '0.16rem 0.2rem', textAlign: 'right', fontSize: '0.68rem' }}
                          />
                        </td>
                        {/* Editable: Actual Metric */}
                        <td style={{ padding: '0.2rem 0.25rem' }}>
                          <input
                            type="text"
                            value={draft.actual_metric}
                            onChange={(e) => updateDraft(item.id, item, { actual_metric: e.target.value })}
                            style={{ width: 72, background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 4, padding: '0.16rem 0.2rem', fontSize: '0.68rem' }}
                          />
                        </td>
                        {/* Editable: Remaining Hours */}
                        <td style={{ padding: '0.2rem 0.25rem', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={draft.remaining_hours}
                            onChange={(e) => updateDraft(item.id, item, { remaining_hours: Math.max(0, Number(e.target.value) || 0) })}
                            style={{ width: 64, background: 'rgba(15,23,42,.6)', border: `1px solid ${gf ? 'rgba(239,68,68,.5)' : isDirty ? 'rgba(99,102,241,.4)' : 'rgba(148,163,184,.2)'}`, color: gf ? '#fca5a5' : '#e2e8f0', borderRadius: 4, padding: '0.16rem 0.2rem', textAlign: 'right', fontSize: '0.68rem' }}
                          />
                        </td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: '#64748b', fontSize: '0.62rem' }}>{item.baseline_count > 0 ? predicted.toFixed(1) : '—'}</td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right', color: '#64748b', fontSize: '0.62rem' }}>{item.actual_count > 0 ? pace.toFixed(1) : '—'}</td>
                        <td style={{ padding: '0.3rem 0.35rem', color: stale >= 14 ? '#f59e0b' : '#64748b', fontSize: '0.62rem' }}>
                          {item.actual_count_updated_at ? `${stale}d ago` : 'Never'}
                        </td>
                        <td style={{ padding: '0.3rem 0.35rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                            <div style={{ width: 32, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, item.percent_complete)}%`, height: '100%', background: item.percent_complete >= 75 ? '#22c55e' : item.percent_complete >= 50 ? '#eab308' : '#ef4444', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: '#94a3b8', fontSize: '0.62rem' }}>{item.percent_complete.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row: guardrail comment + recommendations */}
                      {expanded && (
                        <tr>
                          <td colSpan={17} style={{ padding: '0.5rem 0.6rem', background: 'rgba(30,41,59,0.45)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>Recommendations</div>
                                <div style={{ fontSize: '0.64rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  <div>Predicted (BL ratio): <strong style={{ color: '#e2e8f0' }}>{predicted.toFixed(1)} hrs</strong></div>
                                  <div>Pace-based (trending): <strong style={{ color: '#e2e8f0' }}>{pace.toFixed(1)} hrs</strong></div>
                                  <div>Current remaining: <strong style={{ color: '#e2e8f0' }}>{item.remaining_hours.toFixed(1)} hrs</strong></div>
                                  {item.unit_name && <div style={{ color: '#64748b' }}>Unit: {item.unit_name}</div>}
                                  {item.phase_name && <div style={{ color: '#64748b' }}>Phase: {item.phase_name}</div>}
                                </div>
                                <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => updateDraft(item.id, item, { remaining_hours: predicted })}
                                    style={{ fontSize: '0.6rem', borderRadius: 5, border: '1px solid rgba(99,102,241,.3)', background: 'rgba(99,102,241,.15)', color: '#c7d2fe', padding: '0.18rem 0.4rem', cursor: 'pointer' }}
                                  >Use Predicted</button>
                                  <button
                                    onClick={() => updateDraft(item.id, item, { remaining_hours: pace })}
                                    style={{ fontSize: '0.6rem', borderRadius: 5, border: '1px solid rgba(16,185,129,.3)', background: 'rgba(16,185,129,.15)', color: '#a7f3d0', padding: '0.18rem 0.4rem', cursor: 'pointer' }}
                                  >Use Pace</button>
                                </div>
                              </div>

                              {gf && (
                                <div>
                                  <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.3rem' }}>
                                    ⚠ Low Hours Guardrail
                                  </div>
                                  <div style={{ fontSize: '0.64rem', color: '#fca5a5', marginBottom: '0.25rem' }}>
                                    You entered <strong>{gf.entered.toFixed(1)} hrs</strong> which is below the predicted <strong>{gf.predicted.toFixed(1)} hrs</strong>.
                                    Please provide a rationale.
                                  </div>
                                  <textarea
                                    value={gf.comment}
                                    onChange={(e) => setGuardrails((g) => ({ ...g, [item.id]: { ...gf, comment: e.target.value } }))}
                                    placeholder="Explain why remaining hours are lower than predicted..."
                                    rows={2}
                                    style={{ width: '100%', background: 'rgba(15,23,42,.6)', border: '1px solid rgba(239,68,68,.3)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem', fontSize: '0.64rem' }}
                                  />
                                  <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '0.15rem' }}>
                                    This will be reviewed by your PCA. They may escalate to the Senior Manager.
                                  </div>
                                </div>
                              )}

                              {!gf && (
                                <div style={{ fontSize: '0.64rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  No guardrail flags for this item.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
